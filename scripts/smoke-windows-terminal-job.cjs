/* eslint-disable @typescript-eslint/no-require-imports, no-empty */
/* global Buffer, console, process, require, setTimeout */

const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const nodePty = require('node-pty')

const CAPABILITY = 'student-coding-ide-windows-job-v1'
const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('This smoke test requires Windows x64.')
}
assert.equal(nodePty.supportsWindowsJobOwnership(), CAPABILITY)

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'student-ide-job-smoke-'))
const files = {
  rootPid: path.join(workspace, 'root.pid'),
  childPid: path.join(workspace, 'child.pid'),
  grandchildPid: path.join(workspace, 'grandchild.pid'),
  releaseRoot: path.join(workspace, 'release-root'),
}
const scripts = {
  root: path.join(workspace, 'root.ps1'),
  child: path.join(workspace, 'child.ps1'),
  grandchild: path.join(workspace, 'grandchild.ps1'),
}

writePowerShell(scripts.grandchild, [
  `Set-Content -LiteralPath ${ps(files.grandchildPid)} -Value $PID -NoNewline`,
  'Start-Sleep -Seconds 120',
])
writePowerShell(scripts.child, [
  `Set-Content -LiteralPath ${ps(files.childPid)} -Value $PID -NoNewline`,
  `$grandchild = ${encodedInvocation(scripts.grandchild)}`,
  `Start-Process -FilePath ${ps(POWERSHELL)} -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand',$grandchild) | Out-Null`,
  'Start-Sleep -Seconds 120',
])
writePowerShell(scripts.root, [
  `Set-Content -LiteralPath ${ps(files.rootPid)} -Value $PID -NoNewline`,
  `$child = ${encodedInvocation(scripts.child)}`,
  `Start-Process -FilePath ${ps(POWERSHELL)} -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand',$child) | Out-Null`,
  `while (-not (Test-Path -LiteralPath ${ps(files.releaseRoot)})) { Start-Sleep -Milliseconds 50 }`,
  'exit 23',
])

const control = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-Command', 'Start-Sleep -Seconds 120'], {
  windowsHide: true,
  stdio: 'ignore',
})
let terminal
let released = false

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  if (terminal && !released) {
    try { terminal.terminateWindowsJob() } catch {}
    try {
      await waitFor(() => terminal.windowsJobActiveProcessCount() === 0, 5_000)
      terminal.releaseWindowsJob()
      released = true
    } catch {}
  }
  if (terminal && released) {
    try { terminal.kill() } catch {}
  }
  try { control.kill() } catch {}
})

async function main() {
  const exitEvents = []
  terminal = nodePty.spawn(POWERSHELL, [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scripts.root,
  ], {
    cwd: workspace,
    cols: 80,
    rows: 24,
    name: 'xterm-256color',
    env: process.env,
  })
  terminal.onExit((event) => exitEvents.push(event))

  await waitFor(() => filesExist(files.rootPid, files.childPid, files.grandchildPid), 15_000)
  const rootPid = readPid(files.rootPid)
  const childPid = readPid(files.childPid)
  const grandchildPid = readPid(files.grandchildPid)
  assert.equal(rootPid, terminal.pid)
  assert.equal(isAlive(control.pid), true)
  assert.equal(isAlive(rootPid), true)
  assert.equal(isAlive(childPid), true)
  assert.equal(isAlive(grandchildPid), true)
  const activeBeforeRootExit = terminal.windowsJobActiveProcessCount()
  assert.ok(activeBeforeRootExit >= 3)
  const processTree = snapshotProcessTree(rootPid)
  const helpers = processTree.filter(
    (entry) => entry.pid !== childPid && entry.pid !== grandchildPid,
  )
  assert.throws(() => terminal.releaseWindowsJob(), /non-empty Windows Job/)

  const native = require('node-pty/lib/utils').loadNativeModule('conpty').module
  assert.throws(
    () => native.jobActiveProcessCount('student-ide-job-unknown'),
    /Unknown or stale Windows Job token/,
  )

  fs.writeFileSync(files.releaseRoot, '')
  await waitFor(() => exitEvents.length === 1, 15_000)
  await waitFor(() => !isAlive(rootPid), 5_000)
  const activeAfterRootExit = terminal.windowsJobActiveProcessCount()
  assert.ok(activeAfterRootExit >= 2)
  assert.equal(isAlive(childPid), true)
  assert.equal(isAlive(grandchildPid), true)
  assert.equal(isAlive(control.pid), true)

  terminal.terminateWindowsJob()
  terminal.terminateWindowsJob()
  await waitFor(() => terminal.windowsJobActiveProcessCount() === 0, 5_000)
  terminal.releaseWindowsJob()
  released = true
  await waitFor(() => !isAlive(childPid) && !isAlive(grandchildPid), 5_000)
  await delay(250)

  assert.equal(exitEvents.length, 1)
  assert.equal(isAlive(control.pid), true)
  console.log(JSON.stringify({
    capability: CAPABILITY,
    shellPid: rootPid,
    childPid,
    grandchildPid,
    helperPids: helpers.map((entry) => entry.pid),
    helperProcesses: helpers,
    controlPid: control.pid,
    activeBeforeRootExit,
    rootNaturalExit: true,
    rootPidGone: !isAlive(rootPid),
    jobRetainedAfterRootExit: activeAfterRootExit >= 2,
    descendantsAliveAfterRootExit: true,
    activeAfterRootExit,
    descendantsGoneAfterTermination: !isAlive(childPid) && !isAlive(grandchildPid),
    controlSurvived: isAlive(control.pid),
    jobEmpty: true,
    terminalExitEvents: exitEvents.length,
  }))
}

function encodedInvocation(scriptPath) {
  const command = `& ${ps(scriptPath)}`
  return ps(Buffer.from(command, 'utf16le').toString('base64'))
}

function ps(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function writePowerShell(file, lines) {
  fs.writeFileSync(file, `${lines.join('\r\n')}\r\n`, 'utf8')
}

function filesExist(...paths) {
  return paths.every((file) => fs.existsSync(file))
}

function readPid(file) {
  const value = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10)
  assert.ok(Number.isSafeInteger(value) && value > 0)
  return value
}

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error && error.code === 'ESRCH') return false
    throw error
  }
}

function snapshotProcessTree(rootPid) {
  const command = [
    'Get-CimInstance Win32_Process',
    "Select-Object ProcessId,ParentProcessId,Name",
    'ConvertTo-Json -Compress',
  ].join(' | ')
  const result = spawnSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`Process-tree snapshot failed: ${result.stderr.trim()}`)
  }
  const parsed = JSON.parse(result.stdout)
  const all = (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => ({
    pid: entry.ProcessId,
    parentPid: entry.ParentProcessId,
    name: entry.Name,
  }))
  const descendants = []
  const parents = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const entry of all) {
      if (!parents.has(entry.parentPid) || parents.has(entry.pid)) continue
      parents.add(entry.pid)
      descendants.push(entry)
      changed = true
    }
  }
  return descendants
}

async function waitFor(predicate, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(25)
  }
  throw new Error(`Timed out after ${timeoutMilliseconds}ms.`)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

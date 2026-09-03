import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ProcessManager } from '../src/main/services/process/process-manager'
import { DesktopApplication } from '../src/main/app/desktop-application'
import { ApplicationQuitCoordinator } from '../src/main/app/application-quit-coordinator'
import type {
  ProcessTreeIdentity,
  ProcessTreeOwnership,
  ProcessTreeTerminationResult,
  ProcessTreeTerminator,
} from '../src/main/services/process/process-tree-terminator'
import { WindowsProcessTreeTerminator } from '../src/main/services/process/windows-process-tree-terminator'
import { ProjectService } from '../src/main/services/project/project-service'
import { NodePtyPort } from '../src/main/services/terminal/node-pty-adapter'
import { TerminalService } from '../src/main/services/terminal/terminal-service'

const powershell = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe',
)
const scenario = process.env.STUDENT_IDE_SHUTDOWN_SCENARIO
if (scenario !== 'live-root' && scenario !== 'natural-root') {
  throw new Error('A valid shutdown smoke scenario is required.')
}
const workspace = mkdtempSync(join(tmpdir(), 'student-ide-service-job-smoke-'))
const rootPidFile = join(workspace, 'root.pid')
const childPidFile = join(workspace, 'child.pid')
const grandchildPidFile = join(workspace, 'grandchild.pid')
const releaseFile = join(workspace, 'release-root')
const grandchildScript = join(workspace, 'grandchild.ps1')
const childScript = join(workspace, 'child.ps1')
const rootScript = join(workspace, 'root.ps1')

writeScript(grandchildScript, [
  `Set-Content -LiteralPath ${ps(grandchildPidFile)} -Value $PID -NoNewline`,
  'Start-Sleep -Seconds 120',
])
writeScript(childScript, [
  `Set-Content -LiteralPath ${ps(childPidFile)} -Value $PID -NoNewline`,
  `$next = ${encodedInvocation(grandchildScript)}`,
  `Start-Process -FilePath ${ps(powershell)} -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand',$next) | Out-Null`,
  'Start-Sleep -Seconds 120',
])
writeScript(rootScript, [
  `Set-Content -LiteralPath ${ps(rootPidFile)} -Value $PID -NoNewline`,
  `$next = ${encodedInvocation(childScript)}`,
  `Start-Process -FilePath ${ps(powershell)} -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand',$next) | Out-Null`,
  `while (-not (Test-Path -LiteralPath ${ps(releaseFile)})) { Start-Sleep -Milliseconds 50 }`,
  'exit 31',
])

const control = spawn(powershell, ['-NoLogo', '-NoProfile', '-Command', 'Start-Sleep -Seconds 120'], {
  windowsHide: true,
  stdio: 'ignore',
})
const delegate = new WindowsProcessTreeTerminator()
let allowFinalization = (): void => undefined
let announceFinalization = (): void => undefined
const finalizationAllowed = new Promise<void>((resolve) => { allowFinalization = resolve })
const finalizationStarted = new Promise<void>((resolve) => { announceFinalization = resolve })
const gatedTerminator: ProcessTreeTerminator = {
  capture: (ownership: ProcessTreeOwnership) => delegate.capture(ownership),
  async terminate(
    identity: ProcessTreeIdentity,
    stillOwnsIdentity: (candidate: ProcessTreeIdentity) => boolean,
  ): Promise<ProcessTreeTerminationResult> {
    announceFinalization()
    if (scenario === 'natural-root') await finalizationAllowed
    return delegate.terminate(identity, stillOwnsIdentity)
  },
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  allowFinalization()
  try { control.kill() } catch { /* already exited */ }
})

async function main(): Promise<void> {
  const projectService = new ProjectService()
  const project = await projectService.openRoot(workspace)
  const processManager = new ProcessManager()
  const events: Array<{ type: string }> = []
  const service = new TerminalService({
    ptyPort: new NodePtyPort(),
    projectService,
    processManager,
    processTreeTerminator: gatedTerminator,
    shellResolver: {
      resolve: () => Promise.resolve({
        executable: powershell,
        args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', rootScript],
        shellLabel: 'Windows PowerShell',
      }),
    },
    publish: (_owner, event) => events.push(event),
  })
  const application = new DesktopApplication([processManager, service])
  await application.start()
  await service.create(
    { projectId: project.id, cols: 80, rows: 24 },
    { ownerWebContentsId: 77, projectId: project.id },
  )
  await waitFor(() => exists(rootPidFile) && exists(childPidFile) && exists(grandchildPidFile), 15_000)
  const rootPid = readPid(rootPidFile)
  const childPid = readPid(childPidFile)
  const grandchildPid = readPid(grandchildPidFile)
  let finalQuitCalls = 0
  const coordinator = new ApplicationQuitCoordinator({
    getApplication: () => application,
    requestApproval: () => Promise.resolve(true),
    quit: () => { finalQuitCalls += 1 },
  })

  if (scenario === 'natural-root') {
    writeFileSync(releaseFile, '')
    await finalizationStarted
    await waitFor(() => !isAlive(rootPid), 5_000)
    assert.equal(processManager.size, 1)
    assert.equal(isAlive(childPid), true)
    assert.equal(isAlive(grandchildPid), true)
  }
  assert.equal(isAlive(control.pid), true)

  coordinator.handleBeforeQuit({ preventDefault: () => undefined })
  if (scenario === 'natural-root') allowFinalization()
  await waitFor(
    () => application.getStatus().state === 'STOPPED' && finalQuitCalls === 1,
    10_000,
  )
  await waitFor(() => !isAlive(childPid) && !isAlive(grandchildPid), 5_000)
  await waitFor(() => !isAlive(rootPid), 5_000)
  assert.equal(events.filter((event) => event.type === 'exit').length, 1)
  assert.equal(isAlive(control.pid), true)

  console.log(JSON.stringify({
    scenario,
    shellPid: rootPid,
    childPid,
    grandchildPid,
    controlPid: control.pid,
    rootExitedBeforeShutdown: scenario === 'natural-root',
    descendantsRetainedAfterRootExit: scenario === 'natural-root',
    processManagerRetainedAfterRootExit: scenario === 'natural-root',
    processManagerReleasedAfterJobFinalization: processManager.size === 0,
    descendantsGone: !isAlive(childPid) && !isAlive(grandchildPid),
    controlSurvived: isAlive(control.pid),
    terminalExitEvents: events.filter((event) => event.type === 'exit').length,
    applicationState: application.getStatus().state,
    finalQuitCalls,
  }))
}

function writeScript(file: string, lines: string[]): void {
  writeFileSync(file, `${lines.join('\r\n')}\r\n`, 'utf8')
}
function encodedInvocation(file: string): string {
  return ps(Buffer.from(`& ${ps(file)}`, 'utf16le').toString('base64'))
}
function ps(value: string): string { return `'${value.replaceAll("'", "''")}'` }
function exists(file: string): boolean {
  try { readFileSync(file); return true } catch { return false }
}
function readPid(file: string): number { return Number(readFileSync(file, 'utf8')) }
function isAlive(pid: number | undefined): boolean {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch { return false }
}
async function waitFor(predicate: () => boolean, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out after ${timeout}ms.`)
}

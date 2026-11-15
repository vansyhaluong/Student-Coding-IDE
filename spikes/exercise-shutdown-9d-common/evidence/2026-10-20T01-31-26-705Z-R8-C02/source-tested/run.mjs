/* global process, console, setTimeout, clearTimeout */
// External controller: only kills child Electron hosts it created; observes retained OS handles.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')
const r4 = process.argv.includes('--r4')
const selection = r4 || process.argv.includes('--root-first') ? 'root-first' : process.argv.includes('--remaining') ? 'remaining' : 'suite'
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${r4 ? 'R4-' : ''}${selection}`
const output = join(root, 'out/exercise-shutdown-9d-common'), evidence = join(spike, 'evidence', runId)
mkdirSync(output, { recursive: true }); mkdirSync(evidence, { recursive: true })
const delay = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(check, ms = 20000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) { if (check()) return; await delay(10) }
  throw Error('External observation deadline exceeded')
}
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
function snapshot() {
  const result = {}
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean)
  for (const file of tracked) if (existsSync(join(root, file))) result[file] = sha(join(root, file))
  function walk(directory) {
    if (!existsSync(join(root, directory))) return
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) walk(file)
      else if (entry.isFile()) result[file] = sha(join(root, file))
    }
  }
  walk('out/main'); walk('node_modules/node-pty/prebuilds'); walk('node_modules/node-pty/build/Release')
  return result
}
const before = snapshot()
const baseline = { branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
  gitStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8', windowsHide: true }), before }
writeFileSync(join(output, 'baseline.json'), JSON.stringify(baseline, null, 2))
assert.equal(baseline.branch, 'feature/phase-9a-learning-mode')
const dotnet = join(process.env.ProgramFiles, 'dotnet/dotnet.exe')
const inventory = execFileSync(dotnet, ['--list-sdks'], { encoding: 'utf8', windowsHide: true })
const sdk = inventory.split(/\r?\n/).map(line => /^(10\.\d+\.\d+) \[/.exec(line)?.[1]).filter(Boolean)[0]
assert.ok(sdk, 'Installed stable SDK10 required; no download/fallback')
assert.match(process.version, /^v24\./)
writeFileSync(join(output, 'config.json'), JSON.stringify({ root, node: process.execPath, dotnet, sdk, inventory, runId, r4 }, null, 2))
const native = createRequire(import.meta.url)(join(output, 'exercise-process.node'))
const records = [], children = []
function persist() { writeFileSync(join(evidence, 'results.json'), JSON.stringify({ startedBaseline: { branch: baseline.branch,
  commit: baseline.commit }, environment: { node: process.version, sdk, inventory, platform: process.platform, arch: process.arch }, records }, null, 2)) }
function host(mode) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(join(root, 'node_modules/electron/dist/electron.exe'), [join(output, 'host.cjs'), `--spike-mode=${mode}`],
    { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child); let stdout = '', stderr = ''
  child.stdout.on('data', b => { stdout += b; if (mode === 'suite') process.stdout.write(b) })
  child.stderr.on('data', b => { stderr += b })
  const completed = new Promise((resolve, reject) => {
    child.on('error', reject); child.on('exit', (code, signal) => resolve({ code, signal }))
  })
  return { child, completed, logs() { writeFileSync(join(output, `${mode}.stdout.log`), stdout);
    writeFileSync(join(output, `${mode}.stderr.log`), stderr); return { stdout, stderr } } }
}
let failed = false
try {
  const suite = host(selection)
  const timer = setTimeout(() => suite.child.kill(), 180000)
  const result = await suite.completed; clearTimeout(timer); suite.logs()
  const suiteResult = JSON.parse(readFileSync(join(output, 'suite-results.json'), 'utf8'))
  writeFileSync(join(evidence, 'suite-results.json'), JSON.stringify(suiteResult, null, 2))
  records.push(...suiteResult.records); persist()
  assert.equal(result.code, 0, 'Electron suite failed; affected work must stop for user review')
  for (const phase of (selection === 'root-first' ? [] : ['prepare', 'compile', 'execute'])) {
    const name = `C: external hard-kill of dedicated Electron Main during ${phase}`
    const record = { name }, live = host(`crash-${phase}`)
    let processHandle
    try {
      const ready = join(output, `ready-crash-${phase}.json`)
      await waitFor(() => existsSync(ready))
      const state = JSON.parse(readFileSync(ready, 'utf8')); assert.equal(state.host, live.child.pid)
      processHandle = native.watch(state.pid)
      assert.equal(native.alive(processHandle), true)
      live.child.kill(); await live.completed
      await waitFor(() => !native.alive(processHandle), 10000)
      assert.ok(existsSync(state.workspace), 'Hard crash leaves workspace for recovery')
      assert.equal(JSON.parse(readFileSync(join(state.workspace, 'manifest.json'), 'utf8')).processClean, false)
      Object.assign(record, { status: 'PASS', state, processHandleSignaled: true, workspace: 'retained-unproven',
        scope: 'Controlled long-running phase fixture; crash does not prove real compiler-server lifecycle' })
    } catch (e) { Object.assign(record, { status: 'FAIL', error: String(e.message) }); throw e }
    finally { if (processHandle) native.closeHandle(processHandle); live.logs(); records.push(record); persist() }
    console.log(`PASS: ${name}`)
  }
} catch (e) { failed = true; console.error(e.message); persist() }
finally {
  // Emergency containment only for this controller's child handles, never name/PID-manifest killing.
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill()
  const after = snapshot(), changed = Object.keys(before).filter(file => after[file] !== before[file])
  records.push({ name: 'E: tracked source/config/data and existing Project build artifacts unchanged',
    status: changed.length === 0 ? 'PASS' : 'FAIL', changed, checkedFiles: Object.keys(before).length })
  writeFileSync(join(output, 'integrity.json'), JSON.stringify({ changed, checkedFiles: Object.keys(before).length }, null, 2))
  persist(); if (changed.length) failed = true
}
process.exitCode = failed ? 1 : 0

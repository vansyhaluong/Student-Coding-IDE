/* global process, console, setTimeout, clearTimeout */
// Independent controller: only terminates Electron children it created.
import assert from 'node:assert/strict'
import { execFileSync, execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { inventory, currentRun, spike, repo, output } from './staged-integrity.mjs'

const { evidence, runId } = currentRun(), plan = JSON.parse(readFileSync(join(spike, 'policy-b-shutdown-plan.json'), 'utf8'))
const c02Only = process.argv.includes('--c02-only')
if (!c02Only) throw Error('This corrective revision is authorized for --c02-only execution')
const slots = ['C02']
const baseline = JSON.parse(readFileSync(join(evidence, 'baseline.json'), 'utf8')).baseline
const results = { runId, plan, records: [], build: null, prerequisites: null, integrity: null }
const children = [], delay = ms => new Promise(r => setTimeout(r, ms)), execute = promisify(execFile)
let config, native, failed = false, currentSlot = null
const save = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2))
const persist = () => save(join(evidence, 'results.json'), results)
function checkpointIntegrity() {
  const after = inventory(evidence), changed = Object.keys(baseline).filter(file => baseline[file] !== after[file])
  results.integrity = { status: changed.length ? 'FAIL' : 'PASS', checkedFiles: Object.keys(baseline).length, changed,
    scope: 'Pre-edit baseline through end: tracked files, all src/scripts/docs, Project artifacts, PTY artifacts, prior spike artifacts/evidence and 9D.0' }
  if (changed.length) throw Error(`Integrity changed: ${changed.join(', ')}`)
}
async function wait(check, ms = plan.cleanupDeadlineMs) {
  const end = performance.now() + ms
  while (performance.now() < end) { const value = await check(); if (value) return value; await delay(plan.pollMs) }
  throw Error('Controller observation deadline exceeded')
}
function read(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function host(id, mode = 'test', extra = []) {
  const caseRoot = join(output, runId, `${id}-${mode}`); mkdirSync(caseRoot, { recursive: true })
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(config.electron, [join(output, 'host.cjs'), `--case=${id}`, `--mode=${mode}`, `--case-root=${caseRoot}`,
    `--config=${join(output, 'config.json')}`, ...extra], { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child); let stdout = '', stderr = ''
  child.stdout.on('data', b => { stdout += b; process.stdout.write(b) }); child.stderr.on('data', b => { stderr += b })
  const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })) })
  const watchdog = setTimeout(() => { child.kill(); results.watchdogExpired = { id, mode } }, plan.hostWatchdogMs)
  const done = completed.finally(() => clearTimeout(watchdog))
  return { child, caseRoot, done, async finish() {
    const exit = await done
    const group = join(evidence, 'groups', id[0]); mkdirSync(group, { recursive: true })
    writeFileSync(join(group, `${id}-${mode}.stdout.log`), stdout); writeFileSync(join(group, `${id}-${mode}.stderr.log`), stderr)
    for (const name of ['results.json', 'ready.json', 'released.json', 'recovery.json', 'host-error.json', 'c02-snapshots.jsonl', 'c02-diagnostics.jsonl', 'observer-abort.json']) {
      const path = join(caseRoot, name); if (existsSync(path)) copyFileSync(path, join(group, `${id}-${mode}-${name}`))
    }
    return exit
  } }
}
async function restart(id, state) {
  assert.ok(resolve(state.root).startsWith(output + '\\'))
  const h = host(id, 'recovery', [`--recovery-root=${state.root}`, `--record=${state.recordPath}`])
  const exit = await h.finish(); assert.equal(exit.code, 0, `Recovery ${id} failed`)
  const r = read(join(h.caseRoot, 'recovery.json')); return r
}
async function regular(id) {
  const h = host(id), exit = await h.finish()
  const path = join(h.caseRoot, 'results.json'), data = existsSync(path) ? read(path) : { records: [] }
  if (exit.code !== 0) {
    results.records.push(...data.records)
    if (!data.records.some(r => r.status === 'FAIL')) results.records.push({ name: id, status: 'FAIL', reason: 'Host failure', exit })
    throw Error(`${id} host/test failed`)
  }
  const expected = id === 'P01' ? ['P01', 'P02'] : [id]
  assert.deepEqual(data.records.map(r => r.name), expected)
  if (id === 'W01' || id === 'W05') {
    const r = data.records[0], recovered = await restart(id, r.restart)
    assert.notEqual(recovered.hostPid, data.hostPid)
    if (id === 'W01') { assert.equal(recovered.action, 'CLEANUP_COMPLETE'); assert.equal(existsSync(r.restart.workspace), false); assert.equal(recovered.record.processClean, true) }
    else { assert.equal(recovered.action, 'QUARANTINED'); assert.equal(existsSync(r.restart.workspace), true); assert.equal(recovered.record.processClean, false); assert.equal(recovered.record.cleanupComplete, false) }
    r.recovery = recovered; r.originalHostPid = data.hostPid
  }
  results.records.push(...data.records)
}
async function crash(id) {
  const r = { name: id, started: new Date().toISOString(), status: 'PASS', timeline: [] }, handles = [], h = host(id, 'crash')
  const mark = (event, extra = {}) => r.timeline.push({ event, monotonicMs: performance.now(), ...extra })
  const retained = new Map()
  const retain = state => {
    for (const p of state.identities) {
      if (!p.created || retained.has(`${p.pid}:${p.created}`)) continue
      let handle
      try {
        handle = native.watch(p.pid); const identity = native.processIdentity(handle)
        assert.equal(identity.created, p.created, 'Observer PID creation identity changed')
        handles.push(handle); retained.set(`${p.pid}:${p.created}`, { ...p, handle }); mark('observer-retained', { ...p })
      } catch (e) {
        if (handle) native.closeHandle(handle)
        // A process from a stale snapshot may have exited; never substitute another PID.
        if (e.code === 'ERR_ASSERTION') throw e
        mark('snapshot-process-no-longer-openable', { pid: p.pid, created: p.created })
      }
    }
  }
  try {
    const mainHandle = native.watch(h.child.pid); handles.push(mainHandle); r.hostIdentity = native.processIdentity(mainHandle)
    const readyPath = join(h.caseRoot, id === 'C02' ? 'c02-snapshots.jsonl' : 'ready.json')
    const snapshot = () => {
      if (!existsSync(readyPath)) return null
      if (id !== 'C02') return read(readyPath)
      const text = readFileSync(readyPath, 'utf8'), end = text.lastIndexOf('\n')
      if (end < 0) return null
      return JSON.parse(text.slice(0, end).split('\n').at(-1))
    }
    let state = await wait(snapshot, id === 'C03' ? plan.compileDeadlineMs : plan.cleanupDeadlineMs)
    assert.equal(state.hostPid, h.child.pid); retain(state); r.ready = state
    if (id === 'C02') {
      const end = performance.now() + plan.compileDeadlineMs; let compiler = null
      while (performance.now() < end && h.child.exitCode === null) {
        state = snapshot(); retain(state)
        r.latestSnapshot = { sequence: state.sequence, monotonicMs: state.monotonicMs, exitCode: state.session.exitCode }
        for (const p of state.identities.filter(p => p.pid !== state.session.rootPid && /dotnet\.exe$/i.test(p.image ?? ''))) {
          const entry = retained.get(`${p.pid}:${p.created}`)
          if (!entry || native.waitState(entry.handle) !== 'PENDING') continue
          const query = `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${p.pid}' | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress)`
          const result = await execute(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-Command', query], { windowsHide: true, timeout: plan.crashObservationDeadlineMs })
          const processInfo = result.stdout.trim() ? JSON.parse(result.stdout) : null
          if (processInfo && /(?:^|[\\/])csc\.dll(?:"|\s|$)/i.test(processInfo.CommandLine ?? '') && native.waitState(entry.handle) === 'PENDING') { compiler = { ...p, processInfo }; break }
        }
        if (compiler) break
        if (state.session.exitCode !== null) { assert.equal(state.session.exitCode, 0, state.session.output); break }
        await delay(plan.pollMs)
      }
      if (!compiler) {
        r.status = 'NOT_OBSERVED'; r.phenomenon = 'No retained live actual csc.dll compiler window; no compile hard-crash claim'
        save(join(h.caseRoot, 'observer-abort.json'), { abort: true }); const exit = await h.finish(); assert.equal(exit.code, 0)
        results.records.push(r); return
      }
      r.compiler = compiler
      mark('live-csc-command-line-observed', { pid: compiler.pid, created: compiler.created, snapshotSequence: state.sequence })
    }
    if (id !== 'C01') assert.ok(retained.size > 0, 'Crash needs actual retained process handles')
    if (id === 'C04') assert.ok(retained.size >= 2 && state.members.includes(state.session.rootPid), 'Actual descendant must still belong to Job')
    save(join(h.caseRoot, 'observer-continue.json'), { hostIdentity: r.hostIdentity, observed: [...retained.values()].map(({ handle, ...p }) => p) })
    if (id === 'P03') {
      const released = await wait(() => existsSync(join(h.caseRoot, 'released.json')) && read(join(h.caseRoot, 'released.json')))
      assert.equal(released.checkpoint.checkpoint, 'RELEASE_READY'); assert.equal(released.session.released, true)
      assert.equal(released.session.finalized, false); r.releaseCheckpoint = released
      assert.ok([...retained.values()].every(p => native.waitState(p.handle) === 'SIGNALED'))
      mark('post-release-checkpoint-observed')
    }
    assert.equal(native.waitState(mainHandle), 'PENDING')
    if (id === 'C02') {
      const compiler = retained.get(`${r.compiler.pid}:${r.compiler.created}`)
      assert.equal(native.waitState(compiler.handle), 'PENDING', 'Actual csc must still be alive immediately before Main crash')
      r.compilerStateAtKill = 'PENDING'
    }
    mark('hard-kill-requested')
    assert.equal(h.child.kill(), true); await h.done
    await wait(() => native.waitState(mainHandle) === 'SIGNALED' && [...retained.values()].every(p => native.waitState(p.handle) === 'SIGNALED'), plan.crashObservationDeadlineMs)
    mark('all-observed-handles-signaled'); await h.finish()
    assert.equal(existsSync(state.workspace), true)
    r.afterCrashRecord = read(state.recordPath)
    assert.equal(r.afterCrashRecord.processClean, false); assert.equal(r.afterCrashRecord.finalized, false)
    r.recovery = await restart(id, state); assert.equal(r.recovery.action, 'QUARANTINED'); assert.notEqual(r.recovery.hostPid, state.hostPid)
    r.observed = [...retained.values()].map(({ handle, ...p }) => ({ ...p, signaled: native.waitState(handle) === 'SIGNALED' }))
    r.limit = 'Observer proves retained process termination; no historical coverage claim or fabricated PROCESS_CLEAN after crash'
    results.records.push(r)
  } catch (e) {
    r.status = 'FAIL'; r.error = { message: e.message, stack: e.stack }; results.records.push(r); throw e
  } finally {
    if (h.child.exitCode === null && h.child.signalCode === null) h.child.kill()
    await h.finish().catch(e => { r.logCollectionError = e.message })
    for (const handle of handles) native.closeHandle(handle)
  }
}
try {
  checkpointIntegrity()
  assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: repo, encoding: 'utf8' }).trim(), 'feature/phase-9a-learning-mode')
  assert.equal(plan.slots.length, 30); assert.equal(new Set(plan.slots).size, 30); assert.equal(plan.runsPerSlot, 1)
  assert.match(process.version, /^v24\./)
  const dotnet = join(process.env.ProgramFiles, 'dotnet/dotnet.exe'), inventoryText = execFileSync(dotnet, ['--list-sdks'], { encoding: 'utf8', windowsHide: true })
  const sdk = inventoryText.split(/\r?\n/).map(l => /^(10\.\d+\.\d+) \[/.exec(l)?.[1]).find(Boolean); assert.ok(sdk)
  config = { runId, repo, output, node: process.execPath, dotnet, sdk, electron: join(repo, 'node_modules/electron/dist/electron.exe') }
  for (const path of ['out/main/native/run-process.node', 'node_modules/electron/dist/electron.exe',
    'node_modules/node-pty/prebuilds/win32-x64/conpty.node', 'node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node']) assert.ok(existsSync(join(repo, path)), `Missing existing prerequisite ${path}`)
  for (const file of ['policy-b-runtime.ts', 'policy-b-checkpoint.ts', 'policy-b-recovery.ts', 'staged-host.ts', 'staged-preload.cjs', 'native-test-helpers.inc']) assert.ok(existsSync(join(spike, file)))
  const runtime = readFileSync(join(spike, 'policy-b-runtime.ts'), 'utf8'), hostText = readFileSync(join(spike, 'staged-host.ts'), 'utf8')
  for (const word of ['RELEASE_READY', 'FINALIZED', 'CLEANUP_COMPLETE', 'HANDLES_CLOSED', 'launchFailed']) assert.ok(runtime.includes(word))
  for (const name of ['recover', 'forcefullyCrashRenderer', 'makeCsharp', 'ProjectAdapter', 'NodePtyPort', 'ApplicationQuitCoordinator']) assert.ok(hostText.includes(name))
  results.prerequisites = { status: 'READY_FOR_BUILD', node: process.version, sdk, inventory: inventoryText, groups: plan.groups,
    review: 'staged retry, real checkpoint writer, recovery lease, old test conversion and dedicated observer paths present; not runtime PASS claims' }
  save(join(evidence, 'plan.json'), plan); save(join(output, 'config.json'), config); persist()
  mkdirSync(join(evidence, 'source-tested'), { recursive: true })
  for (const entry of readdirSync(spike, { withFileTypes: true })) if (entry.isFile()) copyFileSync(join(spike, entry.name), join(evidence, 'source-tested', entry.name))
  try {
    const build = execFileSync(process.execPath, [join(spike, 'build.mjs'), '--staged'], { cwd: repo, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, EXERCISE_SPIKE_BUILD_LOG_DIR: evidence } })
    writeFileSync(join(evidence, 'build.log'), build); results.build = { status: 'PASS', attempts: 1 }; console.log(build.trim())
  } catch (e) {
    writeFileSync(join(evidence, 'build-wrapper.stdout.log'), e.stdout ?? ''); writeFileSync(join(evidence, 'build-wrapper.stderr.log'), e.stderr ?? '')
    results.build = { status: 'FAIL', attempts: 1, message: e.message }; throw e
  }
  copyFileSync(join(spike, 'staged-preload.cjs'), join(output, 'staged-preload.cjs'))
  native = createRequire(import.meta.url)(join(output, 'exercise-process.node'))
  for (const fn of ['acquireLease', 'waitState', 'jobMembers', 'processIdentity', 'memberIdentity']) assert.equal(typeof native[fn], 'function')
  results.prerequisites.status = 'READY'; persist()
  for (const id of slots) {
    if (results.records.some(r => r.name === id)) continue
    currentSlot = id
    if (id === 'P03' || id.startsWith('C')) await crash(id)
    else await regular(id)
    const unexpected = results.records.find(r => r.status === 'FAIL'); if (unexpected) throw Error(`Stop after FAIL ${unexpected.name}`)
    const group = join(evidence, 'groups', id[0]); mkdirSync(group, { recursive: true }); save(join(group, 'results.json'), results.records.filter(r => r.name[0] === id[0]))
    persist(); console.log(`Recorded: ${id}`)
  }
  assert.deepEqual(results.records.map(r => r.name), slots)
} catch (e) {
  failed = true; results.stopped = { message: e.message, slot: currentSlot }; console.error(e.message)
  if (currentSlot && !results.records.some(r => r.name === currentSlot)) results.records.push({ name: currentSlot, status: 'FAIL', error: e.message })
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill()
  for (const id of slots) if (!results.records.some(r => r.name === id)) results.records.push({ name: id, status: 'BLOCKED', reason: results.stopped?.message ?? 'Prerequisite not completed' })
  for (const key of Object.keys(plan.groups)) {
    const group = join(evidence, 'groups', key); mkdirSync(group, { recursive: true })
    save(join(group, 'results.json'), results.records.filter(r => r.name[0] === key))
  }
  try { checkpointIntegrity() } catch (e) { failed = true; results.integrityError = e.message }
  persist(); console.log(`Evidence: ${evidence}`)
}
process.exitCode = failed ? 1 : 0

/* global process, console, setTimeout, clearTimeout, setInterval, clearInterval */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { inventory, spike, repo, output as staged } from '../staged-integrity.mjs'
const active = JSON.parse(readFileSync(join(staged, 'limits/active.json'), 'utf8'))
const { runId, output, evidence } = active, read = p => JSON.parse(readFileSync(p, 'utf8'))
const plan = read(join(spike, 'limits/plan.json')), baseline = read(join(evidence, 'baseline.json')).baseline
const treeOnly = process.argv.includes('--t4-tree-only'), remainingOnly = process.argv.includes('--t5-t7-only')
if (treeOnly === remainingOnly) throw Error('Select exactly --t4-tree-only or --t5-t7-only')
const selected = treeOnly ? ['T4-tree'] : ['T5-csharp', 'T5-javascript', 'T6-timeout-terminate', 'T6-memory-finalized', 'T7-phase', 'T7-operation', 'T7-pending-io']
if (remainingOnly) {
  const prior = readdirSync(join(spike, 'evidence')).filter(name => name.endsWith('-R11-T4-tree')).sort().at(-1)
  assert.ok(prior, 'T4-tree prerequisite evidence required')
  const prerequisite = read(join(spike, 'evidence', prior, 'results.json'))
  assert.equal(prerequisite.records.length, 1); assert.equal(prerequisite.records[0].name, 'T4-tree'); assert.equal(prerequisite.records[0].status, 'PASS')
}
const result = { runId, plan, selectedVariants: selected, build: null, records: [], integrity: null }
const save = () => writeFileSync(join(evidence, 'results.json'), JSON.stringify(result, null, 2))
assert.equal(existsSync(join(evidence, 'results.json')), false, 'Refuse evidence overwrite or repeated run')
assert.equal(plan.variants.length, 16); assert.equal(new Set(plan.variants).size, 16)
function integrity() {
  const after = inventory(evidence), changed = Object.keys(baseline).filter(p => baseline[p] !== after[p])
  // Tracked spike files, production and R1-R9 remain protected; report alone is excluded.
  result.integrity = { status: changed.length ? 'FAIL' : 'PASS', checkedFiles: Object.keys(baseline).length, changed }
  assert.deepEqual(changed, [])
}
let failed = false, native
try {
  integrity(); assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: repo, encoding: 'utf8' }).trim(), 'feature/phase-9a-learning-mode')
  assert.match(process.version, /^v24\./)
  const dotnet = join(process.env.ProgramFiles, 'dotnet/dotnet.exe')
  const sdks = execFileSync(dotnet, ['--list-sdks'], { encoding: 'utf8', windowsHide: true })
  const sdk = sdks.split(/\r?\n/).map(l => /^(10\.\d+\.\d+) \[/.exec(l)?.[1]).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
  assert.ok(sdk, 'Installed stable SDK 10.x required')
  const config = { repo, output, runId, plan, dotnet, sdk, node: process.execPath }
  result.runtime = { sdk, node: process.version, inventory: sdks, policy: 'Installed stable SDK10 / Node24; patch not locked; no download or major fallback' }
  writeFileSync(join(evidence, 'config.json'), JSON.stringify(config, null, 2))
  mkdirSync(join(evidence, 'source-tested/limits'), { recursive: true })
  for (const f of readdirSync(join(spike, 'limits'), { withFileTypes: true })) if (f.isFile()) copyFileSync(join(spike, 'limits', f.name), join(evidence, 'source-tested/limits', f.name))
  for (const name of ['policy-b-runtime.ts', 'policy-b-checkpoint.ts', 'policy-b-recovery.ts', 'native-test-helpers.inc', 'build.mjs']) copyFileSync(join(spike, name), join(evidence, 'source-tested', name))
  save()
  try {
    execFileSync(process.execPath, [join(spike, 'limits/build.mjs')], { cwd: repo, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
    result.build = { status: 'PASS', attempts: 1 }
  } catch (e) { result.build = { status: 'FAIL', message: e.message }; throw e }
  save(); native = createRequire(import.meta.url)(join(output, 'exercise-process.node'))
  for (const name of selected) {
    const caseRoot = join(output, runId, name), ev = join(evidence, 'variants', name)
    mkdirSync(caseRoot, { recursive: true }); mkdirSync(ev, { recursive: true })
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(join(repo, 'node_modules/electron/dist/electron.exe'), [join(output, 'host.cjs'), `--variant=${name}`, `--case-root=${caseRoot}`, `--config=${join(evidence, 'config.json')}`],
      { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', done = false, watchdog = false, observerError
    const retained = new Map(), handles = [], timeline = [], observedAt = performance.now()
    child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b })
    const h = native.watch(child.pid); handles.push(h)
    const mainIdentity = native.processIdentity(h)
    const observe = () => {
      const path = join(caseRoot, 'samples.jsonl'); if (!existsSync(path)) return
      const text = readFileSync(path, 'utf8'), end = text.lastIndexOf('\n'); if (end < 0) return
      const latest = JSON.parse(text.slice(0, end).split('\n').at(-1))
      let added = false
      for (const p of latest.identities) {
        const key = `${p.pid}:${p.created}`; if (retained.has(key)) continue
        let handle
        try {
          handle = native.watch(p.pid); assert.equal(native.processIdentity(handle).created, p.created)
          retained.set(key, { ...p, handle }); handles.push(handle); added = true
          timeline.push({ event: 'retained', pid: p.pid, created: p.created, at: performance.now() })
        } catch (e) { if (handle) native.closeHandle(handle); if (e.code === 'ERR_ASSERTION') throw e }
      }
      if (added) {
        // Complete-file replacement with asynchronous host retry reads; no rename/read conflict.
        writeFileSync(join(caseRoot, 'retained.json'), JSON.stringify([...retained.values()].map(p => ({ pid: p.pid, created: p.created }))))
      }
    }
    const poll = setInterval(() => { try { observe() } catch (e) { observerError ??= e } }, plan.pollMs)
    const timer = setTimeout(() => { watchdog = true; child.kill() }, plan.watchdogMs)
    const exit = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', (code, signal) => { done = true; resolveExit({ code, signal }) }) })
    clearTimeout(timer); clearInterval(poll)
    try { observe() } catch (e) { observerError ??= e }
    writeFileSync(join(ev, 'stdout.log'), stdout); writeFileSync(join(ev, 'stderr.log'), stderr)
    for (const file of readdirSync(caseRoot, { withFileTypes: true })) if (file.isFile()) copyFileSync(join(caseRoot, file.name), join(ev, file.name))
    const record = existsSync(join(caseRoot, 'result.json')) ? read(join(caseRoot, 'result.json')) : { name, status: 'FAIL', error: { message: 'Host produced no result', exit } }
    const signaled = [...retained.values()].every(p => native.waitState(p.handle) === 'SIGNALED')
    record.observer = { mainIdentity, mainSignaled: native.waitState(h) === 'SIGNALED', elapsedMs: performance.now() - observedAt, allRetainedSignaled: signaled,
      observed: [...retained.values()].map(p => ({ ...p, handle: undefined, signaled: native.waitState(p.handle) === 'SIGNALED' })), timeline, watchdog, exit }
    if (watchdog || observerError || !done || !signaled || native.waitState(h) !== 'SIGNALED' || exit.code !== 0) {
      record.status = 'FAIL'; record.controllerError = observerError?.message ?? 'Host/observer/watchdog failure'
    }
    for (const handle of handles) native.closeHandle(handle)
    result.records.push(record); writeFileSync(join(ev, 'observer-result.json'), JSON.stringify(record, null, 2)); save()
    console.log(`${record.status}: ${name}`)
    if (record.status === 'FAIL') throw Error(`Stop after unexpected FAIL ${name}: ${record.error?.message ?? record.controllerError}`)
  }
} catch (e) { failed = true; result.stopped = { message: e.message }; console.error(e.message) }
finally {
  for (const name of selected) if (!result.records.some(r => r.name === name)) result.records.push({ name, status: 'BLOCKED', reason: result.stopped?.message ?? 'Prerequisite failed' })
  try { integrity() } catch (e) { failed = true; result.integrityError = e.message }
  save(); console.log(`Evidence: ${evidence}`)
}
process.exitCode = failed ? 1 : 0

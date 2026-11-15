/* global process, console, setTimeout, clearTimeout */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-R5-policy-b`
const evidence = join(spike, 'evidence', runId), output = join(root, 'out/exercise-shutdown-9d-common/policy-b')
mkdirSync(evidence, { recursive: true }); mkdirSync(output, { recursive: true })
const planPath = join(spike, 'policy-b-plan.json'), plan = JSON.parse(readFileSync(planPath, 'utf8'))
writeFileSync(join(evidence, 'plan.json'), JSON.stringify(plan, null, 2))
function snapshot() {
  const values = {}, hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean)) {
    if (existsSync(join(root, file))) values[file] = hash(join(root, file))
  }
  function walk(directory) {
    if (!existsSync(join(root, directory))) return
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`
      if (resolve(root, name).startsWith(resolve(evidence))) continue
      if (entry.isDirectory()) walk(name)
      else if (entry.isFile()) values[name] = hash(join(root, name))
    }
  }
  for (const dir of ['out/main', 'node_modules/node-pty/prebuilds', 'node_modules/node-pty/build/Release', 'spikes/exercise-shutdown-9d-common/evidence']) walk(dir)
  return values
}
const before = snapshot(), results = { runId, plan, records: [], builds: [], integrity: null }
function persist() { writeFileSync(join(evidence, 'results.json'), JSON.stringify(results, null, 2)) }
let failed = false
try {
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  if (branch !== 'feature/phase-9a-learning-mode') throw Error('Wrong branch')
  if (!/^v24\./.test(process.version)) throw Error('Installed Node24 required')
  const dotnet = join(process.env.ProgramFiles, 'dotnet/dotnet.exe')
  const inventory = execFileSync(dotnet, ['--list-sdks'], { cwd: output, encoding: 'utf8', windowsHide: true })
  const sdk = inventory.split(/\r?\n/).map(l => /^(10\.\d+\.\d+) \[/.exec(l)?.[1]).filter(Boolean)[0]
  if (!sdk) throw Error('Installed SDK10 missing; no download/fallback')
  results.environment = { branch, node: process.version, sdk, inventory, platform: process.platform, arch: process.arch }
  let build
  try {
    build = execFileSync(process.execPath, [join(spike, 'build.mjs'), '--policy-b'], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, EXERCISE_SPIKE_BUILD_LOG_DIR: evidence }
    })
  } catch (e) {
    writeFileSync(join(evidence, 'build-wrapper.stdout.log'), e.stdout ?? '')
    writeFileSync(join(evidence, 'build-wrapper.stderr.log'), e.stderr ?? '')
    results.builds.push({ status: 'FAIL', output, exitStatus: e.status, signal: e.signal })
    throw e
  }
  writeFileSync(join(evidence, 'build.log'), build); results.builds.push({ status: 'PASS', output }); console.log(build.trim())
  writeFileSync(join(output, 'config.json'), JSON.stringify({ root, node: process.execPath, dotnet, sdk, runId,
    plan: planPath, electron: join(root, 'node_modules/electron/dist/electron.exe') }, null, 2))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(join(root, 'node_modules/electron/dist/electron.exe'), [join(output, 'host.cjs'), '--policy-mode=suite'],
    { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', b => { stdout += b; process.stdout.write(b) }); child.stderr.on('data', b => { stderr += b })
  const timer = setTimeout(() => { child.kill(); results.hostWatchdogExpired = true }, 180000)
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code, signal) => resolve({code,signal})) })
  clearTimeout(timer); results.hostExit = exit
  writeFileSync(join(evidence, 'stdout.log'), stdout); writeFileSync(join(evidence, 'stderr.log'), stderr)
  const suitePath = join(output, `${runId}-suite.json`)
  if (existsSync(suitePath)) {
    const suite = readFileSync(suitePath, 'utf8'); writeFileSync(join(evidence, 'suite.json'), suite)
    results.records = JSON.parse(suite).records
  }
  const recoveryPath = join(output, `${runId}-recovery.json`)
  if (existsSync(recoveryPath)) writeFileSync(join(evidence, 'recovery.json'), readFileSync(recoveryPath))
  const executed = new Set(results.records.map(r => r.name))
  results.notExecuted = plan.slots.filter(name => !executed.has(name))
  if (exit.code !== 0) throw Error('Policy-B test FAIL; stop immediately for user review')
  if (results.records.length !== plan.functionalSlots) throw Error('Predetermined slot count mismatch')
} catch (e) { failed = true; results.stopped = { status: 'FAIL', message: String(e.message) }; console.error(e.message) }
finally {
  const after = snapshot(), changed = Object.keys(before).filter(file => after[file] !== before[file])
  results.integrity = { status: changed.length ? 'FAIL' : 'PASS', changed, checkedFiles: Object.keys(before).length,
    scope: 'Before isolated build through end of run; includes original R1/R2/R3/R4 evidence' }
  if (changed.length) failed = true
  persist(); console.log(`Evidence: ${evidence}`)
}
process.exitCode = failed ? 1 : 0

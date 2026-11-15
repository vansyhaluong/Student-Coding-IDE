/* global process, console */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { spike, repo, output as staged } from '../staged-integrity.mjs'
const active = JSON.parse(readFileSync(join(staged, 'limits/active.json'), 'utf8'))
const { output, evidence } = active
mkdirSync(output, { recursive: true })
let build = readFileSync(join(spike, 'build.mjs'), 'utf8')
function replace(from, to) { if (!build.includes(from)) throw Error(`Build anchor missing: ${from}`); build = build.replace(from, to) }
replace("const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')", `const spike = ${JSON.stringify(spike)}, root = ${JSON.stringify(repo)}`)
replace("const output = join(root, 'out/exercise-shutdown-9d-common', ...(staged ? ['staged'] : policyB ? ['policy-b'] : []))", `const output = ${JSON.stringify(output)}`)
replace("join(spike, staged ? 'staged-host.ts' : policyB ? 'policy-b-host.ts' : 'host.ts')", "join(spike, 'limits/host.ts')")
replace("writeFileSync(join(output, 'exercise-process.cpp'), source)", `
  replace('struct Session {', 'struct Session {\\n  Handle memoryPort; SIZE_T configuredQuota = 0;');
  replace('struct Event {', 'static void limitsSetup(Session*);\\nstruct Event {');
  replace('SIZE_T size = 0; InitializeProcThreadAttributeList', 'limitsSetup(s.get());\\n    SIZE_T size = 0; InitializeProcThreadAttributeList');
  replace('s->released = true;', 's->memoryPort.close(); s->released = true;');
  replace('static napi_value init(napi_env env, napi_value exports) {', readFileSync(join(spike, 'limits/native.inc'), 'utf8') + '\\nstatic napi_value init(napi_env env, napi_value exports) {\\n  addLimitsHelpers(env, exports);');
  writeFileSync(join(output, 'exercise-process.cpp'), source)
`)
replace("console.log(result.stdout)", `
  const allocator = spawnSync('cl.exe', ['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', join(spike, 'limits/allocator.cpp'), '/Fo' + output + '\\\\', '/Fe' + join(output, 'allocator.exe')], { cwd: output, env: environment, encoding: 'utf8', windowsHide: true });
  writeFileSync(${JSON.stringify(join(evidence, 'allocator-build.log'))}, (allocator.stdout ?? '') + (allocator.stderr ?? ''));
  if (allocator.error || allocator.status !== 0) throw allocator.error ?? Error('Allocator build failed');
  console.log(result.stdout)
`)
const generated = join(output, 'generated-build.mjs')
writeFileSync(generated, build)
try {
  const log = execFileSync(process.execPath, [generated, '--staged'], { cwd: repo, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, EXERCISE_SPIKE_BUILD_LOG_DIR: evidence }, maxBuffer: 16 * 1024 * 1024 })
  writeFileSync(join(evidence, 'build.log'), log); console.log(log)
} catch (e) {
  writeFileSync(join(evidence, 'build-error.log'), (e.stdout ?? '') + (e.stderr ?? '') + e.message); throw e
}

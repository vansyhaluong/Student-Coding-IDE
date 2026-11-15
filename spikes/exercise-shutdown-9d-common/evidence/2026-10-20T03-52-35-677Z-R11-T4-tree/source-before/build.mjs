/* global process, console */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')
const policyB = process.argv.includes('--policy-b')
const staged = process.argv.includes('--staged')
const output = join(root, 'out/exercise-shutdown-9d-common', ...(staged ? ['staged'] : policyB ? ['policy-b'] : []))
mkdirSync(output, { recursive: true })
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 required')
if (!process.argv.includes('--js-only')) {
  let source = execFileSync('git', ['show', 'b4e23fabfa690201d179d93c1596af7849c3d5c0:src/main/services/run/native/run-process.cpp'],
    { cwd: root, encoding: 'utf8', windowsHide: true })
  function replace(from, to) {
    if (!source.includes(from)) throw Error('Pinned native source anchor missing')
    source = source.replace(from, to)
  }
  replace('static void check(bool ok,', 'static int spikeFault = 0; // SPIKE ONLY: 1 Job, 2 spawn, 3 terminate, 4 release\nstatic void check(bool ok,')
  replace('if (s->released) return;\n  check(', 'if (s->released) return;\n  check(spikeFault != 4, "Injected release failure");\n  check(')
  replace('s->job.value = CreateJobObjectW(nullptr, nullptr);', 'check(spikeFault != 1, "Injected Job creation failure");\n    s->job.value = CreateJobObjectW(nullptr, nullptr);')
  replace('SIZE_T size = 0; InitializeProcThreadAttributeList',
    'JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};\n    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;\n    check(SetInformationJobObject(s->job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits)), "Kill-on-close setup failed");\n    SIZE_T size = 0; InitializeProcThreadAttributeList')
  replace('check(CreateProcessW(executable.c_str()', 'check(spikeFault != 2, "Injected spawn failure");\n    check(CreateProcessW(executable.c_str()')
  replace('else if (op == L"terminate") {', 'else if (op == L"terminate") { check(spikeFault != 3, "Injected terminate failure");')
  replace('static napi_value init(napi_env env, napi_value exports) {',
    readFileSync(join(spike, 'native-test-helpers.inc'), 'utf8') + '\nstatic napi_value init(napi_env env, napi_value exports) {\n  addSpikeHelpers(env, exports);')
  writeFileSync(join(output, 'exercise-process.cpp'), source)
  const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
  const headers = join(process.env.LOCALAPPDATA, 'node-gyp/Cache', electron.version)
  const delayHook = join(dirname(process.execPath), 'node_modules/npm/node_modules/node-gyp/src/win_delay_load_hook.cc')
  for (const file of [join(headers, 'include/node/node_api.h'), join(headers, 'x64/node.lib'), delayHook]) {
    if (!existsSync(file)) throw Error('Existing build prerequisite missing; no download permitted')
  }
  const vswhere = join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe')
  const vs = execFileSync(vswhere, ['-latest', '-products', '*', '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true }).trim()
  if (!vs) throw Error('Existing MSVC missing')
  const text = execFileSync(process.env.ComSpec, ['/d', '/s', '/c', `""${join(vs, 'VC/Auxiliary/Build/vcvars64.bat')}" >nul && set"`],
    { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
  const environment = { ...process.env }
  for (const line of text.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) environment[line.slice(0, i)] = line.slice(i + 1) }
  const result = spawnSync('cl.exe', ['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', '/LD',
    '/D_WIN32_WINNT=0x0A00', '/DNAPI_VERSION=8', '/DNODE_GYP_MODULE_NAME=exercise_shutdown_spike', '/DHOST_BINARY="node.exe"',
    `/I${join(headers, 'include/node')}`, join(output, 'exercise-process.cpp'), delayHook, `/Fo${output}\\`,
    `/Fe${join(output, 'exercise-process.node')}`, '/link', join(headers, 'x64/node.lib'), 'delayimp.lib', '/DELAYLOAD:node.exe'],
  { cwd: output, env: environment, encoding: 'utf8', windowsHide: true })
  if (process.env.EXERCISE_SPIKE_BUILD_LOG_DIR) {
    const logDirectory = process.env.EXERCISE_SPIKE_BUILD_LOG_DIR
    mkdirSync(logDirectory, { recursive: true })
    writeFileSync(join(logDirectory, 'native-compiler.stdout.log'), result.stdout ?? '')
    writeFileSync(join(logDirectory, 'native-compiler.stderr.log'), result.stderr ?? '')
  }
  console.log(result.stdout)
  if (result.stderr) console.error(result.stderr)
  if (result.error || result.status !== 0) throw result.error ?? Error('Spike native build failed; stop for review')
}
await build({ configFile: false, logLevel: 'warn', build: { emptyOutDir: false, outDir: output, target: 'node24',
  lib: { entry: join(spike, staged ? 'staged-host.ts' : policyB ? 'policy-b-host.ts' : 'host.ts'), formats: ['cjs'], fileName: () => 'host.cjs' },
  rollupOptions: { external: ['electron', 'node-pty', /^node:/] }, minify: false } })
console.log(`Built independent Electron spike: ${output}`)

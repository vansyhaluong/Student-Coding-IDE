/* global process, console */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')
const output = join(root, 'out/exercise-runtime-9d0')
mkdirSync(output, { recursive: true })
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Windows x64 only')
if (!process.argv.includes('--js-only')) {
// Only the owned argv process primitive is selected from the other branch.
// Never checkout/merge or overwrite the production native artifact.
const source = execFileSync('git', ['show', 'b4e23fabfa690201d179d93c1596af7849c3d5c0:src/main/services/run/native/run-process.cpp'],
  { cwd: root, encoding: 'utf8', windowsHide: true })
writeFileSync(join(output, 'run-process.cpp'), source)
const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
const headers = join(process.env.LOCALAPPDATA, 'node-gyp/Cache', electron.version)
const delayHook = join(dirname(process.execPath), 'node_modules/npm/node_modules/node-gyp/src/win_delay_load_hook.cc')
for (const file of [join(headers, 'include/node/node_api.h'), join(headers, 'x64/node.lib'), delayHook]) {
  if (!existsSync(file)) throw Error('Existing native build prerequisite missing; no download attempted')
}
const vswhere = join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe')
const vs = execFileSync(vswhere, ['-latest', '-products', '*', '-requires',
  'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
{ encoding: 'utf8', windowsHide: true }).trim()
if (!vs) throw Error('MSVC missing; no installation attempted')
const vcvars = join(vs, 'VC/Auxiliary/Build/vcvars64.bat')
const lines = execFileSync(process.env.ComSpec, ['/d', '/s', '/c', `""${vcvars}" >nul && set"`],
  { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
const environment = { ...process.env }
for (const line of lines.split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0) environment[line.slice(0, at)] = line.slice(at + 1)
}
const compiled = spawnSync('cl.exe', ['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', '/LD',
  '/D_WIN32_WINNT=0x0A00', '/DNAPI_VERSION=8', '/DNODE_GYP_MODULE_NAME=exercise_spike', '/DHOST_BINARY="node.exe"',
  `/I${join(headers, 'include/node')}`, join(output, 'run-process.cpp'), delayHook,
  `/Fo${output}\\`, `/Fe${join(output, 'run-process.node')}`, '/link', join(headers, 'x64/node.lib'),
  'delayimp.lib', '/DELAYLOAD:node.exe'], { cwd: output, env: environment, encoding: 'utf8', windowsHide: true })
console.log(compiled.stdout)
if (compiled.stderr) console.error(compiled.stderr)
if (compiled.error || compiled.status !== 0) throw compiled.error ?? Error('Native spike build failed')
}
await build({ configFile: false, logLevel: 'warn', build: { emptyOutDir: false, outDir: output,
  target: 'node24', lib: { entry: join(spike, 'verify.ts'), formats: ['cjs'], fileName: () => 'verify.cjs' },
  rollupOptions: { external: [/^node:/] }, minify: false } })
console.log(`Built isolated spike at ${output}`)

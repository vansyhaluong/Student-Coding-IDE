/* global process, console */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Learning native requires Windows x64.')
const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
const headers = join(process.env.LOCALAPPDATA, 'node-gyp/Cache', electron.version)
const hook = join(dirname(process.execPath), 'node_modules/npm/node_modules/node-gyp/src/win_delay_load_hook.cc')
for (const path of [join(headers, 'include/node/node_api.h'), join(headers, 'x64/node.lib'), hook]) {
  if (!existsSync(path)) throw Error('Existing native build prerequisites missing; no download attempted.')
}
const vswhere = join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe')
const vs = execFileSync(vswhere, ['-latest', '-products', '*', '-requires',
  'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true }).trim()
if (!vs) throw Error('Existing MSVC x64 toolchain unavailable.')
const environmentText = execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c',
  `""${join(vs, 'VC/Auxiliary/Build/vcvars64.bat')}" >nul && set"`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
const environment = { ...process.env }
for (const line of environmentText.split(/\r?\n/)) {
  const split = line.indexOf('='); if (split > 0) environment[line.slice(0, split)] = line.slice(split + 1)
}
const output = join(root, 'out/main/native/learning')
mkdirSync(output, { recursive: true })
function compile(args) {
  const result = spawnSync('cl.exe', args, { cwd: output, env: environment, encoding: 'utf8', windowsHide: true })
  if (result.stdout) console.log(result.stdout)
  if (result.stderr) console.error(result.stderr)
  if (result.error || result.status !== 0) throw result.error ?? Error('Learning native compilation failed.')
}
compile(['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', '/LD', '/D_WIN32_WINNT=0x0A00',
  '/DNAPI_VERSION=8', '/DNODE_GYP_MODULE_NAME=learning_job', '/DHOST_BINARY="node.exe"',
  `/I${join(headers, 'include/node')}`, join(root, 'src/main/services/learning/runtime/native/learning-job.cpp'), hook,
  `/Fo${output}\\`, `/Fe${join(output, 'learning-job.node')}`, '/link', join(headers, 'x64/node.lib'), 'delayimp.lib', '/DELAYLOAD:node.exe'])
if (process.argv.includes('--test-fixtures')) compile(['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD',
  join(root, 'tests/fixtures/learning/native-allocator.cpp'), `/Fo${output}\\`, `/Fe${join(output, 'native-allocator.exe')}`])
console.log(`Built Learning Node-API 8 module for Electron ${electron.version} / Windows x64.`)

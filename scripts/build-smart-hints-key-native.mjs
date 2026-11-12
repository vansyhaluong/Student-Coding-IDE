/* global process, console */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Secure key input requires Windows x64.')
const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
const headers = join(process.env.LOCALAPPDATA, 'node-gyp/Cache', electron.version)
const hook = join(dirname(process.execPath), 'node_modules/npm/node_modules/node-gyp/src/win_delay_load_hook.cc')
for (const file of [join(headers, 'include/node/node_api.h'), join(headers, 'x64/node.lib'), hook]) {
  if (!existsSync(file)) throw Error('Existing native prerequisites missing; no download attempted.')
}
const vswhere = join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe')
const vs = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
  '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true }).trim()
if (!vs) throw Error('Existing MSVC x64 compiler unavailable.')
const text = execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c',
  `""${join(vs, 'VC/Auxiliary/Build/vcvars64.bat')}" >nul && set"`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
const env = { ...process.env }
for (const line of text.split(/\r?\n/)) { const at = line.indexOf('='); if (at > 0) env[line.slice(0, at)] = line.slice(at + 1) }
const output = process.env.STUDENT_IDE_BUILD_ROOT ? join(process.env.STUDENT_IDE_BUILD_ROOT, 'main/native') : join(root, 'out/main/native'); mkdirSync(output, { recursive: true })
const result = spawnSync('cl.exe', ['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', '/LD',
  '/D_WIN32_WINNT=0x0A00', '/DNAPI_VERSION=8', '/DNODE_GYP_MODULE_NAME=smart_hints_key', '/DHOST_BINARY="node.exe"',
  `/I${join(headers, 'include/node')}`, join(root, 'src/main/services/learning/smart-hints/native/key-entry.cpp'), hook,
  `/Fo${output}\\`, `/Fe${join(output, 'smart-hints-key.node')}`, '/link', join(headers, 'x64/node.lib'),
  'user32.lib', 'gdi32.lib', 'delayimp.lib', '/DELAYLOAD:node.exe'], { cwd: output, env, encoding: 'utf8', windowsHide: true })
if (result.stdout) console.log(result.stdout)
if (result.stderr) console.error(result.stderr)
if (result.error || result.status !== 0) throw Error('Secure key native compilation failed.')
console.log(`Built Main-only secure key input for Electron ${electron.version}, Node-API8.`)

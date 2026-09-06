/* global process, console */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('The Run native build currently requires Windows x64.')
}
const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
const headers = join(process.env.LOCALAPPDATA, 'node-gyp/Cache', electron.version)
for (const path of [join(headers, 'include/node/node_api.h'), join(headers, 'x64/node.lib')]) {
  if (!existsSync(path)) throw new Error('Existing Electron headers/import library unavailable; no download attempted.')
}
const vswhere = join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe')
const visualStudio = execFileSync(vswhere, ['-latest', '-products', '*', '-requires',
  'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
{ encoding: 'utf8', windowsHide: true }).trim()
if (!visualStudio) throw new Error('Existing MSVC x64 toolchain was not found.')
const vcvars = join(visualStudio, 'VC/Auxiliary/Build/vcvars64.bat')
// Capture the compiler environment locally; never log an environment dump.
const environmentText = execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c',
  `""${vcvars}" >nul && set"`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
const environment = { ...process.env }
for (const line of environmentText.split(/\r?\n/)) {
  const separator = line.indexOf('=')
  if (separator > 0) environment[line.slice(0, separator)] = line.slice(separator + 1)
}
const output = join(root, 'out/main/native')
mkdirSync(output, { recursive: true })
const delayHook = join(dirname(process.execPath), 'node_modules/npm/node_modules/node-gyp/src/win_delay_load_hook.cc')
if (!existsSync(delayHook)) throw new Error('Existing npm/node-gyp Windows delay-load hook unavailable.')
const result = spawnSync('cl.exe', ['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', '/LD',
  '/D_WIN32_WINNT=0x0A00', '/DNAPI_VERSION=8', '/DNODE_GYP_MODULE_NAME=run_process',
  '/DHOST_BINARY="node.exe"',
  `/I${join(headers, 'include/node')}`, join(root, 'src/main/services/run/native/run-process.cpp'),
  delayHook, `/Fo${output}\\`, `/Fe${join(output, 'run-process.node')}`,
  '/link', join(headers, 'x64/node.lib'), 'delayimp.lib', '/DELAYLOAD:node.exe'], {
  cwd: output, env: environment, encoding: 'utf8', windowsHide: true,
})
if (result.stdout) console.log(result.stdout)
if (result.stderr) console.error(result.stderr)
if (result.error) throw result.error
if (result.status !== 0) throw new Error('Run native compilation failed.')
console.log(`Built Run Node-API 8 module for Electron ${electron.version} / Windows x64.`)

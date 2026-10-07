/* global process, console */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const spike = dirname(fileURLToPath(import.meta.url)), root = resolve(spike, '../..')
const electron = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
const headers = join(process.env.LOCALAPPDATA, 'node-gyp/Cache', electron.version)
const vswhere = join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe')
const visualStudio = execFileSync(vswhere, ['-latest', '-products', '*', '-requires',
  'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
{ encoding: 'utf8', windowsHide: true }).trim()
const vcvars = join(visualStudio, 'VC/Auxiliary/Build/vcvars64.bat')
const environmentText = execFileSync(process.env.ComSpec, ['/d', '/s', '/c',
  `""${vcvars}" >nul && set"`], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true })
const environment = { ...process.env }
for (const line of environmentText.split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0) environment[line.slice(0, at)] = line.slice(at + 1)
}
const output = join(spike, 'out/native')
mkdirSync(output, { recursive: true })
const delayHook = join(dirname(process.execPath), 'node_modules/npm/node_modules/node-gyp/src/win_delay_load_hook.cc')
if (!existsSync(delayHook) || !existsSync(join(headers, 'x64/node.lib'))) throw new Error('Existing toolchain unavailable; no download')
const result = spawnSync('cl.exe', ['/nologo', '/std:c++17', '/EHsc', '/W4', '/WX', '/MD', '/LD',
  '/D_WIN32_WINNT=0x0A00', '/DNAPI_VERSION=8', '/DNODE_GYP_MODULE_NAME=run_probe', '/DHOST_BINARY="node.exe"',
  `/I${join(headers, 'include/node')}`, join(spike, 'native-prototype.cpp'), delayHook,
  `/Fo${output}\\`, `/Fe${join(output, 'run-probe.node')}`, '/link', join(headers, 'x64/node.lib'),
  'delayimp.lib', '/DELAYLOAD:node.exe'], { cwd: output, env: environment, encoding: 'utf8', windowsHide: true })
console.log(result.stdout)
if (result.stderr) console.error(result.stderr)
if (result.error || result.status !== 0) throw result.error ?? new Error('Probe compilation failed')

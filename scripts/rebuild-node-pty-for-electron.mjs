/* global console, process */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  console.log('Skipping the Windows-only node-pty Job rebuild on this platform.')
  process.exit(0)
}
if (process.arch !== 'x64') {
  throw new Error(`The Phase 2E Windows Job build is approved only for x64, not ${process.arch}.`)
}

const CAPABILITY = 'student-coding-ide-windows-job-v1'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const nodePtyRoot = join(repositoryRoot, 'node_modules', 'node-pty')
const electronPackage = JSON.parse(
  readFileSync(join(repositoryRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
)
const nodeGyp = findNodeGyp()
const buildEnvironment = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronPackage.version,
  npm_config_arch: 'x64',
  npm_config_disturl: 'https://electronjs.org/headers',
}

run(process.execPath, [nodeGyp, 'rebuild'], nodePtyRoot, buildEnvironment)
run(
  process.execPath,
  [join(nodePtyRoot, 'scripts', 'post-install.js')],
  nodePtyRoot,
  buildEnvironment,
)

const binaryPath = join(nodePtyRoot, 'build', 'Release', 'conpty.node')
if (!existsSync(binaryPath)) {
  throw new Error('The patched Electron conpty.node was not produced.')
}

const electronExecutable = join(
  repositoryRoot,
  'node_modules',
  'electron',
  'dist',
  'electron.exe',
)
const verification = [
  `const pty = require(${JSON.stringify(nodePtyRoot)})`,
  `if (pty.supportsWindowsJobOwnership() !== ${JSON.stringify(CAPABILITY)}) process.exit(2)`,
].join(';')
run(electronExecutable, ['-e', verification], repositoryRoot, {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1',
})

console.log(
  `Verified patched node-pty ${electronPackage.version} Electron x64 capability load.`,
)

function findNodeGyp() {
  const candidates = [
    process.env.npm_execpath
      ? resolve(dirname(process.env.npm_execpath), '..', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
      : '',
    resolve(
      dirname(process.execPath),
      'node_modules',
      'npm',
      'node_modules',
      'node-gyp',
      'bin',
      'node-gyp.js',
    ),
  ]
  const found = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!found) throw new Error('The npm-bundled node-gyp entry point was not found.')
  return found
}

function run(executable, args, cwd, env) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${executable} failed with exit code ${result.status}.`)
  }
}

/* global process */

import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronExecutable = join(
  repositoryRoot,
  'node_modules',
  'electron',
  'dist',
  'electron.exe',
)
const smokeScript = join(repositoryRoot, 'scripts', 'smoke-windows-terminal-job.cjs')
const result = spawnSync(
  electronExecutable,
  ['-e', `require(${JSON.stringify(smokeScript)})`],
  {
    cwd: repositoryRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true,
    timeout: 45_000,
  },
)

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`Windows terminal Job smoke failed with exit code ${result.status}.`)
}

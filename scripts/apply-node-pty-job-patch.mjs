/* global console */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_VERSION = '1.1.0'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const packageRoot = join(repositoryRoot, 'node_modules', 'node-pty')
const patchPath = join(
  repositoryRoot,
  'patches',
  'node-pty+1.1.0+windows-job-object.patch',
)
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))

if (packageJson.version !== EXPECTED_VERSION) {
  throw new Error(
    `Refusing to patch node-pty ${packageJson.version}; expected exactly ${EXPECTED_VERSION}.`,
  )
}

if (gitApply(['--check', patchPath]).status === 0) {
  const applied = gitApply([patchPath])
  if (applied.status !== 0) fail('node-pty patch application failed', applied)
} else {
  const alreadyApplied = gitApply(['--reverse', '--check', patchPath])
  if (alreadyApplied.status !== 0) {
    fail('node-pty sources match neither the pristine nor patched state', alreadyApplied)
  }
}

const nativeSource = readFileSync(join(packageRoot, 'src', 'win', 'conpty.cc'), 'utf8')
if (!nativeSource.includes('student-coding-ide-windows-job-v1')) {
  throw new Error('The node-pty Windows Job capability marker is missing after patching.')
}

console.log(`Verified Student Coding IDE node-pty ${EXPECTED_VERSION} Windows Job patch.`)

function gitApply(args) {
  return spawnSync('git', [
    'apply',
    '--ignore-space-change',
    '--directory=node_modules/node-pty',
    ...args,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function fail(message, result) {
  const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  throw new Error(detail ? `${message}: ${detail}` : message)
}

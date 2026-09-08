/* global console, process, setTimeout, clearTimeout */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const require = createRequire(import.meta.url)
const binding = require(resolve('out/main/native/run-process.node'))
let directory
const handles = new Set()
async function execute(executable, args) {
  return new Promise((resolveResult, reject) => {
    let stdout = '', stderr = '', exitCode, outEof = false, errEof = false
    const timer = setTimeout(() => {
      binding.control(handle, 'terminate')
      reject(new Error('Git native smoke deadline'))
    }, 10000)
    const environment = Object.entries(process.env)
      .filter(([key, value]) => value !== undefined && !/^GIT_/i.test(key))
      .map(([key, value]) => `${key}=${value}`)
    environment.push('GIT_TERMINAL_PROMPT=0')
    const handle = binding.createGit(executable, args, directory, environment, (event) => {
      if (event.type === 'stdout') stdout += event.data.toString('utf8')
      if (event.type === 'stderr') stderr += event.data.toString('utf8')
      if (event.type === 'stdout-eof') outEof = true
      if (event.type === 'stderr-eof') errEof = true
      if (event.type === 'exit') { exitCode = event.exitCode; binding.control(handle, 'terminate') }
      if (event.type === 'settled') {
        clearTimeout(timer)
        try {
          assert.equal(exitCode, 0, stderr)
          assert.ok(outEof && errEof)
          assert.equal(binding.control(handle, 'count'), 0)
          binding.control(handle, 'release')
          handles.delete(handle)
          resolveResult(stdout)
        } catch (error) { reject(error) }
      }
    })
    handles.add(handle)
  })
}

async function main() {
try {
  await app.whenReady()
  assert.equal(process.type, 'browser')
  assert.equal(typeof binding.create, 'function')
  assert.equal(typeof binding.createGit, 'function')
  const pathValue = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? ''
  const executable = pathValue.split(';').map((entry) => join(entry.replace(/^"|"$/g, ''), 'git.exe'))
    .find((candidate) => /^[a-z]:[\\/]/i.test(candidate) && existsSync(candidate))
  assert.ok(executable, 'Windows PATH git.exe required')
  directory = await mkdtemp(join(tmpdir(), 'student-ide-git-electron-'))
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep))
  const git = (...args) => execute(executable, args)
  await git('init', '--quiet', '--initial-branch=main')
  await git('config', 'user.name', 'Electron Git Smoke')
  await git('config', 'user.email', 'smoke@example.invalid')
  await git('config', 'commit.gpgsign', 'false')
  await git('config', 'core.hooksPath', join(directory, '.git', 'hooks'))
  await writeFile(join(directory, 'file.txt'), 'native Git smoke')
  await git('add', '--', 'file.txt')
  const message = 'tiếng Việt "quoted" trailing\\'
  await git('commit', '-m', message)
  assert.equal((await git('log', '-1', '--format=%s')).trim(), message)
  assert.equal(handles.size, 0)
  console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron,
    git: (await git('--version')).trim(), checks: ['Git argv Unicode/quotes/backslash', 'real commit/history',
      'root exit and both pipe EOFs', 'empty Job before release', 'Run entry retained'] }))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  for (const handle of handles) binding.control(handle, 'terminate')
  if (directory && handles.size === 0) await rm(directory, { recursive: true, force: true })
  app.exit(process.exitCode ?? 0)
}
}
void main()

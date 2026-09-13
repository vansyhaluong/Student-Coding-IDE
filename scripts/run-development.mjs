/* global process */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { developmentEnvironment } from './development-environment.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cli, 'dev', ...process.argv.slice(2)], {
  cwd: root,
  env: developmentEnvironment(root),
  stdio: 'inherit',
  windowsHide: true,
})

child.once('error', () => { process.exitCode = 1 })
child.once('exit', code => { process.exitCode = code ?? 1 })

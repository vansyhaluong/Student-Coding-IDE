/* global process, setInterval, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process')
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  detached: true, stdio: 'ignore', windowsHide: true,
})
child.once('spawn', () => {
  process.stdout.write('child-ready\n', () => process.exit(0))
})
child.once('error', () => process.exit(1))
setInterval(() => {}, 1000)

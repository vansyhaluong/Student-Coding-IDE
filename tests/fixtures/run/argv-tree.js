/* global process, setInterval, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process')
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  detached: true, stdio: 'ignore', windowsHide: true, shell: false,
})
child.once('spawn', () => {
  process.stdout.write(`${child.pid}\n`, () => {
    if (process.argv[2] === 'root-first') process.exit(0)
  })
})
child.once('error', () => process.exit(1))
setInterval(() => {}, 1000)

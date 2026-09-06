// Isolated fixture: never loads project code or opens network connections.
/* global require, process, console, setInterval, __filename */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Standalone Node CommonJS spike fixture.
const { spawn } = require('node:child_process')
const mode = process.argv[2]
if (mode === 'basic') {
  console.log('stdout-test')
  console.error('stderr-test')
  process.exit(0)
}
if (mode === 'leaf') {
  console.log(`PID:${process.pid}`)
  setInterval(() => {}, 1000)
  process.send('ready')
} else if (mode === 'branch') {
  console.log(`PID:${process.pid}`)
  const child = spawn(process.execPath, [__filename, 'leaf'], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'], shell: false,
  })
  child.once('message', () => {
    process.send('ready')
    process.disconnect()
  })
} else if (mode === 'tree' || mode === 'root-first') {
  const child = spawn(process.execPath, [__filename, 'branch'], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'], shell: false,
    detached: mode === 'root-first',
  })
  child.once('message', () => {
    console.log('READY')
    if (mode === 'root-first') process.exit(0)
  })
} else if (mode === 'long') {
  console.log('READY')
  setInterval(() => {}, 1000)
} else {
  throw new Error('Unknown controlled fixture mode')
}

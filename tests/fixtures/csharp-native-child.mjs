/* global process, setInterval */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const filename = fileURLToPath(import.meta.url)
if (process.argv[2] === 'child') {
  process.stdout.write('CHILD:' + process.pid + '\n')
  setInterval(() => {}, 1000)
} else {
  const child = spawn(process.execPath, [filename, 'child'], {
    shell: false, windowsHide: true, detached: true, stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.on('error', () => process.exit(2))
  if (process.argv[2] !== 'blocked') process.stdin.on('data', (data) => process.stdout.write(data))
  process.stderr.write('STDERR\n')
  setInterval(() => {}, 1000)
}

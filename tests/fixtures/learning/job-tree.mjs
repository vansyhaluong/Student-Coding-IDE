/* global process, console, setInterval */
import { spawn } from 'node:child_process'
const child = spawn(process.execPath, ['-e', "console.log('CHILD_READY '+process.pid);setInterval(()=>{},1000)"], {
  stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
})
console.log('ROOT_READY ' + process.pid)
console.log('CHILD ' + child.pid)
setInterval(() => {}, 1000)

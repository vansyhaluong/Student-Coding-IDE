/* global process, Buffer */
import { createRequire } from 'node:module'
const native = createRequire(import.meta.url)(process.argv[2])
let job = native.start(process.execPath, ['-e', 'setInterval(()=>{},1000)'], process.cwd(), 512 * 1024 ** 2, [])
native.submitInput(job, Buffer.alloc(1024 * 1024, 120))
native.control(job, 'resume')
const sample = native.poll(job)
process.send({ pid: sample.rootPid, pending: !sample.stdinSettled })
process.on('message', message => {
  if (message === 'gc') { job = undefined; globalThis.gc(); process.send({ collected: true }) }
  else process.exit(17)
})

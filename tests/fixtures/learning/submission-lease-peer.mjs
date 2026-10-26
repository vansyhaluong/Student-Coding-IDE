/* global process */
import { createRequire } from 'node:module'
// Dedicated S2 fixture. No Jobs, Runtime calls, source execution or stale-lock deletion.
const native = createRequire(import.meta.url)(process.argv[2])
if (native.capability !== 'student-ide-learning-job-v1') throw Error('Lease capability unavailable')
const handle = native.acquireLease(process.argv[3])
process.send({ type: handle ? 'acquired' : 'busy' })
if (!handle) process.disconnect()
else process.on('message', message => {
  if (message === 'release') {
    native.observation(handle, 'close')
    process.send({ type: 'released' }, () => process.disconnect())
  }
})

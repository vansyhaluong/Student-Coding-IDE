/* global process, setInterval, clearInterval */
import { createRequire } from 'node:module'
const native = createRequire(import.meta.url)(process.argv[2])
const lease = native.acquireLease(process.argv[3])
if (!lease) throw Error('Lease unavailable')
const environment = Object.entries(process.env).filter(([key, value]) => value !== undefined
  && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key))
  .sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase())).map(([key, value]) => `${key}=${value}`)
const job = native.start(process.argv[5] || process.execPath, [process.argv[4]], process.cwd(), 512 * 1024 ** 2, environment)
native.control(job, 'resume')
let output = '', ready = false
process.stdout.write('OWNER_HOST ' + JSON.stringify({ node: process.version, electron: process.versions.electron }) + '\n')
const timer = setInterval(() => {
  const sample = native.poll(job)
  output += sample.stdout.toString('utf8')
  if (sample.stderr.length) process.stderr.write(sample.stderr)
  if (!ready && sample.observerSettled) throw Error('Owned root exited before readiness: ' + output)
  if (!ready && /CHILD_READY/.test(output) && sample.retained.length >= 2) {
    ready = true
    process.send({ type: 'ready', pids: sample.retained.map(p => p.pid), electron: process.versions.electron, node: process.version })
  }
}, 15)
process.on('message', message => {
  if (message === 'exit-owner') {
    clearInterval(timer)
    // Deliberately leave Job and lease open: OS owner termination is the test.
    process.exit(17)
  }
})

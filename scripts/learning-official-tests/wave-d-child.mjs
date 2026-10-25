/* global process,Buffer */
// E2-WAVE-D-REFERENCE-ONLY. Fixed trusted CJS references, not a student executor.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ids = ["ch8-02","ch8-03","ch8-04","ch8-05","ch8-06","ch8-07","ch8-09"]
const id = process.argv[2]
if (process.argv.length !== 3 || !ids.includes(id)) throw new Error('UNKNOWN_ID')
const chunks = []; let bytes = 0
for await (const chunk of process.stdin) {
  bytes += chunk.length; if (bytes > 1024 * 1024) throw new Error('INPUT_LIMIT')
  chunks.push(chunk)
}
// Only parent-validated trusted authoring requests, never an admission parser.
const rows = JSON.parse(Buffer.concat(chunks).toString('utf8'))
if (!Array.isArray(rows) || rows.length > 64) throw new Error('COUNT')
const solve = require(`./references/${id}/solution.js`)
process.stdout.write(JSON.stringify(rows.map(args => solve(...args))))

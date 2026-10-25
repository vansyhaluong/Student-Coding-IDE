/* global process,Buffer */
// E2-WAVE-A-REFERENCE-ONLY. Fixed trusted CJS references, not a student executor.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ids = ["ch2-01","ch2-02","ch2-03","ch2-05","ch2-06","ch2-07","ch2-08","ch2-09","ch3-01","ch3-02","ch3-03","ch3-05","ch3-06","ch3-07","ch3-08","ch3-09","ch4-01","ch4-02","ch4-03","ch4-04","ch4-05","ch4-06","ch4-07","ch4-08"]
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

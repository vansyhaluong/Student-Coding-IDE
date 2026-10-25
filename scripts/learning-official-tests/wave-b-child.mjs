/* global process,Buffer */
// E2-WAVE-B-REFERENCE-ONLY. Fixed trusted CJS references, not a student executor.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ids = ["ch5-01","ch5-02","ch5-04","ch5-05","ch5-06","ch5-08","ch5-09","ch6-01","ch6-02","ch6-03","ch6-04","ch6-05","ch6-06","ch6-07","ch6-08","ch6-09"]
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

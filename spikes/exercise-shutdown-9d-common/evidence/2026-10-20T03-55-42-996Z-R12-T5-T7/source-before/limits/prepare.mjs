/* global process, console */
import { inventory, spike, output as staged } from '../staged-integrity.mjs'
import { mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-R10-limits`
const evidence = join(spike, 'evidence', runId), output = join(staged, 'limits')
mkdirSync(join(evidence, 'source-before'), { recursive: true }); mkdirSync(output, { recursive: true })
for (const f of readdirSync(spike, { withFileTypes: true })) if (f.isFile()) copyFileSync(join(spike, f.name), join(evidence, 'source-before', f.name))
const baseline = inventory(evidence)
// Only the spike report is authorized to change among existing tracked files.
delete baseline['spikes/exercise-shutdown-9d-common/REPORT.md']
writeFileSync(join(evidence, 'baseline.json'), JSON.stringify({ runId, evidence, output, baseline }, null, 2))
writeFileSync(join(output, 'active.json'), JSON.stringify({ runId, evidence, output }, null, 2))
console.log(evidence)

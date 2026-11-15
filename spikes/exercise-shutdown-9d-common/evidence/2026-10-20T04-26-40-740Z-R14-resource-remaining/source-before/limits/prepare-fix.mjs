/* global process, console */
import { inventory, spike, output as staged } from '../staged-integrity.mjs'
import { mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const label = process.argv[2]
if (!['R11-T4-tree', 'R12-T5-T7'].includes(label)) throw Error('Select authorized continuation label')
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`
const evidence = join(spike, 'evidence', runId), output = join(staged, 'limits-fix')
mkdirSync(join(evidence, 'source-before/limits'), { recursive: true }); mkdirSync(output, { recursive: true })
for (const f of readdirSync(spike, { withFileTypes: true })) if (f.isFile()) copyFileSync(join(spike, f.name), join(evidence, 'source-before', f.name))
for (const f of readdirSync(join(spike, 'limits'), { withFileTypes: true })) if (f.isFile()) copyFileSync(join(spike, 'limits', f.name), join(evidence, 'source-before/limits', f.name))
const baseline = inventory(evidence)
for (const file of ['REPORT.md', 'limits/allocator.cpp', 'limits/run.mjs']) delete baseline[`spikes/exercise-shutdown-9d-common/${file}`]
writeFileSync(join(evidence, 'baseline.json'), JSON.stringify({ runId, evidence, output, baseline }, null, 2))
writeFileSync(join(staged, 'limits/active.json'), JSON.stringify({ runId, evidence, output }, null, 2))
console.log(evidence)

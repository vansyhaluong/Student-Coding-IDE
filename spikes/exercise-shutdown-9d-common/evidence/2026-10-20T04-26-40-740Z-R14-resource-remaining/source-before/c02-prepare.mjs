import { inventory, spike, output } from './staged-integrity.mjs'
import { mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import console from 'node:console'
const label = process.argv[2] ?? 'R7-C02'
if (!/^R\d+-C02$/.test(label)) throw Error('Invalid evidence label')
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`
const evidence = join(spike, 'evidence', runId)
mkdirSync(join(evidence, 'source-before'), { recursive: true })
for (const f of readdirSync(spike, { withFileTypes: true })) if (f.isFile()) copyFileSync(join(spike, f.name), join(evidence, 'source-before', f.name))
writeFileSync(join(evidence, 'baseline.json'), JSON.stringify({ runId, evidence, baseline: inventory(evidence) }, null, 2))
writeFileSync(join(output, 'active-run.json'), JSON.stringify({ runId, evidence, output }, null, 2))
console.log(evidence)

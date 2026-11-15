// Spike-only integrity inventory. Never traverses .git or deletes files.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
export const spike = dirname(fileURLToPath(import.meta.url)), repo = resolve(spike, '../..')
export const output = join(repo, 'out/exercise-shutdown-9d-common/staged')
export function inventory(excludedEvidence) {
  const hashes = {}
  const add = file => { if (existsSync(join(repo, file))) hashes[file] = createHash('sha256').update(readFileSync(join(repo, file))).digest('hex') }
  for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean)) add(file)
  function walk(dir) {
    const absolute = resolve(repo, dir)
    if (!existsSync(absolute) || absolute === output || absolute === excludedEvidence) return
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(name)
      else if (entry.isFile()) add(name)
    }
  }
  for (const dir of ['src', 'scripts', 'docs', 'out/main', 'out/exercise-runtime-9d0',
    'out/exercise-shutdown-9d-common', 'spikes/exercise-runtime-9d0',
    'spikes/exercise-shutdown-9d-common/evidence', 'node_modules/node-pty/prebuilds', 'node_modules/node-pty/build/Release']) walk(dir)
  return hashes
}
export function currentRun() { return JSON.parse(readFileSync(join(output, 'active-run.json'), 'utf8')) }
if (process.argv.includes('--prepare')) {
  if (execFileSync('git', ['branch', '--show-current'], { cwd: repo, encoding: 'utf8' }).trim() !== 'feature/phase-9a-learning-mode') throw Error('Wrong branch')
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-R6-staged`
  const evidence = join(spike, 'evidence', runId)
  mkdirSync(join(evidence, 'source-before'), { recursive: true }); mkdirSync(output, { recursive: true })
  for (const file of readdirSync(spike, { withFileTypes: true })) if (file.isFile()) copyFileSync(join(spike, file.name), join(evidence, 'source-before', file.name))
  const run = { runId, evidence, output, baseline: inventory(evidence) }
  writeFileSync(join(evidence, 'baseline.json'), JSON.stringify(run, null, 2))
  writeFileSync(join(output, 'active-run.json'), JSON.stringify({ runId, evidence, output }, null, 2))
  console.log(JSON.stringify({ runId, evidence, checkedFiles: Object.keys(run.baseline).length }))
}

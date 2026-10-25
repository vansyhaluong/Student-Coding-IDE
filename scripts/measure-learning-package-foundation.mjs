/* global console, process */
// Step5 acceptance only. Bundles instrumentation, never production assets/code.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const require = createRequire(import.meta.url)
const directory = resolve('out', `package-foundation-step5-${Date.now()}`)
await mkdir(directory, { recursive: true })
const entry = join(directory, 'measurement.cjs')
await build({ entryPoints: ['tests/fixtures/learning/package-foundation-measurement.ts'], outfile: entry,
  platform: 'node', format: 'cjs', bundle: true, external: ['electron'], sourcemap: true })
const runs = []
for (const scenario of ['production', 'large-string', 'dense-nodes', 'maximum-registry']) {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const code = await new Promise((accept, reject) => {
    const child = spawn(require('electron'), ['--js-flags=--expose-gc', entry, directory, scenario], {
      cwd: process.cwd(), env: environment, stdio: 'inherit', windowsHide: true,
    })
    child.once('error', reject); child.once('exit', code => accept(code))
  })
  runs.push({ scenario, exitCode: code })
  if (code !== 0) break
}
await writeFile(join(directory, 'runs.json'), JSON.stringify({ directory, runs }, null, 2))
console.log(JSON.stringify({ directory, runs }))
// Measured target failures are evidence, not an instrumentation crash.
process.exitCode = runs.some(run => run.exitCode !== 0) ? 1 : 0

/* global console, process */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { developmentEnvironment } from './development-environment.mjs'

const require = createRequire(import.meta.url), output = resolve('out', `step5-app-diagnostics-${Date.now()}`)
await mkdir(output, { recursive: true })
const entry = join(output, 'wrapper.mjs'), smoke = join(output, 'smoke.mjs')
let source = await readFile('scripts/smoke-learning-csharp-run.mjs', 'utf8')
source = source.replace("from './learning-monaco-source-observer.mjs'", 'from ' + JSON.stringify(pathToFileURL(resolve('scripts/learning-monaco-source-observer.mjs')).href))
// Only a marker for chronological association; assertions/workload are unchanged.
source = 'globalThis.__step5Diagnostics.mark("smoke.entry")\n' + source
if (process.argv.includes('--native-only')) {
  const target = 'const handle = native.start(...args), sample = native.poll(handle)'
  if (!source.includes(target)) throw Error('Native smoke probe mismatch')
  source = source.replace(target, 'const handle = globalThis.__step5Diagnostics.sync("native.start", () => native.start(...args)), sample = native.poll(handle)')
}
await writeFile(smoke, source)
await build({ entryPoints: ['tests/fixtures/learning/step5-app-diagnostics.ts'], outfile: entry,
  platform: 'node', format: 'esm', bundle: true, external: ['electron', 'typescript'], sourcemap: true })
const runs = []
for (const mode of process.argv.includes('--native-only') ? ['native'] : process.argv.includes('--stages-only') ? ['stages'] : ['plain', 'stages', 'cpu']) {
  const environment = developmentEnvironment(process.cwd()); delete environment.ELECTRON_RUN_AS_NODE
  const directory = join(output, mode); await mkdir(directory, { recursive: true })
  let log = ''
  const exitCode = await new Promise((accept, reject) => {
    const child = spawn(require('electron'), [entry, directory, mode, smoke, '--presentation'], { env: environment, cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', chunk => { log += chunk; process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { log += chunk; process.stderr.write(chunk) })
    child.once('error', reject); child.once('exit', accept)
  })
  await writeFile(join(directory, 'run.log'), log)
  runs.push({ mode, exitCode }); await writeFile(join(output, 'runs.json'), JSON.stringify({ output, runs }, null, 2))
}
console.log(JSON.stringify({ output, runs }))

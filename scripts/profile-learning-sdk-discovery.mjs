/* global console, process */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { developmentEnvironment } from './development-environment.mjs'
const require = createRequire(import.meta.url), output = resolve('out', `s5-r1-sdk-${Date.now()}`)
await mkdir(output, { recursive: true })
const protectedFiles = ['src/main/services/learning/runtime/csharp-sdk-resolver.ts', 'src/main/services/learning/runtime/csharp-runtime-files.ts', 'src/main/services/learning/runtime/csharp-execution-adapter.ts', 'src/main/services/learning/runtime/csharp-compiler.ts', 'src/main/services/learning/runtime/exercise-limits.ts', 'out/main/index.js']
async function hashes() { return Object.fromEntries(await Promise.all(protectedFiles.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])))}
await writeFile(join(output, 'before.json'), JSON.stringify(await hashes(), null, 2))
let source = await readFile('scripts/smoke-learning-csharp-run.mjs', 'utf8')
source = source.replace("from './learning-monaco-source-observer.mjs'", 'from ' + JSON.stringify(pathToFileURL(resolve('scripts/learning-monaco-source-observer.mjs')).href))
const smoke = join(output, 'smoke.mjs'), entry = join(output, 'wrapper.mjs')
await writeFile(smoke, source)
await build({ entryPoints: ['tests/fixtures/learning/sdk-discovery-diagnostics.ts'], outfile: entry, platform: 'node', format: 'esm', bundle: true, external: ['electron', 'typescript'] })
const runs = []
for (const [index, mode] of (process.argv.includes('--followup') ? ['detail'] : ['plain', 'detail', 'detail', 'plain']).entries()) {
  const directory = join(output, `${index + 1}-${mode}`); await mkdir(directory)
  const env = developmentEnvironment(process.cwd()); delete env.ELECTRON_RUN_AS_NODE
  let log = ''; const began = new Date().toISOString()
  const exitCode = await new Promise((accept, reject) => {
    const child = spawn(require('electron'), [entry, directory, mode, smoke, ...(process.argv.includes('--followup') ? ['--r1-followup'] : []), '--presentation'], { env, cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', c => { log += c; process.stdout.write(c) }); child.stderr.on('data', c => { log += c; process.stderr.write(c) })
    child.once('error', reject); child.once('exit', accept)
  })
  await writeFile(join(directory, 'run.log'), log)
  runs.push({ index: index + 1, mode, began, finished: new Date().toISOString(), exitCode }); await writeFile(join(output, 'runs.json'), JSON.stringify({ output, runs }, null, 2))
}
await writeFile(join(output, 'after.json'), JSON.stringify(await hashes(), null, 2))
console.log(JSON.stringify({ output, runs }))

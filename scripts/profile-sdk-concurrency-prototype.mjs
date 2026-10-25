/* global console, process */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prototypeSource } from './sdk-concurrency-prototype-source.mjs'
import { developmentEnvironment } from './development-environment.mjs'

const require = createRequire(import.meta.url), output = resolve('out', `sdk-concurrency-prototype-${Date.now()}`)
await mkdir(output, { recursive: true })
const protectedPaths = ['src/main/services/learning/runtime/csharp-sdk-resolver.ts', 'src/main/services/learning/runtime/csharp-runtime-files.ts', 'src/main/services/learning/runtime/csharp-compiler.ts', 'src/main/services/learning/runtime/csharp-execution-adapter.ts', 'src/main/services/learning/runtime/exercise-limits.ts', 'out/main/index.js']
async function hashes() { return Object.fromEntries(await Promise.all(protectedPaths.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])))}
await writeFile(join(output, 'before.json'), JSON.stringify(await hashes(), null, 2))
const original = await readFile(protectedPaths[0], 'utf8'), prototype = join(output, 'prototype.cjs')
let source = prototypeSource(original, resolve('tests/fixtures/learning/sdk-concurrency-pool.ts'))
source = source.replace("import { DomainError } from '../../../errors/app-error'", 'const DomainError = globalThis.__sdkPrototypeDomainError')
await writeFile(join(output, 'prototype.ts'), source)
await build({ stdin: { contents: source, sourcefile: 'prototype.ts', resolveDir: dirname(resolve(protectedPaths[0])), loader: 'ts' }, outfile: prototype, bundle: true, platform: 'node', format: 'cjs' })

// Reuse the already exercised R1 observer, retaining bounded aggregates rather
// than one record per filesystem call (less retention bias for RSS/GC).
source = await readFile('tests/fixtures/learning/sdk-discovery-diagnostics.ts', 'utf8')
source = source.replace("import { performance } from 'node:perf_hooks'", "import { performance, PerformanceObserver } from 'node:perf_hooks'")
source = source.replace('const followup = process.argv.includes', "const prototypePath = process.env.S5_R1_PROTOTYPE_MODULE\nconst variant = prototypePath ? 'prototype' : 'baseline'\nconst followup = process.argv.includes")
source = source.replace('const spans: object[] = [], files: object[] = [], host: object[] = []', `const spans: object[] = [], files: object[] = [], host: object[] = []
const aggregates = new Map<string, { op: string; parent?: number; category: string; n: number; ms: number; max: number; failures: number }>()
function recordFile(v: { op: string; parent?: number; category: string; ms: number; outcome?: string }) {
  const key = v.op + ':' + v.parent + ':' + v.category
  const row = aggregates.get(key) ?? { op: v.op, parent: v.parent, category: v.category, n: 0, ms: 0, max: 0, failures: 0 }
  row.n++; row.ms += v.ms; row.max = Math.max(row.max, v.ms); if (v.outcome && v.outcome !== 'OK') row.failures++
  aggregates.set(key, row)
}
globalThis.__sdkPrototypeMetrics = []
const memoryStart = process.memoryUsage(), memoryPeak = { ...memoryStart }, gc: number[] = []
const observer = new PerformanceObserver(list => { for (const e of list.getEntries()) gc.push(e.duration) }); observer.observe({ entryTypes: ['gc'] })
const memoryTimer = setInterval(() => { const m = process.memoryUsage(); for (const k of Object.keys(memoryPeak) as (keyof typeof m)[]) memoryPeak[k] = Math.max(memoryPeak[k], m[k]) }, 10)`)
source = source.replaceAll('files.push(', 'recordFile(')
source = source.replace('function instrument(file: string, source: string): string {', `function instrument(file: string, source: string): string {
  if (prototypePath && source.includes('new FilesystemCsharpSdkResolver()')) {
    const match = /const windowsProcessTreeTerminator = require\\(("[^"\\n]+")\\);/.exec(source)
    if (!match || source.split('new FilesystemCsharpSdkResolver()').length !== 2) throw Error('Prototype injection anchor mismatch')
    source = source.replace('new FilesystemCsharpSdkResolver()', 'new globalThis.__sdkPrototype.FilesystemCsharpSdkResolver()')
    source = 'globalThis.__sdkPrototypeDomainError = require(' + match[1] + ').DomainError; globalThis.__sdkPrototype = require(' + JSON.stringify(prototypePath) + ');\\n' + source
  }`)
source = source.replace("const owner = ts.isClassDeclaration(node.parent) ? node.parent.name?.text : ''", "const owner = (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent)) ? node.parent.name?.text ?? (ts.isVariableDeclaration(node.parent.parent) ? node.parent.parent.name.getText(tree) : '') : ''")
source = source.replace("mode === 'detail' && p.startsWith(resolve('out/main') + sep)", "mode === 'detail' && (p.startsWith(resolve('out/main') + sep) || p === prototypePath)")
source = source.replace("finished = true; clearInterval(timer);", "finished = true; clearInterval(timer); clearInterval(memoryTimer); observer.disconnect();")
source = source.replace('JSON.stringify({ mode, spans, files, host,', 'JSON.stringify({ variant, mode, spans, files: [...aggregates.values()], host, memoryStart, memoryPeak, memoryEnd: process.memoryUsage(), gc, prototypeMetrics: globalThis.__sdkPrototypeMetrics,')
const wrapper = join(output, 'wrapper.mjs'), smoke = join(output, 'smoke.mjs')
await writeFile(join(output, 'wrapper.ts'), source)
await build({ stdin: { contents: source, sourcefile: 'wrapper.ts', loader: 'ts', resolveDir: resolve('tests/fixtures/learning') }, outfile: wrapper, bundle: true, platform: 'node', format: 'esm', external: ['electron', 'typescript'] })
source = await readFile('scripts/smoke-learning-csharp-run.mjs', 'utf8')
source = source.replace("from './learning-monaco-source-observer.mjs'", 'from ' + JSON.stringify(pathToFileURL(resolve('scripts/learning-monaco-source-observer.mjs')).href))
await writeFile(smoke, source)
const runs = []
for (const [index, variant] of ['baseline', 'prototype', 'prototype', 'baseline'].entries()) {
  const directory = join(output, `${index + 1}-${variant}`); await mkdir(directory)
  const env = developmentEnvironment(process.cwd()); delete env.ELECTRON_RUN_AS_NODE; delete env.S5_R1_PROTOTYPE_MODULE
  if (variant === 'prototype') env.S5_R1_PROTOTYPE_MODULE = prototype
  let log = ''; const began = new Date().toISOString()
  const exitCode = await new Promise((accept, reject) => {
    const child = spawn(require('electron'), [wrapper, directory, 'detail', smoke, '--r1-followup', '--presentation'], { env, cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', c => { log += c; process.stdout.write(c) }); child.stderr.on('data', c => { log += c; process.stderr.write(c) })
    child.once('error', reject); child.once('exit', accept)
  })
  await writeFile(join(directory, 'run.log'), log); runs.push({ index: index + 1, variant, began, finished: new Date().toISOString(), exitCode })
  await writeFile(join(output, 'runs.json'), JSON.stringify({ output, runs }, null, 2))
}
await writeFile(join(output, 'after.json'), JSON.stringify(await hashes(), null, 2))
console.log(JSON.stringify({ output, runs }))

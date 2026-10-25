/* global console, process */
// S5-F1 acceptance only: reuse the exact retained Step5 inputs and workload.
import { build } from 'esbuild'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'

const require = createRequire(import.meta.url)
const baseline = resolve('out/package-foundation-step5-1792773151098')
const output = resolve('out', `s5-f1-correction-${Date.now()}`)
const scenarios = ['production', 'large-string', 'dense-nodes', 'maximum-registry']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const compiledPath = resolve('out/main/exercise-package-resources-runtime.js')
const compiled = await readFile(compiledPath, 'utf8')
const tree = ts.createSourceFile(compiledPath, compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
let compiledAnchor
function findAnchor(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'anchor') {
    if (!ts.isCallExpression(node.initializer) || node.initializer.expression.getText(tree) !== 'Object.freeze') throw Error('Unsupported Main anchor')
    compiledAnchor = JSON.parse(node.initializer.arguments[0].getText(tree))
  }
  ts.forEachChild(node, findAnchor)
}
findAnchor(tree)
if (!compiledAnchor) throw Error('Missing compiled Main anchor')
await mkdir(output, { recursive: true })
async function fingerprint() {
  const state = {}
  for (const scenario of scenarios) {
    const root = scenario === 'production' ? resolve('out/main/resources/learning/exercises') : join(baseline, `fixture-${scenario}/learning/exercises`)
    const raw = await readFile(join(root, 'manifest.json')), manifest = JSON.parse(raw)
    const old = JSON.parse(await readFile(join(baseline, scenario + '.json')))
    if (raw.length !== old.inventory.rawManifestBytes || manifest.packages.length !== old.inventory.packages) throw Error('Changed fixture inventory')
    const hash = createHash('sha256').update(raw)
    let bytes = raw.length, files = 1
    for (const descriptor of manifest.packages) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(descriptor.exerciseId)) throw Error('Invalid fixture identity')
      for (const asset of Object.values(descriptor.assets)) {
        if (!['exercise.json', 'samples.json', 'judge/v1.json', 'starters/csharp.txt', 'starters/javascript.txt'].includes(asset.path)) throw Error('Unexpected fixture path')
        const body = await readFile(join(root, descriptor.exerciseId, asset.path))
        if (body.length !== asset.bytes || digest(body) !== asset.sha256) throw Error('Fixture integrity changed')
        bytes += body.length; files++; hash.update(descriptor.exerciseId + '/' + asset.path + ':' + asset.sha256)
      }
    }
    if (old.inventory.logicalBytes !== undefined && old.inventory.logicalBytes !== bytes) throw Error('Fixture logical bytes changed')
    state[scenario] = { sha256: hash.digest('hex'), bytes, files, packages: manifest.packages.length }
  }
  return state
}
const before = await fingerprint()
const oldFingerprint = JSON.parse(await readFile('out/s5-f1-profile-1792775236645/inputs.json', 'utf8')).fingerprint
if (JSON.stringify(before) !== JSON.stringify(oldFingerprint)) throw Error('Inputs differ from historical profiling fingerprint')
const sources = ['bounded-package-json', 'exercise-package-work', 'exercise-package-validation', 'exercise-package-resources', 'exercise-package-registry', 'exercise-package-budget']
const hashes = {}
for (const name of sources) {
  const path = resolve('src/main/services/learning/content', name + '.ts')
  hashes[path] = digest(await readFile(path))
}
hashes[compiledPath] = digest(compiled)
await writeFile(join(output, 'inputs.json'), JSON.stringify({ baseline, compiledAnchor, hashes, fingerprint: before }, null, 2))

// Observe native atomic calls in a separate instrumented run. Plain runs have no
// source probes. Source transformations never touch on-disk production modules.
function atomics(path, source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), f = ts.factory
  const result = ts.transform(tree, [context => {
    const visit = node => {
      const updated = ts.visitEachChild(node, visit, context)
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(tree)
        const label = expression === 'JSON.parse' ? 'JSON.parse' : expression === 'structuredClone' ? 'structuredClone'
          : expression === 'matchesExerciseType' ? 'matchesExerciseType' : expression === 'JSON.stringify' ? 'JSON.stringify'
            : /TextDecoder.*\.decode$/.test(expression) ? 'UTF8.decode' : undefined
        if (label) return f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__s5Atomic'), undefined,
          [f.createStringLiteral(label), f.createArrowFunction(undefined, undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), updated)])
        if (['Object.freeze', 'Object.isFrozen'].includes(expression) && node.arguments[0]?.getText(tree) === 'value') {
          const probe = f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__s5Atomic'), undefined,
            [f.createStringLiteral(expression + '(array)'), f.createArrowFunction(undefined, undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), updated)])
          return f.createConditionalExpression(f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier('Array'), 'isArray'), undefined, [f.createIdentifier('value')]),
            undefined, probe, undefined, updated)
        }
      }
      return updated
    }
    return root => ts.visitNode(root, visit)
  }])
  const text = ts.createPrinter().printFile(result.transformed[0]); result.dispose(); return text
}
const runs = []
for (const mode of ['plain', 'atomics']) {
  const directory = join(output, mode); await mkdir(directory, { recursive: true })
  const entry = join(directory, 'measurement.cjs')
  await build({ entryPoints: ['tests/fixtures/learning/package-foundation-measurement.ts'], outfile: entry, platform: 'node', format: 'cjs',
    bundle: true, external: ['electron'], sourcemap: true, plugins: [{ name: 'retained-correction-inputs', setup(plugin) {
      plugin.onLoad({ filter: /package-foundation-measurement\.ts$/ }, async args => {
        let source = await readFile(args.path, 'utf8')
        const replace = (from, to) => { if (!source.includes(from)) throw Error('Measurement hook no longer matches: ' + from); source = source.replace(from, to) }
        replace("const synthetic = scenario === 'production' ? undefined : await fixture()", `const synthetic = scenario === 'production' ? undefined : {
          environment: { packaged: true, mainOutput: '', resourcesPath: ${JSON.stringify(baseline)} + '/fixture-' + scenario },
          anchor: { version: 1, rawBytes: (await readFile(${JSON.stringify(baseline)} + '/fixture-' + scenario + '/learning/exercises/manifest.json')).length,
            sha256: rawPackageDigest(await readFile(${JSON.stringify(baseline)} + '/fixture-' + scenario + '/learning/exercises/manifest.json')) },
          inventory: JSON.parse(await readFile(${JSON.stringify(baseline)} + '/' + scenario + '.json', 'utf8')).inventory }`)
        replace('async allocation => {', 'async (allocation, control) => {')
        replace('synthetic.anchor, observe(allocation))', 'synthetic.anchor, observe(allocation), control)')
        replace("await compiled.openBundledExerciseResources({ packaged: false, resourcesPath: process.resourcesPath }, observe(allocation))",
          `await openAnchoredExerciseResources({ packaged: false, mainOutput: resolve('out/main'), resourcesPath: process.resourcesPath }, ${JSON.stringify(compiledAnchor)}, observe(allocation), control)`)
        replace('readPackage: (id, scope) => resources.readPackage(id, observe(scope))', 'readPackage: (id, scope, work) => resources.readPackage(id, observe(scope), work)')
        replace('readPublicPackage: (id, scope) => resources.readPublicPackage(id, observe(scope))', 'readPublicPackage: (id, scope, work) => resources.readPublicPackage(id, observe(scope), work)')
        replace('const projected = lease.represent(', 'const projected = await lease.representCooperative(')
        replace('const clone = lease.copy()', 'const clone = await lease.copyCooperative()')
        if (mode === 'atomics') {
          source = `const atomicDurations: Record<string, number[]> = {}
            ;(globalThis as any).__s5Atomic = (label: string, work: () => unknown) => {
              const start = performance.now(); try { return work() } finally { (atomicDurations[label] ??= []).push(performance.now() - start) }
            }
          ` + source
          replace('await writeFile(join(directory, `${scenario}.json`)', 'await writeFile(join(directory, `${scenario}-atomics.json`), JSON.stringify(Object.fromEntries(Object.entries(atomicDurations).map(([key, values]) => [key, stats(values)])), null, 2))\n  await writeFile(join(directory, `${scenario}.json`)')
        }
        return { contents: source, loader: 'ts' }
      })
      if (mode === 'atomics') plugin.onLoad({ filter: /(?:bounded-package-json|exercise-package-(?:validation|registry|work))\.ts$/ }, async args => ({ contents: atomics(args.path, await readFile(args.path, 'utf8')), loader: 'ts' }))
    } }] })
  for (const scenario of scenarios) {
    const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
    const code = await new Promise((accept, reject) => {
      const child = spawn(require('electron'), ['--js-flags=--expose-gc', entry, directory, scenario], { cwd: process.cwd(), env: environment, stdio: 'inherit', windowsHide: true })
      child.once('error', reject); child.once('exit', code => accept(code))
    })
    runs.push({ mode, scenario, exitCode: code })
    if (code !== 0) throw Error('Correction measurement failed: ' + mode + '/' + scenario)
  }
}
const after = await fingerprint()
if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Fixture bytes changed')
for (const [path, hash] of Object.entries(hashes)) if (digest(await readFile(path)) !== hash) throw Error('Measured source changed')
await writeFile(join(output, 'runs.json'), JSON.stringify({ output, runs, historicalFingerprintMatch: true, fixtureBytesUnchanged: true, measuredSourcesUnchanged: true }, null, 2))
console.log(JSON.stringify({ output, runs, fixtureBytesUnchanged: true }))

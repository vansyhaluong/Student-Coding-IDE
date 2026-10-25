/* global console, process */
// Profiling only: transforms in-memory bundle copies, never production files.
import ts from 'typescript'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const baseline = resolve('out/package-foundation-step5-1792773151098')
const output = resolve('out', `s5-f1-profile-${Date.now()}`)
const scenarios = ['production', 'large-string', 'dense-nodes', 'maximum-registry']
const sources = ['bounded-package-json.ts', 'exercise-package-validation.ts', 'exercise-package-resources.ts', 'exercise-package-registry.ts', 'exercise-package-budget.ts']
const hashes = {}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
await mkdir(output, { recursive: true })
for (const name of sources) {
  const path = resolve('src/main/services/learning/content', name)
  hashes[path] = digest(await readFile(path))
}
const compiledPath = resolve('out/main/exercise-package-resources-runtime.js')
const compiled = await readFile(compiledPath, 'utf8')
hashes[compiledPath] = digest(compiled)
const compiledTree = ts.createSourceFile(compiledPath, compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
let compiledAnchor
function anchor(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(compiledTree) === 'anchor') {
    if (!ts.isCallExpression(node.initializer) || node.initializer.expression.getText(compiledTree) !== 'Object.freeze') throw Error('Unsupported compiled anchor encoding')
    compiledAnchor = JSON.parse(node.initializer.arguments[0].getText(compiledTree))
  }
  ts.forEachChild(node, anchor)
}
anchor(compiledTree)
if (!compiledAnchor) throw Error('No compiled Main anchor')

async function fingerprint() {
  const state = {}
  for (const scenario of scenarios) {
    const base = scenario === 'production' ? resolve('out/main/resources/learning/exercises') : join(baseline, `fixture-${scenario}/learning/exercises`)
    const raw = await readFile(join(base, 'manifest.json')), manifest = JSON.parse(raw)
    const old = JSON.parse(await readFile(join(baseline, scenario + '.json')))
    if (raw.length !== old.inventory.rawManifestBytes || manifest.packages.length !== old.inventory.packages) throw Error('Fixture inventory changed')
    const hash = createHash('sha256').update(raw)
    let bytes = raw.length, files = 1
    for (const descriptor of manifest.packages) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(descriptor.exerciseId)) throw Error('Invalid fixture identity')
      for (const asset of Object.values(descriptor.assets)) {
        if (!['exercise.json', 'samples.json', 'judge/v1.json', 'starters/csharp.txt', 'starters/javascript.txt'].includes(asset.path)) throw Error('Unexpected fixture path')
        const body = await readFile(join(base, descriptor.exerciseId, asset.path))
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
await writeFile(join(output, 'inputs.json'), JSON.stringify({ hashes, compiledAnchor, fingerprint: before }, null, 2))

// Named stage scopes are deliberately coarse: never wrap per-node freeze or
// scanner-character helpers, whose observer overhead would dominate the work.
function instrument(path, source) {
  const file = basename(path), tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const factory = ts.factory, labels = []
  const invoke = (label, body, async = false) => {
    labels.push(label)
    return factory.createCallExpression(factory.createPropertyAccessExpression(factory.createPropertyAccessExpression(factory.createIdentifier('globalThis'), '__packageProfile'), async ? 'async' : 'sync'), undefined,
      [factory.createStringLiteral(label), factory.createArrowFunction(async ? [factory.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined, undefined, [], undefined, factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), body)])
  }
  const functions = {
    'bounded-package-json.ts': { decodePackageUtf8: 'json.decode', scan: 'json.scan', parseBoundedPackageJson: 'json.boundedParse' },
    'exercise-package-validation.ts': { metadata: 'validation.metadata', samples: 'validation.samples', judge: 'validation.judge',
      test: 'validation.case', typed: 'validation.typed', validatePackageManifest: 'validation.manifest',
      validateExercisePackageAssets: 'validation.full', validatePublicPackageAssets: 'validation.public' },
    'exercise-package-resources.ts': { openAnchoredExerciseResources: 'resources.openAnchored' },
  }
  const result = ts.transform(tree, [context => {
    const visit = node => {
      const original = node, updated = ts.visitEachChild(node, visit, context)
      if (ts.isFunctionDeclaration(updated) && updated.body && updated.name) {
        const label = functions[file]?.[updated.name.text]
        if (label) {
          const async = updated.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
          const call = invoke(label, updated.body, async)
          return factory.updateFunctionDeclaration(updated, updated.modifiers, updated.asteriskToken, updated.name, updated.typeParameters,
            updated.parameters, updated.type, factory.createBlock([factory.createReturnStatement(async ? factory.createAwaitExpression(call) : call)], true))
        }
      }
      if (ts.isMethodDeclaration(updated) && updated.body && ts.isClassDeclaration(original.parent)) {
        const className = original.parent.name?.text, name = updated.name.getText(tree)
        const resource = className === 'ExerciseResourceRoot' && ['open', 'read', 'manifest', 'package', 'publicPackage', 'checkRoots', 'parents', 'recheck', 'exactDirectory'].includes(name)
        const budget = (className === 'PackageResidentBudget' && name === 'change') || (className === 'PackageAllocationScope' && name === 'parsed')
        if (resource || budget) {
          const async = updated.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
          const call = invoke((resource ? 'resources.' : 'budget.') + name, updated.body, async)
          return factory.updateMethodDeclaration(updated, updated.modifiers, updated.asteriskToken, updated.name, updated.questionToken,
            updated.typeParameters, updated.parameters, updated.type, factory.createBlock([factory.createReturnStatement(async ? factory.createAwaitExpression(call) : call)], true))
        }
      }
      if (ts.isVariableDeclaration(updated) && ts.isIdentifier(updated.name) && updated.initializer && ts.isArrowFunction(updated.initializer)) {
        const label = file === 'exercise-package-validation.ts' && updated.name.text === 'size' ? 'validation.encodeSize'
          : file === 'exercise-package-resources.ts' && updated.name.text === 'rawPackageDigest' ? 'resources.sha256' : undefined
        if (label) {
          const fn = updated.initializer
          return factory.updateVariableDeclaration(updated, updated.name, updated.exclamationToken, updated.type,
            factory.updateArrowFunction(fn, fn.modifiers, fn.typeParameters, fn.parameters, fn.type, fn.equalsGreaterThanToken, invoke(label, fn.body)))
        }
      }
      if (ts.isCallExpression(updated)) {
        if (file === 'bounded-package-json.ts' && original.expression.getText(tree) === 'JSON.parse') return invoke('json.parse', updated)
        if (file === 'exercise-package-resources.ts') {
          const expression = original.expression.getText(tree)
          if (['fs.lstat', 'fs.realpath', 'fs.open', 'fs.opendir', 'handle.read', 'handle.stat', 'handle.close'].includes(expression)) {
            return invoke(expression.startsWith('handle.') ? 'fs.' + expression : expression, updated, true)
          }
          if (expression === 'Buffer.alloc') return invoke('resources.bufferAlloc', updated)
        }
        if (file === 'exercise-package-registry.ts' && ts.isIdentifier(updated.expression)) {
          if (updated.expression.text === 'structuredClone') return invoke('registry.clone', updated)
          if (updated.expression.text === 'freeze' && updated.arguments[0] && ts.isIdentifier(updated.arguments[0]) && updated.arguments[0].text === 'data') {
            return invoke('registry.freeze@' + (tree.getLineAndCharacterOfPosition(original.getStart(tree)).line + 1), updated)
          }
        }
      }
      if (ts.isForOfStatement(updated)) {
        const expression = original.expression.getText(tree)
        if (file === 'exercise-package-resources.ts' && expression === 'manifest.packages') return factory.createExpressionStatement(invoke('manifest.freezeDescriptors', factory.createBlock([updated], true)))
        if (file === 'exercise-package-registry.ts' && expression === 'resources.manifest.packages') return factory.createExpressionStatement(invoke('registry.buildIndex', factory.createBlock([updated], true)))
      }
      return updated
    }
    return root => ts.visitNode(root, visit)
  }])
  const text = ts.createPrinter().printFile(result.transformed[0]); result.dispose()
  return { text, labels }
}

const runs = [], transformations = {}
for (const mode of ['plain', 'stages', 'cpu']) {
  const directory = join(output, mode); await mkdir(directory, { recursive: true })
  const entry = join(directory, 'measurement.cjs')
  await build({ entryPoints: ['tests/fixtures/learning/package-foundation-measurement.ts'], outfile: entry, platform: 'node', format: 'cjs',
    bundle: true, external: ['electron'], sourcemap: true, plugins: [{ name: 'test-only-profile-copies', setup(plugin) {
      plugin.onLoad({ filter: /package-foundation-measurement\.ts$/ }, async args => {
        let source = await readFile(args.path, 'utf8')
        const replace = (from, to) => { if (!source.includes(from)) throw Error('Profiling hook no longer matches: ' + from); source = source.replace(from, to) }
        source = 'import { profile } from "./package-profile-observer"\n' + source
        replace("const synthetic = scenario === 'production' ? undefined : await fixture()", `const synthetic = scenario === 'production' ? undefined : {
          environment: { packaged: true, mainOutput: '', resourcesPath: ${JSON.stringify(baseline)} + '/fixture-' + scenario },
          anchor: { version: 1, rawBytes: (await readFile(${JSON.stringify(baseline)} + '/fixture-' + scenario + '/learning/exercises/manifest.json')).length,
            sha256: rawPackageDigest(await readFile(${JSON.stringify(baseline)} + '/fixture-' + scenario + '/learning/exercises/manifest.json')) },
          inventory: JSON.parse(await readFile(${JSON.stringify(baseline)} + '/' + scenario + '.json', 'utf8')).inventory }`)
        replace("await compiled.openBundledExerciseResources({ packaged: false, resourcesPath: process.resourcesPath }, observe(allocation))",
          `await openAnchoredExerciseResources({ packaged: false, mainOutput: resolve('out/main'), resourcesPath: process.resourcesPath }, ${JSON.stringify(compiledAnchor)}, observe(allocation))`)
        replace('const baseline = process.memoryUsage(), peak = { ...baseline }', `await profile.start(${JSON.stringify(mode)})\n  const baseline = process.memoryUsage(), peak = { ...baseline }`)
        replace('const beforeForcedGc = process.memoryUsage()', 'await profile.stopSampling()\n  const beforeForcedGc = process.memoryUsage()')
        replace('stalls.push(Math.max(0, now - last - 5)); last = now', 'stalls.push(Math.max(0, now - last - 5)); profile.lag(last, now, Math.max(0, now - last - 5)); last = now')
        replace('await writeFile(join(directory, `${scenario}.json`)', 'await profile.save(directory, scenario, ' + JSON.stringify(mode) + ')\n  await writeFile(join(directory, `${scenario}.json`)')
        // Instrumentation uses the original fixture bytes; its generator is not run.
        return { contents: source, loader: 'ts' }
      })
      plugin.onLoad({ filter: /(?:bounded-package-json|exercise-package-(?:validation|resources|registry|budget))\.ts$/ }, async args => {
        const source = await readFile(args.path, 'utf8')
        if (mode !== 'stages') return { contents: source, loader: 'ts' }
        const transformed = instrument(args.path, source)
        transformations[args.path] = transformed.labels
        await writeFile(join(directory, basename(args.path)), transformed.text)
        return { contents: transformed.text, loader: 'ts' }
      })
    } }] })
  for (const scenario of scenarios) {
    const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
    const code = await new Promise((accept, reject) => {
      const child = spawn(require('electron'), ['--js-flags=--expose-gc', entry, directory, scenario], { cwd: process.cwd(), env: environment, stdio: 'inherit', windowsHide: true })
      child.once('error', reject); child.once('exit', code => accept(code))
    })
    runs.push({ mode, scenario, exitCode: code })
    if (code !== 0) throw Error('Profiling scenario failed: ' + mode + '/' + scenario)
  }
}
const after = await fingerprint()
if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Fixture bytes changed during profiling')
for (const [path, hash] of Object.entries(hashes)) if (digest(await readFile(path)) !== hash) throw Error('Production source/build changed: ' + path)
await writeFile(join(output, 'runs.json'), JSON.stringify({ output, runs, transformations, fixtureBytesUnchanged: true, productionSourcesUnchanged: true }, null, 2))
console.log(JSON.stringify({ output, runs, fixtureBytesUnchanged: true, productionSourcesUnchanged: true }))

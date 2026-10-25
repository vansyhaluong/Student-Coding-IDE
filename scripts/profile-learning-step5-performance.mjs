/* global console, process */
// Reuse the retained-input runner; edit only generated in-memory/out copies.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import ts from 'typescript'

const output = resolve('out', `step5-loader-diagnostics-${Date.now()}`)
await mkdir(output, { recursive: true })
let runner = await readFile('scripts/measure-learning-package-correction.mjs', 'utf8')
const replace = (from, to) => { if (!runner.includes(from)) throw Error('Diagnostics runner hook mismatch: ' + from); runner = runner.replace(from, to) }
replace("const output = resolve('out', `s5-f1-correction-${Date.now()}`)", `const output = ${JSON.stringify(output)}`)
replace("for (const mode of ['plain', 'atomics'])", "for (const mode of ['plain', 'stages', 'cpu'])")
if (process.argv.includes('--stages-only')) replace("for (const mode of ['plain', 'stages', 'cpu'])", "for (const mode of ['stages'])")
replace("if (mode === 'atomics') {", `if (mode !== 'plain') {
          source = 'import { diagnostics } from "./step5-performance-observer"\\n' + source
          replace('const baseline = process.memoryUsage(), peak = { ...baseline }', 'await diagnostics.start(' + JSON.stringify(mode) + ')\\n  const baseline = process.memoryUsage(), peak = { ...baseline }')
          replace('const beforeForcedGc = process.memoryUsage()', 'await diagnostics.stop()\\n  const beforeForcedGc = process.memoryUsage()')
          replace('await writeFile(join(directory, ' + '\x60' + '\x24{scenario}.json' + '\x60' + ')', 'diagnostics.save(join(directory, scenario + "-diagnostics.json"))\\n  await writeFile(join(directory, ' + '\x60' + '\x24{scenario}.json' + '\x60' + ')')
        }
        if (false) {`)
replace("if (mode === 'atomics') plugin.onLoad", "if (mode === 'stages') plugin.onLoad")
replace('validation|registry|work', 'validation|registry|work|resources')
replace('contents: atomics(args.path, await readFile(args.path, \'utf8\'))', 'contents: diagnosticSource(args.path, await readFile(args.path, \'utf8\'))')
runner = runner.replace("const runs = []", `${diagnosticSource.toString()}\nconst runs = []`)
await writeFile(join(output, 'runner.mjs'), runner)
const code = await new Promise((accept, reject) => {
  const child = spawn(process.execPath, [join(output, 'runner.mjs')], { cwd: process.cwd(), stdio: 'inherit', windowsHide: true })
  child.once('error', reject); child.once('exit', accept)
})
console.log(JSON.stringify({ output, exitCode: code })); process.exitCode = code ?? 1

function diagnosticSource(path, source) {
  const file = path.split(/[\\/]/).at(-1)
  const exact = (from, to) => { if (!source.includes(from)) throw Error('Source probe hook mismatch: ' + from); source = source.replace(from, to) }
  if (file === 'exercise-package-work.ts') {
    exact('      return this.resume(work)', '      globalThis.__step5Diagnostics.force(this, forceYield)\n      return this.resume(work)')
    exact('    await this.scheduling.yield()', `    globalThis.__step5Diagnostics.waitStart(this, work, { chars: this.chars, nodes: this.nodes, steps: this.steps, entries: this.entries })
    const diagnosticWait = performance.now()
    await this.scheduling.yield()
    globalThis.__step5Diagnostics.waitEnd(this, performance.now() - diagnosticWait)`)
    const driverStart = source.indexOf('export async function runPackageWork<')
    if (driverStart < 0) throw Error('Missing cooperative work driver')
    const beforeDriver = source.slice(0, driverStart)
    source = source.slice(driverStart)
    exact('  try {\n    control.check()\n    let step = work.next()', `  let diagnosticTransitions = 0
  globalThis.__step5Diagnostics.workStart(globalThis.__step5Diagnostics.label(work))
  try {
    control.check()
    let step = work.next()`)
    exact('    while (!step.done) {', '    while (!step.done) {\n      diagnosticTransitions++')
    exact('  } finally { work.return(undefined as never) }', '  } finally { work.return(undefined as never); globalThis.__step5Diagnostics.workEnd(diagnosticTransitions) }')
    source = beforeDriver + source
  }
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), f = ts.factory
  const call = (label, body, async = false) => f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__step5Diagnostics'), async ? 'async' : 'sync'), undefined,
    [f.createStringLiteral(label), f.createArrowFunction(async ? [f.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined, undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), body)])
  const result = ts.transform(tree, [context => {
    const visit = node => {
      const updated = ts.visitEachChild(node, visit, context)
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText(tree)
        if (['validateExercisePackageAssetsWork', 'validatePublicPackageAssetsWork', 'validatePackageManifestWork', 'representationWork', 'copyWork', 'freezePackageWork'].includes(expression)
          && !ts.isYieldExpression(node.parent)) return f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__step5Diagnostics'), 'tag'), undefined, [f.createStringLiteral(expression), updated])
        if (['JSON.parse', 'structuredClone', 'decodePackageUtf8', 'matchesExerciseType', 'rawPackageDigest', 'size'].includes(expression)) return call(expression, updated)
        if (['handle.read', 'handle.close', 'handle.stat', 'fs.lstat', 'fs.realpath', 'fs.open', 'fs.opendir'].includes(expression)) return call(expression, updated, true)
      }
      if (ts.isMethodDeclaration(updated) && updated.body && ts.isClassDeclaration(node.parent)) {
        const owner = node.parent.name?.text, name = updated.name.getText(tree)
        if ((owner === 'ExerciseResourceRoot' && ['read', 'manifest', 'package', 'publicPackage'].includes(name)) || (owner === 'ExercisePackageRegistry' && ['acquireContent'].includes(name))) {
          const async = updated.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
          return f.updateMethodDeclaration(updated, updated.modifiers, updated.asteriskToken, updated.name, updated.questionToken, updated.typeParameters,
            updated.parameters, updated.type, f.createBlock([f.createReturnStatement(call(owner + '.' + name, updated.body, async))], true))
        }
      }
      return updated
    }
    return root => ts.visitNode(root, visit)
  }])
  const text = ts.createPrinter().printFile(result.transformed[0]); result.dispose(); return text
}

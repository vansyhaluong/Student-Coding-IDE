/** S5-R1 test-only, in-memory instrumentation of the existing emitted app. */
import { app } from 'electron'
import Module from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import { cpus, freemem } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, sep, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const [directory, mode, smoke] = process.argv.filter(v => !v.startsWith('--')).slice(-3)
const followup = process.argv.includes('--r1-followup')
if (!resolve(directory).startsWith(resolve('out') + sep) || !resolve(smoke).startsWith(resolve('out') + sep)) throw Error('Invalid R1 paths')
type Scope = { id: number; label: string }
const local = new AsyncLocalStorage<Scope>()
const spans: object[] = [], files: object[] = [], host: object[] = []
let serial = 0, finished = false
const threadCpuUsage = followup ? (process as unknown as { threadCpuUsage?: (previous?: NodeJS.CpuUsage) => NodeJS.CpuUsage }).threadCpuUsage?.bind(process) : undefined
const timing = () => ({ time: performance.now(), cpu: process.cpuUsage(), thread: threadCpuUsage?.() })
function end(start: ReturnType<typeof timing>) { const cpu = process.cpuUsage(start.cpu), thread = start.thread && threadCpuUsage?.(start.thread); return { start: start.time, ms: performance.now() - start.time, cpuMs: (cpu.user + cpu.system) / 1000, mainThreadCpuMs: thread ? (thread.user + thread.system) / 1000 : undefined } }
const probe = {
  async async(label: string, work: () => Promise<unknown>, deadline?: number) {
    const parent = local.getStore(), scope = { id: ++serial, label }, start = timing()
    return local.run(scope, async () => {
      let outcome = 'OK'
      try { return await work() } catch (e) { outcome = String((e as { details?: { reason?: string }; code?: string }).details?.reason ?? (e as { code?: string }).code ?? 'ERROR'); throw e }
      finally { spans.push({ ...scope, parent: parent?.id, deadline, outcome, ...end(start) }) }
    })
  },
  sync(label: string, work: () => unknown) {
    const start = performance.now(); try { return work() } finally { spans.push({ label, parent: local.getStore()?.id, start, ms: performance.now() - start }) }
  },
}
;(globalThis as unknown as { __r1: typeof probe }).__r1 = probe
function instrument(file: string, source: string): string {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), f = ts.factory
  const transformed = ts.transform(tree, [context => {
    const visit: ts.Visitor = node => {
      const updated = ts.visitEachChild(node, visit, context)
      if (followup && ts.isVariableDeclaration(node) && ts.isVariableDeclaration(updated) && updated.initializer && ts.isArrowFunction(updated.initializer)) {
        const name = node.name.getText(tree)
        let owner: ts.Node | undefined = node.parent
        while (owner && !ts.isMethodDeclaration(owner)) owner = owner.parent
        if (owner && owner.name.getText(tree) === 'resolve' && ['safe', 'read', 'json', 'list', 'versions'].includes(name)) {
          const call = f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__r1'), 'async'), undefined,
            [f.createStringLiteral('sdk.' + name), f.createArrowFunction([f.createModifier(ts.SyntaxKind.AsyncKeyword)], undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), updated.initializer.body)])
          const arrow = f.updateArrowFunction(updated.initializer, updated.initializer.modifiers, updated.initializer.typeParameters, updated.initializer.parameters, updated.initializer.type, updated.initializer.equalsGreaterThanToken, call)
          return f.updateVariableDeclaration(updated, updated.name, updated.exclamationToken, updated.type, arrow)
        }
      }
      if ((ts.isMethodDeclaration(updated) || ts.isFunctionDeclaration(updated)) && updated.body && !updated.asteriskToken) {
        const name = updated.name?.getText(tree) ?? ''
        if (name === 'attributes' && !followup) return updated
        const owner = ts.isClassDeclaration(node.parent) ? node.parent.name?.text : ''
        if (!['resolve', 'capture', 'validate', 'prepare', 'persist', 'runPhase', 'compile', 'revalidateCsharpSdk', 'pe', 'attributes'].includes(name)) return updated
        const async = updated.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
        const label = (owner ? owner + '.' : '') + name
        const params = updated.parameters.map(p => p.name.getText(tree))
        const phase = params.includes('phase')
        const args: ts.Expression[] = [phase ? f.createBinaryExpression(f.createStringLiteral(label + ':'), f.createToken(ts.SyntaxKind.PlusToken), f.createIdentifier('phase')) : f.createStringLiteral(label),
          f.createArrowFunction(async ? [f.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined, undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), updated.body)]
        if (async && params.includes('context')) args.push(f.createPropertyAccessExpression(f.createIdentifier('context'), 'deadline'))
        const body = f.createBlock([f.createReturnStatement(f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__r1'), async ? 'async' : 'sync'), undefined, args))], true)
        return ts.isMethodDeclaration(updated)
          ? f.updateMethodDeclaration(updated, updated.modifiers, updated.asteriskToken, updated.name, updated.questionToken, updated.typeParameters, updated.parameters, updated.type, body)
          : f.updateFunctionDeclaration(updated, updated.modifiers, updated.asteriskToken, updated.name, updated.typeParameters, updated.parameters, updated.type, body)
      }
      return updated
    }
    return root => ts.visitNode(root, visit) as ts.SourceFile
  }])
  const result = ts.createPrinter().printFile(transformed.transformed[0] as ts.SourceFile); transformed.dispose(); return result
}
const internal = Module as unknown as { _extensions: Record<string, (m: { _compile(s: string, p: string): void }, p: string) => void>; _load(n: string, ...a: unknown[]): unknown }
const extension = internal._extensions['.js'], load = internal._load
internal._extensions['.js'] = (m, p) => mode === 'detail' && p.startsWith(resolve('out/main') + sep)
  ? m._compile(instrument(p, readFileSync(p, 'utf8')), p) : extension(m, p)
const seen = new WeakSet<object>(), pathIds = new Map<string, number>()
function group(p: unknown) { return typeof p !== 'string' ? 'other' : /[\\/]Roslyn[\\/]/i.test(p) ? 'compiler' : /[\\/]packs[\\/]/i.test(p) ? 'reference' : /[\\/]shared[\\/]/i.test(p) ? 'runtime' : /[\\/]host[\\/]/i.test(p) ? 'host' : 'root-or-other' }
internal._load = function(n, ...a) {
  const value = load.call(this, n, ...a)
  if (mode === 'detail' && n === 'node:fs/promises' && value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value); const fs = value as Record<string, (...a: unknown[]) => Promise<unknown>>
    for (const op of ['lstat', 'realpath', 'readdir', 'open', 'readFile', 'writeFile', 'mkdir', 'rename']) {
      const original = fs[op]
      fs[op] = async (...input) => {
        const start = performance.now(), parent = local.getStore(), key = String(input[0]).toLowerCase()
        if (!pathIds.has(key)) pathIds.set(key, pathIds.size + 1)
        const pathId = pathIds.get(key), category = group(input[0]); let outcome = 'OK'
        try {
          const result = await original(...input)
          if (op === 'open') {
            const h = result as Record<string, (...a: unknown[]) => Promise<unknown>>
            for (const method of ['read', 'stat', 'close']) {
              const fn = h[method].bind(h)
              h[method] = async (...args) => { const began = performance.now(); try { return await fn(...args) } finally { files.push({ op: 'handle.' + method, parent: local.getStore()?.id, pathId, category, start: began, ms: performance.now() - began }) } }
            }
          }
          return result
        } catch (e) { outcome = (e as { code?: string }).code ?? 'ERROR'; throw e }
        finally { files.push({ op, parent: parent?.id, pathId, category, outcome, start, ms: performance.now() - start }) }
      }
    }
  }
  return value
}
let last = performance.now()
const interval = followup ? 1000 : 20
const timer = setInterval(() => { const now = performance.now(); host.push({ time: now, lag: Math.max(0, now - last - interval), freeMemory: freemem(), cpu: cpus().map(c => c.times) }); last = now }, interval)
const exiting = app.exit.bind(app)
function save() { if (finished) return; finished = true; clearInterval(timer); writeFileSync(join(directory, 'trace.json'), JSON.stringify({ mode, spans, files, host, platform: process.platform, arch: process.arch, versions: { electron: process.versions.electron, node: process.versions.node } })) }
app.exit = code => { save(); return exiting(code) }
app.on('will-quit', save)
await import(pathToFileURL(resolve(smoke)).href)

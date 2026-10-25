/** Full-app diagnostics wrapper around the unchanged production smoke/build. */
import { app, ipcMain } from 'electron'
import Module, { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { cpus, freemem } from 'node:os'
import { readFileSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as TypeScript from 'typescript'
import { diagnostics } from './step5-performance-observer'

const [directoryArg, mode, smokeArg] = process.argv.filter(value => !value.startsWith('--')).slice(-3)
const directory = resolve(directoryArg), smoke = resolve(smokeArg)
const ts = mode === 'stages' ? (await import('typescript')).default : undefined
if (!directory.startsWith(resolve('out') + sep) || !['plain', 'stages', 'cpu', 'native'].includes(mode) || !smoke.startsWith(resolve('out') + sep)) throw Error('Invalid diagnostic invocation')
const globalProbe = globalThis as typeof globalThis & { __step5Diagnostics: typeof diagnostics }
globalProbe.__step5Diagnostics = diagnostics
const timeline: { time: number; rss: number; heapUsed: number; external: number; lag: number }[] = []
const system: { time: number; freeMemory: number; cpu: ReturnType<typeof cpus>; processes: ReturnType<typeof app.getAppMetrics> }[] = []
let last = performance.now(), finished = false
await diagnostics.start(mode === 'native' ? 'stages' : mode)
const timer = setInterval(() => {
  const now = performance.now(), memory = process.memoryUsage()
  if (timeline.length < 60000) timeline.push({ time: now, rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external, lag: Math.max(0, now - last - 5) })
  last = now
}, 5)
const sampler = setInterval(() => {
  if (system.length < 600) system.push({ time: performance.now(), freeMemory: freemem(), cpu: cpus(), processes: app.isReady() ? app.getAppMetrics() : [] })
}, 1000)
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, (...args) => diagnostics.async('IPC:' + channel, async () => {
  if (channel === 'exercise:run') diagnostics.mark('Run.admission')
  return listener(...args)
}))
app.on('browser-window-created', (_event, window) => {
  diagnostics.mark('window.created')
  window.webContents.on('did-finish-load', () => diagnostics.mark('renderer.did-finish-load'))
})

function instrument(path: string, text: string): string {
  if (!ts) return text
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), f = ts.factory
  const result = ts.transform(tree, [context => {
    const visit: TypeScript.Visitor = node => {
      const updated = ts.visitEachChild(node, visit, context)
      if (ts.isCallExpression(node) && ts.isCallExpression(updated)) {
        const expression = node.expression.getText(tree)
        if (['registry.acquirePublic', 'lease.representCooperative'].includes(expression)) {
          return f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__step5Diagnostics'), 'async'), undefined,
            [f.createStringLiteral(expression), f.createArrowFunction([f.createModifier(ts.SyntaxKind.AsyncKeyword)], undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), updated)])
        }
      }
      if (ts.isMethodDeclaration(updated) && updated.body) {
        const name = updated.name.getText(tree)
        let owner = ts.isClassDeclaration(node.parent) ? node.parent.name?.text : undefined
        if (!owner) { let p: TypeScript.Node | undefined = node.parent; while (p && !ts.isFunctionDeclaration(p)) p = p.parent; owner = p && ts.isFunctionDeclaration(p) ? p.name?.text : 'object' }
        if (!['runPhase', 'resolve', 'capture', 'validate', 'prepare', 'persist', 'manifest', 'package', 'publicPackage', 'compile', 'whenStarted', 'phase', 'start'].includes(name)) return updated
        const async = updated.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)
        // Do not wrap generators or native lifecycle state accessors.
        if (updated.asteriskToken) return updated
        const label = (owner ?? 'object') + '.' + name
        const phase = updated.parameters.some(p => p.name.getText(tree) === 'phase')
        const labelNode = phase ? f.createBinaryExpression(f.createStringLiteral(label + ':'), f.createToken(ts.SyntaxKind.PlusToken), f.createIdentifier('phase')) : f.createStringLiteral(label)
        let body = updated.body
        if (['runPhase', 'resolve', 'capture'].includes(name) && updated.parameters.some(p => p.name.getText(tree) === 'context')) {
          const deadline = f.createExpressionStatement(f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__step5Diagnostics'), 'deadline'), undefined,
            [labelNode, f.createPropertyAccessExpression(f.createIdentifier('context'), 'deadline')]))
          body = f.createBlock([deadline, ...body.statements], true)
        }
        const call = f.createCallExpression(f.createPropertyAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('globalThis'), '__step5Diagnostics'), async ? 'async' : 'sync'), undefined,
          [labelNode, f.createArrowFunction(async ? [f.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined, undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), body)])
        return f.updateMethodDeclaration(updated, updated.modifiers, updated.asteriskToken, updated.name, updated.questionToken, updated.typeParameters,
          updated.parameters, updated.type, f.createBlock([f.createReturnStatement(call)], true))
      }
      return updated
    }
    return root => ts.visitNode(root, visit) as TypeScript.SourceFile
  }])
  const textOut = ts.createPrinter().printFile(result.transformed[0] as TypeScript.SourceFile); result.dispose(); return textOut
}
type CommonModule = { _compile(text: string, path: string): void }
const internals = Module as unknown as { _extensions: Record<string, (module: CommonModule, path: string) => void>; _load(name: string, ...args: unknown[]): unknown }
const originalExtension = internals._extensions['.js']
internals._extensions['.js'] = (module, path) => {
  if (mode === 'stages' && path.startsWith(resolve('out/main') + sep)) {
    const source = instrument(path, readFileSync(path, 'utf8'))
    return diagnostics.sync('startup.compile:' + path.split(/[\\/]/).at(-1), () => module._compile(source, path))
  }
  return mode === 'native' && path.startsWith(resolve('out/main') + sep)
    ? diagnostics.sync('startup.module:' + path.split(/[\\/]/).at(-1), () => originalExtension(module, path))
    : originalExtension(module, path)
}
const originalLoad = internals._load, seenFs = new WeakSet<object>()
internals._load = function (name, ...args) {
  const value = originalLoad.call(this, name, ...args)
  if (name === 'node:fs/promises' && mode === 'stages' && value && typeof value === 'object' && !seenFs.has(value)) {
    seenFs.add(value)
    const fs = value as Record<string, (...args: unknown[]) => Promise<unknown>>
    const group = (path: unknown) => typeof path !== 'string' ? 'other' : /[\\/]\.?(?:dotnet)[\\/]/i.test(path) ? 'sdk'
      : /learning[\\/]exercises/i.test(path) ? 'package' : /exercise-runtime/i.test(path) ? 'workspace' : 'other'
    for (const name of ['lstat', 'realpath', 'readdir', 'open', 'mkdir', 'writeFile', 'rename', 'rm']) {
      const fn = fs[name]
      fs[name] = (...input) => diagnostics.async('FS.' + name + ':' + group(input[0]), async () => {
        const result = await fn(...input)
        if (name === 'open') {
          const handle = result as Record<string, (...args: unknown[]) => Promise<unknown>>
          for (const operation of ['read', 'stat', 'close']) {
            const original = handle[operation].bind(handle)
            handle[operation] = (...args) => diagnostics.async('FS.handle.' + operation + ':' + group(input[0]), () => original(...args))
          }
        }
        return result
      })
    }
  }
  return value
}
const require = createRequire(join(process.cwd(), 'package.json'))
diagnostics.mark('startup.before-main')
// The smoke owns native jobs, isolated userData, secure windows and shutdown.
const exiting = app.exit.bind(app)
async function save() {
  if (finished) return
  finished = true; clearInterval(timer); clearInterval(sampler)
  await diagnostics.stop()
  diagnostics.save(join(directory, mode + '-app.json'), { timeline, system, scope: 'full application including original smoke/instrumentation',
    limitations: ['First process is not cold OS disk cache', 'Electron process working sets may share pages; external dotnet/PTY RSS not covered', 'Instrumentation can change CPU/GC/stalls and deadlines'] })
}
app.exit = code => { void save().finally(() => exiting(code)); return undefined as never }
app.on('will-quit', event => {
  if (!finished) { event.preventDefault(); void save().finally(() => app.quit()) }
})
void require // assert resolution is anchored to repository dependencies
await import(pathToFileURL(smoke).href)

import { open, lstat, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import type { ExerciseLanguage } from '../../../../shared/contracts/practice'
import { smartFields, smartInteger, smartText } from '../../../../shared/contracts/smart-hints-validation'
import type { SmartCapture } from './capture'
import { assertSelectionFixBinding } from './selection-fix'
import { SelectionFixError } from './selection-fix-diagnostics'
import type { SelectionFixGuard, SelectionFixGuardLease, SelectionFixScope } from './selection-fix-guard'
import { FIX_PARSER_PROTOCOL, FIX_PARSER_TYPESCRIPT, FIX_PARSER_SDK, FIX_PARSER_RUNTIME, FIX_PARSER_ROSLYN,
  FIX_PARSER_REASONS, type FixParserInput, type FixParserReason } from './selection-fix-protocol'
import { SelectionFixCsharpSdkResolver } from './selection-fix-sdk-resolver'
import type { CsharpSdkResolver, CsharpSdkSelection } from '../runtime/csharp-execution-contracts'

const jsFiles = ['selection-fix-js.cjs', 'TYPESCRIPT-LICENSE.txt', 'TYPESCRIPT-NOTICE.txt']
const csFiles = ['SelectionFixGuard.dll', 'SelectionFixGuard.runtimeconfig.json']
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const unavailable = () => new SelectionFixError('INVALID_INPUT', 'GUARD_RUNTIME', 'UNAVAILABLE')
interface Assets { manifest: string; files: Record<string, { bytes: number; sha256: string }>; sdk?: CsharpSdkSelection; sdkAnchors?: Record<string, string> }

/** Main-owned parse-only processes. No configured Renderer path, project load or source files. */
export class MainSelectionFixGuard implements SelectionFixGuard {
  private readonly directory: string
  private readonly budget: number
  constructor(private readonly options: { assetDirectory?: string; sdkResolver?: CsharpSdkResolver; budgetMs?: number } = {}) {
    this.directory = resolve(options.assetDirectory ?? join(__dirname, 'smart-hints-parser'))
    this.budget = options.budgetMs ?? 2000
    if (!smartInteger(this.budget, 1) || this.budget > 5000) throw unavailable()
  }
  private check(scope: SelectionFixScope): void {
    scope.check()
    if (scope.signal.aborted || scope.clock() >= scope.deadline) throw new SelectionFixError('TIMEOUT', 'GUARD_RUNTIME', scope.signal.aborted ? 'CANCELLED' : 'TIMEOUT')
  }
  private async bounded<T>(scope: SelectionFixScope, work: (inner: SelectionFixScope) => Promise<T>, budget = this.budget): Promise<T> {
    this.check(scope)
    const controller = new AbortController(), deadline = Math.min(scope.deadline, scope.clock() + budget)
    const abort = () => controller.abort()
    scope.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, Math.max(0, deadline - scope.clock()))
    const inner = { ...scope, signal: controller.signal, deadline }
    try { const value = await work(inner); this.check(inner); this.check(scope); return value }
    catch (error) {
      if (scope.signal.aborted || controller.signal.aborted || scope.clock() >= deadline)
        throw new SelectionFixError('TIMEOUT', 'GUARD_RUNTIME', scope.signal.aborted ? 'CANCELLED' : 'TIMEOUT')
      if (error instanceof SelectionFixError) throw error
      throw new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'CRASH')
    } finally { clearTimeout(timer); scope.signal.removeEventListener('abort', abort) }
  }
  private async sdkAnchors(sdk: CsharpSdkSelection, scope: SelectionFixScope, expected?: Record<string, string>): Promise<Record<string, string>> {
    const files = [sdk.dotnetPath, join(sdk.sdkDirectory, '.version'),
      ...['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll'].map(n => join(sdk.sdkDirectory, 'Roslyn/bincore', n)),
      ...['coreclr.dll', 'hostpolicy.dll', 'System.Private.CoreLib.dll', 'System.Runtime.dll', 'System.Text.Json.dll',
        'System.Collections.Immutable.dll', 'System.Reflection.Metadata.dll', 'Microsoft.NETCore.App.deps.json'].map(n => join(sdk.runtimeDirectory, n)),
      join(dirname(sdk.dotnetPath), 'host/fxr', sdk.runtimeVersion, 'hostfxr.dll')]
    const result: Record<string, string> = {}
    for (const file of files) {
      this.check(scope)
      const s = await lstat(file)
      if (!s.isFile() || s.isSymbolicLink() || resolve(await realpath(file)).toLowerCase() !== resolve(file).toLowerCase()) throw unavailable()
      const stamp = JSON.stringify([s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs, s.birthtimeMs])
      if (expected && expected[file] !== stamp) throw unavailable()
      result[file] = stamp
    }
    return result
  }
  private async read(name: string, cap: number, scope: SelectionFixScope): Promise<Buffer> {
    this.check(scope)
    const file = join(this.directory, name)
    // Only fixed app asset names are used; reject linked assets/directories and archive-only layouts.
    if ((await lstat(this.directory)).isSymbolicLink() || resolve(await realpath(this.directory)).toLowerCase() !== this.directory.toLowerCase()) throw unavailable()
    const before = await lstat(file)
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > cap) throw unavailable()
    const handle = await open(file, 'r')
    try {
      const same = (s: typeof before) => s.isFile() && s.dev === before.dev && s.ino === before.ino && s.size === before.size && s.mtimeMs === before.mtimeMs
      if (!same(await handle.stat())) throw unavailable()
      const data = Buffer.alloc(before.size)
      let offset = 0
      while (offset < data.length) {
        this.check(scope)
        const { bytesRead } = await handle.read(data, offset, Math.min(65536, data.length - offset), offset)
        if (!bytesRead) throw unavailable()
        offset += bytesRead
      }
      if (!same(await handle.stat()) || !same(await lstat(file))) throw unavailable()
      this.check(scope); return data
    } finally { await handle.close() }
  }
  private async load(language: ExerciseLanguage, scope: SelectionFixScope, expected?: Assets): Promise<Assets> {
    try {
      const raw = await this.read('manifest.json', 16384, scope), m: unknown = JSON.parse(raw.toString('utf8'))
      if (!smartFields(m, ['protocol', 'typescript', 'csharp', 'artifacts']) || m.protocol !== FIX_PARSER_PROTOCOL || m.typescript !== FIX_PARSER_TYPESCRIPT) throw unavailable()
      const hasCs = m.csharp !== null
      if (hasCs && (!smartFields(m.csharp, ['sdk', 'runtime', 'roslyn']) || m.csharp.sdk !== FIX_PARSER_SDK
        || m.csharp.runtime !== FIX_PARSER_RUNTIME || m.csharp.roslyn !== FIX_PARSER_ROSLYN)) throw unavailable()
      if (!smartFields(m.artifacts, [...jsFiles, ...(hasCs ? csFiles : [])])) throw unavailable()
      const manifest = digest(raw), files: Assets['files'] = {}
      if (expected && expected.manifest !== manifest) throw unavailable()
      for (const name of language === 'javascript' ? jsFiles : csFiles) {
        const record = m.artifacts[name]
        if (!smartFields(record, ['bytes', 'sha256']) || !smartInteger(record.bytes, 1) || record.bytes > 20 * 1024 ** 2
          || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) throw unavailable()
        const data = await this.read(name, 20 * 1024 ** 2, scope)
        if (data.length !== record.bytes || digest(data) !== record.sha256) throw unavailable()
        files[name] = { bytes: record.bytes, sha256: record.sha256 }
      }
      let sdk: CsharpSdkSelection | undefined
      let sdkAnchors: Record<string, string> | undefined
      if (language === 'csharp') {
        if (!hasCs || process.platform !== 'win32' || process.arch !== 'x64') throw unavailable()
        const context = { signal: scope.signal, deadline: performance.now() + Math.max(0, scope.deadline - scope.clock()) }
        if (expected?.sdk) {
          sdk = expected.sdk
          sdkAnchors = await this.sdkAnchors(sdk, scope, expected.sdkAnchors)
        } else {
          const result = await (this.options.sdkResolver ?? new SelectionFixCsharpSdkResolver()).resolve(context)
          if (result.state !== 'AVAILABLE' || result.selection.sdkVersion !== FIX_PARSER_SDK || result.selection.runtimeVersion !== FIX_PARSER_RUNTIME) throw unavailable()
          sdk = result.selection
          sdkAnchors = await this.sdkAnchors(sdk, scope)
        }
      }
      this.check(scope); return { manifest, files, sdk, sdkAnchors }
    } catch (error) {
      this.check(scope)
      if (expected) throw new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'ASSET_CHANGED')
      if (error instanceof SelectionFixError) throw error
      throw unavailable()
    }
  }
  private async javascript(input: FixParserInput | { probe: true }, scope: SelectionFixScope): Promise<FixParserReason> {
    this.check(scope)
    const worker = new Worker(join(this.directory, jsFiles[0]), { workerData: input, env: {}, execArgv: [], stdout: true, stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 } })
    const exited = new Promise<void>(resolve => { worker.once('exit', () => resolve()) })
    let complete = false, ready = false, bytes = 0
    let reject!: (error: SelectionFixError) => void
    const fail = () => reject(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'INVALID_PROTOCOL'))
    const abort = () => reject(new SelectionFixError('TIMEOUT', 'GUARD_RUNTIME', 'CANCELLED'))
    let answer: FixParserReason | undefined, failure: unknown
    try {
      answer = await new Promise<FixParserReason>((resolve, bad) => {
        reject = bad
        scope.signal.addEventListener('abort', abort, { once: true })
        for (const stream of [worker.stdout, worker.stderr]) stream?.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 4096) fail() })
        worker.on('message', value => {
          if (smartFields(value, ['protocol', 'ready', 'version']) && value.protocol === 1 && value.ready === true && value.version === FIX_PARSER_TYPESCRIPT && !ready) { ready = true; return }
          if (!ready || complete || !smartFields(value, ['protocol', 'reason']) || value.protocol !== 1 || !FIX_PARSER_REASONS.includes(value.reason as FixParserReason)) { fail(); return }
          complete = true; resolve(value.reason as FixParserReason)
        })
        worker.once('error', () => bad(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'CRASH')))
        worker.once('exit', () => { if (!complete) bad(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'CRASH')) })
        if (scope.signal.aborted) abort()
      })
    } catch (error) { failure = error } finally {
      scope.signal.removeEventListener('abort', abort)
      try { await worker.terminate(); await exited } catch { failure = new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'CLEANUP_FAILED') }
    }
    if (failure) throw failure
    if (!answer) throw new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'INVALID_PROTOCOL')
    return answer
  }
  private async csharp(assets: Assets, input: FixParserInput | { probe: true }, scope: SelectionFixScope): Promise<FixParserReason> {
    this.check(scope)
    const sdk = assets.sdk!
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]!]))
    const child = spawn(sdk.dotnetPath, ['exec', '--fx-version', FIX_PARSER_RUNTIME, '--roll-forward', 'Disable',
      join(this.directory, csFiles[0]), join(sdk.sdkDirectory, 'Roslyn/bincore')], {
      cwd: this.directory, env: { ...env, DOTNET_MULTILEVEL_LOOKUP: '0', DOTNET_EnableDiagnostics: '0' }, windowsHide: true, shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let complete = false, bytes = 0, raw = ''
    let reject!: (error: SelectionFixError) => void
    const closed = new Promise<void>(resolve => { child.once('close', () => resolve()) })
    const abort = () => { child.kill('SIGKILL'); reject(new SelectionFixError('TIMEOUT', 'GUARD_RUNTIME', 'CANCELLED')) }
    try {
      return await new Promise<FixParserReason>((resolve, bad) => {
        reject = bad; scope.signal.addEventListener('abort', abort, { once: true })
        const failed = () => { child.kill('SIGKILL'); bad(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'CRASH')) }
        child.on('error', failed); child.stdin.on('error', failed)
        child.stdout.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 4096) failed(); else raw += data.toString('utf8') })
        child.stderr.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 4096) failed() })
        child.once('close', code => {
          complete = true
          if (code !== 0) { bad(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'CRASH')); return }
          try {
            const v: unknown = JSON.parse(raw)
            if (!smartFields(v, ['protocol', 'version', 'reason']) || v.protocol !== 1 || v.version !== FIX_PARSER_ROSLYN
              || !FIX_PARSER_REASONS.includes(v.reason as FixParserReason)) throw unavailable()
            resolve(v.reason as FixParserReason)
          } catch { bad(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'INVALID_PROTOCOL')) }
        })
        const data = JSON.stringify(input)
        if (Buffer.byteLength(data) > 262144) { failed(); return }
        child.stdin.end(data)
        if (scope.signal.aborted) abort()
      })
    } finally {
      scope.signal.removeEventListener('abort', abort)
      if (!complete) child.kill('SIGKILL')
      await closed
    }
  }
  private invoke(language: ExerciseLanguage, assets: Assets, input: FixParserInput | { probe: true }, scope: SelectionFixScope) {
    return language === 'javascript' ? this.javascript(input, scope) : this.csharp(assets, input, scope)
  }
  async availability(language: ExerciseLanguage, scope: SelectionFixScope): Promise<boolean> {
    try {
      const assets = await this.bounded(scope, inner => this.load(language, inner), scope.deadline - scope.clock())
      return await this.bounded(scope, inner => this.invoke(language, assets, { probe: true }, inner).then(r => r === 'ACCEPT'))
    }
    catch { return false }
  }
  async preflight(capture: SmartCapture, scope: SelectionFixScope): Promise<SelectionFixGuardLease> {
    assertSelectionFixBinding(capture)
    const c = structuredClone(capture)
    if (c.action.kind !== 'SUGGEST_FIX') throw unavailable()
    const input: FixParserInput = { protocol: 1, phase: 'PREFLIGHT', source: c.source, candidate: null,
      start: c.action.selection.startOffset, end: c.action.selection.endOffset, signature: c.signature }
    // SDK/asset discovery is pre-consent work inside the existing Prepare TTL.
    // The parse itself and postflight stay under the smaller private budget.
    const assets = await this.bounded(scope, inner => this.load(c.binding.language, inner), scope.deadline - scope.clock())
    await this.bounded(scope, async inner => {
      const reason = await this.invoke(c.binding.language, assets, input, inner)
      if (reason !== 'ACCEPT') throw new SelectionFixError(reason === 'INTERNAL' ? 'PROVIDER' : 'INVALID_INPUT',
        reason === 'INTERNAL' ? 'GUARD_RUNTIME' : 'PREFLIGHT', reason === 'INTERNAL' ? 'CRASH' : reason)
    })
    let disposed = false
    const controller = new AbortController(), tasks = new Set<Promise<unknown>>()
    const run = async (outer: SelectionFixScope, work: (inner: SelectionFixScope) => Promise<void>) => {
      if (disposed) throw unavailable()
      const abort = () => controller.abort()
      outer.signal.addEventListener('abort', abort, { once: true })
      if (outer.signal.aborted) abort()
      const task = this.bounded({ ...outer, signal: controller.signal }, work); tasks.add(task)
      try { await task } finally { tasks.delete(task); outer.signal.removeEventListener('abort', abort) }
    }
    return {
      assertReady: outer => run(outer, async inner => { await this.load(c.binding.language, inner, assets) }),
      verify: (candidate, outer) => run(outer, async inner => {
        if (!smartText(candidate, 16384, true)) throw new SelectionFixError('INVALID_RESPONSE', 'POSTFLIGHT', 'STRUCTURE')
        await this.load(c.binding.language, inner, assets)
        const reason = await this.invoke(c.binding.language, assets, { ...input, phase: 'POSTFLIGHT', candidate }, inner)
        if (reason !== 'ACCEPT') throw new SelectionFixError(reason === 'INTERNAL' ? 'PROVIDER' : 'INVALID_RESPONSE',
          reason === 'INTERNAL' ? 'GUARD_RUNTIME' : 'POSTFLIGHT', reason === 'INTERNAL' ? 'CRASH' : reason)
      }),
      dispose: async () => { disposed = true; controller.abort(); await Promise.allSettled([...tasks]); c.source = ''; c.action = { kind: 'ANALYZE' }; input.source = '' },
    }
  }
}

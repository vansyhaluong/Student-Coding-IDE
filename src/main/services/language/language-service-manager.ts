import { randomUUID } from 'node:crypto'
import type { LanguageDependencyStatus } from '../../../shared/contracts/language'
import { CsharpLsResolver, type CsharpLsDetection, type CsharpLsResolverOptions } from '../dependencies/csharp-ls'
import { DotnetSdkDetector, type DotnetDetection } from '../dependencies/dotnet-sdk'
import { ProcessManager } from '../process/process-manager'
import { CSharpLsAdapter } from './csharp-ls-adapter'
import { LspConnection } from './lsp-connection'
import { bounded, LanguageError } from './language-error'
import { WindowsCsharpProcessFactory, validateCsharpContext,
  type CsharpProcess, type CsharpProcessFactory, type CsharpSessionContext } from './csharp-process'

interface Session {
  generation: number
  process: CsharpProcess
  connection: LspConnection
  adapter: CSharpLsAdapter
  unregister: () => void
}
export interface LanguageManagerDependencies {
  sdk: { detect(): Promise<DotnetDetection> }
  provider: { detect(): Promise<CsharpLsDetection> }
  processes: ProcessManager
  factory: CsharpProcessFactory
}

/** Main-owned provider lifecycle; callers expose only capability-scoped semantic operations. */
export class LanguageServiceManager {
  private generation = 0
  private session?: Session
  private starting?: Promise<CSharpLsAdapter>
  private stopping?: Promise<void>
  private cleaning?: Promise<void>
  private disposed = false
  private currentState: 'STOPPED' | 'STARTING' | 'RUNNING' | 'CRASHED' = 'STOPPED'
  private readonly listeners = new Set<() => void>()
  private get lifecycle() { return this.currentState }
  private set lifecycle(state: typeof this.currentState) {
    this.currentState = state
    for (const listener of this.listeners) queueMicrotask(listener)
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  get adapter(): CSharpLsAdapter {
    if (this.state !== 'RUNNING' || !this.session) throw new LanguageError('not-running')
    return this.session.adapter
  }
  private dependencyStatus?: LanguageDependencyStatus
  private cleanupFailure?: LanguageError
  private readonly owner = 'csharp_' + randomUUID()

  constructor(private readonly dependencies: LanguageManagerDependencies) {}

  get state(): 'STOPPED' | 'STARTING' | 'RUNNING' | 'CRASHED' { return this.lifecycle }
  get dependency(): LanguageDependencyStatus | undefined {
    return this.dependencyStatus ? structuredClone(this.dependencyStatus) : undefined
  }
  async detectDependencies(): Promise<void> {
    if (this.dependencyStatus) return
    const sdk = await this.dependencies.sdk.detect()
    this.dependencyStatus = sdk.status
    if (sdk.status.state === 'AVAILABLE') this.dependencyStatus = (await this.dependencies.provider.detect()).status
  }
  get cleanupPending(): boolean { return this.session !== undefined }
  get lastCleanupError(): LanguageError | undefined { return this.cleanupFailure }
  get capabilities() { return this.session?.adapter.effectiveCapabilities(this.state === 'RUNNING') ?? [] }

  start(context: CsharpSessionContext): Promise<CSharpLsAdapter> {
    if (this.disposed || this.session || this.starting || this.stopping || this.cleaning) {
      return Promise.reject(new LanguageError('busy'))
    }
    validateCsharpContext(context)
    const trustedContext = { ...context }
    const generation = ++this.generation
    this.lifecycle = 'STARTING'
    const task = Promise.resolve().then(async () => {
      try {
        const sdk = await this.dependencies.sdk.detect()
        this.assertGeneration(generation)
        this.dependencyStatus = sdk.status
        if (!sdk.runtime || sdk.status.state !== 'AVAILABLE') throw new LanguageError('startup-failed')
        const provider = await this.dependencies.provider.detect()
        this.assertGeneration(generation)
        this.dependencyStatus = provider.status
        if (!provider.provider || provider.status.state !== 'AVAILABLE') throw new LanguageError('startup-failed')
        const child = this.dependencies.factory.create(provider.provider, trustedContext, () => this.crash(generation))
        const connection = new LspConnection(child.stdout, child.stdin, () => this.crash(generation))
        const adapter = new CSharpLsAdapter(connection, generation,
          () => this.generation === generation && child.isAlive())
        const session: Session = { generation, process: child, connection, adapter, unregister: () => {} }
        this.session = session
        session.unregister = this.dependencies.processes.register({
          id: this.owner + '_' + generation, ownerId: this.owner, close: () => this.stop(),
        })
        await adapter.initialize(trustedContext)
        this.assertGeneration(generation)
        if (!child.isAlive()) throw new LanguageError('startup-failed')
        this.lifecycle = 'RUNNING'
        return adapter
      } catch (error) {
        if (this.generation === generation) {
          this.lifecycle = this.dependencyStatus?.state === 'AVAILABLE' ? 'CRASHED' : 'STOPPED'
        }
        if (this.session?.generation === generation) {
          this.session.adapter.invalidate()
          this.session.connection.dispose()
          await this.clean(this.session)
        }
        throw error instanceof LanguageError ? error : new LanguageError('startup-failed')
      }
    })
    this.starting = task
    void task.finally(() => { if (this.starting === task) this.starting = undefined }).catch(() => {})
    return task
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    ++this.generation
    const session = this.session
    session?.adapter.invalidate()
    const task = Promise.resolve().then(async () => {
      let protocolFailure: unknown
      if (session) {
        if (session.process.isAlive() && this.lifecycle === 'RUNNING') {
          try {
            await session.connection.request('@shutdown', 'shutdown', undefined, 5000)
            await session.connection.notify('exit')
            await bounded(session.process.exited, 5000)
          } catch (error) { protocolFailure = error }
        }
        session.connection.dispose()
        await this.clean(session)
      }
      if (this.starting) {
        try { await this.starting } catch { /* The start caller receives the original failure. */ }
      }
      // A failed start cleanup remains owned and is retried by this stop.
      if (this.session) await this.clean(this.session)
      this.lifecycle = 'STOPPED'
      if (protocolFailure) throw protocolFailure
    })
    this.stopping = task
    void task.finally(() => { if (this.stopping === task) this.stopping = undefined }).catch(() => {})
    return task
  }

  dispose(): Promise<void> {
    this.disposed = true
    return this.stop()
  }

  private assertGeneration(generation: number): void {
    if (this.generation !== generation || this.disposed) throw new LanguageError('stale-session')
  }
  private crash(generation: number): void {
    if (this.generation !== generation || !this.session || this.stopping) return
    ++this.generation
    this.lifecycle = 'CRASHED'
    const session = this.session
    session.adapter.invalidate()
    session.connection.dispose()
    // No restart. Failure is retained and observable; future stop retries cleanup.
    void this.clean(session).catch(() => {})
  }
  private clean(session: Session): Promise<void> {
    if (this.cleaning) return this.cleaning
    const task = Promise.resolve().then(async () => {
      try {
        await session.process.close()
        if (!session.process.isReleased()) throw new LanguageError('cleanup-failed')
        session.unregister()
        if (this.session === session) this.session = undefined
        this.cleanupFailure = undefined
      } catch {
        this.lifecycle = 'CRASHED'
        this.cleanupFailure = new LanguageError('cleanup-failed')
        throw this.cleanupFailure
      }
    })
    this.cleaning = task
    void task.finally(() => { if (this.cleaning === task) this.cleaning = undefined }).catch(() => {})
    return task
  }
}

/** Trusted Main composition. Paths and environment never come from Renderer. */
export function createCsharpLanguageManager(options: CsharpLsResolverOptions, processes: ProcessManager,
  environment: NodeJS.ProcessEnv = process.env): LanguageServiceManager {
  return new LanguageServiceManager({
    sdk: new DotnetSdkDetector(environment),
    provider: new CsharpLsResolver(options, environment),
    factory: new WindowsCsharpProcessFactory(undefined, environment),
    processes,
  })
}

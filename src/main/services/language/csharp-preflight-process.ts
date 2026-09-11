import { createRequire } from 'node:module'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DotnetSdkDetector } from '../dependencies/dotnet-sdk'
import { WindowsProcessTreeTerminator } from '../process/windows-process-tree-terminator'
import { bounded, LanguageError } from './language-error'
import type { WorkspaceCommands } from './csharp-workspace'

type Event = { type: 'stdout' | 'stderr'; data: Buffer } | { type: 'exit'; exitCode: number }
  | { type: 'stdout-eof' | 'stderr-eof' | 'settled' | 'error' }
export interface PreflightBinding {
  capability: string
  createCsharpPreflight(executable: string, args: readonly string[], cwd: string, env: string[],
    observe: (event: Event) => void): object
  control(handle: object, operation: 'pid' | 'count' | 'terminate' | 'release'): number | undefined
}

/** Finite trusted-workspace commands; no build/restore/target or public executor. */
export class CsharpPreflightProcess implements WorkspaceCommands {
  private retained = new Set<() => Promise<void>>()
  private active = false
  private stopping = false
  private generation = 0
  private detection?: ReturnType<DotnetSdkDetector['detect']>
  constructor(private readonly sdk: Pick<DotnetSdkDetector, 'detect'> = new DotnetSdkDetector(),
    private readonly load: () => PreflightBinding = () => createRequire(__filename)(join(__dirname, 'native/run-process.node')),
    private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async execute(args: readonly string[], cwd: string, signal: AbortSignal): Promise<{ exitCode: number; stdout: string }> {
    if (this.active || this.stopping || this.retained.size || signal.aborted) throw new LanguageError('busy')
    if (!allowed(args) || !/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(cwd) || cwd.includes('\0')) {
      throw new LanguageError('invalid-context')
    }
    this.active = true
    const generation = this.generation
    const command = [...args]
    try {
      const detected = await (this.detection ??= this.sdk.detect())
      if (signal.aborted || this.stopping || generation !== this.generation) throw new LanguageError('stale-session')
      if (!detected.runtime) throw new LanguageError('preflight-failed')
      return await this.run(detected.runtime.executable, command, cwd, signal)
    } finally { this.active = false }
  }

  async stop(): Promise<void> {
    ++this.generation
    this.detection = undefined
    this.stopping = true
    try {
      const results = await Promise.allSettled([...this.retained].map((cleanup) => cleanup()))
      if (results.some((result) => result.status === 'rejected')) throw new LanguageError('cleanup-failed')
    } finally { this.stopping = false }
  }

  private run(executable: string, args: readonly string[], cwd: string, signal: AbortSignal): Promise<{
    exitCode: number; stdout: string
  }> {
    const binding = this.load()
    if (binding.capability !== 'student-ide-piped-job-v1' || typeof binding.createCsharpPreflight !== 'function') {
      throw new LanguageError('startup-failed')
    }
    return new Promise((resolve, reject) => {
      let handle: object, released = false, root = false, outEof = false, errEof = false
      let exitCode = -1, failure: LanguageError | undefined, bytes = 0
      const chunks: Buffer[] = []
      let finishDrain!: () => void
      const drained = new Promise<void>((done) => { finishDrain = done })
      let cleaning: Promise<void> | undefined
      const cleanup = (): Promise<void> => {
        if (released) return Promise.resolve()
        if (cleaning) return cleaning
        const task = (async () => {
          binding.control(handle, 'terminate')
          await bounded(drained, 5000)
          const job = { token: randomUUID(), isReleased: () => released,
            activeProcessCount: () => Number(binding.control(handle, 'count')),
            terminate: () => { binding.control(handle, 'terminate') },
            release: () => {
              if (!root || !outEof || !errEof) throw new LanguageError('cleanup-failed')
              binding.control(handle, 'release'); released = true
            } }
          const terminator = new WindowsProcessTreeTerminator()
          await terminator.terminate(await terminator.capture({ mode: 'JOB_OWNED', rootPid: Number(binding.control(handle, 'pid')), job }), () => !released)
          this.retained.delete(cleanup)
        })()
        cleaning = task
        void task.finally(() => { cleaning = undefined }).catch(() => {})
        return task
      }
      let settling = false
      const settle = async () => {
        if (settling) return
        settling = true
        clearTimeout(timer); signal.removeEventListener('abort', abort)
        try {
          await cleanup()
          if (failure) throw failure
          resolve({ exitCode, stdout: Buffer.concat(chunks).toString('utf8') })
        } catch (error) { reject(error instanceof LanguageError ? error : new LanguageError('cleanup-failed')) }
      }
      const abort = () => { failure ??= new LanguageError('cancelled'); void settle() }
      const timer = setTimeout(() => { failure ??= new LanguageError('timeout'); void settle() }, 20_000)
      const env = Object.entries(this.environment).filter(([key, value]) => value !== undefined
        && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|MSBUILDENABLEALLPROPERTYFUNCTIONS)$/i.test(key)
        && !key.includes('=') && !key.includes('\0') && !value.includes('\0'))
      try {
        handle = binding.createCsharpPreflight(executable, args, cwd,
          env.map(([key, value]) => key + '=' + value), (event) => {
            if (event.type === 'stdout' || event.type === 'stderr') {
              bytes += event.data.length
              if (bytes > 1024 * 1024) { failure ??= new LanguageError('preflight-failed'); void settle() }
              else if (event.type === 'stdout') chunks.push(Buffer.from(event.data))
            } else if (event.type === 'exit') { root = true; exitCode = event.exitCode; void settle() }
            else if (event.type === 'stdout-eof') outEof = true
            else if (event.type === 'stderr-eof') errEof = true
            else if (event.type === 'settled') finishDrain()
            else { failure ??= new LanguageError('preflight-failed'); void settle() }
          })
        this.retained.add(cleanup)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      } catch {
        clearTimeout(timer); signal.removeEventListener('abort', abort)
        reject(new LanguageError('startup-failed'))
      }
    })
  }
}

function allowed(args: readonly string[]): boolean {
  if (args.some((arg) => arg.includes('\0'))) return false
  if (args.length === 1 && args[0] === '--version') return true
  if (args.length === 3 && args[0] === 'sln' && /\.slnx?$/i.test(args[1]) && args[2] === 'list') return true
  return args.length === 9 && args[0] === 'msbuild' && /\.csproj$/i.test(args[1])
    && args.slice(2).join('|') === '-nologo|-verbosity:quiet|-interactive:false|-nodeReuse:false|-noAutoResponse|'
      + '-getProperty:TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion|-getItem:ProjectReference'
}

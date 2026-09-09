import { createRequire } from 'node:module'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DomainError } from '../../errors/app-error'
import { WindowsProcessTreeTerminator } from '../process/windows-process-tree-terminator'
import { isValidatedGitExecutable } from '../dependencies/git-executable'
import type { GitCommandOptions, GitCommandResult, GitStreamResult } from './git-command-runner'

type NativeEvent = { type: 'stdout' | 'stderr'; data: Buffer }
  | { type: 'exit'; exitCode: number }
  | { type: 'stdout-eof' | 'stderr-eof' | 'settled' | 'error' }
export interface GitNativeBinding {
  capability: string
  createGit(executable: string, args: readonly string[], cwd: string, environment: string[],
    observe: (event: NativeEvent) => void): object
  control(handle: object, operation: 'pid' | 'count' | 'terminate' | 'release'): number | undefined
}

/** Retains the known root result independently of a failed ownership cleanup. */
export class GitCleanupFailure extends DomainError {
  constructor(readonly result?: GitCommandResult) {
    super({ code: 'PROCESS_FAILED', message: 'Git process cleanup could not be confirmed.',
      details: { reason: 'cleanup-failed' }, retryable: false })
  }
}

/** Main-only Git process tree. The native Run entry point remains unchanged. */
export class GitOwnedCommandRunner {
  private binding?: GitNativeBinding
  private readonly retained = new Set<() => Promise<void>>()
  private failed = false
  constructor(private readonly load: () => GitNativeBinding = () =>
    createRequire(__filename)(join(__dirname, 'native/run-process.node')),
  private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async stop(): Promise<void> {
    const results = await Promise.allSettled([...this.retained].map((cleanup) => cleanup()))
    if (results.some((result) => result.status === 'rejected')) throw new GitCleanupFailure()
    this.failed = false
  }

  get cleanupPending(): boolean { return this.retained.size > 0 }

  execute(executable: string, args: readonly string[], cwd: string,
    options: GitCommandOptions = {}): Promise<GitCommandResult> {
    return this.run(executable, args, cwd, undefined, options)
  }

  async stream(executable: string, args: readonly string[], cwd: string,
    consume: (chunk: Uint8Array) => boolean, options: GitCommandOptions = {}): Promise<GitStreamResult> {
    const result = await this.run(executable, args, cwd, consume, options)
    return { exitCode: result.exitCode, stoppedEarly: result.stoppedEarly }
  }

  private run(executable: string, args: readonly string[], cwd: string,
    consume: ((chunk: Uint8Array) => boolean) | undefined, options: GitCommandOptions):
    Promise<GitCommandResult & { stoppedEarly: boolean }> {
    const timeout = options.timeoutMs ?? 10_000
    if (!isValidatedGitExecutable(executable) || !/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(cwd)
      || cwd.includes('\0') || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
      || !Number.isSafeInteger(timeout) || timeout <= 0) return Promise.reject(failure('invalid-command'))
    if (options.signal?.aborted) return Promise.reject(failure('cancelled'))
    if (this.failed) return Promise.reject(new GitCleanupFailure())
    this.binding ??= this.load()
    const binding = this.binding
    if (binding.capability !== 'student-ide-piped-job-v1' || typeof binding.createGit !== 'function') {
      return Promise.reject(failure('native-unavailable'))
    }
    const environment = Object.entries(this.environment).filter(([key, value]) => value !== undefined
      && !/^GIT_/i.test(key) && !key.includes('=') && !key.includes('\0') && !value.includes('\0'))
      .map(([key, value]) => [key, value!] as const)
    const env = new Map(environment)
    env.set('LANG', 'C'); env.set('LC_ALL', 'C'); env.set('GIT_TERMINAL_PROMPT', '0')
    return new Promise((resolve, reject) => {
      let handle: object
      let rootCode: number | undefined, error: unknown, early = false, released = false
      let outBytes = 0, errBytes = 0, out = Buffer.alloc(0), err = Buffer.alloc(0)
      let resolveDrained!: () => void
      const drained = new Promise<void>((done) => { resolveDrained = done })
      let cleaning: Promise<void> | undefined
      let rootSeen = false, outEof = false, errEof = false
      const stop = (reason: unknown) => {
        error ??= reason
        try { binding.control(handle, 'terminate') } catch { error = new GitCleanupFailure() }
      }
      const abort = () => stop(failure('cancelled'))
      const timer = setTimeout(() => stop(failure('timeout')), timeout)
      const disposeObservers = () => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
      }
      const cleanup = (): Promise<void> => {
        if (released) return Promise.resolve()
        if (cleaning) return cleaning
        cleaning = (async () => {
          binding.control(handle, 'terminate')
          await drained
          const job = {
            token: randomUUID(),
            activeProcessCount: () => Number(binding.control(handle, 'count')),
            terminate: () => { binding.control(handle, 'terminate') },
            isReleased: () => released,
            release: () => {
              if (!rootSeen || !outEof || !errEof) throw new GitCleanupFailure()
              binding.control(handle, 'release'); released = true
            },
          }
          const terminator = new WindowsProcessTreeTerminator()
          const identity = await terminator.capture({ mode: 'JOB_OWNED',
            rootPid: Number(binding.control(handle, 'pid')), job })
          await terminator.terminate(identity, () => !released)
          this.retained.delete(cleanup)
        })().finally(() => { cleaning = undefined })
        return cleaning
      }
      const finish = async () => {
        disposeObservers()
        try { await cleanup() } catch {
          this.failed = true
          reject(new GitCleanupFailure(rootCode === undefined ? undefined : {
            exitCode: rootCode, stdout: out.toString('utf8'), stderr: err.toString('utf8'),
          }))
          return
        }
        if (error) reject(error)
        else if (rootCode === undefined) reject(failure('process-failed'))
        else resolve({ exitCode: early ? 0 : rootCode, stdout: out.toString('utf8'),
          stderr: err.toString('utf8'), stoppedEarly: early })
      }
      try {
        handle = binding.createGit(executable, args, cwd,
          [...env].sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase())).map(([k, v]) => `${k}=${v}`),
          (event) => {
            if (event.type === 'exit') {
              rootSeen = true; rootCode = event.exitCode
              // Git root completion does not release its surviving hook descendants.
              try { binding.control(handle, 'terminate') } catch { error = new GitCleanupFailure() }
            } else if (event.type === 'stdout-eof') outEof = true
            else if (event.type === 'stderr-eof') errEof = true
            else if (event.type === 'settled') { resolveDrained(); void finish() }
            else if (event.type === 'error') stop(failure('observation-failed'))
            else if (!error && !early) {
              if (event.type === 'stdout') {
                if (consume) {
                  try {
                    if (consume(event.data)) { early = true; binding.control(handle, 'terminate') }
                  } catch (cause) { stop(cause) }
                } else {
                  outBytes += event.data.length
                  if (outBytes > 1024 * 1024) stop(failure('output-limit'))
                  else out = Buffer.concat([out, event.data])
                }
              } else if (event.type === 'stderr') {
                errBytes += event.data.length
                if (errBytes > 1024 * 1024) stop(failure('output-limit'))
                else err = Buffer.concat([err, event.data])
              }
            }
          })
        this.retained.add(cleanup)
        options.signal?.addEventListener('abort', abort, { once: true })
        if (options.signal?.aborted) abort()
      } catch {
        disposeObservers(); reject(failure('spawn-failed'))
      }
    })
  }
}

function failure(reason: string): DomainError {
  return new DomainError({ code: reason === 'timeout' || reason === 'cancelled' ? 'PROCESS_CANCELLED' : 'PROCESS_FAILED',
    message: 'Git could not complete the operation.', details: { reason }, retryable: false })
}

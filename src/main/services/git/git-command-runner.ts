import {
  execFile,
  spawn,
  type ChildProcess,
  type ExecFileException,
  type SpawnOptions,
} from 'node:child_process'

import { DomainError } from '../../errors/app-error'
import { isValidatedGitExecutable } from '../dependencies/git-executable'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024

export interface GitCommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface GitCommandOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

interface ExecFileOptions {
  readonly cwd: string
  readonly encoding: 'utf8'
  readonly env: NodeJS.ProcessEnv
  readonly maxBuffer: number
  readonly shell: false
  readonly signal?: AbortSignal
  readonly timeout: number
  readonly windowsHide: true
}

export type GitExecFile = (
  executable: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: (
    error: ExecFileException | null,
    stdout: string,
    stderr: string,
  ) => void,
) => ChildProcess | void

const nodeExecFile: GitExecFile = (executable, args, options, callback) => {
  return execFile(executable, [...args], options, callback)
}

export type GitSpawn = (executable: string, args: readonly string[], options: SpawnOptions) => ChildProcess
export interface GitStreamResult {
  readonly exitCode: number
  readonly stoppedEarly: boolean
}

/** Private finite-process adapter. Callers, never Renderer payloads, own args/cwd. */
export class GitCommandRunner {
  constructor(
    private readonly executeFile: GitExecFile = nodeExecFile,
    private readonly maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly spawnProcess: GitSpawn = (executable, args, options) => spawn(executable, [...args], options),
  ) {}

  /** Main-only stream consumer. Returning true stops after the semantic limit. */
  stream(
    executable: string,
    args: readonly string[],
    cwd: string,
    consume: (chunk: Uint8Array) => boolean,
    options: GitCommandOptions = {},
  ): Promise<GitStreamResult> {
    validateCommand(executable, args, cwd)
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw invalidCommand('Git timeout must be a positive integer.')
    if (options.signal?.aborted) return Promise.reject(cancelled('cancelled'))
    return new Promise((resolve, reject) => {
      let child: ChildProcess
      try {
        child = this.spawnProcess(executable, args, {
          cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
          env: gitEnvironment(this.environment),
        })
      } catch {
        reject(streamFailure())
        return
      }
      let failure: unknown
      let stoppedEarly = false
      let settled = false
      let stderrBytes = 0
      const stop = (error?: unknown) => {
        if (settled || failure || stoppedEarly) return
        if (error) failure = error
        else stoppedEarly = true
        child.kill()
      }
      const abort = () => stop(cancelled('cancelled'))
      const timer = setTimeout(() => stop(cancelled('timeout')), timeoutMs)
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) abort()
      const stdout = (chunk: Buffer) => {
        if (failure || stoppedEarly || settled) return
        try {
          if (consume(chunk)) stop()
        } catch (error) {
          stop(error instanceof DomainError ? error : streamFailure())
        }
      }
      const stderr = (chunk: Buffer) => {
        stderrBytes += chunk.byteLength
        if (stderrBytes > this.maxBufferBytes) stop(streamFailure('output-limit'))
      }
      const error = () => { failure ??= streamFailure() }
      child.stdout?.on('data', stdout)
      child.stderr?.on('data', stderr)
      child.once('error', error)
      child.once('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        child.stdout?.removeListener('data', stdout)
        child.stderr?.removeListener('data', stderr)
        child.removeListener('error', error)
        if (failure) reject(failure)
        else if (stoppedEarly) resolve({ exitCode: 0, stoppedEarly: true })
        else if (typeof code === 'number') resolve({ exitCode: code, stoppedEarly: false })
        else reject(streamFailure())
      })
    })
  }

  execute(
    executable: string,
    args: readonly string[],
    cwd: string,
    options: GitCommandOptions = {},
  ): Promise<GitCommandResult> {
    validateCommand(executable, args, cwd)
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw invalidCommand('Git timeout must be a positive integer.')
    }
    if (options.signal?.aborted) {
      return Promise.reject(cancelled('cancelled'))
    }

    return new Promise((resolve, reject) => {
      let completionRequested = false
      let processClosed = false
      const child = this.executeFile(executable, args, {
        cwd,
        encoding: 'utf8',
        env: gitEnvironment(this.environment),
        maxBuffer: this.maxBufferBytes,
        shell: false,
        signal: options.signal,
        timeout: timeoutMs,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        if (completionRequested) return
        completionRequested = true
        queueMicrotask(() => {
          const finish = () => complete(error, stdout, stderr, options.signal, resolve, reject)
          if (!child || processClosed) finish()
          else child.once('close', finish)
        })
      })
      // Even spawn failure emits close after error. Exit/PID state alone does
      // not prove stdio handles and AbortSignal resources have been released.
      child?.once('close', () => { processClosed = true })
    })
  }
}

function gitEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Ambient Git overrides must not redirect this project's index/root/pathspecs.
  const result = Object.fromEntries(Object.entries(environment)
    .filter(([name]) => !name.toUpperCase().startsWith('GIT_')))
  return { ...result, LANG: 'C', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' }
}

function streamFailure(reason = 'process-failure'): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED', message: 'Git could not complete the operation.',
    operation: 'git:execute', details: { reason }, retryable: false,
  })
}

function complete(
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
  signal: AbortSignal | undefined,
  resolve: (result: GitCommandResult) => void,
  reject: (reason: unknown) => void,
): void {
  if (!error) {
    resolve({ exitCode: 0, stdout, stderr })
    return
  }
  if (isAbortError(error) || signal?.aborted) {
    reject(cancelled('cancelled'))
    return
  }
  if (isOutputLimitError(error)) {
    reject(new DomainError({
      code: 'PROCESS_FAILED',
      message: 'Git produced more output than the operation allows.',
      operation: 'git:execute',
      details: { reason: 'output-limit' },
      retryable: false,
    }))
    return
  }
  if (error.killed) {
    reject(cancelled('timeout'))
    return
  }
  if (typeof error.code === 'number') {
    resolve({ exitCode: error.code, stdout, stderr })
    return
  }
  reject(new DomainError({
    code: 'PROCESS_FAILED',
    message: 'Git could not complete the operation.',
    operation: 'git:execute',
    retryable: true,
  }, { cause: error }))
}

function validateCommand(
  executable: string,
  args: readonly string[],
  cwd: string,
): void {
  if (!isValidatedGitExecutable(executable)) {
    throw invalidCommand('The Git executable is invalid.')
  }
  if (!isFullyQualified(cwd) || cwd.includes('\0')) {
    throw invalidCommand('The Git working directory is invalid.')
  }
  if (!Array.isArray(args) || args.some((argument) => (
    typeof argument !== 'string' || argument.includes('\0')
  ))) {
    throw invalidCommand('The Git arguments are invalid.')
  }
}

function isAbortError(error: ExecFileException): boolean {
  return error.name === 'AbortError' || error.code === 'ABORT_ERR'
}

function isOutputLimitError(error: ExecFileException): boolean {
  return error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
}

function cancelled(reason: 'cancelled' | 'timeout'): DomainError {
  return new DomainError({
    code: 'PROCESS_CANCELLED',
    message: reason === 'timeout'
      ? 'The Git operation timed out.'
      : 'The Git operation was cancelled.',
    operation: 'git:execute',
    details: { reason },
    retryable: true,
  })
}

function invalidCommand(message: string): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT',
    message,
    operation: 'git:execute',
    retryable: false,
  })
}

function isFullyQualified(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path)
    || /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(path)
}

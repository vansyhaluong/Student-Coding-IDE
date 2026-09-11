import { createRequire } from 'node:module'
import { join, win32 } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import type { CsharpLsProvider } from '../dependencies/csharp-ls'
import { isValidatedWindowsExecutable } from '../dependencies/windows-executable'
import { WindowsProcessTreeTerminator } from '../process/windows-process-tree-terminator'
import { bounded, LanguageError } from './language-error'

/** Trusted Main context. Selection and preflight are supplied by 5.5E, not performed here. */
export interface CsharpSessionContext {
  readonly root: string
  readonly solution?: string
}
export type CsharpProcessEvent = 'exit' | 'error'
export interface CsharpProcess {
  readonly exited: Promise<void>
  readonly stdout: PassThrough
  readonly stdin: Writable
  isAlive(): boolean
  isReleased(): boolean
  close(): Promise<void>
}
export interface CsharpProcessFactory {
  create(provider: CsharpLsProvider, context: CsharpSessionContext,
    observe: (event: CsharpProcessEvent) => void): CsharpProcess
}
type NativeEvent = { type: 'stdout' | 'stderr'; data: Buffer }
  | { type: 'stdout-eof' | 'stderr-eof' | 'settled' | 'error' | 'exit' }
export interface CsharpNativeBinding {
  capability: string
  createCsharp(executable: string, args: readonly string[], cwd: string, environment: string[],
    observe: (event: NativeEvent) => void): object
  writeCsharp(handle: object, data: Buffer, complete: (success: boolean) => void): void
  control(handle: object, operation: 'pid' | 'count' | 'terminate' | 'release'): number | undefined
}

export function validateCsharpContext(context: CsharpSessionContext): void {
  if (!/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(context.root) || context.root.includes('\0')) {
    throw new LanguageError('invalid-context')
  }
  if (context.solution !== undefined && (!/\.(sln|slnx)$/i.test(context.solution)
    || win32.isAbsolute(context.solution) || context.solution.split(/[\\/]/).includes('..')
    || /[:\0]/.test(context.solution))) throw new LanguageError('invalid-context')
}

/** No generic spawn API: resolver-selected csharp-ls and fixed C# argument construction. */
export class WindowsCsharpProcessFactory implements CsharpProcessFactory {
  constructor(private readonly load: () => CsharpNativeBinding = () =>
    createRequire(__filename)(join(__dirname, 'native/run-process.node')),
  private readonly environment: NodeJS.ProcessEnv = process.env) {}

  create(provider: CsharpLsProvider, context: CsharpSessionContext,
    observe: (event: CsharpProcessEvent) => void): CsharpProcess {
    validateCsharpContext(context)
    if (process.platform !== 'win32' || process.arch !== 'x64'
      || !isValidatedWindowsExecutable(provider.executable, 'csharp-ls.exe') || provider.version !== '0.27.0') {
      throw new LanguageError('startup-failed')
    }
    const binding = this.load()
    if (binding.capability !== 'student-ide-piped-job-v1'
      || typeof binding.createCsharp !== 'function' || typeof binding.writeCsharp !== 'function') {
      throw new LanguageError('startup-failed')
    }
    const args = ['--loglevel', 'error', ...(context.solution ? ['--solution', context.solution] : [])]
    const environment = Object.entries(this.environment).filter(([key, value]) => value !== undefined
      && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key)
      && !key.includes('=') && !key.includes('\0') && !value.includes('\0'))
      .sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase())).map(([key, value]) => key + '=' + value)
    const stdout = new PassThrough()
    let alive = true, released = false, outEof = false, errEof = false
    let finishDrain!: () => void
    let finishExit!: () => void
    const exited = new Promise<void>((resolve) => { finishExit = resolve })
    const drained = new Promise<void>((resolve) => { finishDrain = resolve })
    let pendingWrite: Promise<void> = Promise.resolve()
    const stdin = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        pendingWrite = new Promise<void>((resolve) => {
          const complete = (success: boolean) => {
            resolve()
            callback(success ? undefined : new LanguageError('closed'))
          }
          try { binding.writeCsharp(handle, Buffer.from(chunk), complete) }
          catch { complete(false) }
        })
      },
    })
    stdin.on('error', () => { if (!released) observe('error') })
    // Stream errors and provider logs are never forwarded as raw public events.
    stdout.on('error', () => { if (!released) observe('error') })
    const handle = binding.createCsharp(provider.executable, args, context.root, environment, (event) => {
      if (released) return
      if (event.type === 'stdout') {
        stdout.write(event.data)
        // Bound pre-listen/backlogged transport memory. Fail the session, never truncate a frame.
        if (stdout.readableLength > 16 * 1024 * 1024) observe('error')
      } else if (event.type === 'stdout-eof') { outEof = true; stdout.end() }
      else if (event.type === 'stderr-eof') errEof = true
      else if (event.type === 'settled') finishDrain()
      else if (event.type === 'exit') { alive = false; finishExit(); observe('exit') }
      else if (event.type === 'error') observe('error')
      // stderr is deliberately drained and discarded; no raw log store or text-based state.
    })
    const job = {
      token: randomUUID(),
      activeProcessCount: () => Number(binding.control(handle, 'count')),
      terminate: () => { binding.control(handle, 'terminate') },
      isReleased: () => released,
      release: () => {
        if (alive || !outEof || !errEof) throw new LanguageError('cleanup-failed')
        binding.control(handle, 'release'); released = true
      },
    }
    const terminator = new WindowsProcessTreeTerminator()
    let closing: Promise<void> | undefined
    return {
      stdin, stdout, exited, isAlive: () => alive, isReleased: () => released,
      close: () => {
        if (released) return Promise.resolve()
        if (closing) return closing
        stdin.destroy() // Stops queued writes; an in-flight native write settles after Job termination.
        closing = (async () => {
          try {
            job.terminate()
            await bounded(Promise.all([drained, pendingWrite]), 5000)
            const identity = await terminator.capture({ mode: 'JOB_OWNED',
              rootPid: Number(binding.control(handle, 'pid')), job })
            await terminator.terminate(identity, () => !released)
            stdout.destroy()
          } catch { throw new LanguageError('cleanup-failed') }
        })().finally(() => { closing = undefined })
        return closing
      },
    }
  }
}

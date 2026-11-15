import { createRequire } from 'node:module'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { randomUUID } from 'node:crypto'
import { DomainError } from '../../errors/app-error'
import { WindowsProcessTreeTerminator } from '../process/windows-process-tree-terminator'
import type { WindowsJobController } from '../process/process-tree-terminator'
import type { PreparedRun } from './run-strategy'
import type { PipedProcessAdapter, PipedProcessEvent, PipedRunProcess, RunInputWriteStatus, RunStdinMode } from './piped-process-adapter'

type NativeEvent = { type: 'stdout' | 'stderr'; data: Buffer }
  | { type: 'stdout-eof' | 'stderr-eof' | 'settled' | 'error' }
  | { type: 'exit'; exitCode: number }
interface NativeModule {
  capability: string
  createRun(executable: string, args: readonly string[], cwd: string, environment: string[],
    callback: (event: NativeEvent) => void): object
  createRunInput?(executable: string, args: readonly string[], cwd: string, environment: string[],
    callback: (event: NativeEvent) => void): object
  writeRun?(handle: object, bytes: Buffer, callback: (status: RunInputWriteStatus) => void): void
  closeRunInput?(handle: object, callback: (status: 'closed') => void): void
  control(handle: object, operation: 'pid' | 'count' | 'terminate' | 'release' | 'cancel-input'): number | undefined
}

/** Internal binding path is derived from the built Main directory, not cwd. */
export class WindowsPipedProcessAdapter implements PipedProcessAdapter {
  private readonly native: NativeModule
  constructor(modulePath = join(__dirname, 'native/run-process.node'),
    private readonly environment: NodeJS.ProcessEnv = process.env) {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new DomainError({
      code: 'UNSUPPORTED', retryable: false, operation: 'run:native', message: 'Run currently requires Windows x64.' })
    const binding: NativeModule = createRequire(__filename)(modulePath)
    if (binding.capability !== 'student-ide-piped-job-v1' || typeof binding.createRun !== 'function') {
      throw new Error('Run native capability mismatch.')
    }
    this.native = binding
  }

  create(run: PreparedRun, observe: (event: PipedProcessEvent) => void, stdin: RunStdinMode = 'closed'): PipedRunProcess {
    if (run.shell !== false || !Array.isArray(run.args) || run.args.length > 1024
      || !run.environmentAdditions || Object.keys(run.environmentAdditions).length !== 0) {
      throw new Error('Unsupported Run execution preparation.')
    }
    const environment = Object.entries(this.environment).filter(([key, value]) => value !== undefined
      && !/^(NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)$/i.test(key)
      && !key.includes('=') && !key.includes('\0') && !value.includes('\0'))
      .sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase()))
      .map(([key, value]) => `${key}=${value}`)
    const stdout = new StringDecoder('utf8'), stderr = new StringDecoder('utf8')
    let resolveSettled!: () => void
    const settled = new Promise<void>((resolve) => { resolveSettled = resolve })
    let rootObserved = false, stdoutEof = false, stderrEof = false, released = false
    let observationFailed = false
    const emit = (event: PipedProcessEvent): void => {
      try { observe(event) } catch { observationFailed = true }
    }
    if (stdin !== 'closed' && stdin !== 'line-input') throw new Error('Unsupported Run stdin mode.')
    if (stdin === 'line-input' && (typeof this.native.createRunInput !== 'function'
      || typeof this.native.writeRun !== 'function' || typeof this.native.closeRunInput !== 'function')) {
      throw new Error('Run native stdin capability mismatch.')
    }
    const observeNative = (event: NativeEvent): void => {
      if (released) return
      if (event.type === 'stdout' || event.type === 'stderr') {
        const data = (event.type === 'stdout' ? stdout : stderr).write(event.data)
        if (data) emit({ type: event.type, data })
      } else if (event.type === 'stdout-eof' || event.type === 'stderr-eof') {
        const isOut = event.type === 'stdout-eof'
        const data = (isOut ? stdout : stderr).end()
        if (data) emit({ type: isOut ? 'stdout' : 'stderr', data })
        if (isOut) stdoutEof = true
        else stderrEof = true
        emit({ type: event.type })
      } else if (event.type === 'exit') {
        rootObserved = true; emit(event)
      } else if (event.type === 'settled') {
        resolveSettled()
      } else {
        observationFailed = true
        emit({ type: 'error', message: 'Run process observation failed.' })
      }
    }
    // createRun validates/quotes bounded argv before allocating OS resources.
    // Closed stdin stays NUL. Line-input is a separate Run entry, not the LSP writer.
    const handle = stdin === 'line-input'
      ? this.native.createRunInput!(run.executable, run.args, run.cwd, environment, observeNative)
      : this.native.createRun(run.executable, run.args, run.cwd, environment, observeNative)
    const job: WindowsJobController = {
      token: `run-job_${randomUUID()}`,
      activeProcessCount: () => Number(this.native.control(handle, 'count')),
      terminate: () => { this.native.control(handle, 'terminate') },
      release: () => {
        if (!rootObserved || !stdoutEof || !stderrEof) throw new Error('Run observers have not settled.')
        this.native.control(handle, 'release'); released = true
      },
      isReleased: () => released,
    }
    const ownership = { mode: 'JOB_OWNED' as const, rootPid: Number(this.native.control(handle, 'pid')), job }
    const terminator = new WindowsProcessTreeTerminator()
    let closing: Promise<void> | undefined
    let inputIdle: Promise<void> = Promise.resolve()
    const trackInput = (work: Promise<void>): void => {
      inputIdle = inputIdle.then(() => work, () => work)
    }
    const closedInput = (): Promise<never> => Promise.reject(new Error('Run stdin is closed.'))
    return {
      ownership, settled, stdin, isReleased: () => released,
      writeInput: stdin === 'line-input' ? (bytes) => {
        if (released) return Promise.reject(new Error('Run stdin is closed.'))
        const task = new Promise<RunInputWriteStatus>((resolve, reject) => {
          try {
            this.native.writeRun!(handle, Buffer.from(bytes), (status) => {
              if (status === 'delivered' || status === 'broken' || status === 'cancelled') resolve(status)
              else reject(new Error('Unexpected Run stdin result.'))
            })
          } catch (error) { reject(error instanceof Error ? error : new Error('Run stdin write failed.')) }
        })
        trackInput(task.then(() => undefined, () => undefined))
        return task
      } : () => closedInput(),
      closeInput: stdin === 'line-input' ? () => {
        if (released) return Promise.reject(new Error('Run stdin is closed.'))
        const task = new Promise<void>((resolve, reject) => {
          try {
            this.native.closeRunInput!(handle, (status) => {
              if (status === 'closed') resolve()
              else reject(new Error('Run stdin EOF failed.'))
            })
          } catch (error) { reject(error instanceof Error ? error : new Error('Run stdin EOF failed.')) }
        })
        trackInput(task.then(() => undefined, () => undefined))
        return task
      } : () => closedInput(),
      close: () => {
        if (released) return Promise.resolve()
        if (closing) return closing
        closing = (async () => {
          if (stdin === 'line-input') this.native.control(handle, 'cancel-input')
          await inputIdle
          job.terminate()
          await boundedSettlement(settled)
          const identity = await terminator.capture(ownership)
          await terminator.terminate(identity, () => !released)
          if (observationFailed) emit({ type: 'error', message: 'Run output could not be fully observed.' })
        })().finally(() => { closing = undefined })
        return closing
      },
    }
  }
}

function boundedSettlement(settled: Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    // Deadline detects failure; readiness is exclusively driven by native callbacks.
    const timer = setTimeout(() => reject(new Error('Run observer cleanup timed out.')), 5000)
    settled.then(() => { clearTimeout(timer); resolve() }, (error) => { clearTimeout(timer); reject(error) })
  })
}

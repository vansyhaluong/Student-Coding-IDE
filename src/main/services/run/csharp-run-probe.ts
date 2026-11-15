import { randomUUID } from 'node:crypto'
import { win32 } from 'node:path'
import { isValidatedWindowsExecutable, isFullyQualifiedWindowsPath } from '../dependencies/windows-executable'
import { ProcessManager } from '../process/process-manager'
import type { PipedProcessAdapter, PipedRunProcess } from './piped-process-adapter'
import { WindowsPipedProcessAdapter } from './windows-piped-process-adapter'

export const RUN_EVALUATION_PROPERTIES = [
  'OutputType', 'TargetFramework', 'TargetFrameworks', 'TargetFrameworkIdentifier',
  'TargetFrameworkVersion', 'UsingMicrosoftNETSdk', 'UsingMicrosoftNETSdkWeb',
  'UseWPF', 'UseWindowsForms', 'IsTestProject',
] as const
export const RUN_PROBE_LIMITS = { outputBytes: 1024 * 1024, timeoutMs: 20_000 } as const
export type RunProbeFailure = 'CANCELLED' | 'TIMEOUT' | 'OUTPUT_LIMIT' | 'SPAWN_FAILED'
  | 'OBSERVATION_FAILED' | 'CLEANUP_FAILED' | 'BUSY' | 'INVALID_CONTEXT'
export class RunProbeError extends Error {
  constructor(readonly reason: RunProbeFailure) { super(reason) }
}
export type RunProbeCommand = { readonly kind: 'inventory' | 'version' }
  | { readonly kind: 'evaluate'; readonly project: string }
export interface RunProbeResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
export interface RunSdkProbe {
  execute(executable: string, command: RunProbeCommand, cwd: string, signal: AbortSignal): Promise<RunProbeResult>
}

/** Run-owned finite probes. Only fixed semantic commands; no caller-supplied switches. */
export class CsharpRunProbe implements RunSdkProbe {
  private active = false
  private retained?: () => Promise<void>
  constructor(private readonly processes: ProcessManager,
    private readonly ownerId: string,
    private readonly adapter: () => PipedProcessAdapter = () => new WindowsPipedProcessAdapter(undefined,
      Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^MSBUILDENABLEALLPROPERTYFUNCTIONS$/i.test(key))))) {}

  async execute(executable: string, command: RunProbeCommand, cwd: string, signal: AbortSignal): Promise<RunProbeResult> {
    if (signal.aborted) throw new RunProbeError('CANCELLED')
    if (this.active || this.retained) throw new RunProbeError('BUSY')
    if (!isValidatedWindowsExecutable(executable, 'dotnet.exe') || !isFullyQualifiedWindowsPath(cwd)
      || cwd.includes('\0') || (command.kind === 'evaluate' && (!/\.csproj$/i.test(command.project)
        || command.project.includes('\0') || win32.dirname(command.project).toLowerCase() !== win32.normalize(cwd).toLowerCase()))) {
      throw new RunProbeError('INVALID_CONTEXT')
    }
    const args = command.kind === 'inventory' ? ['--list-sdks'] : command.kind === 'version' ? ['--version']
      : command.kind === 'evaluate' ? ['msbuild', command.project, '-nologo', '-verbosity:quiet',
        '-interactive:false', '-nodeReuse:false', '-noAutoResponse', '-property:Configuration=Debug',
        `-getProperty:${RUN_EVALUATION_PROPERTIES.join(',')}`, '-getItem:ProjectReference'] : undefined
    if (!args) throw new RunProbeError('INVALID_CONTEXT')
    this.active = true
    try {
      return await new Promise<RunProbeResult>((resolve, reject) => {
        let child: PipedRunProcess | undefined, failure: RunProbeFailure | undefined
        let exitCode = -1, bytes = 0, finishing = false, closing: Promise<void> | undefined
        const stdout: string[] = [], stderr: string[] = []
        const cleanup = (): Promise<void> => {
          if (closing) return closing
          closing = (async () => {
            await child?.close()
            if (child && !child.isReleased()) throw new RunProbeError('CLEANUP_FAILED')
            unregister()
            this.retained = undefined
          })().finally(() => { closing = undefined })
          return closing
        }
        const finish = async () => {
          if (finishing) return
          finishing = true
          clearTimeout(timer); signal.removeEventListener('abort', abort)
          try {
            await cleanup()
            if (failure) throw new RunProbeError(failure)
            resolve({ exitCode, stdout: stdout.join(''), stderr: stderr.join('') })
          } catch (error) {
            reject(error instanceof RunProbeError && !this.retained ? error : new RunProbeError('CLEANUP_FAILED'))
          }
        }
        const fail = (reason: RunProbeFailure) => { failure ??= reason; queueMicrotask(() => { void finish() }) }
        const abort = () => fail('CANCELLED')
        const timer = setTimeout(() => fail('TIMEOUT'), RUN_PROBE_LIMITS.timeoutMs)
        const unregister = this.processes.register({ id: `run-probe_${randomUUID()}`, ownerId: this.ownerId,
          close: async () => { fail('CANCELLED'); await cleanup() } })
        this.retained = cleanup
        signal.addEventListener('abort', abort, { once: true })
        try {
          child = this.adapter().create({ executable, args, cwd, shell: false, environmentAdditions: {} }, (event) => {
            if (event.type === 'stdout' || event.type === 'stderr') {
              bytes += Buffer.byteLength(event.data, 'utf8')
              if (bytes > RUN_PROBE_LIMITS.outputBytes) fail('OUTPUT_LIMIT')
              else (event.type === 'stdout' ? stdout : stderr).push(event.data)
            } else if (event.type === 'exit') { exitCode = event.exitCode; queueMicrotask(() => { void finish() }) }
            else if (event.type === 'error') fail('OBSERVATION_FAILED')
          })
          if (signal.aborted) abort()
        } catch { fail('SPAWN_FAILED') }
      })
    } finally { this.active = false }
  }

  /** Retry retained cleanup after a failed command; no new command may bypass it. */
  async stop(): Promise<void> { await this.processes.cleanupOwner(this.ownerId) }
}

import { win32 as path } from 'node:path'
import { performance } from 'node:perf_hooks'
import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import type { CsharpCompileResult, CsharpFailureKind } from '../../../../shared/contracts/csharp-execution'
import { DomainError } from '../../../errors/app-error'
import type { CsharpCompilation, CsharpCompiler, CsharpPreparedExecution, CsharpSdkSelection } from './csharp-execution-contracts'
import type { ExercisePhaseContext } from './exercise-runtime-adapter'
import { WindowsExerciseRuntimeAdapter, type LearningProcessSpec } from './windows-exercise-adapter'
import type { LearningNativeBinding } from './windows-exercise-native'
import type { ExerciseWorkspace } from './exercise-workspace'
import { CsharpCompileWorkspace, checkCsharpWork } from './csharp-compile-workspace'
import { generateCsharpHarness, CSHARP_ENTRY_POINT } from './csharp-harness'
import { CsharpDiagnostics } from './csharp-diagnostics'
import { revalidateCsharpSdk } from './csharp-sdk-resolver'
import { exerciseCoreError } from './exercise-limits'

function quoted(value: string): string {
  if (!path.isAbsolute(value) || /[\r\n\0"]/.test(value)) throw exerciseCoreError('COMPILER_PATH')
  return `"${value}"`
}
/** Fixed Main-owned arguments only. No response directive/source/SDK args from Renderer. */
export function csharpResponseFile(sdk: CsharpSdkSelection, files: CsharpCompileWorkspace): string {
  if (sdk.targetFramework !== 'net10.0' || !sdk.references.length || sdk.references.length > 1024
    || !['System.Runtime.dll', 'System.Console.dll', 'System.Text.Json.dll', 'System.Collections.dll']
      .every(name => sdk.references.some(file => path.basename(file) === name))
    || sdk.references.some(file => path.dirname(file).toLowerCase() !== sdk.referenceDirectory.toLowerCase() || path.extname(file).toLowerCase() !== '.dll')) throw exerciseCoreError('COMPILER_REFERENCES')
  return ['/nologo', '/nostdlib+', '/target:exe', '/platform:x64', '/unsafe-', '/checked-',
    '/optimize+', '/debug-', '/deterministic+', '/nullable:enable', '/langversion:default', '/utf8output',
    '/codepage:65001', '/preferreduilang:en-US', `/main:${CSHARP_ENTRY_POINT}`, `/out:${quoted(files.assembly)}`,
    ...sdk.references.map(file => `/reference:${quoted(file)}`), quoted(files.solution), quoted(files.harness), ''].join('\n')
}
export function csharpRuntimeConfig(sdk: CsharpSdkSelection): string {
  if (!/^10\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(sdk.runtimeVersion) || sdk.targetFramework !== 'net10.0') throw exerciseCoreError('COMPILER_RUNTIME')
  // This operation binds the resolver's chosen patch; later operations rediscover normally.
  return JSON.stringify({ runtimeOptions: { tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version: sdk.runtimeVersion }, rollForward: 'Disable' } }, null, 2) + '\n'
}
/** Per-operation compiler. The admitting Core/driver MUST own runtime for Policy B cleanup. */
export class RoslynCsharpCompiler implements CsharpCompiler {
  readonly runtime: WindowsExerciseRuntimeAdapter
  private plan: LearningProcessSpec | null = null
  private used = false
  constructor(native: LearningNativeBinding, private readonly workspace: ExerciseWorkspace) {
    const systemRoot = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'systemroot')?.[1]
    this.runtime = new WindowsExerciseRuntimeAdapter(native, phase => phase === 'compile' ? this.plan : null, {
      ...(systemRoot ? { SystemRoot: systemRoot, WINDIR: systemRoot } : {}),
      TEMP: workspace.path, TMP: workspace.path, DOTNET_CLI_HOME: workspace.path,
      DOTNET_EnableDiagnostics: '0', DOTNET_MULTILEVEL_LOOKUP: '0', DOTNET_ROLL_FORWARD_TO_PRERELEASE: '0',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1',
    })
  }
  async compile(input: CsharpPreparedExecution, context: ExercisePhaseContext): Promise<CsharpCompilation> {
    if (this.used) throw exerciseCoreError('ADMISSION_CLOSED')
    this.used = true
    const phaseContext = { ...context, deadline: Math.min(context.deadline, performance.now() + EXERCISE_LIMITS.compileMs) }
    const files = new CsharpCompileWorkspace(this.workspace, phaseContext)
    const diagnostics = new CsharpDiagnostics(files.solution, files.harness)
    let rawBytes = 0, observing = true
    const failed = (kind: CsharpFailureKind, operation = false): CsharpCompilation => ({ artifact: null,
      result: { status: 'FAILED', exitCode: this.runtime.processResult()?.exitCode ?? null, diagnostics: [...diagnostics.diagnostics],
        ...diagnostics.streams(), failure: { kind, phase: operation ? 'operation' : 'compile', caseIndex: null } } })
    try {
      checkCsharpWork(phaseContext)
      if (input.workspace !== this.workspace || context.jobMemoryBytes !== EXERCISE_LIMITS.compileJobMemoryBytes
        || typeof input.code !== 'string' || input.code.length > 256 * 1024) throw exerciseCoreError('COMPILER_CONFIGURATION')
      const harness = generateCsharpHarness(input.exercise, input.schema)
      if (!await revalidateCsharpSdk(input.sdk, phaseContext)) throw exerciseCoreError('COMPILER_DEPENDENCY')
      await files.create()
      await files.write(files.solution, input.code); await files.write(files.harness, harness)
      await files.write(files.runtimeConfig, csharpRuntimeConfig(input.sdk))
      await files.write(files.response, csharpResponseFile(input.sdk, files))
      await files.verifyFiles(); checkCsharpWork(phaseContext)
      this.plan = { executable: input.sdk.dotnetPath, cwd: files.directory,
        args: ['exec', '--fx-version', input.sdk.runtimeVersion, '--roll-forward', 'Disable', input.sdk.compilerPath, '/noconfig', `@${files.response}`] }
      const process = await this.runtime.runProcessPhase('compile', { ...phaseContext,
        output: (stream, text) => {
          // Core discards post-cancellation output; do not let our parser/limit
          // throw again while Policy B is draining retained native pipes.
          if (!observing || phaseContext.signal.aborted) return
          const bytes = Buffer.byteLength(text, 'utf8'); rawBytes += bytes
          // Account BEFORE normalization. Raw Roslyn paths never enter an Exercise snapshot.
          context.output(stream, '', bytes)
          if (phaseContext.signal.aborted) return
          if (rawBytes > EXERCISE_LIMITS.outputBytes) { observing = false; throw exerciseCoreError('OUTPUT_LIMIT') }
          diagnostics.write(stream, text)
        },
      })
      diagnostics.finish(); checkCsharpWork(phaseContext)
      if (!process || !process.processExited || !process.observerSettled || !process.stdoutSettled || !process.stderrSettled) return failed('INFRASTRUCTURE_FAILURE')
      if (process.jobMemoryLimitObserved) return failed('JOB_MEMORY_LIMIT')
      if (process.exitCode !== 0) return failed(diagnostics.sourceError && !diagnostics.infrastructureError ? 'COMPILE_ERROR' : 'INFRASTRUCTURE_FAILURE')
      if (process.failure || diagnostics.sourceError || diagnostics.infrastructureError) return failed('INFRASTRUCTURE_FAILURE')
      await files.validateAssembly(); checkCsharpWork(phaseContext)
      const result: CsharpCompileResult & { status: 'SUCCEEDED' } = { status: 'SUCCEEDED', exitCode: 0,
        diagnostics: [...diagnostics.diagnostics], ...diagnostics.streams(), failure: null }
      return { result, artifact: Object.freeze({ assemblyPath: files.assembly, runtimeConfigPath: files.runtimeConfig }) }
    } catch (error) {
      diagnostics.finish()
      const reason: unknown = phaseContext.signal.reason
      const abortReason = reason instanceof DomainError ? reason.details?.reason : undefined
      const failureReason = error instanceof DomainError ? error.details?.reason : undefined
      if (abortReason === 'OPERATION_TIMEOUT') return failed('TIMEOUT', true)
      if (abortReason === 'COMPILE_TIMEOUT' || failureReason === 'PHASE_DEADLINE' || performance.now() >= phaseContext.deadline) return failed('TIMEOUT')
      if (abortReason === 'OUTPUT_LIMIT' || failureReason === 'OUTPUT_LIMIT') return failed('OUTPUT_LIMIT')
      if (this.runtime.processResult()?.jobMemoryLimitObserved) return failed('JOB_MEMORY_LIMIT')
      if (phaseContext.signal.aborted || this.runtime.processResult()?.failure === 'CANCELLED') {
        throw new DomainError({ code: 'PROCESS_CANCELLED', operation: 'exercise:compile', message: 'Learning compilation was cancelled.',
          details: { reason: 'CANCELLED' }, retryable: false })
      }
      return failed('INFRASTRUCTURE_FAILURE')
    } finally { observing = false; this.plan = null }
  }
}

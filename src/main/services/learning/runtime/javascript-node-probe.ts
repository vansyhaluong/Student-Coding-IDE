import { win32 } from 'node:path'
import { EXERCISE_LIMITS, type ExerciseEndReason } from '../../../../shared/contracts/exercise'
import type { JavascriptNodeProbe, JavascriptNodeResolution, JavascriptNodeSelection } from './javascript-execution-contracts'
import type { ExerciseExecutionPhase, ExercisePhaseContext, ExerciseRuntimeAdapter } from './exercise-runtime-adapter'
import { exerciseCoreError } from './exercise-limits'
import { classifyExerciseTermination } from './exercise-session'
import { captureJavascriptNode, checkJavascriptWork, revalidateJavascriptNode } from './javascript-node-files'
import { WindowsExerciseRuntimeAdapter, type LearningProcessSpec } from './windows-exercise-adapter'
import type { LearningNativeBinding } from './windows-exercise-native'
import { assertExerciseDirectory, sameWorkspace, workspaceIdentity, type ExerciseWorkspace } from './exercise-workspace'

/** Fixed trusted probe only, never student code. No shell, npm or external imports. */
const probeSource = `const vm=require('node:vm');process.stdout.write(JSON.stringify({protocolVersion:1,version:process.version,architecture:process.arch,platform:process.platform,execPath:process.execPath,capabilities:{script:typeof vm.Script==='function',context:typeof vm.createContext==='function',utf8:typeof TextDecoder==='function'}}));`
export class WindowsLearningNodeProbe implements JavascriptNodeProbe, ExerciseRuntimeAdapter {
  private readonly execution: WindowsExerciseRuntimeAdapter
  private plan: LearningProcessSpec | null = null
  private active = false
  private sealed = false
  private prepareContext?: ExercisePhaseContext
  private stdout: Buffer[] = []
  private stderr = 0
  private bytes = 0
  constructor(native: LearningNativeBinding, private readonly workspace: ExerciseWorkspace) {
    // Do not inherit NODE_OPTIONS, NODE_PATH, coverage/config hooks or arbitrary user env.
    const environment = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: workspace.path, TMP: workspace.path }
    this.execution = new WindowsExerciseRuntimeAdapter(native, phase => phase === 'prepare' ? this.plan : null, environment)
  }
  private async validateWorkspace(context: ExercisePhaseContext): Promise<void> {
    checkJavascriptWork(context)
    if (!this.workspace.ownsLease || !this.workspace.identity) throw exerciseCoreError('OWNERSHIP')
    await assertExerciseDirectory(this.workspace.path)
    if (!sameWorkspace(this.workspace.identity, await workspaceIdentity(this.workspace.path))) throw exerciseCoreError('WORKSPACE_REPLACED')
    checkJavascriptWork(context)
  }
  async probe(candidate: Readonly<Pick<JavascriptNodeSelection, 'executablePath' | 'canonicalPath' | 'identity'>>,
    context: ExercisePhaseContext): Promise<JavascriptNodeResolution> {
    checkJavascriptWork(context)
    if (this.sealed || this.active || context.jobMemoryBytes !== EXERCISE_LIMITS.executeJobMemoryBytes
      || this.prepareContext && (this.prepareContext.signal !== context.signal || this.prepareContext.deadline !== context.deadline)) throw exerciseCoreError('ADMISSION_CLOSED')
    this.prepareContext ??= context
    this.active = true; this.stdout = []; this.stderr = 0; this.bytes = 0
    try {
      if (classifyExerciseTermination(await this.execution.evidence()) !== 'VERIFIED') throw exerciseCoreError('PROCESS_UNRESOLVED')
      await this.validateWorkspace(context)
      const files = await captureJavascriptNode(candidate.executablePath, context)
      if (files.canonicalPath !== candidate.canonicalPath || files.identity.volume !== candidate.identity.volume
        || files.identity.fileId !== candidate.identity.fileId) throw exerciseCoreError('INVALID_RUNTIME')
      await revalidateJavascriptNode(files, context)
      checkJavascriptWork(context)
      this.plan = { executable: files.canonicalPath, args: ['--eval', probeSource], cwd: this.workspace.path,
        observeBytes: (stream, bytes) => {
          if (this.sealed || context.signal.aborted) return // Cleanup still drains native pipes without republishing/buffering.
          // Core owns the cumulative raw counter; never expose probe data/paths in snapshots.
          context.output(stream, '', bytes.length)
          this.bytes += bytes.length
          if (this.bytes > EXERCISE_LIMITS.outputBytes) throw exerciseCoreError('OUTPUT_LIMIT')
          if (stream === 'stdout') this.stdout.push(Buffer.from(bytes)); else this.stderr += bytes.length
        } }
      const result = await this.execution.runProcessPhase('prepare', { ...context, output: () => {} })
      checkJavascriptWork(context)
      if (classifyExerciseTermination(await this.execution.evidence()) !== 'VERIFIED') throw exerciseCoreError('PROCESS_UNRESOLVED')
      await revalidateJavascriptNode(files, context)
      if (!result?.processExited || !result.observerSettled || !result.stdoutSettled || !result.stderrSettled
        || result.failure && result.failure !== 'NONZERO_EXIT') throw exerciseCoreError('INTERNAL_ERROR')
      if (result.exitCode !== 0 || this.stderr || this.stdout.length === 0) return { state: 'INVALID_CONFIGURATION', reason: 'NODE_INCOMPATIBLE' }
      return this.parse(Buffer.concat(this.stdout), files)
    } finally { this.active = false; this.plan = null; this.stdout = [] }
  }
  private parse(bytes: Buffer, candidate: Pick<JavascriptNodeSelection, 'executablePath' | 'canonicalPath' | 'identity'>): JavascriptNodeResolution {
    const bad: JavascriptNodeResolution = { state: 'INVALID_CONFIGURATION', reason: 'NODE_INCOMPATIBLE' }
    try {
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      // Fixed flat report grammar eliminates duplicate keys, extra fields/documents,
      // escaped aliases and trailing data before parsing. Version patches stay unpinned.
      if (Array.from(text).some(c => c.charCodeAt(0) < 32)
        || !/^\{"protocolVersion":1,"version":"v[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?","architecture":"[a-z0-9]+","platform":"[a-z0-9]+","execPath":"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*","capabilities":\{"script":(?:true|false),"context":(?:true|false),"utf8":(?:true|false)\}\}$/.test(text)) return bad
      const report = JSON.parse(text) as { version: string; architecture: string; platform: string; execPath: string; capabilities: { script: boolean; context: boolean; utf8: boolean } }
      if (!/^v24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(report.version) || report.platform !== 'win32'
        || win32.normalize(report.execPath).toLowerCase() !== win32.normalize(candidate.canonicalPath).toLowerCase()) return bad
      if (report.architecture !== 'x64') return { state: 'INVALID_CONFIGURATION', reason: 'ARCHITECTURE_MISMATCH' }
      if (!Object.values(report.capabilities).every(Boolean)) return { state: 'INVALID_CONFIGURATION', reason: 'CAPABILITY_MISSING' }
      return { state: 'AVAILABLE', selection: { executablePath: candidate.executablePath, canonicalPath: candidate.canonicalPath,
        identity: candidate.identity, version: report.version, architecture: report.architecture } }
    } catch { return bad }
  }
  /** Probe is called only by an admitted Main Prepare driver; not a Run driver/factory. */
  async runPhase(phase: ExerciseExecutionPhase, context: ExercisePhaseContext): Promise<void> {
    void phase; void context; throw exerciseCoreError('ADMISSION_CLOSED')
  }
  async terminate(reason: ExerciseEndReason): Promise<void> { this.sealed = true; await this.execution.terminate(reason) }
  settleObservers() { return this.execution.settleObservers() }
  evidence() { return this.execution.evidence() }
  release() { return this.execution.release() }
  closeHandles() { return this.execution.closeHandles() }
  diagnostics() { return this.execution.diagnostics() }
}

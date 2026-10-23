import { win32 } from 'node:path'
import { mainPathDirectories } from '../../dependencies/windows-executable'
import type { JavascriptNodeProbe, JavascriptNodeResolution, JavascriptNodeResolver, JavascriptNodeSelection,
  JavascriptPreparationContext } from './javascript-execution-contracts'
import type { ExercisePhaseContext } from './exercise-runtime-adapter'
import { exerciseCoreError } from './exercise-limits'
import { captureJavascriptNode, checkJavascriptWork, NodeCandidateError, NodeCandidateMissing,
  revalidateJavascriptNode, safeNodePath, type JavascriptNodeFiles } from './javascript-node-files'

/** One resolver instance per operation; no I/O in construction and no Project resolver. */
export class LearningNodeResolver implements JavascriptNodeResolver {
  private readonly directories: readonly string[]
  private readonly retained = new WeakMap<JavascriptNodeSelection, JavascriptNodeFiles>()
  private active = false
  private attempted = false
  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.directories = Object.freeze([...new Set(mainPathDirectories(environment).filter(safeNodePath))])
  }
  async resolve(context: ExercisePhaseContext, probe: JavascriptNodeProbe): Promise<JavascriptNodeResolution> {
    if (this.active || this.attempted) throw exerciseCoreError('ADMISSION_CLOSED')
    this.active = true; this.attempted = true
    let invalid: JavascriptNodeResolution | undefined
    try {
      for (const directory of this.directories) {
        checkJavascriptWork(context)
        try {
          const files = await captureJavascriptNode(win32.join(directory, 'node.exe'), context)
          checkJavascriptWork(context)
          const result = await probe.probe(files, context)
          checkJavascriptWork(context)
          await revalidateJavascriptNode(files, context)
          if (result.state !== 'AVAILABLE') { invalid = result; continue }
          // Probe implementations are trusted Main ports, but selection must match
          // the verified candidate; never retain an arbitrary returned executable.
          const s = result.selection
          if (!/^v24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(s.version) || s.architecture !== 'x64'
            || s.executablePath !== files.executablePath || s.canonicalPath !== files.canonicalPath
            || s.identity.volume !== files.identity.volume || s.identity.fileId !== files.identity.fileId) throw new NodeCandidateError('NODE_INCOMPATIBLE')
          const selection = Object.freeze({ executablePath: s.executablePath, canonicalPath: s.canonicalPath,
            version: s.version, architecture: s.architecture, identity: Object.freeze({ ...s.identity }) })
          this.retained.set(selection, files)
          return { state: 'AVAILABLE', selection }
        } catch (error) {
          checkJavascriptWork(context)
          if (error instanceof NodeCandidateMissing) continue
          if (error instanceof NodeCandidateError) { invalid = { state: 'INVALID_CONFIGURATION', reason: error.reason }; continue }
          throw error
        }
      }
      return invalid ?? { state: 'MISSING', reason: 'NODE_NOT_FOUND' }
    } catch (error) {
      checkJavascriptWork(context)
      // No native errors, filesystem paths or raw stacks escape this Main boundary.
      if (error instanceof Error && 'details' in error) throw error
      throw exerciseCoreError('INTERNAL_ERROR')
    } finally { this.active = false }
  }
  async revalidate(selection: JavascriptNodeSelection, context: JavascriptPreparationContext): Promise<void> {
    checkJavascriptWork(context)
    const files = this.retained.get(selection)
    if (!files || this.active) throw exerciseCoreError('INVALID_RUNTIME')
    try { await revalidateJavascriptNode(files, context) }
    catch { checkJavascriptWork(context); throw exerciseCoreError('INVALID_RUNTIME') }
  }
}

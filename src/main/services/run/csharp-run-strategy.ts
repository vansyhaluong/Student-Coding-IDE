import { win32 } from 'node:path'
import { DomainError } from '../../errors/app-error'
import { isValidatedWindowsExecutable } from '../dependencies/windows-executable'
import { normalizePathIdentity } from '../project/project-identity'
import type { CsharpRunEvaluation } from './csharp-run-preflight'
import { classifyCsharpRunProject } from './csharp-run-target-resolver'
import { runTargetIdentity, snapshotPlan, type AuthorizedRunTarget, type RunExecutionPlan,
  type RunRuntime, type RunStrategy } from './run-strategy'

const evaluations = new WeakMap<RunRuntime, CsharpRunEvaluation>()
export function csharpPreparationError(reason: string, detail?: string): DomainError {
  return new DomainError({ code: 'PROCESS_FAILED', operation: 'run:prepare', retryable: false,
    message: 'The C# Run target could not be prepared.', details: { reason, ...(detail ? { detail } : {}) } })
}

/** Main-only evaluated runtime capability. Never accepted from IPC or persisted. */
export function evaluatedCsharpRuntime(evaluation: CsharpRunEvaluation): RunRuntime {
  const runtime = Object.freeze({ executable: evaluation.runtime.executable })
  evaluations.set(runtime, Object.freeze({ ...evaluation,
    target: Object.freeze({ ...evaluation.target }), properties: Object.freeze({ ...evaluation.properties }),
    runtime: Object.freeze({ ...evaluation.runtime,
      effectiveSdk: Object.freeze({ ...evaluation.runtime.effectiveSdk }) }),
    projectReferences: Object.freeze([...evaluation.projectReferences]) }))
  return runtime
}

export class CSharpRunStrategy implements RunStrategy {
  readonly kind = 'csharp-project' as const
  supports(target: { relativePath: string }): boolean { return /\.csproj$/i.test(target.relativePath) }
  prepare(): never { throw csharpPreparationError('OWNED_PLAN_REQUIRED') }

  preparePlan(target: AuthorizedRunTarget, runtime: RunRuntime): RunExecutionPlan {
    const facts = evaluations.get(runtime)
    const identity = (path: string) => normalizePathIdentity(path, 'win32')
    if (!facts || !this.supports(target)
      || runTargetIdentity(target, this.kind) !== runTargetIdentity(facts.target, this.kind)
      || identity(target.canonicalRoot) !== identity(facts.target.canonicalRoot)
      || classifyCsharpRunProject(facts).eligibility !== 'ELIGIBLE'
      || !isValidatedWindowsExecutable(runtime.executable, 'dotnet.exe')
      || identity(facts.runtime.cwd) !== identity(win32.dirname(target.canonicalFile))
      || facts.runtime.effectiveSdk.major < 8 || facts.runtime.effectiveSdk.prerelease) {
      throw csharpPreparationError('INVALID_TARGET')
    }
    const execution = (args: string[]) => ({ executable: runtime.executable, args,
      cwd: win32.dirname(target.canonicalFile), environmentAdditions: {}, shell: false as const })
    return snapshotPlan({ configurationIdentity: JSON.stringify([
      facts.runtime.effectiveSdk.version, facts.properties.TargetFramework,
    ]), steps: [
      { phase: 'BUILD_RESTORE', execution: execution(['build', target.canonicalFile,
        '--configuration', 'Debug', '--disable-build-servers', '-nodeReuse:false']) },
      { phase: 'EXECUTING', execution: execution(['run', '--project', target.canonicalFile,
        '--configuration', 'Debug', '--no-build', '--no-restore', '--no-launch-profile', '--disable-build-servers']) },
    ] }, this.kind)
  }
}

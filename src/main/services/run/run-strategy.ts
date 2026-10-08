import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import type { RunTarget, RunTargetKind, RunExecutionPhase } from '../../../shared/contracts/run'
import { invalidInputError } from '../../errors/app-error'
import { normalizePathIdentity } from '../project/project-identity'

/** Main-only output from target authorization; never a renderer request DTO. */
export interface AuthorizedRunTarget extends RunTarget {
  readonly canonicalRoot: string
  readonly canonicalFile: string
}

/** Resolved by Main for the authorized target/strategy, never supplied by Renderer. */
export interface RunRuntime { readonly executable: string }
export interface PreparedRun {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly environmentAdditions: Readonly<Record<string, string>>
  readonly shell: false
}

/** Internal strategy seam; no dynamic registration or user-defined runners. */
export interface RunStrategy {
  readonly kind: RunTargetKind
  supports(target: RunTarget): boolean
  prepare(target: AuthorizedRunTarget, runtime: RunRuntime): PreparedRun
  preparePlan?(target: AuthorizedRunTarget, runtime: RunRuntime,
    context: RunPreparationContext): Promise<RunExecutionPlan> | RunExecutionPlan
}

/** Main-only context, supplied only after project/filesystem authorization. */
export interface RunRuntimeContext {
  readonly strategyKind: RunTargetKind
  readonly target: AuthorizedRunTarget
  readonly preparation?: RunPreparationContext
}

/** Main-only plans; the existing adapter still supplies closed stdin. */
export interface RunExecutionStep {
  readonly phase: Exclude<RunExecutionPhase, 'PREPARING'>
  readonly execution: PreparedRun
}
export interface RunExecutionPlan { readonly steps: readonly RunExecutionStep[] }
export interface RunPreparationContext {
  readonly signal: AbortSignal
  readonly resourceOwnerId: string
  /** Register before creation; release only after safe cleanup. */
  registerResource(close: () => Promise<void>): () => void
}

export function snapshotPlan(plan: RunExecutionPlan, kind: RunTargetKind): RunExecutionPlan {
  const phases = plan.steps.map(step => step.phase)
  if (JSON.stringify(phases) !== JSON.stringify(kind === 'javascript-file'
    ? ['EXECUTING'] : ['BUILD_RESTORE', 'EXECUTING'])) {
    throw invalidInputError('run:plan', ['steps'])
  }
  return Object.freeze({ steps: Object.freeze(plan.steps.map(step => Object.freeze({
    phase: step.phase, execution: snapshotExecution(step.execution),
  }))) })
}

export function runPlanFingerprint(identity: string, target: AuthorizedRunTarget, plan: RunExecutionPlan): string {
  return createHash('sha256').update(JSON.stringify(plan.steps.map(step =>
    [step.phase, runExecutionFingerprint(identity, target, step.execution)]))).digest('hex')
}

export function runTargetIdentity(target: AuthorizedRunTarget, kind: RunTargetKind): string {
  const absolute = (path: string) => typeof path === 'string' && !path.includes('\0')
    && (/^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path)) && win32.isAbsolute(path)
  if (!absolute(target.canonicalRoot) || !absolute(target.canonicalFile)) {
    throw invalidInputError('run:prepare', ['target'])
  }
  const root = normalizePathIdentity(target.canonicalRoot, 'win32')
  const file = normalizePathIdentity(target.canonicalFile, 'win32')
  if (!file.startsWith(root.endsWith('\\') ? root : `${root}\\`)) {
    throw invalidInputError('run:prepare', ['target'])
  }
  return JSON.stringify([target.projectId, kind, file])
}

/** Copy before retaining: strategy-owned arrays/maps cannot mutate a preparation. */
export function snapshotExecution(execution: PreparedRun): PreparedRun {
  return Object.freeze({ executable: execution.executable, args: Object.freeze([...execution.args]),
    cwd: execution.cwd, shell: execution.shell,
    environmentAdditions: Object.freeze({ ...execution.environmentAdditions }) })
}

export function runExecutionFingerprint(identity: string, target: AuthorizedRunTarget, execution: PreparedRun): string {
  return createHash('sha256').update(JSON.stringify([identity,
    normalizePathIdentity(target.canonicalRoot, 'win32'), execution.executable, execution.args,
    execution.cwd, execution.shell,
    Object.entries(execution.environmentAdditions).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  ])).digest('hex')
}

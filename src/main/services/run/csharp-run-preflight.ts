import { win32 } from 'node:path'
import type { CSharpProjectRunTarget, CSharpRunCandidateReason } from '../../../shared/contracts/run'
import { validateSemanticRunTarget } from '../../../shared/contracts/run'
import type { FileSystemService } from '../filesystem/filesystem-service'
import { DotnetRunRuntimeResolver, type DotnetRunResolution, type DotnetRunRuntime } from '../dependencies/dotnet-run-runtime'
import { normalizePathIdentity } from '../project/project-identity'
import { runTargetIdentity, type AuthorizedRunTarget } from './run-strategy'
import { RUN_EVALUATION_PROPERTIES, RUN_PROBE_LIMITS, RunProbeError, type RunSdkProbe, type RunProbeFailure } from './csharp-run-probe'

export type EvaluatedRunProperties = Readonly<Record<typeof RUN_EVALUATION_PROPERTIES[number], string>>
/** Main-only facts, never an eligibility decision or wire DTO. References are not yet authorized. */
export interface CsharpRunEvaluation {
  readonly target: AuthorizedRunTarget
  readonly runtime: DotnetRunRuntime
  readonly properties: EvaluatedRunProperties
  readonly projectReferences: readonly string[]
}
export type CsharpRunPreflightResult = { readonly ok: true; readonly evaluation: CsharpRunEvaluation }
  | { readonly ok: false; readonly reason: CSharpRunCandidateReason;
      readonly detail: RunProbeFailure | 'INVALID_PROJECT_PATH' | 'PROJECT_CHANGED' | 'EVALUATION_FAILED' | 'INVALID_EVALUATION_OUTPUT';
      readonly exitCode?: number }
  | { readonly ok: false; readonly reason: 'SDK_MISSING' | 'SDK_SELECTION_FAILED' | 'PREFLIGHT_FAILED';
      readonly sdk: Extract<DotnetRunResolution, { ok: false }> }

/** Evaluates one Main-authorized candidate. No discovery, reference traversal or classification. */
export class CsharpRunPreflight {
  constructor(private readonly files: Pick<FileSystemService, 'authorizeRunFile'>,
    private readonly runtime: DotnetRunRuntimeResolver, private readonly probe: RunSdkProbe) {}

  async evaluate(request: CSharpProjectRunTarget, signal: AbortSignal): Promise<CsharpRunPreflightResult> {
    const fail = (detail: RunProbeFailure | 'INVALID_PROJECT_PATH' | 'PROJECT_CHANGED' | 'EVALUATION_FAILED' | 'INVALID_EVALUATION_OUTPUT',
      exitCode?: number): CsharpRunPreflightResult => ({ ok: false,
      reason: detail === 'INVALID_PROJECT_PATH' || detail === 'PROJECT_CHANGED' ? 'INVALID_PROJECT' : 'PREFLIGHT_FAILED',
      detail, ...(exitCode === undefined ? {} : { exitCode }) })
    if (!validateSemanticRunTarget(request).ok || request.kind !== 'csharp-project') return fail('INVALID_PROJECT_PATH')
    // Snapshot before the first await; caller mutation cannot redirect authorization.
    const identity = { ...request }
    let target: AuthorizedRunTarget
    try {
      if (signal.aborted) return fail('CANCELLED')
      target = Object.freeze({ projectId: identity.projectId, relativePath: identity.relativePath,
        ...await this.files.authorizeRunFile(identity.projectId, identity.relativePath) })
      runTargetIdentity(target, 'csharp-project')
      if (!/\.csproj$/i.test(target.canonicalFile)) return fail('INVALID_PROJECT_PATH')
    } catch { return fail('INVALID_PROJECT_PATH') }
    if (signal.aborted) return fail('CANCELLED')
    const sdk = await this.runtime.resolve(target, signal)
    if (!sdk.ok) return { ok: false, reason: sdk.dependency.state === 'MISSING' ? 'SDK_MISSING'
      : sdk.dependency.reason === 'SDK_SELECTION_FAILED' ? 'SDK_SELECTION_FAILED' : 'PREFLIGHT_FAILED', sdk }
    try {
      const current = await this.files.authorizeRunFile(identity.projectId, identity.relativePath)
      if (['canonicalRoot', 'canonicalFile'].some(key => normalizePathIdentity(current[key as keyof typeof current], 'win32')
        !== normalizePathIdentity(target[key as 'canonicalRoot' | 'canonicalFile'], 'win32'))) return fail('PROJECT_CHANGED')
      if (signal.aborted) return fail('CANCELLED')
      const result = await this.probe.execute(sdk.runtime.executable,
        { kind: 'evaluate', project: target.canonicalFile }, win32.dirname(target.canonicalFile), signal)
      if (signal.aborted) return fail('CANCELLED')
      if (result.exitCode !== 0) return fail('EVALUATION_FAILED', result.exitCode)
      const facts = parseRunEvaluation(result.stdout)
      if (!facts) return fail('INVALID_EVALUATION_OUTPUT')
      return { ok: true, evaluation: Object.freeze({ target, runtime: sdk.runtime, ...facts }) }
    } catch (error) { return fail(error instanceof RunProbeError ? error.reason : 'EVALUATION_FAILED') }
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const boundedText = (value: unknown): value is string => typeof value === 'string'
  && value.length <= 4096 && !/[\0\r\n]/.test(value)

export function parseRunEvaluation(stdout: string): Pick<CsharpRunEvaluation, 'properties' | 'projectReferences'> | null {
  if (Buffer.byteLength(stdout) > RUN_PROBE_LIMITS.outputBytes) return null
  let json: unknown
  try { json = JSON.parse(stdout) } catch { return null }
  if (!record(json) || !record(json.Properties) || !record(json.Items)
    || !Array.isArray(json.Items.ProjectReference) || json.Items.ProjectReference.length > 64) return null
  const properties = {} as Record<typeof RUN_EVALUATION_PROPERTIES[number], string>
  for (const key of RUN_EVALUATION_PROPERTIES) {
    const value = json.Properties[key]
    if (!boundedText(value)) return null
    properties[key] = value
  }
  const references: string[] = []
  for (const item of json.Items.ProjectReference) {
    if (!record(item) || !boundedText(item.Identity) || !item.Identity.trim()) return null
    references.push(item.Identity)
  }
  return { properties: Object.freeze(properties), projectReferences: Object.freeze(references) }
}

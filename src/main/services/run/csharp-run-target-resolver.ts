import { win32 } from 'node:path'
import type { ProjectId } from '../../../shared/contracts'
import { RUN_SEMANTIC_LIMITS, validateSemanticRunTarget, type CSharpRunCandidate,
  type CSharpRunCandidateReason, type CSharpRunDependencyFailure,
  type CSharpRunTargetResolution } from '../../../shared/contracts/run'
import type { FileSystemService } from '../filesystem/filesystem-service'
import { isPathWithinRoot } from '../filesystem/filesystem-service'
import { normalizePathIdentity, resolveProjectRelativePath } from '../project/project-identity'
import type { ProjectService } from '../project/project-service'
import type { CsharpRunEvaluation, CsharpRunPreflight, CsharpRunPreflightResult } from './csharp-run-preflight'
import { runTargetIdentity, type AuthorizedRunTarget } from './run-strategy'

/** Architecture section 10: same discovery exclusions as C# workspace, independent selection. */
export const CSHARP_RUN_DISCOVERY_LIMITS = { maximumEntries: 100_000,
  maximumProjects: RUN_SEMANTIC_LIMITS.maximumCandidates,
  maximumRelativePathLength: RUN_SEMANTIC_LIMITS.maximumRelativePathLength } as const
export const CSHARP_RUN_EXCLUDED_DIRECTORIES = ['.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'out'] as const

type PreflightFailure = Extract<CsharpRunPreflightResult, { ok: false }>
export type CsharpRunDiscoveryDetail = 'CONSOLE' | 'LIBRARY' | 'WEB' | 'TEST' | 'WPF' | 'WINDOWS_FORMS'
  | 'NOT_EXE' | 'NOT_SDK_STYLE' | 'UNRESOLVED_METADATA' | 'MULTIPLE_FRAMEWORKS' | 'UNSUPPORTED_FRAMEWORK'
  | 'INVALID_PROJECT_PATH' | 'PROJECT_CHANGED' | 'INVALID_REFERENCE' | 'REFERENCE_FAILED' | 'REFERENCE_CYCLE'
  | 'DISCOVERY_FAILED' | 'DISCOVERY_LIMIT_EXCEEDED' | 'PATH_LIMIT_EXCEEDED' | 'CANCELLED' | 'PREFLIGHT_FAILED'
  | Extract<PreflightFailure, { detail: unknown }>['detail']
  | Extract<PreflightFailure, { sdk: unknown }>['sdk']['detail']

/** Main-only diagnostics retain rejected candidates even when the wire FAILED DTO has no list.
 * No executable, cwd, command, stderr, provider state or native resource is retained here.
 */
export interface CsharpRunCandidateAssessment {
  readonly candidate: CSharpRunCandidate
  readonly detail: CsharpRunDiscoveryDetail
  readonly targetFramework?: string
  readonly dependency?: CSharpRunDependencyFailure
}
export interface CsharpRunDiscoveryResult {
  readonly resolution: CSharpRunTargetResolution
  readonly assessments: readonly CsharpRunCandidateAssessment[]
  readonly failure?: CsharpRunDiscoveryDetail
}
type Classification = Pick<CsharpRunCandidateAssessment, 'detail'> & Pick<CSharpRunCandidate, 'eligibility' | 'reason'>
const rejected = (detail: CsharpRunDiscoveryDetail, reason: CSharpRunCandidateReason = 'NOT_CONSOLE_PROJECT',
  eligibility: 'INELIGIBLE' | 'UNASSESSABLE' = 'INELIGIBLE'): Classification => ({ eligibility, reason, detail })

/** Facts are produced by M1-05, never by reading project XML here. */
export function classifyCsharpRunProject(evaluation: CsharpRunEvaluation): Classification {
  const p = evaluation.properties
  const flag = (value: string) => value.trim().toLowerCase()
  for (const [key, detail] of [['UsingMicrosoftNETSdkWeb', 'WEB'], ['IsTestProject', 'TEST'],
    ['UseWPF', 'WPF'], ['UseWindowsForms', 'WINDOWS_FORMS']] as const) {
    if (flag(p[key]) === 'true') return rejected(detail)
    if (!['', 'false'].includes(flag(p[key]))) return rejected('UNRESOLVED_METADATA', 'PREFLIGHT_FAILED', 'UNASSESSABLE')
  }
  if (flag(p.UsingMicrosoftNETSdk) !== 'true') return flag(p.UsingMicrosoftNETSdk) === 'false'
    ? rejected('NOT_SDK_STYLE') : rejected('UNRESOLVED_METADATA', 'PREFLIGHT_FAILED', 'UNASSESSABLE')
  if (flag(p.OutputType) === 'library') return rejected('LIBRARY')
  if (!p.OutputType.trim()) return rejected('UNRESOLVED_METADATA', 'PREFLIGHT_FAILED', 'UNASSESSABLE')
  if (flag(p.OutputType) !== 'exe') return rejected('NOT_EXE')
  // Any TargetFrameworks declaration is cross-targeting, including a one-item list.
  // Never pick a framework from it or let an injected TargetFramework hide it.
  if (p.TargetFrameworks.trim() || p.TargetFramework.includes(';')) return rejected('MULTIPLE_FRAMEWORKS', 'MULTIPLE_FRAMEWORKS')
  const tfm = p.TargetFramework.trim().toLowerCase()
  if (!tfm) return rejected('UNRESOLVED_METADATA', 'PREFLIGHT_FAILED', 'UNASSESSABLE')
  // Modern .NET single TFM; Windows-specific Console TFMs are allowed, other
  // platform workloads are outside this Windows Console MVP. Future SDK/TFM
  // compatibility is not inferred from a successful evaluation-only command.
  const match = /^net(5|6|7|8|9|10)\.0(?:-windows(?:\d+(?:\.\d+){0,3})?)?$/.exec(tfm)
  const major = match ? Number(match[1]) : NaN
  if (!match || major > evaluation.runtime.effectiveSdk.major
    || (p.TargetFrameworkIdentifier && p.TargetFrameworkIdentifier !== '.NETCoreApp')
    || (p.TargetFrameworkVersion && p.TargetFrameworkVersion.toLowerCase() !== `v${major}.0`)) {
    return rejected('UNSUPPORTED_FRAMEWORK', 'UNSUPPORTED_FRAMEWORK')
  }
  // Empty computed identifier/version are valid M1-05 evaluation facts; the
  // unambiguous known TFM and explicit SDK flag above are still required.
  return { eligibility: 'ELIGIBLE', reason: null, detail: 'CONSOLE' }
}

class DiscoveryFailure extends Error {
  constructor(readonly detail: CsharpRunDiscoveryDetail) { super(detail) }
}
type Files = Pick<FileSystemService, 'listDirectory' | 'authorizeRunFile'>
type Projects = Pick<ProjectService, 'getAuthorizedProject' | 'subscribe'>
interface Node {
  path: string
  target: AuthorizedRunTarget
  edges: Set<string>
  assessment?: CsharpRunCandidateAssessment
  referenceFailure?: CsharpRunDiscoveryDetail
}
const key = (path: string) => normalizePathIdentity(path, 'win32')
const compare = (a: string, b: string) => {
  const x = key(a), y = key(b)
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0
}

/** Main-only independent discovery. No LSP workspace/store/editor or execution dependency. */
export class CsharpRunTargetResolver {
  constructor(private readonly projects: Projects, private readonly files: Files,
    private readonly evaluator: Pick<CsharpRunPreflight, 'evaluate'>) {}

  async resolve(projectId: ProjectId, signal: AbortSignal): Promise<CsharpRunDiscoveryResult> {
    const assessments = new Map<string, CsharpRunCandidateAssessment>()
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    let removeProjectListener: (() => void) | undefined
    let projectChanged = false
    const ordered = () => [...assessments.values()].sort((a, b) => compare(a.candidate.relativePath, b.candidate.relativePath))
    try {
      const project = this.projects.getAuthorizedProject(projectId)
      removeProjectListener = this.projects.subscribe(() => { projectChanged = true; abort() })
      const current = () => {
        if (projectChanged) throw new DiscoveryFailure('PROJECT_CHANGED')
        if (controller.signal.aborted) throw new DiscoveryFailure('CANCELLED')
        if (this.projects.getAuthorizedProject(projectId) !== project) throw new DiscoveryFailure('PROJECT_CHANGED')
      }
      const nodes = new Map<string, Node>(), candidates = new Map<string, string>()
      const safePath = (path: string) => {
        if (path.length > CSHARP_RUN_DISCOVERY_LIMITS.maximumRelativePathLength) throw new DiscoveryFailure('PATH_LIMIT_EXCEEDED')
        if (!validateSemanticRunTarget({ kind: 'csharp-project', projectId, relativePath: path }).ok) throw new DiscoveryFailure('INVALID_PROJECT_PATH')
      }
      const authorize = async (path: string): Promise<AuthorizedRunTarget> => {
        current(); safePath(path)
        const target = { projectId, relativePath: path, ...await this.files.authorizeRunFile(projectId, path) }
        current()
        runTargetIdentity(target, 'csharp-project')
        if (key(target.canonicalRoot) !== key(project.canonicalRoot) || !/\.csproj$/i.test(target.canonicalFile)) {
          throw new DiscoveryFailure('INVALID_PROJECT_PATH')
        }
        return target
      }
      const add = (path: string, target: AuthorizedRunTarget): string => {
        const identity = key(target.canonicalFile)
        if (!nodes.has(identity)) {
          if (nodes.size + assessments.size >= CSHARP_RUN_DISCOVERY_LIMITS.maximumProjects) throw new DiscoveryFailure('DISCOVERY_LIMIT_EXCEEDED')
          nodes.set(identity, { path, target, edges: new Set() })
        }
        return identity
      }
      const assess = (path: string, classification: Classification,
        extra: Pick<CsharpRunCandidateAssessment, 'targetFramework' | 'dependency'> = {}): CsharpRunCandidateAssessment => ({
        candidate: { relativePath: path, displayName: win32.basename(path),
          ...(classification.eligibility === 'ELIGIBLE' ? { eligibility: 'ELIGIBLE', reason: null }
            : { eligibility: classification.eligibility, reason: classification.reason! }) },
        detail: classification.detail, ...extra,
      })
      // Collect first, then authorize in stable order so aliases cannot pick a
      // display spelling based on readdir order. The entire scan must succeed.
      const pending = [''], visited = new Set<string>(), paths = new Set<string>()
      let entriesSeen = 0
      for (let i = 0; i < pending.length; ++i) {
        current()
        const directory = pending[i]
        if (visited.has(key(directory))) continue
        visited.add(key(directory))
        const entries = await this.files.listDirectory(projectId, directory)
        current()
        entriesSeen += entries.length
        if (entriesSeen > CSHARP_RUN_DISCOVERY_LIMITS.maximumEntries) throw new DiscoveryFailure('DISCOVERY_LIMIT_EXCEEDED')
        for (const entry of [...entries].sort((a, b) => compare(a.relativePath, b.relativePath))) {
          current()
          if (entry.isSymbolicLink) continue
          if (entry.relativePath.length > CSHARP_RUN_DISCOVERY_LIMITS.maximumRelativePathLength) throw new DiscoveryFailure('PATH_LIMIT_EXCEEDED')
          resolveProjectRelativePath(project.canonicalRoot, entry.relativePath, 'win32')
          if (win32.dirname(entry.relativePath).replaceAll('\\', '/') !== (directory || '.')) throw new DiscoveryFailure('INVALID_PROJECT_PATH')
          if (entry.kind === 'directory' && !CSHARP_RUN_EXCLUDED_DIRECTORIES.some(p => p === entry.name.toLowerCase())) pending.push(entry.relativePath)
          else if (entry.kind === 'file' && /\.csproj$/i.test(entry.name)) paths.add(entry.relativePath)
        }
      }
      for (const path of [...paths].sort(compare)) {
        current(); safePath(path)
        try {
          const target = await authorize(path)
          const identity = add(path, target)
          if (!candidates.has(identity)) candidates.set(identity, path)
        } catch (error) {
          current()
          if (error instanceof DiscoveryFailure) throw error
          assessments.set(path, assess(path, rejected('INVALID_PROJECT_PATH', 'INVALID_PROJECT', 'UNASSESSABLE')))
        }
        if (candidates.size + assessments.size > CSHARP_RUN_DISCOVERY_LIMITS.maximumProjects) throw new DiscoveryFailure('DISCOVERY_LIMIT_EXCEEDED')
      }
      // Map iteration visits newly appended references too; unique nodes bound
      // both recursion depth (<=64) and fanout (<=64 facts per evaluated node).
      for (const node of nodes.values()) {
        current()
        let result: CsharpRunPreflightResult
        try { result = await this.evaluator.evaluate({ kind: 'csharp-project', projectId, relativePath: node.path }, controller.signal) }
        catch { current(); throw new DiscoveryFailure('PREFLIGHT_FAILED') }
        current()
        if (!result.ok) {
          const detail = 'sdk' in result ? result.sdk.detail : result.detail
          if (detail === 'CANCELLED' || detail === 'CLEANUP_FAILED' || detail === 'BUSY') throw new DiscoveryFailure(detail)
          node.assessment = assess(node.path, rejected(detail, 'sdk' in result && detail === 'UNSUPPORTED_SDK'
            ? 'UNSUPPORTED_SDK' : result.reason, 'UNASSESSABLE'), 'sdk' in result ? { dependency: result.sdk.dependency } : {})
          continue
        }
        try {
          const latest = await authorize(node.path)
          if (runTargetIdentity(latest, 'csharp-project') !== runTargetIdentity(node.target, 'csharp-project')
            || runTargetIdentity(result.evaluation.target, 'csharp-project') !== runTargetIdentity(node.target, 'csharp-project')) {
            throw new DiscoveryFailure('PROJECT_CHANGED')
          }
        } catch {
          current(); node.assessment = assess(node.path, rejected('PROJECT_CHANGED', 'INVALID_PROJECT', 'UNASSESSABLE')); continue
        }
        node.assessment = assess(node.path, classifyCsharpRunProject(result.evaluation), { targetFramework: result.evaluation.properties.TargetFramework })
        for (const reference of [...result.evaluation.projectReferences].sort(compare)) {
          current()
          try {
            // Reject drive-relative/device authority. Absolute evaluated references
            // are acceptable only after containment and FileSystemService authorization.
            if (/^[a-z]:[^\\/]/i.test(reference) || reference.startsWith('\\\\?\\') || reference.startsWith('\\\\.\\')) throw new Error('invalid reference')
            const absolute = win32.resolve(win32.dirname(node.target.canonicalFile), reference)
            if (!isPathWithinRoot(project.canonicalRoot, absolute, 'win32')) throw new Error('outside reference')
            const path = win32.relative(project.canonicalRoot, absolute).replaceAll('\\', '/')
            const target = await authorize(path)
            node.edges.add(add(path, target))
          } catch (error) {
            current()
            if (error instanceof DiscoveryFailure && error.detail === 'DISCOVERY_LIMIT_EXCEEDED') throw error
            node.referenceFailure = 'INVALID_REFERENCE'
          }
        }
      }
      // A later probe may yield while an earlier candidate/reference disappears
      // or changes identity. Reauthorize the complete graph before cardinality.
      // This is still not the launch-time snapshot/revalidation of M1-09.
      for (const node of nodes.values()) {
        try {
          if (runTargetIdentity(await authorize(node.path), 'csharp-project') !== runTargetIdentity(node.target, 'csharp-project')) {
            throw new DiscoveryFailure('PROJECT_CHANGED')
          }
        } catch {
          current(); node.assessment = assess(node.path, rejected('PROJECT_CHANGED', 'INVALID_PROJECT', 'UNASSESSABLE'))
        }
      }
      const graphFailure = (identity: string, stack: Set<string>, checked: Set<string>): CsharpRunDiscoveryDetail | undefined => {
        if (stack.has(identity)) return 'REFERENCE_CYCLE'
        if (checked.has(identity)) return
        const node = nodes.get(identity)!
        if (node.referenceFailure) return node.referenceFailure
        if (node.assessment?.candidate.eligibility === 'UNASSESSABLE') return 'REFERENCE_FAILED'
        stack.add(identity)
        for (const child of node.edges) {
          const failure = graphFailure(child, stack, checked)
          if (failure) return failure
        }
        stack.delete(identity); checked.add(identity)
      }
      for (const [identity, path] of candidates) {
        const node = nodes.get(identity)!
        let assessment = node.assessment!
        if (assessment.candidate.eligibility !== 'UNASSESSABLE') {
          const failure = graphFailure(identity, new Set(), new Set())
          if (failure) assessment = assess(path, rejected(failure, 'INVALID_PROJECT_REFERENCE', 'UNASSESSABLE'),
            { targetFramework: assessment.targetFramework })
        }
        assessments.set(path, assessment)
      }
      current()
      const list = ordered(), candidatesResult = list.map(item => item.candidate)
      const eligible = candidatesResult.filter(c => c.eligibility === 'ELIGIBLE')
      const unknown = list.filter(item => item.candidate.eligibility === 'UNASSESSABLE')
      const context = { projectId, candidates: candidatesResult }
      const resolution: CSharpRunTargetResolution = eligible.length === 1 && !unknown.length
        ? { ...context, state: 'READY', target: { kind: 'csharp-project', projectId, relativePath: eligible[0].relativePath } }
        : eligible.length ? { ...context, state: 'SELECTION_REQUIRED' }
          : !unknown.length ? { ...context, state: 'NO_RUNNABLE_PROJECT' }
            : unknown.every(item => item.dependency) ? { ...context, state: 'DEPENDENCY_FAILED', dependency: unknown[0].dependency! }
              : { projectId, state: 'FAILED', reason: 'PREFLIGHT_FAILED' }
      return { resolution, assessments: list }
    } catch (error) {
      const failure = projectChanged ? 'PROJECT_CHANGED' : controller.signal.aborted ? 'CANCELLED'
        : error instanceof DiscoveryFailure ? error.detail : 'DISCOVERY_FAILED'
      return { resolution: { projectId, state: 'FAILED', reason: failure === 'DISCOVERY_LIMIT_EXCEEDED'
        ? 'DISCOVERY_LIMIT_EXCEEDED' : 'PREFLIGHT_FAILED' }, assessments: ordered(), failure }
    } finally { signal.removeEventListener('abort', abort); removeProjectListener?.() }
  }
}

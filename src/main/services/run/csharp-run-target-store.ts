import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProjectId } from '../../../shared/contracts'
import { validateCSharpRunTargetResolution, validateSemanticRunTarget,
  type CSharpProjectRunTarget, type CSharpRunTargetResolution } from '../../../shared/contracts/run'
import { PersistenceService, type PersistenceFileSystem } from '../persistence/persistence-service'
import type { ProjectService } from '../project/project-service'
import { normalizePathIdentity, type ActiveProject } from '../project/project-identity'
import type { FileSystemService } from '../filesystem/filesystem-service'
import type { CsharpRunDiscoveryResult, CsharpRunTargetResolver } from './csharp-run-target-resolver'
import { runTargetIdentity } from './run-strategy'

interface RunTargetState { relativePath?: string }
export type CsharpRunSelectionIssue = 'INVALID_SELECTION' | 'STALE_TARGET' | 'PERSISTENCE_RECOVERED'
  | 'PERSISTENCE_FAILED' | 'PROJECT_CHANGED' | 'CANCELLED' | 'SUPERSEDED' | 'STOPPED' | 'PREFLIGHT_FAILED'
/** Main-only selection metadata; the existing semantic resolution DTO is unchanged. */
export interface CsharpRunSelectionResult extends CsharpRunDiscoveryResult {
  readonly selection: 'NONE' | 'AUTOMATIC' | 'SAVED' | 'EXPLICIT' | 'CLEARED' | 'STALE' | 'RECOVERED'
  readonly issue?: CsharpRunSelectionIssue
}
interface StoreEntry {
  persistence: PersistenceService<RunTargetState>
  readFailed: boolean
  beforeCommit?: () => void
}
interface Operation {
  project: ActiveProject
  controller: AbortController
  issue?: CsharpRunSelectionIssue
  check(): void
}
class SelectionError extends Error {
  constructor(readonly issue: CsharpRunSelectionIssue) { super(issue) }
}
const disk: PersistenceFileSystem = { copyFile, mkdir, readFile, rename, unlink, writeFile }
const identity = (path: string) => normalizePathIdentity(path, 'win32')
type Action = { kind: 'resolve' | 'clear' } | { kind: 'select'; target: CSharpProjectRunTarget }

/** Independent Run namespace using existing serialized atomic JSON persistence.
 * No LSP/editor selection, IPC registration, execution plan or process ownership.
 */
export class CsharpRunTargetStore {
  private readonly stores = new Map<ProjectId, StoreEntry>()
  private readonly queues = new Map<ProjectId, Promise<void>>()
  private readonly latest = new Map<ProjectId, Operation>()
  private stopped = false

  constructor(private readonly directory: string,
    private readonly projects: Pick<ProjectService, 'getAuthorizedProject' | 'subscribe'>,
    private readonly files: Pick<FileSystemService, 'authorizeRunFile'>,
    private readonly resolver: Pick<CsharpRunTargetResolver, 'resolve'>,
    private readonly fileSystem: PersistenceFileSystem = disk) {}

  resolve(projectId: ProjectId, signal: AbortSignal): Promise<CsharpRunSelectionResult> {
    return this.perform(projectId, { kind: 'resolve' }, signal)
  }

  select(target: CSharpProjectRunTarget, signal: AbortSignal): Promise<CsharpRunSelectionResult> {
    const valid = validateSemanticRunTarget(target)
    if (!valid.ok || valid.value.kind !== 'csharp-project') {
      return Promise.resolve(this.failed(target?.projectId, 'INVALID_SELECTION'))
    }
    // Exact validator copies the semantic request before any async work.
    return this.perform(valid.value.projectId, { kind: 'select', target: valid.value }, signal)
  }

  clear(projectId: ProjectId, signal: AbortSignal): Promise<CsharpRunSelectionResult> {
    return this.perform(projectId, { kind: 'clear' }, signal)
  }

  private failed(projectId: ProjectId, issue: CsharpRunSelectionIssue,
    discovery?: CsharpRunDiscoveryResult): CsharpRunSelectionResult {
    return { ...discovery, resolution: { projectId, state: 'FAILED',
      reason: issue === 'PERSISTENCE_FAILED' ? 'PERSISTENCE_FAILED' : 'PREFLIGHT_FAILED' },
      assessments: discovery?.assessments ?? [], selection: 'NONE', issue }
  }

  private perform(projectId: ProjectId, action: Action, signal: AbortSignal): Promise<CsharpRunSelectionResult> {
    if (this.stopped) return Promise.resolve(this.failed(projectId, 'STOPPED'))
    if (signal.aborted) return Promise.resolve(this.failed(projectId, 'CANCELLED'))
    let project: ActiveProject
    try { project = this.projects.getAuthorizedProject(projectId) }
    catch { return Promise.resolve(this.failed(projectId, 'PROJECT_CHANGED')) }
    const controller = new AbortController()
    const operation: Operation = { project, controller, check: () => {
      if (operation.issue) throw new SelectionError(operation.issue)
      try {
        if (this.projects.getAuthorizedProject(projectId) !== project) throw new Error('changed')
      } catch { throw new SelectionError('PROJECT_CHANGED') }
    } }
    const abort = (issue: CsharpRunSelectionIssue) => { operation.issue ??= issue; controller.abort() }
    const onAbort = () => abort('CANCELLED')
    const removeProject = this.projects.subscribe(() => abort('PROJECT_CHANGED'))
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    const previous = this.latest.get(projectId)
    if (previous) { previous.issue ??= 'SUPERSEDED'; previous.controller.abort() }
    this.latest.set(projectId, operation)
    const run = (this.queues.get(projectId) ?? Promise.resolve()).then(async (): Promise<CsharpRunSelectionResult> => {
      let entry: StoreEntry | undefined, discovery: CsharpRunDiscoveryResult | undefined
      try {
        operation.check()
        entry = this.store(project)
        entry.readFailed = false
        const loaded = await entry.persistence.load()
        operation.check()
        if (entry.readFailed) throw new SelectionError('PERSISTENCE_FAILED')
        const authorize = async (path: string): Promise<string> => {
          operation.check()
          const canonical = await this.files.authorizeRunFile(projectId, path)
          operation.check()
          if (identity(canonical.canonicalRoot) !== identity(project.canonicalRoot)) throw new SelectionError('STALE_TARGET')
          return runTargetIdentity({ projectId, relativePath: path, ...canonical }, 'csharp-project')
        }
        const priorPath = action.kind === 'select' ? action.target.relativePath
          : action.kind === 'resolve' && !loaded.recovered ? loaded.value.relativePath : undefined
        let priorIdentity: string | undefined, savedAuthorizationFailed = false
        if (priorPath) {
          try { priorIdentity = await authorize(priorPath) }
          catch {
            operation.check()
            if (action.kind === 'select') throw new SelectionError('INVALID_SELECTION')
            savedAuthorizationFailed = true
          }
        }
        discovery = await this.resolver.resolve(projectId, controller.signal)
        operation.check()
        const resolution = discovery.resolution
        if (resolution.projectId !== projectId || !validateCSharpRunTargetResolution(resolution).ok) {
          throw new SelectionError('PREFLIGHT_FAILED')
        }
        const usable = resolution.state === 'READY' || resolution.state === 'SELECTION_REQUIRED'
        const candidates = 'candidates' in resolution ? resolution.candidates : []
        const eligible = usable ? candidates.filter(candidate => candidate.eligibility === 'ELIGIBLE') : []
        const choiceRequired = (): CSharpRunTargetResolution => usable
          ? { projectId, state: 'SELECTION_REQUIRED', candidates: resolution.candidates } : resolution
        const persist = async (state: RunTargetState) => {
          operation.check(); entry!.beforeCommit = operation.check
          try { await entry!.persistence.save(state) }
          catch (error) { if (error instanceof SelectionError) throw error; throw new SelectionError('PERSISTENCE_FAILED') }
          finally { entry!.beforeCommit = undefined }
          operation.check()
        }
        const ready = async (path: string, selection: 'AUTOMATIC' | 'SAVED' | 'EXPLICIT' | 'CLEARED',
          save = false): Promise<CsharpRunSelectionResult> => {
          const candidate = eligible.find(item => identity(item.relativePath) === identity(path))
          if (!candidate) throw new SelectionError('STALE_TARGET')
          let before: string
          try {
            before = await authorize(candidate.relativePath)
            if (await authorize(path) !== before) throw new SelectionError('STALE_TARGET')
            if (priorIdentity && before !== priorIdentity) throw new SelectionError('STALE_TARGET')
          } catch (error) { operation.check(); if (error instanceof SelectionError) throw error; throw new SelectionError('STALE_TARGET') }
          if (save) await persist({ relativePath: candidate.relativePath })
          try { if (await authorize(candidate.relativePath) !== before) throw new SelectionError('STALE_TARGET') }
          catch (error) { operation.check(); if (error instanceof SelectionError) throw error; throw new SelectionError('STALE_TARGET') }
          operation.check()
          return { ...discovery!, resolution: { projectId, state: 'READY', candidates,
            target: { kind: 'csharp-project', projectId, relativePath: candidate.relativePath } }, selection }
        }
        if (action.kind === 'clear') {
          await persist({})
          return resolution.state === 'READY' ? await ready(resolution.target.relativePath, 'CLEARED')
            : { ...discovery, selection: 'CLEARED' }
        }
        if (action.kind === 'select') {
          if (!usable) return this.failed(projectId, 'INVALID_SELECTION', discovery)
          if (!eligible.some(candidate => identity(candidate.relativePath) === identity(action.target.relativePath))) {
            return this.failed(projectId, 'INVALID_SELECTION', discovery)
          }
          return await ready(action.target.relativePath, 'EXPLICIT', true)
        }
        if (loaded.recovered) {
          return { ...discovery, resolution: choiceRequired(), selection: 'RECOVERED', issue: 'PERSISTENCE_RECOVERED' }
        }
        if (loaded.value.relativePath) {
          if (!savedAuthorizationFailed && eligible.some(candidate => identity(candidate.relativePath) === identity(loaded.value.relativePath!))) {
            return await ready(loaded.value.relativePath, 'SAVED')
          }
          return { ...discovery, resolution: choiceRequired(), selection: 'STALE', issue: 'STALE_TARGET' }
        }
        return resolution.state === 'READY' ? await ready(resolution.target.relativePath, 'AUTOMATIC')
          : { ...discovery, selection: 'NONE' }
      } catch (error) {
        const issue = operation.issue ?? (error instanceof SelectionError ? error.issue : 'PREFLIGHT_FAILED')
        if (issue === 'STALE_TARGET' && discovery) {
          const r = discovery.resolution
          return { ...discovery, resolution: r.state === 'READY' || r.state === 'SELECTION_REQUIRED'
            ? { projectId, state: 'SELECTION_REQUIRED', candidates: r.candidates } : r,
            selection: 'STALE', issue }
        }
        return this.failed(projectId, issue, discovery)
      } finally {
        removeProject(); signal.removeEventListener('abort', onAbort)
        if (this.latest.get(projectId) === operation) this.latest.delete(projectId)
      }
    })
    const settled = run.then(() => undefined)
    this.queues.set(projectId, settled)
    void settled.then(() => { if (this.queues.get(projectId) === settled) this.queues.delete(projectId) })
    return run
  }

  private store(project: ActiveProject): StoreEntry {
    if (!/^project_[a-f0-9]{24}$/.test(project.id)) throw new SelectionError('INVALID_SELECTION')
    const found = this.stores.get(project.id)
    if (found) return found
    const entry: StoreEntry = { readFailed: false, persistence: undefined! }
    const backend = this.fileSystem
    entry.persistence = new PersistenceService<RunTargetState>({
      filePath: join(this.directory, 'csharp-run-targets', `${project.id}.json`), schemaVersion: 1,
      defaultValue: () => ({}), validate: (value): value is RunTargetState => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
        if (!Object.keys(value).length) return true
        return Object.keys(value).length === 1 && 'relativePath' in value
          && validateSemanticRunTarget({ kind: 'csharp-project', projectId: project.id, relativePath: value.relativePath }).ok
      },
      fileSystem: { ...backend, readFile: async (path, encoding) => {
        try { return await backend.readFile(path, encoding) }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) entry.readFailed = true
          throw error
        }
      }, rename: async (source, destination) => {
        // Existing atomic replace is the commit point. Do not commit stale
        // queued intent or treat an unreadable primary as mere corruption.
        if (entry.readFailed) throw new SelectionError('PERSISTENCE_FAILED')
        entry.beforeCommit?.()
        await backend.rename(source, destination)
      } },
    })
    this.stores.set(project.id, entry)
    return entry
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const operation of this.latest.values()) { operation.issue ??= 'STOPPED'; operation.controller.abort() }
    await Promise.all(this.queues.values())
    await Promise.all([...this.stores.values()].map(entry => entry.persistence.stop()))
    this.stores.clear(); this.latest.clear()
  }
}

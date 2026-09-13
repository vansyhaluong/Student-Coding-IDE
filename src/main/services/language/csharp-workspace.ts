import { randomUUID } from 'node:crypto'
import { basename, dirname, relative, resolve } from 'node:path'
import type { ProjectId } from '../../../shared/contracts'
import type { FileSystemService } from '../filesystem/filesystem-service'
import { isPathWithinRoot } from '../filesystem/filesystem-service'
import { normalizePathIdentity, resolveProjectRelativePath, type ActiveProject } from '../project/project-identity'
import type { CsharpSelectionStore } from './csharp-workspace-store'
import { LanguageError } from './language-error'

export interface WorkspaceCandidate { candidateId: string; displayName: string; relativePath: string }
export type WorkspaceResult =
  | { state: 'SELECTION_REQUIRED'; candidates: WorkspaceCandidate[] }
  | { state: 'NO_CSHARP_WORKSPACE' }
  | { state: 'PREFLIGHT_FAILED'; reason: string }
  | { state: 'READY'; mode: 'solution' | 'project'; solution?: string }
export interface WorkspaceCommands {
  execute(args: readonly string[], cwd: string, signal: AbortSignal): Promise<{ exitCode: number; stdout: string }>
  stop(): Promise<void>
}
export type WorkspaceFiles = Pick<FileSystemService, 'listDirectory' | 'authorizeRunFile'>
const exclusions = new Set(['.git', 'node_modules', 'bin', 'obj', 'dist', 'build', 'out'])
const properties = '-getProperty:TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion'
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Main-only workspace policy; all exposed candidate data is project-relative. */
export class CsharpWorkspace {
  private candidates = new Map<string, string>()
  private revision = 0
  private project?: ActiveProject

  constructor(private readonly files: WorkspaceFiles, private readonly store: CsharpSelectionStore,
    private readonly commands: WorkspaceCommands) {}

  invalidate(): void { ++this.revision; this.candidates.clear(); this.project = undefined }

  async prepare(project: ActiveProject, signal: AbortSignal, candidateId?: string): Promise<WorkspaceResult> {
    const chosen = candidateId === undefined ? undefined : this.candidates.get(candidateId)
    if (candidateId !== undefined && (!chosen || this.project !== project)) throw new LanguageError('invalid-handle')
    const revision = ++this.revision
    this.project = project
    this.candidates.clear()
    const current = () => {
      if (signal.aborted || revision !== this.revision) throw new LanguageError('stale-session')
    }
    try {
      const entries = await this.discover(project.id, current)
      current()
      const solutions = entries.filter((p) => /\.slnx?$/i.test(p))
      const projects = entries.filter((p) => /\.csproj$/i.test(p))
      const saved = chosen ?? await this.store.read(project)
      current()
      const savedCandidate = saved && solutions.find((path) => normalizePathIdentity(path) === normalizePathIdentity(saved))
      const solution = savedCandidate || (solutions.length === 1 ? solutions[0] : undefined)
      if (!solution && solutions.length > 1) {
        return { state: 'SELECTION_REQUIRED', candidates: solutions.map((relativePath) => {
          const candidateId = randomUUID()
          this.candidates.set(candidateId, relativePath)
          return { candidateId, displayName: basename(relativePath), relativePath }
        }) }
      }
      if (!solution && projects.length === 0) return { state: 'NO_CSHARP_WORKSPACE' }
      if (chosen && solution === chosen) {
        await this.store.select(project, chosen)
        current()
      }
      const run = async (args: readonly string[], cwd = project.canonicalRoot) => {
        current()
        const result = await this.commands.execute(args, cwd, signal)
        current()
        if (result.exitCode !== 0) throw new LanguageError('preflight-failed')
        return result.stdout
      }
      const version = (await run(['--version'])).trim()
      const match = /^(\d+)\.\d+\.\d+(?:-[\w.-]+)?$/.exec(version)
      if (!match || Number(match[1]) < 10) return { state: 'PREFLIGHT_FAILED', reason: 'SDK_SELECTION_FAILED' }
      let queue = projects
      if (solution) {
        const path = await this.files.authorizeRunFile(project.id, solution)
        current()
        const listed = await run(['sln', path.canonicalFile, 'list'])
        queue = listed.split(/\r?\n/).map((line) => line.trim()).filter((line) => /\.csproj$/i.test(line))
          .map((token) => this.relativeMember(project, dirname(path.canonicalFile), token))
        if (!queue.length) return { state: 'PREFLIGHT_FAILED', reason: 'NO_SOLUTION_PROJECTS' }
      }
      const visited = new Set<string>()
      for (let i = 0; i < queue.length; ++i) {
        current()
        const file = await this.files.authorizeRunFile(project.id, queue[i])
        current()
        const identity = process.platform === 'win32' ? file.canonicalFile.toLowerCase() : file.canonicalFile
        if (visited.has(identity)) continue
        visited.add(identity)
        if (visited.size > 64) return { state: 'PREFLIGHT_FAILED', reason: 'PREFLIGHT_BOUND_EXCEEDED' }
        const json: unknown = JSON.parse(await run(['msbuild', file.canonicalFile, '-nologo', '-verbosity:quiet',
          '-interactive:false', '-nodeReuse:false', '-noAutoResponse', properties, '-getItem:ProjectReference'],
        dirname(file.canonicalFile)))
        if (!object(json) || !object(json.Properties) || !object(json.Items) || !Array.isArray(json.Items.ProjectReference)
          || ['TargetFramework', 'TargetFrameworks', 'TargetFrameworkIdentifier', 'TargetFrameworkVersion']
            .some((key) => typeof (json.Properties as Record<string, unknown>)[key] !== 'string')) {
          return { state: 'PREFLIGHT_FAILED', reason: 'INVALID_EVALUATION_JSON' }
        }
        for (const item of json.Items.ProjectReference) {
          if (!object(item) || typeof item.Identity !== 'string' || !item.Identity) throw new LanguageError('preflight-failed')
          const member = this.relativeMember(project, dirname(file.canonicalFile), item.Identity)
          await this.files.authorizeRunFile(project.id, member)
          current()
          if (queue.length >= 4096) return { state: 'PREFLIGHT_FAILED', reason: 'PREFLIGHT_BOUND_EXCEEDED' }
          queue.push(member)
        }
      }
      current()
      return { state: 'READY', mode: solution ? 'solution' : 'project', ...(solution ? { solution } : {}) }
    } catch (error) {
      current()
      if (error instanceof LanguageError && error.reason === 'persistence-failed') throw error
      return { state: 'PREFLIGHT_FAILED', reason: 'WORKSPACE_PREFLIGHT_FAILED' }
    }
  }

  private relativeMember(project: ActiveProject, base: string, token: string): string {
    const target = resolve(base, token.replaceAll('\\', '/'))
    if (!isPathWithinRoot(project.canonicalRoot, target)) throw new LanguageError('invalid-context')
    const value = relative(project.canonicalRoot, target).replaceAll('\\', '/')
    resolveProjectRelativePath(project.canonicalRoot, value)
    if (!/\.csproj$/i.test(value)) throw new LanguageError('invalid-context')
    return value
  }

  private async discover(projectId: ProjectId, current: () => void): Promise<string[]> {
    const pending = [''], result: string[] = []
    let seen = 0
    for (let i = 0; i < pending.length; ++i) {
      current()
      const entries = await this.files.listDirectory(projectId, pending[i])
      current()
      for (const entry of entries) {
        if (++seen > 100_000) throw new LanguageError('preflight-failed')
        if (entry.isSymbolicLink) continue
        if (entry.kind === 'directory' && !exclusions.has(entry.name.toLowerCase())) pending.push(entry.relativePath)
        else if (entry.kind === 'file' && /\.(slnx?|csproj)$/i.test(entry.name)) result.push(entry.relativePath)
      }
    }
    return result.sort()
  }
}

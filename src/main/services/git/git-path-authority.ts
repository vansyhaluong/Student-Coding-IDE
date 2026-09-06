import { lstat, realpath } from 'node:fs/promises'
import { posix, win32 } from 'node:path'
import { isGitRelativePath } from '../../../shared/contracts'
import { DomainError } from '../../errors/app-error'
import { normalizePathIdentity, resolveProjectRelativePath, type ActiveProject } from '../project/project-identity'

export interface GitPathAccess {
  realpath(path: string): Promise<string>
  lstat(path: string): Promise<{ isDirectory(): boolean }>
}
const disk: GitPathAccess = { lstat, realpath }

/** Missing deleted paths are allowed; every existing ancestor remains contained. */
export async function authorizeGitPath(
  project: ActiveProject, relativePath: string, platform: NodeJS.Platform,
  files: GitPathAccess = disk,
): Promise<void> {
  if (!isGitRelativePath(relativePath)) throw invalidGitPath()
  const pathApi = platform === 'win32' ? win32 : posix
  const target = resolveProjectRelativePath(project.canonicalRoot, relativePath, platform)
  const root = normalizePathIdentity(project.canonicalRoot, platform)
  let candidate = target
  while (true) {
    try {
      const stats = await files.lstat(candidate)
      const canonical = normalizePathIdentity(await files.realpath(candidate).catch(() => {
        // An existing but unresolvable link is not a missing deleted path.
        throw invalidGitPath()
      }), platform)
      const prefix = root.endsWith(pathApi.sep) ? root : root + pathApi.sep
      if (canonical !== root && !canonical.startsWith(prefix)) throw invalidGitPath()
      // A file request must never expand to a directory subtree pathspec.
      if (candidate === target && stats.isDirectory()) throw invalidGitPath()
      if (candidate === target && canonical !== normalizePathIdentity(target, platform)
        && (await files.lstat(canonical)).isDirectory()) throw invalidGitPath()
      if (candidate !== target && !stats.isDirectory()) throw invalidGitPath()
      return
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      const parent = pathApi.dirname(candidate)
      if (parent === candidate || normalizePathIdentity(candidate, platform) === root) throw invalidGitPath()
      candidate = parent
    }
  }
}

export function invalidGitPath(): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT', message: 'The selected Git path is invalid or no longer available.',
    operation: 'git:path', retryable: false,
  })
}

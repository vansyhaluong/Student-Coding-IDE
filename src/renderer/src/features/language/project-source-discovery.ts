import type {
  AppError,
  FileApi,
  FileEntry,
  ProjectId,
} from '../../../../shared/contracts'
import {
  isPhase3cProjectSourcePath,
  type ProjectSourceSnapshotLimits,
  type ProjectSourceSnapshotPlan,
  type SnapshotExclusionReason,
} from './project-source-snapshot'
import { normalizeProjectRelativePath } from './project-uri'

type ProjectSourceFileApi = Pick<FileApi, 'listDirectory' | 'stat' | 'read'>

export class ProjectSourceDiscoveryError extends Error {
  constructor(readonly cause: AppError) {
    super(cause.message)
    this.name = 'ProjectSourceDiscoveryError'
  }
}

export async function discoverProjectSourceSnapshot(
  fileApi: ProjectSourceFileApi,
  projectId: ProjectId,
  limits: ProjectSourceSnapshotLimits,
  isCurrent: () => boolean = () => true,
): Promise<ProjectSourceSnapshotPlan | null> {
  assertPositiveLimits(limits)
  const sources: Array<{ relativePath: string; content: string }> = []
  const exclusions: Array<{
    relativePath: string
    reason: SnapshotExclusionReason
  }> = []
  const directories = ['']
  let measuredFiles = 0
  let measuredBytes = 0
  let selectedBytes = 0
  let fileLimitReached = false

  while (directories.length > 0 && !fileLimitReached) {
    if (!isCurrent()) return null
    const directory = directories.shift()!
    const listed = await fileApi.listDirectory(projectId, directory)
    if (!isCurrent()) return null
    if (!listed.ok) {
      if (listed.error.code === 'NOT_FOUND') continue
      throw new ProjectSourceDiscoveryError(listed.error)
    }

    for (const entry of sortEntries(listed.value)) {
      if (!isCurrent()) return null
      const relativePath = normalizeProjectRelativePath(entry.relativePath)
      if (isInsideNodeModules(relativePath)) {
        if (entry.kind === 'file') {
          measuredFiles += 1
          exclusions.push({ relativePath, reason: 'node-modules' })
        }
        continue
      }
      if (entry.kind === 'directory' && !entry.isSymbolicLink) {
        directories.push(relativePath)
        continue
      }
      if (entry.kind !== 'file' || entry.isSymbolicLink) continue
      measuredFiles += 1
      if (!isPhase3cProjectSourcePath(relativePath)) {
        exclusions.push({ relativePath, reason: 'unsupported-language' })
        continue
      }
      if (sources.length >= limits.maximumFiles) {
        exclusions.push({ relativePath, reason: 'file-count-limit' })
        fileLimitReached = true
        break
      }

      const stat = await fileApi.stat(projectId, relativePath)
      if (!isCurrent()) return null
      if (!stat.ok) {
        if (stat.error.code === 'NOT_FOUND') continue
        throw new ProjectSourceDiscoveryError(stat.error)
      }
      measuredBytes += stat.value.size
      if (stat.value.kind !== 'file' || stat.value.isSymbolicLink) continue
      if (stat.value.size > limits.maximumFileBytes) {
        exclusions.push({ relativePath, reason: 'file-too-large' })
        continue
      }
      if (selectedBytes + stat.value.size > limits.maximumTotalBytes) {
        exclusions.push({ relativePath, reason: 'total-byte-limit' })
        continue
      }

      const read = await fileApi.read(projectId, relativePath)
      if (!isCurrent()) return null
      if (!read.ok) {
        if (read.error.code === 'NOT_FOUND') continue
        throw new ProjectSourceDiscoveryError(read.error)
      }
      const contentBytes = new TextEncoder().encode(read.value).byteLength
      if (contentBytes > limits.maximumFileBytes) {
        exclusions.push({ relativePath, reason: 'file-too-large' })
        continue
      }
      if (selectedBytes + contentBytes > limits.maximumTotalBytes) {
        exclusions.push({ relativePath, reason: 'total-byte-limit' })
        continue
      }
      sources.push({ relativePath, content: read.value })
      selectedBytes += contentBytes
    }
  }

  return {
    sources,
    exclusions,
    measuredFiles,
    measuredBytes,
    selectedBytes,
  }
}

function sortEntries(entries: readonly FileEntry[]): FileEntry[] {
  return [...entries].sort((left, right) => (
    left.relativePath.localeCompare(right.relativePath, 'en-US', {
      sensitivity: 'base',
    })
  ))
}

function isInsideNodeModules(relativePath: string): boolean {
  return relativePath.split('/').some(
    (part) => part.toLowerCase() === 'node_modules',
  )
}

function assertPositiveLimits(limits: ProjectSourceSnapshotLimits): void {
  for (const value of [
    limits.maximumFiles,
    limits.maximumTotalBytes,
    limits.maximumFileBytes,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Snapshot limits must be positive safe integers.')
    }
  }
}

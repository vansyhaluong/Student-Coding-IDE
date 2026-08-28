import { createHash } from 'node:crypto'
import {
  isAbsolute as isPosixAbsolute,
  normalize as normalizePosix,
} from 'node:path/posix'
import {
  basename as basenameWindows,
  isAbsolute as isWindowsAbsolute,
  normalize as normalizeWindows,
  parse as parseWindows,
  resolve as resolveWindows,
  sep as windowsSeparator,
} from 'node:path/win32'
import {
  basename,
  isAbsolute,
  normalize,
  parse,
  resolve,
  sep,
} from 'node:path'

import type {
  ProjectId,
  ProjectIdentity,
} from '../../../shared/contracts'
import { DomainError } from '../../errors/app-error'

export interface ActiveProject extends ProjectIdentity {
  canonicalRoot: string
  pathIdentity: string
}

export interface ProjectFileSystem {
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ isDirectory(): boolean }>
}

export async function createProjectIdentity(
  rootPath: string,
  fileSystem: ProjectFileSystem,
  platform: NodeJS.Platform = process.platform,
): Promise<ActiveProject> {
  if (!isAbsoluteForPlatform(rootPath, platform)) {
    throw new DomainError({
      code: 'INVALID_INPUT',
      message: 'Project root must be an absolute path.',
      operation: 'project:identify',
      retryable: false,
    })
  }

  const canonicalRoot = await fileSystem.realpath(rootPath)
  const stats = await fileSystem.stat(canonicalRoot)
  if (!stats.isDirectory()) {
    throw new DomainError({
      code: 'INVALID_INPUT',
      message: 'Project root must be a directory.',
      operation: 'project:identify',
      retryable: false,
    })
  }

  const pathIdentity = normalizePathIdentity(canonicalRoot, platform)
  const id = `project_${createHash('sha256')
    .update(pathIdentity)
    .digest('hex')
    .slice(0, 24)}` as ProjectId

  return {
    id,
    name: platform === 'win32'
      ? basenameWindows(canonicalRoot)
      : basename(canonicalRoot),
    canonicalRoot,
    pathIdentity,
  }
}

export function normalizePathIdentity(
  value: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const normalized = normalizeWindows(value)
    return trimTrailingSeparator(
      normalized,
      windowsSeparator,
      parseWindows(normalized).root.length,
    )
      .toLocaleLowerCase('en-US')
  }

  const normalized = normalize(value)
  return trimTrailingSeparator(
    normalized,
    sep,
    parse(normalized).root.length,
  )
}

export function resolveProjectRelativePath(
  canonicalRoot: string,
  relativePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (
    relativePath.length === 0
    || relativePath.includes('\0')
    || isWindowsAbsolute(relativePath)
    || isPosixAbsolute(relativePath)
  ) {
    throw invalidProjectPath()
  }

  const pathIdentity = normalizePathIdentity(canonicalRoot, platform)
  const resolved = platform === 'win32'
    ? resolveWindows(canonicalRoot, relativePath)
    : resolve(canonicalRoot, relativePath)
  const resolvedIdentity = normalizePathIdentity(resolved, platform)
  const separator = platform === 'win32' ? windowsSeparator : sep
  const descendantPrefix = pathIdentity.endsWith(separator)
    ? pathIdentity
    : `${pathIdentity}${separator}`

  if (
    resolvedIdentity !== pathIdentity
    && !resolvedIdentity.startsWith(descendantPrefix)
  ) {
    throw invalidProjectPath()
  }

  return platform === 'win32'
    ? normalizeWindows(resolved)
    : normalizePosix(resolved)
}

function isAbsoluteForPlatform(
  value: string,
  platform: NodeJS.Platform,
): boolean {
  return platform === 'win32' ? isWindowsAbsolute(value) : isAbsolute(value)
}

function trimTrailingSeparator(
  value: string,
  separator: string,
  rootLength: number,
): string {
  let result = value
  while (result.length > rootLength && result.endsWith(separator)) {
    result = result.slice(0, -1)
  }
  return result
}

function invalidProjectPath(): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT',
    message: 'Project-relative path is invalid.',
    operation: 'project:resolve-path',
    retryable: false,
  })
}

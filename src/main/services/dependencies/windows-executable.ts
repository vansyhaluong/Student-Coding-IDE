import { realpath, stat } from 'node:fs/promises'
import { win32 } from 'node:path'

export interface ExecutableFileAccess {
  resolveFile(path: string): Promise<string | null>
}

export const executableDiskAccess: ExecutableFileAccess = {
  async resolveFile(path) {
    try {
      return (await stat(path)).isFile() ? await realpath(path) : null
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT') || isNodeErrorCode(error, 'ENOTDIR')) return null
      throw error
    }
  },
}

export function isFullyQualifiedWindowsPath(path: string): boolean {
  if (/^[a-z]:[\\/]/i.test(path)) return true
  if (!path.startsWith('\\\\')) return false
  return path.slice(2).split(/[\\/]/).filter(Boolean).length >= 2
}

export function isValidatedWindowsExecutable(path: string, name: string): boolean {
  return isFullyQualifiedWindowsPath(path)
    && !Array.from(path).some((character) => character.charCodeAt(0) === 0)
    && win32.basename(path).toLowerCase() === name.toLowerCase()
}

export function mainPathDirectories(environment: NodeJS.ProcessEnv): readonly string[] {
  const key = Object.keys(environment).find((name) => name.toUpperCase() === 'PATH')
  const value = key ? environment[key] ?? '' : ''
  return value.split(';').map(normalizePathEntry).filter(isSafePathDirectory)
}

function normalizePathEntry(entry: string): string {
  const trimmed = entry.trim()
  if (trimmed.length < 2) return trimmed
  return trimmed.charCodeAt(0) === 34 && trimmed.charCodeAt(trimmed.length - 1) === 34
    ? trimmed.slice(1, -1) : trimmed
}

function isSafePathDirectory(entry: string): boolean {
  return entry.length > 0 && isFullyQualifiedWindowsPath(entry)
    && !Array.from(entry).some((character) => character.charCodeAt(0) === 0)
}

export async function resolveExecutableOnMainPath(
  name: string,
  environment: NodeJS.ProcessEnv,
  files: ExecutableFileAccess,
): Promise<string | null> {
  for (const directory of mainPathDirectories(environment)) {
    const resolved = await files.resolveFile(win32.join(directory, name))
    if (resolved && isValidatedWindowsExecutable(resolved, name)) return resolved
  }
  return null
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

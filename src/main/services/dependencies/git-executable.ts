import { realpath, stat } from 'node:fs/promises'
import { win32 } from 'node:path'

export interface GitExecutable {
  readonly executable: string
}

export type GitExecutableStatus =
  | { readonly state: 'AVAILABLE'; readonly git: GitExecutable }
  | { readonly state: 'MISSING' }

export interface GitExecutableAccess {
  resolveFile(path: string): Promise<string | null>
}

const disk: GitExecutableAccess = {
  async resolveFile(path) {
    try {
      return (await stat(path)).isFile() ? await realpath(path) : null
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT') || isNodeErrorCode(error, 'ENOTDIR')) {
        return null
      }
      throw error
    }
  },
}

/** Main PATH only: no PATHEXT, cwd search, Settings path, or Renderer input. */
export class GitExecutableDetector {
  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly files: GitExecutableAccess = disk,
  ) {}

  async detect(): Promise<GitExecutableStatus> {
    const pathKey = Object.keys(this.environment)
      .find((name) => name.toUpperCase() === 'PATH')
    const pathValue = pathKey ? this.environment[pathKey] ?? '' : ''

    for (const rawEntry of pathValue.split(';')) {
      const directory = unwrapQuotedPathEntry(rawEntry.trim())
      if (!directory || directory.includes('\0') || !isFullyQualified(directory)) {
        continue
      }

      const resolved = await this.files.resolveFile(
        win32.join(directory, 'git.exe'),
      )
      if (!resolved || !isValidatedGitExecutable(resolved)) {
        continue
      }
      return { state: 'AVAILABLE', git: { executable: resolved } }
    }

    return { state: 'MISSING' }
  }
}

export function isValidatedGitExecutable(path: string): boolean {
  return isFullyQualified(path)
    && !path.includes('\0')
    && win32.basename(path).toLowerCase() === 'git.exe'
}

function unwrapQuotedPathEntry(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value
}

// win32.isAbsolute also accepts current-drive rooted paths such as \tools.
function isFullyQualified(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path)
    || /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(path)
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

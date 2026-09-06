import { realpath, stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { DomainError } from '../../errors/app-error'
import type { RunRuntime } from '../run/run-strategy'

export type NodeRuntimeStatus = { state: 'AVAILABLE'; runtime: RunRuntime }
  | { state: 'MISSING' }
  | { state: 'INVALID_CONFIGURATION' }
export interface NodeExecutableAccess {
  resolveFile(path: string): Promise<string | null>
}
const disk: NodeExecutableAccess = {
  async resolveFile(path) {
    try { return (await stat(path)).isFile() ? await realpath(path) : null }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT'
        || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return null
      throw error
    }
  },
}

/** Only Main's PATH is consulted. No PATHEXT scripts, cwd search, or renderer input. */
export class NodeRuntimeDetector {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly files: NodeExecutableAccess = disk) {}

  async detect(): Promise<NodeRuntimeStatus> {
    const key = Object.keys(this.environment).find((name) => name.toUpperCase() === 'PATH')
    const value = key ? this.environment[key] ?? '' : ''
    for (const raw of value.split(';')) {
      const directory = raw.trim().replace(/^"(.*)"$/, '$1')
      // Relative/empty PATH entries must not confer current-project executable authority.
      if (!directory || !isFullyQualified(directory) || directory.includes('\0')) continue
      try {
        const executable = await this.files.resolveFile(win32.join(directory, 'node.exe'))
        if (!executable) continue
        if (!isFullyQualified(executable) || executable.includes('\0')
          || win32.basename(executable).toLowerCase() !== 'node.exe') return { state: 'INVALID_CONFIGURATION' }
        return { state: 'AVAILABLE', runtime: { executable } }
      } catch { return { state: 'INVALID_CONFIGURATION' } }
    }
    return { state: 'MISSING' }
  }

  async resolve(): Promise<RunRuntime> {
    const status = await this.detect()
    if (status.state === 'AVAILABLE') return status.runtime
    throw new DomainError({ code: status.state === 'MISSING' ? 'DEPENDENCY_MISSING' : 'INVALID_INPUT',
      operation: 'run:runtime', retryable: true, message: status.state === 'MISSING'
        ? 'Node.js was not found on PATH. Install Node.js and restart the IDE.'
        : 'The Node.js executable on PATH could not be validated.' })
  }
}

// win32.isAbsolute also accepts drive-relative rooted paths such as \tools.
function isFullyQualified(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(path)
}

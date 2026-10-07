import { win32 } from 'node:path'
import type { RunTarget } from '../../../shared/contracts/run'
import { DomainError } from '../../errors/app-error'
import { normalizePathIdentity, resolveProjectRelativePath } from '../project/project-identity'
import type { AuthorizedRunTarget, PreparedRun, RunRuntime, RunStrategy } from './run-strategy'

export class JavaScriptRunStrategy implements RunStrategy {
  readonly kind = 'javascript-file' as const
  supports(target: RunTarget): boolean {
    return win32.extname(target.relativePath) === '.js'
  }

  prepare(target: AuthorizedRunTarget, runtime: RunRuntime): PreparedRun {
    if (!this.supports(target)) {
      throw new DomainError({ code: 'UNSUPPORTED', retryable: false, operation: 'run:prepare',
        message: target.relativePath.endsWith('.ts')
          ? 'TypeScript Run is not supported in current V1.'
          : 'Run supports JavaScript .js files only in current V1.' })
    }
    // Defense in depth, not a replacement for Main filesystem authorization.
    resolveProjectRelativePath(target.canonicalRoot, target.relativePath, 'win32')
    const root = normalizePathIdentity(target.canonicalRoot, 'win32')
    const file = normalizePathIdentity(target.canonicalFile, 'win32')
    if (!win32.isAbsolute(target.canonicalRoot) || !win32.isAbsolute(target.canonicalFile)
      || !file.startsWith(root.endsWith('\\') ? root : `${root}\\`)
      || win32.extname(target.canonicalFile) !== '.js'
      || !win32.isAbsolute(runtime.executable) || runtime.executable.includes('\0')
      || win32.basename(runtime.executable).toLowerCase() !== 'node.exe') {
      throw new DomainError({ code: 'INVALID_INPUT', retryable: false,
        operation: 'run:prepare', message: 'Invalid authorized Run target or runtime.' })
    }
    return Object.freeze({ executable: runtime.executable,
      args: Object.freeze([target.canonicalFile]), cwd: target.canonicalRoot,
      environmentAdditions: Object.freeze({}), shell: false })
  }
}

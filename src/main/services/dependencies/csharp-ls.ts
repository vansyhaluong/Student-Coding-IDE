import type { LanguageDependencyStatus } from '../../../shared/contracts'
import { FiniteLanguageProbe, type LanguageProbe } from './language-probe'
import {
  executableDiskAccess,
  isValidatedWindowsExecutable,
  resolveExecutableOnMainPath,
  type ExecutableFileAccess,
} from './windows-executable'

export const EXPECTED_CSHARP_LS_VERSION = '0.27.0'

export interface CsharpLsProvider {
  /** Main-only canonical executable path. */
  readonly executable: string
  readonly version: typeof EXPECTED_CSHARP_LS_VERSION
}
export type CsharpLsDetection =
  | { readonly status: LanguageDependencyStatus; readonly provider: CsharpLsProvider }
  | { readonly status: LanguageDependencyStatus; readonly provider: null }
export interface CsharpLsResolverOptions {
  readonly mode: 'development' | 'packaged'
  /** Trusted Main composition supplies the private/app-owned candidate. */
  readonly privateExecutable?: string
}

const unavailable = (
  state: 'MISSING' | 'INVALID_CONFIGURATION',
  reason: 'CSHARP_LS_MISSING' | 'CSHARP_LS_INVALID' | 'CSHARP_LS_VERSION_MISMATCH' | 'CSHARP_LS_PROBE_FAILED',
): CsharpLsDetection => ({ status: { state, reason, warnings: [] }, provider: null })

/** Enforces private-first development and app-owned-only packaged resolution. */
export class CsharpLsResolver {
  constructor(
    private readonly options: CsharpLsResolverOptions,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly files: ExecutableFileAccess = executableDiskAccess,
    private readonly probe: LanguageProbe = new FiniteLanguageProbe(environment),
  ) {}

  async detect(): Promise<CsharpLsDetection> {
    const privateResult = await this.resolvePrivate()
    if (privateResult === 'INVALID') return unavailable('INVALID_CONFIGURATION', 'CSHARP_LS_INVALID')
    if (privateResult) return this.probeVersion(privateResult)
    if (this.options.mode === 'packaged') return unavailable('MISSING', 'CSHARP_LS_MISSING')

    try {
      const executable = await resolveExecutableOnMainPath('csharp-ls.exe', this.environment, this.files)
      return executable ? this.probeVersion(executable) : unavailable('MISSING', 'CSHARP_LS_MISSING')
    } catch {
      return unavailable('INVALID_CONFIGURATION', 'CSHARP_LS_INVALID')
    }
  }

  private async resolvePrivate(): Promise<string | 'INVALID' | null> {
    const candidate = this.options.privateExecutable
    if (candidate === undefined) return null
    if (!isValidatedWindowsExecutable(candidate, 'csharp-ls.exe')) return 'INVALID'
    try {
      const resolved = await this.files.resolveFile(candidate)
      if (resolved === null) return null
      return isValidatedWindowsExecutable(resolved, 'csharp-ls.exe') ? resolved : 'INVALID'
    } catch {
      return 'INVALID'
    }
  }

  private async probeVersion(executable: string): Promise<CsharpLsDetection> {
    try {
      const result = await this.probe.execute(executable, ['--version'])
      if (result.exitCode !== 0) return unavailable('INVALID_CONFIGURATION', 'CSHARP_LS_PROBE_FAILED')
      const version = parseCsharpLsVersion(result.stdout)
      if (version === null) return unavailable('INVALID_CONFIGURATION', 'CSHARP_LS_PROBE_FAILED')
      if (version !== EXPECTED_CSHARP_LS_VERSION) {
        return unavailable('INVALID_CONFIGURATION', 'CSHARP_LS_VERSION_MISMATCH')
      }
      return { status: { state: 'AVAILABLE', reason: null, warnings: [] },
        provider: { executable, version: EXPECTED_CSHARP_LS_VERSION } }
    } catch {
      return unavailable('INVALID_CONFIGURATION', 'CSHARP_LS_PROBE_FAILED')
    }
  }
}

export function parseCsharpLsVersion(stdout: string): string | null {
  const match = /^csharp-ls,\s+(\d+\.\d+\.\d+)(?:\s+\([A-Za-z0-9.-]+\)\+[0-9a-f]+)?\s*$/i.exec(stdout.trim())
  return match?.[1] ?? null
}

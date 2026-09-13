import type { LanguageDependencyStatus } from '../../../shared/contracts'
import { FiniteLanguageProbe, type LanguageProbe } from './language-probe'
import {
  executableDiskAccess,
  resolveExecutableOnMainPath,
  type ExecutableFileAccess,
} from './windows-executable'

export interface DotnetSdkVersion {
  readonly version: string
  readonly major: number
  readonly prerelease: boolean
}
export interface DotnetRuntime {
  /** Main-only canonical executable path. */
  readonly executable: string
  readonly sdks: readonly DotnetSdkVersion[]
}
export type DotnetDetection =
  | { readonly status: LanguageDependencyStatus; readonly runtime: DotnetRuntime }
  | { readonly status: LanguageDependencyStatus; readonly runtime: null }

const missing = (reason: 'DOTNET_HOST_MISSING' | 'DOTNET_SDK_MISSING'): DotnetDetection => ({
  status: { state: 'MISSING', reason, warnings: [] }, runtime: null,
})
const invalid = (reason: 'DOTNET_SDK_TOO_OLD' | 'DOTNET_PROBE_FAILED'): DotnetDetection => ({
  status: { state: 'INVALID_CONFIGURATION', reason, warnings: [] }, runtime: null,
})

/** Main-owned PATH-only machine inventory detector; workspace SDK selection is Phase 5.5E. */
export class DotnetSdkDetector {
  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly files: ExecutableFileAccess = executableDiskAccess,
    private readonly probe: LanguageProbe = new FiniteLanguageProbe(environment),
  ) {}

  async detect(): Promise<DotnetDetection> {
    let executable: string | null
    try {
      executable = await resolveExecutableOnMainPath('dotnet.exe', this.environment, this.files)
    } catch {
      return invalid('DOTNET_PROBE_FAILED')
    }
    if (!executable) return missing('DOTNET_HOST_MISSING')

    try {
      const result = await this.probe.execute(executable, ['--list-sdks'])
      if (result.exitCode !== 0) return invalid('DOTNET_PROBE_FAILED')
      const sdks = parseDotnetSdkInventory(result.stdout)
      if (sdks === null) return invalid('DOTNET_PROBE_FAILED')
      if (sdks.length === 0) return missing('DOTNET_SDK_MISSING')
      const eligible = sdks.filter((sdk) => sdk.major >= 10)
      if (eligible.length === 0) return invalid('DOTNET_SDK_TOO_OLD')
      const warnings = eligible.some((sdk) => !sdk.prerelease) ? [] : ['DOTNET_PRERELEASE_ONLY'] as const
      return { status: { state: 'AVAILABLE', reason: null, warnings }, runtime: { executable, sdks } }
    } catch {
      return invalid('DOTNET_PROBE_FAILED')
    }
  }
}

export function parseDotnetSdkInventory(stdout: string): readonly DotnetSdkVersion[] | null {
  if (stdout.length > 1024 * 1024) return null
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const result: DotnetSdkVersion[] = []
  for (const line of lines) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?\s+\[[^\]\r\n]+\]$/.exec(line)
    if (!match) return null
    result.push({ version: match[4] ? `${match[1]}.${match[2]}.${match[3]}-${match[4]}`
      : `${match[1]}.${match[2]}.${match[3]}`, major: Number(match[1]), prerelease: Boolean(match[4]) })
  }
  return result
}

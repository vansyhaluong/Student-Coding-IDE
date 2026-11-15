import type { CSharpRunDependencyFailure } from '../../../shared/contracts/run'
import { runTargetIdentity, type AuthorizedRunTarget, type RunRuntime } from '../run/run-strategy'
import { RunProbeError, type RunSdkProbe, type RunProbeFailure } from '../run/csharp-run-probe'
import { win32 } from 'node:path'
import { open } from 'node:fs/promises'
import { executableDiskAccess, resolveExecutableOnMainPath, isFullyQualifiedWindowsPath,
  type ExecutableFileAccess } from './windows-executable'

export interface RunSdkVersion { readonly version: string; readonly major: number; readonly prerelease: boolean }
export interface DotnetRunRuntime extends RunRuntime {
  readonly effectiveSdk: RunSdkVersion
  readonly cwd: string
  readonly installedSdks: readonly RunSdkVersion[]
}
export type RunSdkFailureDetail = RunProbeFailure | 'HOST_MISSING' | 'SDK_MISSING'
  | 'SDK_RESOLUTION_FAILED' | 'SDK_CONFIGURATION_INVALID' | 'INVALID_GLOBAL_JSON' | 'UNSUPPORTED_SDK' | 'INVALID_OUTPUT' | 'PROBE_FAILED'
export type DotnetRunResolution = { readonly ok: true; readonly runtime: DotnetRunRuntime }
  | { readonly ok: false; readonly dependency: CSharpRunDependencyFailure; readonly detail: RunSdkFailureDetail }

/** Independent Run policy: stable SDK >=8 selected by the CLI in candidate cwd. */
export class DotnetRunRuntimeResolver {
  constructor(private readonly probe: RunSdkProbe,
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly files: ExecutableFileAccess = executableDiskAccess,
    private readonly globalJson: (cwd: string, signal: AbortSignal) => Promise<'valid-or-absent' | 'invalid'> = inspectRunGlobalJson) {}

  async resolve(target: AuthorizedRunTarget, signal: AbortSignal): Promise<DotnetRunResolution> {
    const invalid = (detail: RunSdkFailureDetail, selection = false): DotnetRunResolution => ({ ok: false,
      dependency: { state: 'INVALID_CONFIGURATION', reason: selection ? 'SDK_SELECTION_FAILED' : 'DOTNET_PROBE_FAILED' }, detail })
    try {
      runTargetIdentity(target, 'csharp-project')
      if (!/\.csproj$/i.test(target.canonicalFile)) return invalid('INVALID_CONTEXT')
      const cwd = win32.dirname(target.canonicalFile)
      if (signal.aborted) return invalid('CANCELLED')
      const executable = await resolveExecutableOnMainPath('dotnet.exe', this.environment, this.files)
      if (signal.aborted) return invalid('CANCELLED')
      if (!executable) return { ok: false, dependency: { state: 'MISSING', reason: 'DOTNET_HOST_MISSING' }, detail: 'HOST_MISSING' }
      const inventory = await this.probe.execute(executable, { kind: 'inventory' }, cwd, signal)
      if (inventory.exitCode !== 0 || inventory.stderr.trim()) return invalid('PROBE_FAILED')
      const sdks = parseRunSdkInventory(inventory.stdout)
      if (!sdks) return invalid('INVALID_OUTPUT')
      // --version is authoritative even when inventory is empty (global.json SDK paths).
      const selected = await this.probe.execute(executable, { kind: 'version' }, cwd, signal)
      // Syntax/field-shape diagnostics only: CLI remains the source of truth for version and
      // roll-forward. Some SDKs silently ignore malformed host configuration;
      // SDK 10 may instead throw a CLI initializer error with generic exit 1.
      if (await this.globalJson(cwd, signal) === 'invalid') return invalid('INVALID_GLOBAL_JSON', true)
      if (selected.exitCode !== 0) return sdks.length === 0
        ? { ok: false, dependency: { state: 'MISSING', reason: 'DOTNET_SDK_MISSING' }, detail: 'SDK_MISSING' }
        : invalid('SDK_RESOLUTION_FAILED', true)
      // The host can ignore a malformed global.json and still return a version.
      // Fail closed on host diagnostics without parsing localized prose or JSON rules.
      if (selected.stderr.trim()) return invalid('SDK_CONFIGURATION_INVALID', true)
      const effectiveSdk = parseRunSdkVersion(selected.stdout.trim())
      if (!effectiveSdk) return invalid('INVALID_OUTPUT')
      if (effectiveSdk.major < 8 || effectiveSdk.prerelease) return invalid('UNSUPPORTED_SDK', true)
      if (signal.aborted) return invalid('CANCELLED')
      return { ok: true, runtime: Object.freeze({ executable, cwd, effectiveSdk, installedSdks: sdks }) }
    } catch (error) { return invalid(error instanceof RunProbeError ? error.reason : 'PROBE_FAILED') }
  }
}

/** Nearest ancestor file only; bounded schema inspection, never SDK selection rules. */
export async function inspectRunGlobalJson(cwd: string, signal: AbortSignal): Promise<'valid-or-absent' | 'invalid'> {
  let directory = cwd
  for (let depth = 0; depth < 64; ++depth) {
    if (signal.aborted) throw new RunProbeError('CANCELLED')
    let handle
    try {
      handle = await open(win32.join(directory, 'global.json'), 'r')
      const stats = await handle.stat()
      if (!stats.isFile() || stats.size > 64 * 1024) return 'invalid'
      const bytes = Buffer.alloc(64 * 1024 + 1)
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
      if (bytesRead > 64 * 1024) return 'invalid'
      if (signal.aborted) throw new RunProbeError('CANCELLED')
      try {
        return validRunGlobalJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)))
          ? 'valid-or-absent' : 'invalid'
      } catch { return 'invalid' }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) throw error
    } finally { await handle?.close() }
    const parent = win32.dirname(directory)
    if (parent === directory) return 'valid-or-absent'
    directory = parent
  }
  throw new RunProbeError('INVALID_CONTEXT')
}

/** JSON-with-comments plus known SDK field shapes. Never select/roll forward a version. */
export function validRunGlobalJson(text: string): boolean {
  if (Buffer.byteLength(text) > 64 * 1024 || text.includes('\0')) return false
  // Tokenize strings before comments so URLs and escaped quotes are preserved.
  const stripped = text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    token => token.startsWith('"') ? token : ' ')
  try {
    const parsed: unknown = JSON.parse(stripped)
    const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
    if (!object(parsed)) return false
    if (!('sdk' in parsed)) return true
    const sdk = parsed.sdk
    if (!object(sdk)) return false
    if ('version' in sdk && (typeof sdk.version !== 'string' || !parseRunSdkVersion(sdk.version))) return false
    if ('allowPrerelease' in sdk && typeof sdk.allowPrerelease !== 'boolean') return false
    if ('rollForward' in sdk && (typeof sdk.rollForward !== 'string'
      || !['disable', 'patch', 'feature', 'minor', 'major', 'latestpatch', 'latestfeature', 'latestminor', 'latestmajor']
        .includes(sdk.rollForward.toLowerCase()))) return false
    if ('paths' in sdk && (!Array.isArray(sdk.paths) || sdk.paths.length > 64
      || sdk.paths.some(path => typeof path !== 'string' || !path || path.length > 4096 || path.includes('\0')))) return false
    return true
  } catch { return false }
}

export function parseRunSdkVersion(value: string): RunSdkVersion | null {
  if (value.length > 128 || value.includes('\0')) return null
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/.exec(value)
  if (!match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part)))) return null
  return Object.freeze({ version: value, major: Number(match[1]), prerelease: Boolean(match[4]) })
}

export function parseRunSdkInventory(stdout: string): readonly RunSdkVersion[] | null {
  if (Buffer.byteLength(stdout) > 64 * 1024 || stdout.includes('\0')) return null
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > 256) return null
  const result: RunSdkVersion[] = []
  for (const line of lines) {
    const match = /^(\S+) \[([^\]\r\n]+)\]$/.exec(line)
    if (!match || match[2].length > 4096 || !isFullyQualifiedWindowsPath(match[2])) return null
    const version = parseRunSdkVersion(match[1])
    if (!version) return null
    result.push(version)
  }
  return Object.freeze(result)
}

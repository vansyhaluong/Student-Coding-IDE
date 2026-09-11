import { execFile, type ExecFileException } from 'node:child_process'

export interface LanguageProbeResult {
  readonly exitCode: number
  readonly stdout: string
}
export interface LanguageProbe {
  execute(executable: string, args: readonly string[]): Promise<LanguageProbeResult>
}

const MAX_PROBE_OUTPUT_BYTES = 1024 * 1024
const PROBE_TIMEOUT_MS = 10_000

/** Finite Main-only probe. Executables and arguments never originate in Renderer. */
export class FiniteLanguageProbe implements LanguageProbe {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  execute(executable: string, args: readonly string[]): Promise<LanguageProbeResult> {
    return new Promise((resolve, reject) => {
      execFile(executable, [...args], {
        encoding: 'utf8', env: this.environment, maxBuffer: MAX_PROBE_OUTPUT_BYTES,
        shell: false, timeout: PROBE_TIMEOUT_MS, windowsHide: true,
      }, (error: ExecFileException | null, stdout: string) => {
        if (!error) resolve({ exitCode: 0, stdout })
        else if (typeof error.code === 'number') resolve({ exitCode: error.code, stdout })
        else reject(new Error('Language dependency probe failed.'))
      })
    })
  }
}

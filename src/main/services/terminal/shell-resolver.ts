import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'

import { DomainError } from '../../errors/app-error'

export interface TerminalShellProfile {
  executable: string
  args: readonly string[]
  shellLabel: string
}

export interface TerminalShellResolver {
  resolve(): Promise<TerminalShellProfile>
}

export interface ExecutableAccess {
  isFile(path: string): Promise<boolean>
}

export interface WindowsShellResolverOptions {
  environment?: NodeJS.ProcessEnv
  executableAccess?: ExecutableAccess
  platform?: NodeJS.Platform
}

const nodeExecutableAccess: ExecutableAccess = {
  async isFile(path): Promise<boolean> {
    try {
      return (await stat(path)).isFile()
    } catch {
      return false
    }
  },
}

export class WindowsShellResolver implements TerminalShellResolver {
  private readonly environment: NodeJS.ProcessEnv
  private readonly executableAccess: ExecutableAccess
  private readonly platform: NodeJS.Platform

  constructor(options: WindowsShellResolverOptions = {}) {
    this.environment = options.environment ?? process.env
    this.executableAccess = options.executableAccess ?? nodeExecutableAccess
    this.platform = options.platform ?? process.platform
  }

  async resolve(): Promise<TerminalShellProfile> {
    if (this.platform !== 'win32') {
      throw new DomainError({
        code: 'UNSUPPORTED',
        message: 'The V1 terminal backend supports Windows only.',
        operation: 'terminal:resolve-shell',
        retryable: false,
      })
    }

    const pwsh = await this.findOnPath('pwsh.exe')
    if (pwsh) {
      return { executable: pwsh, args: [], shellLabel: 'PowerShell' }
    }

    const systemRoot = environmentValue(this.environment, 'SystemRoot')
      ?? environmentValue(this.environment, 'windir')
    if (systemRoot) {
      const windowsPowerShell = win32.join(
        systemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      )
      if (await this.executableAccess.isFile(windowsPowerShell)) {
        return {
          executable: windowsPowerShell,
          args: [],
          shellLabel: 'Windows PowerShell',
        }
      }
    }

    const comSpec = environmentValue(this.environment, 'ComSpec')
    if (
      comSpec
      && win32.isAbsolute(comSpec)
      && await this.executableAccess.isFile(comSpec)
    ) {
      return { executable: comSpec, args: [], shellLabel: 'Command Prompt' }
    }

    if (systemRoot) {
      const commandPrompt = win32.join(systemRoot, 'System32', 'cmd.exe')
      if (await this.executableAccess.isFile(commandPrompt)) {
        return {
          executable: commandPrompt,
          args: [],
          shellLabel: 'Command Prompt',
        }
      }
    }

    throw new DomainError({
      code: 'DEPENDENCY_MISSING',
      message: 'No supported Windows shell is available.',
      operation: 'terminal:resolve-shell',
      retryable: false,
    })
  }

  private async findOnPath(executable: string): Promise<string | null> {
    const pathValue = environmentValue(this.environment, 'PATH')
    if (!pathValue) return null

    const seen = new Set<string>()
    for (const rawDirectory of pathValue.split(';')) {
      const directory = rawDirectory.trim().replace(/^"|"$/g, '')
      if (!directory) continue
      const candidate = win32.join(directory, executable)
      const identity = candidate.toLocaleLowerCase('en-US')
      if (seen.has(identity)) continue
      seen.add(identity)
      if (await this.executableAccess.isFile(candidate)) return candidate
    }
    return null
  }
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const match = Object.entries(environment).find(
    ([key]) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
  )
  return match?.[1]
}

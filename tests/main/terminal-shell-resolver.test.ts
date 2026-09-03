import { win32 } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  WindowsShellResolver,
  type ExecutableAccess,
} from '../../src/main/services/terminal/shell-resolver'
import { createPtyEnvironment } from '../../src/main/services/terminal/terminal-environment'

class FakeExecutableAccess implements ExecutableAccess {
  private readonly files = new Set<string>()

  add(path: string): void {
    this.files.add(path.toLocaleLowerCase('en-US'))
  }

  isFile(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path.toLocaleLowerCase('en-US')))
  }
}

describe('Phase 2E-D Windows terminal shell resolution', () => {
  it('prefers pwsh from PATH without executing a discovery command', async () => {
    const access = new FakeExecutableAccess()
    access.add('C:\\Tools\\pwsh.exe')
    access.add(windowsPowerShellPath())
    access.add('C:\\Windows\\System32\\cmd.exe')
    const resolver = resolverWith(access, {
      PATH: '"C:\\Tools";C:\\Other',
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    })

    await expect(resolver.resolve()).resolves.toEqual({
      executable: 'C:\\Tools\\pwsh.exe',
      args: [],
      shellLabel: 'PowerShell',
    })
  })

  it('falls back from missing pwsh to Windows PowerShell', async () => {
    const access = new FakeExecutableAccess()
    access.add(windowsPowerShellPath())

    await expect(resolverWith(access, {
      Path: 'C:\\Missing',
      windir: 'C:\\Windows',
    }).resolve()).resolves.toEqual({
      executable: windowsPowerShellPath(),
      args: [],
      shellLabel: 'Windows PowerShell',
    })
  })

  it('falls back to a valid absolute ComSpec and then system cmd.exe', async () => {
    const comSpecAccess = new FakeExecutableAccess()
    comSpecAccess.add('D:\\Windows\\cmd.exe')
    await expect(resolverWith(comSpecAccess, {
      ComSpec: 'D:\\Windows\\cmd.exe',
    }).resolve()).resolves.toMatchObject({
      executable: 'D:\\Windows\\cmd.exe',
      shellLabel: 'Command Prompt',
    })

    const systemAccess = new FakeExecutableAccess()
    systemAccess.add('C:\\Windows\\System32\\cmd.exe')
    await expect(resolverWith(systemAccess, {
      SystemRoot: 'C:\\Windows',
      ComSpec: 'cmd.exe',
    }).resolve()).resolves.toMatchObject({
      executable: 'C:\\Windows\\System32\\cmd.exe',
      shellLabel: 'Command Prompt',
    })
  })

  it('ignores custom-shell variables and reports DEPENDENCY_MISSING when none exist', async () => {
    const access = new FakeExecutableAccess()
    access.add('C:\\Custom\\bash.exe')
    const resolver = resolverWith(access, {
      CUSTOM_SHELL: 'C:\\Custom\\bash.exe',
      SHELL: 'C:\\Custom\\bash.exe',
      PATH: 'C:\\Missing',
    })

    await expect(resolver.resolve()).rejects.toMatchObject({
      code: 'DEPENDENCY_MISSING',
      operation: 'terminal:resolve-shell',
    })
  })

  it('rejects non-Windows use without inventing another shell policy', async () => {
    const resolver = new WindowsShellResolver({
      platform: 'linux',
      environment: {},
      executableAccess: new FakeExecutableAccess(),
    })
    await expect(resolver.resolve()).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
})

describe('Phase 2E-D PTY environment policy', () => {
  it('removes undefined values and preserves effective Main Windows variables', () => {
    expect(createPtyEnvironment({
      PATH: 'C:\\Tools',
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      USERPROFILE: 'C:\\Users\\student',
      TEMP: undefined,
    })).toEqual({
      PATH: 'C:\\Tools',
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      USERPROFILE: 'C:\\Users\\student',
    })
  })
})

function resolverWith(
  executableAccess: ExecutableAccess,
  environment: NodeJS.ProcessEnv,
): WindowsShellResolver {
  return new WindowsShellResolver({
    executableAccess,
    environment,
    platform: 'win32',
  })
}

function windowsPowerShellPath(): string {
  return win32.join(
    'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
}

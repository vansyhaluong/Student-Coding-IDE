import { describe, expect, it } from 'vitest'
import { win32 } from 'node:path'
import { developmentEnvironment } from '../../scripts/development-environment.mjs'

describe('development launch environment', () => {
  const root = 'D:\\coding-ide'
  const sdk = win32.join(root, 'spikes', 'csharp-lsp-compatibility', '.dotnet')
  const tools = win32.join(root, 'spikes', 'csharp-lsp-compatibility', '.tools')

  it('prefers the complete Phase 5.5B private SDK/provider pair on Windows', () => {
    const environment = developmentEnvironment(root, {
      Path: 'C:\\Program Files\\dotnet;C:\\Windows',
      Dotnet_Root: 'C:\\old-sdk',
      KEEP: 'value',
    }, { platform: 'win32', exists: path => path === win32.join(sdk, 'dotnet.exe')
      || path === win32.join(tools, 'csharp-ls.exe') })

    expect(environment).toMatchObject({
      DOTNET_ROOT: sdk,
      PATH: `${sdk};${tools};C:\\Program Files\\dotnet;C:\\Windows`,
      KEEP: 'value',
    })
    expect(environment).not.toHaveProperty('Path')
    expect(environment).not.toHaveProperty('Dotnet_Root')
  })

  it('preserves the inherited environment when the validated pair is incomplete', () => {
    const inherited = { PATH: 'C:\\Program Files\\dotnet', DOTNET_ROOT: 'C:\\configured' }
    expect(developmentEnvironment(root, inherited, {
      platform: 'win32', exists: path => path.endsWith('dotnet.exe'),
    })).toEqual(inherited)
  })

  it('does not alter non-Windows development launches', () => {
    const inherited = { PATH: '/usr/bin', DOTNET_ROOT: '/opt/dotnet' }
    expect(developmentEnvironment('/repo', inherited, { platform: 'linux' })).toEqual(inherited)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { CsharpLsResolver, EXPECTED_CSHARP_LS_VERSION } from '../../src/main/services/dependencies/csharp-ls'
import { DotnetSdkDetector, parseDotnetSdkInventory } from '../../src/main/services/dependencies/dotnet-sdk'

describe('Phase 5.5C .NET SDK detection', () => {
  it('uses only safe absolute Main PATH entries and --list-sdks', async () => {
    const resolveFile = vi.fn(async (path: string) => path.includes('Program Files') ? path : null)
    const execute = vi.fn(async () => ({ exitCode: 0, stdout: '10.0.401 [C:\\Program Files\\dotnet\\sdk]\n' }))
    const detector = new DotnetSdkDetector({
      Path: ';.;relative;C:relative;\\tools;/tools;C:\\missing;C:\\Program Files\\dotnet',
    }, { resolveFile }, { execute })

    await expect(detector.detect()).resolves.toMatchObject({
      status: { state: 'AVAILABLE', reason: null, warnings: [] },
      runtime: { executable: 'C:\\Program Files\\dotnet\\dotnet.exe' },
    })
    expect(resolveFile.mock.calls.map(([path]) => path)).toEqual([
      'C:\\missing\\dotnet.exe', 'C:\\Program Files\\dotnet\\dotnet.exe',
    ])
    expect(execute).toHaveBeenCalledWith('C:\\Program Files\\dotnet\\dotnet.exe', ['--list-sdks'])
  })

  it('parses stable and prerelease SDK inventory without retaining install paths', () => {
    expect(parseDotnetSdkInventory([
      '8.0.410 [C:\\dotnet\\sdk]',
      '10.0.100-preview.7 [D:\\SDKs]',
      '10.0.401 [C:\\dotnet\\sdk]',
    ].join('\n'))).toEqual([
      { version: '8.0.410', major: 8, prerelease: false },
      { version: '10.0.100-preview.7', major: 10, prerelease: true },
      { version: '10.0.401', major: 10, prerelease: false },
    ])
    expect(parseDotnetSdkInventory('not an SDK line')).toBeNull()
  })

  it.each([
    ['', 'MISSING', 'DOTNET_SDK_MISSING', []],
    ['8.0.410 [C:\\dotnet\\sdk]\n9.0.314 [C:\\dotnet\\sdk]\n', 'INVALID_CONFIGURATION', 'DOTNET_SDK_TOO_OLD', []],
    ['10.0.100-preview.7 [C:\\dotnet\\sdk]\n', 'AVAILABLE', null, ['DOTNET_PRERELEASE_ONLY']],
    ['10.0.401 [C:\\dotnet\\sdk]\n', 'AVAILABLE', null, []],
  ])('classifies SDK inventory %s', async (stdout, state, reason, warnings) => {
    const detector = new DotnetSdkDetector({ PATH: 'C:\\dotnet' }, { resolveFile: async (path) => path }, {
      execute: async () => ({ exitCode: 0, stdout }),
    })
    const result = await detector.detect()
    expect(result.status).toEqual({ state, reason, warnings })
  })

  it('distinguishes a missing host from probe failures', async () => {
    await expect(new DotnetSdkDetector({ PATH: '.;relative' }, { resolveFile: async () => null }, {
      execute: async () => ({ exitCode: 0, stdout: '' }),
    }).detect()).resolves.toEqual({
      status: { state: 'MISSING', reason: 'DOTNET_HOST_MISSING', warnings: [] }, runtime: null,
    })
    for (const execute of [
      async () => ({ exitCode: 1, stdout: '' }),
      async (): Promise<never> => { throw new Error('private failure') },
      async () => ({ exitCode: 0, stdout: 'corrupt' }),
    ]) {
      const result = await new DotnetSdkDetector({ PATH: 'C:\\dotnet' }, { resolveFile: async (path) => path }, { execute }).detect()
      expect(result).toEqual({
        status: { state: 'INVALID_CONFIGURATION', reason: 'DOTNET_PROBE_FAILED', warnings: [] }, runtime: null,
      })
      expect(JSON.stringify(result)).not.toContain('private failure')
    }
  })
})

describe('Phase 5.5C csharp-ls resolution', () => {
  const privateProvider = 'D:\\coding-ide\\.tools\\csharp-ls.exe'
  const pathProvider = 'C:\\global-tools\\csharp-ls.exe'
  const versionOutput = `csharp-ls, ${EXPECTED_CSHARP_LS_VERSION} (Vartai)+d48ab7781176d2d369ceeb31d986503c2ad493e2`
  const matchingProbe = { execute: vi.fn(async () => ({ exitCode: 0, stdout: versionOutput })) }

  it('uses the development private provider before PATH', async () => {
    const resolveFile = vi.fn(async (path: string) => path)
    const result = await new CsharpLsResolver(
      { mode: 'development', privateExecutable: privateProvider },
      { PATH: 'C:\\global-tools' }, { resolveFile }, matchingProbe,
    ).detect()
    expect(result).toEqual({
      status: { state: 'AVAILABLE', reason: null, warnings: [] },
      provider: { executable: privateProvider, version: '0.27.0' },
    })
    expect(resolveFile).toHaveBeenCalledExactlyOnceWith(privateProvider)
  })

  it('allows development PATH fallback when the private candidate is absent', async () => {
    const resolveFile = vi.fn(async (path: string) => path === privateProvider ? null : path)
    const result = await new CsharpLsResolver(
      { mode: 'development', privateExecutable: privateProvider },
      { PATH: 'C:\\global-tools' }, { resolveFile }, matchingProbe,
    ).detect()
    expect(result).toMatchObject({ status: { state: 'AVAILABLE' }, provider: { executable: pathProvider } })
    expect(resolveFile.mock.calls.map(([path]) => path)).toEqual([privateProvider, pathProvider])
  })

  it('never falls back to PATH in packaged mode', async () => {
    matchingProbe.execute.mockClear()
    const resolveFile = vi.fn(async () => null)
    const result = await new CsharpLsResolver(
      { mode: 'packaged', privateExecutable: privateProvider },
      { PATH: 'C:\\global-tools' }, { resolveFile }, matchingProbe,
    ).detect()
    expect(result).toEqual({
      status: { state: 'MISSING', reason: 'CSHARP_LS_MISSING', warnings: [] }, provider: null,
    })
    expect(resolveFile).toHaveBeenCalledExactlyOnceWith(privateProvider)
    expect(matchingProbe.execute).not.toHaveBeenCalledWith(pathProvider, expect.anything())
  })

  it.each([
    ['csharp-ls, 0.26.0 (Vartai)+d48ab7781176d2d369ceeb31d986503c2ad493e2', 'CSHARP_LS_VERSION_MISMATCH'],
    ['corrupt output', 'CSHARP_LS_PROBE_FAILED'],
  ])('rejects provider version output %s', async (stdout, reason) => {
    const result = await new CsharpLsResolver(
      { mode: 'packaged', privateExecutable: privateProvider }, {},
      { resolveFile: async (path) => path }, { execute: async () => ({ exitCode: 0, stdout }) },
    ).detect()
    expect(result).toEqual({ status: { state: 'INVALID_CONFIGURATION', reason, warnings: [] }, provider: null })
  })

  it('rejects unsafe private paths, corrupt canonical results, and probe failure', async () => {
    const unsafe = await new CsharpLsResolver(
      { mode: 'packaged', privateExecutable: '.tools\\csharp-ls.exe' }, {},
      { resolveFile: async (path) => path }, matchingProbe,
    ).detect()
    expect(unsafe.status).toMatchObject({ state: 'INVALID_CONFIGURATION', reason: 'CSHARP_LS_INVALID' })

    const corrupt = await new CsharpLsResolver(
      { mode: 'packaged', privateExecutable: privateProvider }, {},
      { resolveFile: async () => 'C:\\Windows\\cmd.exe' }, matchingProbe,
    ).detect()
    expect(corrupt.status).toMatchObject({ state: 'INVALID_CONFIGURATION', reason: 'CSHARP_LS_INVALID' })

    const failed = await new CsharpLsResolver(
      { mode: 'packaged', privateExecutable: privateProvider }, {},
      { resolveFile: async (path) => path }, { execute: async () => ({ exitCode: 2, stdout: '' }) },
    ).detect()
    expect(failed.status).toMatchObject({ state: 'INVALID_CONFIGURATION', reason: 'CSHARP_LS_PROBE_FAILED' })
  })
})

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { join, resolve, win32 as path } from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { FilesystemCsharpSdkResolver, csharpSdkDiskAccess, type CsharpSdkFileSystem } from '../../src/main/services/learning/runtime/csharp-sdk-resolver'
import { SelectionFixCsharpSdkResolver } from '../../src/main/services/learning/smart-hints/selection-fix-sdk-resolver'
import { MainSelectionFixGuard } from '../../src/main/services/learning/smart-hints/selection-fix-parser-runtime'
import { FIX_PARSER_SDK, FIX_PARSER_RUNTIME } from '../../src/main/services/learning/smart-hints/selection-fix-protocol'
import { request, capture, fixAction } from '../fixtures/learning/smart-hints'

vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn(actual.spawn) }
})
const system = join(process.env.ProgramFiles ?? 'C:/Program Files', 'dotnet')
const spike = resolve('spikes/csharp-lsp-compatibility/.dotnet'), assets = resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/main/smart-hints-parser')
const environment = { ...process.env, DOTNET_ROOT: spike, PATH: `${spike};${process.env.PATH ?? ''}` }
const context = () => ({ signal: new AbortController().signal, deadline: performance.now() + 30000 })
const scope = () => ({ signal: new AbortController().signal, deadline: Date.now() + 30000, clock: Date.now, check() {} })
const name = (file: string) => path.basename(file).toLowerCase()
const files = (patch: Partial<CsharpSdkFileSystem>): CsharpSdkFileSystem => ({ ...csharpSdkDiskAccess, ...patch })
afterEach(() => { vi.mocked(spawn).mockClear() })

describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('Suggest Fix G0 candidate selection with real installed SDKs (read-only)', () => {
  beforeAll(async () => {
    // Missing host prerequisites must fail this acceptance, never silently pass.
    expect((await readFile(join(spike, 'sdk/10.0.401/.version'), 'utf8')).split(/\r?\n/)[1]).toBe('10.0.401')
    const result = await new SelectionFixCsharpSdkResolver({ roots: [system] }).resolve(context())
    expect(result).toMatchObject({ state: 'AVAILABLE', selection: { sdkVersion: FIX_PARSER_SDK, runtimeVersion: FIX_PARSER_RUNTIME } })
  }, 30000)

  it('dev discovery sees both roots: Fix chooses 112 while unmodified Learning policy chooses 401', async () => {
    const selected = await new SelectionFixCsharpSdkResolver({ environment }).resolve(context())
    expect(selected).toMatchObject({ state: 'AVAILABLE', selection: { sdkVersion: '10.0.112', runtimeVersion: '10.0.12',
      dotnetPath: join(system, 'dotnet.exe'), referenceDirectory: join(system, 'packs/Microsoft.NETCore.App.Ref/10.0.12/ref/net10.0') } })
    const learning = await new FilesystemCsharpSdkResolver({ environment }).resolve(context())
    expect(learning).toMatchObject({ state: 'AVAILABLE', selection: { sdkVersion: '10.0.401', dotnetPath: join(spike, 'dotnet.exe') } })
  }, 30000)
  it('preview with only the system root is available and does not change process environment', async () => {
    const before = { ...process.env }
    expect(await new SelectionFixCsharpSdkResolver({ roots: [system] }).resolve(context())).toMatchObject({ state: 'AVAILABLE', selection: { sdkVersion: '10.0.112' } })
    expect(process.env).toEqual(before)
  }, 15000)
  it('only 401 is unavailable; no unapproved fallback and no helper spawn', async () => {
    const sdkResolver = new SelectionFixCsharpSdkResolver({ roots: [spike] })
    expect((await sdkResolver.resolve(context())).state).not.toBe('AVAILABLE')
    expect(await new MainSelectionFixGuard({ assetDirectory: assets, sdkResolver }).availability('csharp', scope())).toBe(false)
    expect(spawn).not.toHaveBeenCalled()
  }, 15000)
  it.each(['runtime', 'reference-pack', 'hostfxr'])('missing approved %s fails even when a newer version is offered by discovery', async fault => {
    const io = files({ readdir: async directory => {
      const entries = await csharpSdkDiskAccess.readdir(directory)
      const target = fault === 'runtime' ? 'microsoft.netcore.app' : fault === 'reference-pack' ? 'microsoft.netcore.app.ref' : 'fxr'
      return name(directory) === target ? [...entries.filter(e => e !== '10.0.12'), '10.0.13'] : entries
    } })
    const sdkResolver = new SelectionFixCsharpSdkResolver({ roots: [system, spike], files: io })
    expect((await sdkResolver.resolve(context())).state).not.toBe('AVAILABLE')
    expect(await new MainSelectionFixGuard({ assetDirectory: assets, sdkResolver }).availability('csharp', scope())).toBe(false)
    expect(spawn).not.toHaveBeenCalled()
  }, 20000)
  it.each(['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll', 'System.Private.CoreLib.dll'])('missing %s fails closed before helper', async missing => {
    const io = files({ readFile: async (file, expected) => {
      if (name(file) === missing.toLowerCase()) throw Object.assign(new Error('Synthetic missing asset'), { code: 'ENOENT' })
      return csharpSdkDiskAccess.readFile(file, expected)
    } })
    const sdkResolver = new SelectionFixCsharpSdkResolver({ roots: [system, spike], files: io })
    expect(await new MainSelectionFixGuard({ assetDirectory: assets, sdkResolver }).availability('csharp', scope())).toBe(false)
    expect(spawn).not.toHaveBeenCalled()
  }, 20000)
  it.each(['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll'])('incompatible/corrupt %s fails existing PE/closure validation', async bad => {
    const io = files({ readFile: async (file, expected) => name(file) === bad.toLowerCase()
      ? Buffer.alloc(expected.size) : csharpSdkDiskAccess.readFile(file, expected) })
    expect((await new SelectionFixCsharpSdkResolver({ roots: [system, spike], files: io }).resolve(context())).state).not.toBe('AVAILABLE')
  }, 15000)
  it('retains canonical path/symlink rejection in the same installation validator', async () => {
    const io = files({ realpath: async file => name(file) === 'dotnet.exe' ? join(path.dirname(file), 'redirected.exe') : csharpSdkDiskAccess.realpath(file) })
    expect((await new SelectionFixCsharpSdkResolver({ roots: [system], files: io }).resolve(context())).state).not.toBe('AVAILABLE')
  })
  it('real helper uses the selected absolute host/runtime/Roslyn with a poisoned parent DOTNET_ROOT and PATH', async () => {
    vi.stubEnv('DOTNET_ROOT', spike); vi.stubEnv('PATH', `${spike};${process.env.PATH ?? ''}`)
    try {
      const runtime = new MainSelectionFixGuard({ assetDirectory: assets })
      expect(await runtime.availability('csharp', scope())).toBe(true)
      const source = 'public class Solution { public int Sum(int a, int b) { return a; } }', at = source.indexOf('return a;')
      const c = capture(request({ source, language: 'csharp', action: fixAction(source, at, at + 9) }))
      c.signature = { functionName: 'Sum', parameters: [{ name: 'a', type: 'int32' }, { name: 'b', type: 'int32' }], returnType: 'int32' }
      const lease = await runtime.preflight(c, scope())
      try { await lease.verify(source.replace('return a;', 'return a + b;'), scope()) } finally { await lease.dispose() }
      expect(spawn).toHaveBeenCalledTimes(3)
      for (const [host, args, options] of vi.mocked(spawn).mock.calls) {
        expect(host).toBe(join(system, 'dotnet.exe'))
        expect(args).toEqual(['exec', '--fx-version', '10.0.12', '--roll-forward', 'Disable', join(assets, 'SelectionFixGuard.dll'), join(system, 'sdk/10.0.112/Roslyn/bincore')])
        expect(options).toMatchObject({ shell: false, windowsHide: true })
        expect(options?.env).not.toHaveProperty('DOTNET_ROOT'); expect(options?.env).not.toHaveProperty('PATH')
      }
    } finally { vi.unstubAllEnvs() }
  }, 30000)
  it('cancelled discovery cannot return a candidate', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(new SelectionFixCsharpSdkResolver().resolve({ ...context(), signal: controller.signal })).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
  })
})

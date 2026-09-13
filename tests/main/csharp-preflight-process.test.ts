import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsharpPreflightProcess, type PreflightBinding } from '../../src/main/services/language/csharp-preflight-process'
import type { DotnetDetection } from '../../src/main/services/dependencies/dotnet-sdk'

afterEach(() => vi.useRealTimers())
function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function fixture() {
  const spawned = deferred()
  let emit!: Parameters<PreflightBinding['createCsharpPreflight']>[4]
  let released = false, failRelease = false, running = true
  const controls: string[] = []
  const sdk = { detect: vi.fn(async (): Promise<DotnetDetection> => ({ status: { state: 'AVAILABLE', reason: null, warnings: [] },
    runtime: { executable: 'C:/dotnet/dotnet.exe', sdks: [{ version: '10.0.401', major: 10, prerelease: false }] } })) }
  const binding: PreflightBinding = {
    capability: 'student-ide-piped-job-v1',
    createCsharpPreflight: vi.fn((_exe, _args, _cwd, _env, observe) => { emit = observe; spawned.resolve(); return {} }),
    control: vi.fn((_handle, operation) => {
      controls.push(operation)
      if (operation === 'pid') return 42
      if (operation === 'count') return running ? 1 : 0
      if (operation === 'release') { if (failRelease) throw Error('owned'); released = true }
      if (operation === 'terminate' && running) {
        running = false
        queueMicrotask(() => {
          emit({ type: 'exit', exitCode: 0 }); emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' }); emit({ type: 'settled' })
        })
      }
      return undefined
    }),
  }
  const runner = new CsharpPreflightProcess(sdk, () => binding, {})
  return { runner, sdk, binding, spawned, controls, emit: (event: Parameters<typeof emit>[0]) => emit(event),
    released: () => released, setFailRelease: (value: boolean) => { failRelease = value } }
}
describe('Main-owned C# preflight process', () => {
  it('uses detected dotnet, preserves stdout/exit status, drains and releases only an empty owned Job', async () => {
    const f = fixture()
    const result = f.runner.execute(['--version'], 'C:/trusted', new AbortController().signal)
    await f.spawned.promise
    f.emit({ type: 'stdout', data: Buffer.from('10.0.401') }); f.emit({ type: 'exit', exitCode: 0 })
    expect(await result).toEqual({ exitCode: 0, stdout: '10.0.401' })
    expect(f.binding.createCsharpPreflight).toHaveBeenCalledWith('C:/dotnet/dotnet.exe', ['--version'], 'C:/trusted', [], expect.any(Function))
    expect(f.controls.indexOf('terminate')).toBeLessThan(f.controls.indexOf('release'))
    expect(f.controls.indexOf('count')).toBeLessThan(f.controls.indexOf('release'))
    expect(f.released()).toBe(true)
    await f.runner.stop()
  })
  it.each([['build'], ['restore'], ['msbuild', 'App.csproj', '-target:Build'], ['sln', 'App.csproj', 'list']])(
    'rejects non-preflight commands: %j', async (...args) => {
      const f = fixture()
      await expect(f.runner.execute(args, 'C:/trusted', new AbortController().signal)).rejects.toMatchObject({ reason: 'invalid-context' })
      expect(f.binding.createCsharpPreflight).not.toHaveBeenCalled()
    })
  it('cancels and cleans up pending commands without passing partial output', async () => {
    const f = fixture(), abort = new AbortController()
    const result = f.runner.execute(['--version'], 'C:/trusted', abort.signal)
    await f.spawned.promise
    abort.abort()
    await expect(result).rejects.toMatchObject({ reason: 'cancelled' })
    expect(f.released()).toBe(true)
  })
  it('enforces the existing finite deadline and cleans the owned Job', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const result = f.runner.execute(['--version'], 'C:/trusted', new AbortController().signal)
    const rejected = expect(result).rejects.toMatchObject({ reason: 'timeout' })
    await f.spawned.promise
    await vi.advanceTimersByTimeAsync(20_000)
    await rejected
    expect(f.released()).toBe(true)
  })
  it('retains failed cleanup and blocks another command until explicit cleanup succeeds', async () => {
    const f = fixture()
    f.setFailRelease(true)
    const result = f.runner.execute(['--version'], 'C:/trusted', new AbortController().signal)
    await f.spawned.promise
    f.emit({ type: 'exit', exitCode: 0 })
    await expect(result).rejects.toMatchObject({ reason: 'cleanup-failed' })
    expect(f.released()).toBe(false)
    await expect(f.runner.execute(['--version'], 'C:/trusted', new AbortController().signal)).rejects.toMatchObject({ reason: 'busy' })
    f.setFailRelease(false)
    await f.runner.stop()
    expect(f.released()).toBe(true)
  })
  it('invalidates an in-flight SDK probe on stop before a native process can be created', async () => {
    const f = fixture(), detection = deferred<DotnetDetection>()
    f.sdk.detect.mockReturnValue(detection.promise)
    const result = f.runner.execute(['--version'], 'C:/trusted', new AbortController().signal)
    await f.runner.stop()
    detection.resolve({ status: { state: 'MISSING', reason: 'DOTNET_HOST_MISSING', warnings: [] }, runtime: null })
    await expect(result).rejects.toMatchObject({ reason: 'stale-session' })
    expect(f.binding.createCsharpPreflight).not.toHaveBeenCalled()
  })
})

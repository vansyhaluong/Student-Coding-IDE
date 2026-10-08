import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectId } from '../../src/shared/contracts'
import { DotnetRunRuntimeResolver, parseRunSdkInventory, parseRunSdkVersion, validRunGlobalJson } from '../../src/main/services/dependencies/dotnet-run-runtime'
import { DotnetSdkDetector } from '../../src/main/services/dependencies/dotnet-sdk'
import { CsharpRunPreflight, parseRunEvaluation } from '../../src/main/services/run/csharp-run-preflight'
import { CsharpRunProbe, RUN_EVALUATION_PROPERTIES, RUN_PROBE_LIMITS, RunProbeError,
  type RunProbeCommand, type RunSdkProbe } from '../../src/main/services/run/csharp-run-probe'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import type { PipedProcessEvent, PipedRunProcess } from '../../src/main/services/run/piped-process-adapter'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const target = { projectId, relativePath: 'Việt # app/App.csproj', canonicalRoot: 'C:\\work', canonicalFile: 'C:\\work\\Việt # app\\App.csproj' }
const request = { kind: 'csharp-project' as const, projectId, relativePath: target.relativePath }
const inventory = '8.0.410 [C:\\dotnet\\sdk]\n10.0.112 [C:\\dotnet\\sdk]\n'
const signal = () => new AbortController().signal
function json(properties: Record<string, string> = {}, references: unknown[] = []) {
  return JSON.stringify({ Properties: { ...Object.fromEntries(RUN_EVALUATION_PROPERTIES.map(key => [key, ''])),
    OutputType: 'Exe', TargetFramework: 'net8.0', UsingMicrosoftNETSdk: 'true', ...properties },
  Items: { ProjectReference: references } })
}
function fixture() {
  const execute = vi.fn<RunSdkProbe['execute']>(async (_exe, command) => ({ exitCode: 0, stderr: '',
    stdout: command.kind === 'inventory' ? inventory : command.kind === 'version' ? '8.0.410\r\n' : json() }))
  const files = { resolveFile: vi.fn(async (path: string): Promise<string | null> => path) }
  const globalJson = vi.fn(async (): Promise<'valid-or-absent' | 'invalid'> => 'valid-or-absent')
  const resolver = new DotnetRunRuntimeResolver({ execute }, { PATH: 'C:\\dotnet' }, files, globalJson)
  const authorizeRunFile = vi.fn(async () => ({ canonicalRoot: target.canonicalRoot, canonicalFile: target.canonicalFile }))
  const preflight = new CsharpRunPreflight({ authorizeRunFile }, resolver, { execute })
  return { execute, files, resolver, authorizeRunFile, preflight, globalJson }
}
afterEach(() => vi.useRealTimers())

describe('Run SDK resolution (mocked boundaries; CLI semantics also have real smoke)', () => {
  it('accepts SDK 8 selected in candidate cwd while language policy still requires SDK 10', async () => {
    const f = fixture()
    const result = await f.resolver.resolve(target, signal())
    expect(result).toMatchObject({ ok: true, runtime: { executable: 'C:\\dotnet\\dotnet.exe',
      cwd: 'C:\\work\\Việt # app', effectiveSdk: { version: '8.0.410' } } })
    expect(f.execute.mock.calls.map(call => [call[1].kind, call[2]])).toEqual([
      ['inventory', 'C:\\work\\Việt # app'], ['version', 'C:\\work\\Việt # app']])
    const language = new DotnetSdkDetector({ PATH: 'C:\\dotnet' }, f.files,
      { execute: async () => ({ exitCode: 0, stdout: '8.0.410 [C:\\dotnet\\sdk]' }) })
    expect(await language.detect()).toMatchObject({ status: { reason: 'DOTNET_SDK_TOO_OLD' }, runtime: null })
  })
  it('does not cache SDK selection across candidate directories or choose the largest inventory entry', async () => {
    const f = fixture()
    f.execute.mockImplementation(async (_exe, command, cwd) => ({ exitCode: 0, stderr: '',
      stdout: command.kind === 'inventory' ? inventory : cwd.endsWith('other') ? '10.0.112' : '8.0.410' }))
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ runtime: { effectiveSdk: { version: '8.0.410' } } })
    expect(await f.resolver.resolve({ ...target, canonicalFile: 'C:\\work\\other\\App.csproj' }, signal()))
      .toMatchObject({ runtime: { effectiveSdk: { version: '10.0.112' } } })
  })
  it('reports missing executable without invoking a process', async () => {
    const f = fixture()
    f.files.resolveFile.mockResolvedValue(null)
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ ok: false, dependency: { reason: 'DOTNET_HOST_MISSING' } })
    expect(f.execute).not.toHaveBeenCalled()
  })
  it.each([
    ['', 145, '', 'SDK_MISSING'], [inventory, 145, '', 'SDK_RESOLUTION_FAILED'],
    [inventory, 0, 'malformed global configuration', 'SDK_CONFIGURATION_INVALID'],
  ])('classifies CLI selection failure without parsing localized prose', async (list, code, stderr, detail) => {
    const f = fixture()
    f.execute.mockImplementation(async (_exe, command) => command.kind === 'inventory'
      ? { exitCode: 0, stdout: list, stderr: '' } : { exitCode: code, stdout: '10.0.112', stderr })
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ ok: false, detail })
  })
  it.each(['7.0.400', '10.0.100-preview.1'])('rejects unsupported effective SDK %s', async version => {
    const f = fixture()
    f.execute.mockResolvedValueOnce({ exitCode: 0, stdout: inventory, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: version, stderr: '' })
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ detail: 'UNSUPPORTED_SDK' })
  })
  it.each(['', '8.0.410\n10.0.112', '8.0.410\0', '999999999999999999.0.1', 'not a version'])('rejects version output %j', async stdout => {
    const f = fixture()
    f.execute.mockResolvedValueOnce({ exitCode: 0, stdout: inventory, stderr: '' }).mockResolvedValueOnce({ exitCode: 0, stdout, stderr: '' })
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ detail: 'INVALID_OUTPUT' })
  })
  it.each(['8.0.410 [relative]', 'broken', '8.0.410 [C:\\sdk]\0', 'x'.repeat(65537),
    ('8.0.410 [C:\\sdk]\n').repeat(257)])('bounds inventory and validates its format', stdout => {
    expect(parseRunSdkInventory(stdout)).toBeNull()
  })
  it('preserves numeric major, prerelease facts and discards inventory paths', () => {
    expect(parseRunSdkVersion('10.0.112')).toEqual({ version: '10.0.112', major: 10, prerelease: false })
    expect(parseRunSdkInventory(inventory)?.map(item => item.version)).toEqual(['8.0.410', '10.0.112'])
  })
  it('reports invalid global.json distinctly even when the CLI returns a version', async () => {
    const f = fixture(); f.globalJson.mockResolvedValue('invalid')
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ detail: 'INVALID_GLOBAL_JSON',
      dependency: { reason: 'SDK_SELECTION_FAILED' } })
  })
  it.each(['{invalid', '{"sdk":', 'null', '[]', '{/* unterminated', '{"x":"a\0b"}'])('rejects malformed global JSON syntax %j', value => {
    expect(validRunGlobalJson(value)).toBe(false)
  })
  it('accepts comments without interpreting version or roll-forward rules; rejects trailing commas', () => {
    expect(validRunGlobalJson('{/* comment */ "sdk": { "version": "8.0.410" }, // comment\n "url":"https://example/a/*b*/"}')).toBe(true)
    expect(validRunGlobalJson('{"sdk":{"version":"8.0.410",},}')).toBe(false)
    expect(validRunGlobalJson('{"sdk":{"rollForward":"latestFeature","version":"8.0.100"}}')).toBe(true)
  })
  it.each([{ version: '8.0' }, { version: 8 }, { allowPrerelease: 'false' }, { rollForward: 'unknown' },
    { paths: 'C:\\sdk' }, { paths: [null] }])('rejects SDK fields that the host might silently ignore: %j', sdk => {
    expect(validRunGlobalJson(JSON.stringify({ sdk }))).toBe(false)
  })
  it('maps probe exceptions and cancellation to bounded structured failures', async () => {
    const f = fixture()
    f.execute.mockRejectedValue(new Error('secret stderr'))
    expect(await f.resolver.resolve(target, signal())).toMatchObject({ detail: 'PROBE_FAILED' })
    const abort = new AbortController(); abort.abort()
    expect(await f.resolver.resolve(target, abort.signal)).toMatchObject({ detail: 'CANCELLED' })
    expect(f.execute).toHaveBeenCalledTimes(1)
  })
})

describe('one-candidate structured evaluation', () => {
  it.each(['Exe', 'Library', 'WinExe'])('returns facts without classifying %s', async OutputType => {
    const f = fixture()
    f.execute.mockImplementation(async (_exe, command) => ({ exitCode: 0, stderr: '', stdout:
      command.kind === 'inventory' ? inventory : command.kind === 'version' ? '8.0.410'
        : json({ OutputType, TargetFrameworks: 'net8.0;net10.0', TargetFramework: '' }, [{ Identity: '..\\Library\\Library.csproj' }]) }))
    expect(await f.preflight.evaluate(request, signal())).toMatchObject({ ok: true, evaluation: {
      target, properties: { OutputType, TargetFramework: '', TargetFrameworks: 'net8.0;net10.0' },
      projectReferences: ['..\\Library\\Library.csproj'] } })
    expect(f.authorizeRunFile).toHaveBeenCalledTimes(2)
    expect(f.execute.mock.calls[2].slice(0, 3)).toEqual(['C:\\dotnet\\dotnet.exe',
      { kind: 'evaluate', project: target.canonicalFile }, 'C:\\work\\Việt # app'])
  })
  it.each(['../App.csproj', 'C:/App.csproj', 'App.cs', 'a\0.csproj'])('rejects invalid relative project %j before authorization', async relativePath => {
    const f = fixture()
    expect(await f.preflight.evaluate({ ...request, relativePath }, signal())).toMatchObject({ detail: 'INVALID_PROJECT_PATH' })
    expect(f.authorizeRunFile).not.toHaveBeenCalled()
  })
  it('rejects missing files and canonical escapes before launching', async () => {
    const f = fixture()
    f.authorizeRunFile.mockRejectedValueOnce(Error('missing'))
    expect(await f.preflight.evaluate(request, signal())).toMatchObject({ detail: 'INVALID_PROJECT_PATH' })
    f.authorizeRunFile.mockResolvedValue({ canonicalRoot: target.canonicalRoot, canonicalFile: 'C:\\outside\\App.csproj' })
    expect(await f.preflight.evaluate(request, signal())).toMatchObject({ detail: 'INVALID_PROJECT_PATH' })
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('rechecks canonical identity after SDK resolution', async () => {
    const f = fixture()
    f.authorizeRunFile.mockResolvedValueOnce(target).mockResolvedValueOnce({ ...target, canonicalFile: 'C:\\work\\changed.csproj' })
    expect(await f.preflight.evaluate(request, signal())).toMatchObject({ detail: 'PROJECT_CHANGED' })
    expect(f.execute).toHaveBeenCalledTimes(2)
  })
  it('returns nonzero evaluation without exposing stderr', async () => {
    const f = fixture()
    f.execute.mockResolvedValueOnce({ exitCode: 0, stdout: inventory, stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '8.0.410', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: 'private', stderr: 'secret' })
    expect(await f.preflight.evaluate(request, signal())).toEqual({ ok: false, reason: 'PREFLIGHT_FAILED', detail: 'EVALUATION_FAILED', exitCode: 1 })
  })
  it.each(['broken', '{}', '[]', json({ OutputType: 'x\0' }), json({}, [{ Identity: '' }]),
    json({}, Array.from({ length: 65 }, () => ({ Identity: 'Library.csproj' }))), 'x'.repeat(1024 * 1024 + 1)])(
    'rejects malformed or unbounded JSON', stdout => { expect(parseRunEvaluation(stdout)).toBeNull() })
  it('requires every requested property but preserves empty evaluation-only fields', () => {
    const value = JSON.parse(json()); delete value.Properties.TargetFramework
    expect(parseRunEvaluation(JSON.stringify(value))).toBeNull()
    expect(parseRunEvaluation(json())?.properties.TargetFrameworkIdentifier).toBe('')
  })
})

function processFixture() {
  const manager = new ProcessManager()
  let emit!: (event: PipedProcessEvent) => void
  let released = false, releaseFails = false
  let tail = ''
  const child: PipedRunProcess = { ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 42 }, settled: Promise.resolve(),
    isReleased: () => released, close: vi.fn(async () => {
      if (releaseFails) throw Error('retained')
      if (tail) emit({ type: 'stdout', data: tail })
      released = true
    }) }
  const create = vi.fn((_run, observe) => { emit = observe; released = false; return child })
  const probe = new CsharpRunProbe(manager, 'run-evaluation:owner', () => ({ create }))
  const start = (command: RunProbeCommand = { kind: 'version' }, abort = signal()) =>
    probe.execute('C:\\dotnet\\dotnet.exe', command, 'C:\\work', abort)
  return { manager, child, create, probe, start, emit: (event: PipedProcessEvent) => emit(event),
    failRelease: (value: boolean) => { releaseFails = value }, tail: (value: string) => { tail = value } }
}
describe('bounded Run-owned process probes', () => {
  it('uses fixed argv, no shell/environment additions, and preserves output drained after root exit', async () => {
    const f = processFixture(), pending = f.start({ kind: 'evaluate', project: 'C:\\work\\App.csproj' })
    f.emit({ type: 'stdout', data: 'first' }); f.tail('tail'); f.emit({ type: 'exit', exitCode: 0 })
    expect(await pending).toEqual({ exitCode: 0, stdout: 'firsttail', stderr: '' })
    expect(f.create.mock.calls[0][0]).toMatchObject({ shell: false, environmentAdditions: {},
      args: ['msbuild', 'C:\\work\\App.csproj', '-nologo', '-verbosity:quiet', '-interactive:false',
        '-nodeReuse:false', '-noAutoResponse', '-property:Configuration=Debug',
        `-getProperty:${RUN_EVALUATION_PROPERTIES.join(',')}`, '-getItem:ProjectReference'] })
    expect(f.manager.size).toBe(0); expect(f.child.isReleased()).toBe(true)
  })
  it.each(['stdout', 'stderr'] as const)('bounds %s and cleans before returning', async type => {
    const f = processFixture(), pending = f.start()
    f.emit({ type, data: 'x'.repeat(RUN_PROBE_LIMITS.outputBytes + 1) })
    await expect(pending).rejects.toMatchObject({ reason: 'OUTPUT_LIMIT' })
    expect(f.manager.size).toBe(0)
  })
  it('cancels from AbortSignal and owner cleanup', async () => {
    const f = processFixture(), abort = new AbortController(), pending = f.start({ kind: 'version' }, abort.signal)
    abort.abort(); await expect(pending).rejects.toMatchObject({ reason: 'CANCELLED' })
    const other = f.start(); const assertion = expect(other).rejects.toMatchObject({ reason: 'CANCELLED' })
    await f.manager.cleanupOwner('run-evaluation:owner'); await assertion
    expect(f.manager.size).toBe(0)
  })
  it('times out and releases resources', async () => {
    vi.useFakeTimers()
    const f = processFixture(), pending = f.start()
    const assertion = expect(pending).rejects.toMatchObject({ reason: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(20_000); await assertion
    expect(f.manager.size).toBe(0)
  })
  it('retains ownership on failed cleanup, blocks launches and permits explicit retry', async () => {
    const f = processFixture(); f.failRelease(true)
    const pending = f.start(); f.emit({ type: 'exit', exitCode: 1 })
    await expect(pending).rejects.toMatchObject({ reason: 'CLEANUP_FAILED' })
    expect(f.manager.size).toBe(1)
    await expect(f.start()).rejects.toMatchObject({ reason: 'BUSY' })
    f.failRelease(false); await f.probe.stop(); expect(f.manager.size).toBe(0)
  })
  it('cleans spawn/observation failure and repeated nonzero exits', async () => {
    const f = processFixture()
    f.create.mockImplementationOnce(() => { throw Error('private') })
    await expect(f.start()).rejects.toBeInstanceOf(RunProbeError)
    for (let i = 0; i < 12; ++i) {
      const pending = f.start(); f.emit({ type: 'exit', exitCode: 1 })
      expect((await pending).exitCode).toBe(1); expect(f.manager.size).toBe(0)
    }
    const pending = f.start(); f.emit({ type: 'error', message: 'private native error' })
    await expect(pending).rejects.toMatchObject({ reason: 'OBSERVATION_FAILED' })
    expect(f.manager.size).toBe(0)
  })
  it('rejects an evaluation project outside its fixed cwd', async () => {
    const f = processFixture()
    await expect(f.start({ kind: 'evaluate', project: 'C:\\other\\App.csproj' })).rejects.toMatchObject({ reason: 'INVALID_CONTEXT' })
    expect(f.create).not.toHaveBeenCalled()
  })
})

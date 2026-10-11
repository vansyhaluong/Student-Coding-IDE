import { afterEach, describe, expect, it, vi } from 'vitest'
import process from 'node:process'
import { mkdtemp, mkdir, writeFile, rm, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, win32 } from 'node:path'
import type { FileEntry } from '../../src/shared/contracts'
import { validateCSharpRunTargetResolution } from '../../src/shared/contracts/run'
import { ProjectService } from '../../src/main/services/project/project-service'
import { FileSystemService } from '../../src/main/services/filesystem/filesystem-service'
import { DotnetRunRuntimeResolver } from '../../src/main/services/dependencies/dotnet-run-runtime'
import { CsharpRunPreflight, type EvaluatedRunProperties } from '../../src/main/services/run/csharp-run-preflight'
import { RUN_EVALUATION_PROPERTIES, RunProbeError, type RunSdkProbe } from '../../src/main/services/run/csharp-run-probe'
import { CsharpRunTargetResolver, CSHARP_RUN_DISCOVERY_LIMITS } from '../../src/main/services/run/csharp-run-target-resolver'

const cleanups: Array<() => Promise<unknown> | void> = []
// These production integration tests require Windows canonical paths and a real
// Windows filesystem. CI runs them in the dedicated Windows job.
const describeWindows = describe.skipIf(process.platform !== 'win32')
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const properties = (overrides: Partial<EvaluatedRunProperties> = {}): EvaluatedRunProperties => ({
  ...Object.fromEntries(RUN_EVALUATION_PROPERTIES.map(p => [p, ''])), OutputType: 'Exe', TargetFramework: 'net8.0',
  TargetFrameworks: '', UsingMicrosoftNETSdk: 'true', UsingMicrosoftNETSdkWeb: '', UseWPF: '', UseWindowsForms: '',
  IsTestProject: '', TargetFrameworkIdentifier: '.NETCoreApp', TargetFrameworkVersion: 'v8.0', ...overrides,
})
async function fixture(paths: string[], facts: Record<string, Partial<EvaluatedRunProperties>> = {}, refs: Record<string, string[]> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'run-targets-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  for (const path of paths) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), '') }
  const projects = new ProjectService(), project = await projects.openRoot(root)
  const files = new FileSystemService(projects, { watchFactory: () => ({ close() {} }), trashItem: async () => {} })
  files.start(); cleanups.push(() => { files.stop(); return projects.stop() })
  const execute = vi.fn<RunSdkProbe['execute']>(async (_exe, command) => {
    const path = command.kind === 'evaluate' ? win32.relative(root, command.project).replaceAll('\\', '/') : ''
    return { exitCode: 0, stderr: '', stdout: command.kind === 'inventory' ? '8.0.410 [C:\\dotnet\\sdk]\n10.0.112 [C:\\dotnet\\sdk]'
      : command.kind === 'version' ? '10.0.112' : JSON.stringify({ Properties: properties(facts[path]),
        Items: { ProjectReference: (refs[path] ?? []).map(Identity => ({ Identity })) } }) }
  })
  const runtime = new DotnetRunRuntimeResolver({ execute }, { PATH: 'C:\\dotnet' },
    { resolveFile: async path => path }, async () => 'valid-or-absent')
  const preflight = new CsharpRunPreflight(files, runtime, { execute })
  const resolver = new CsharpRunTargetResolver(projects, files, preflight)
  const resolve = async (signal = new AbortController().signal) => {
    const result = await resolver.resolve(project.id, signal)
    expect(validateCSharpRunTargetResolution(result.resolution).ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain(root)
    return result
  }
  return { root, projects, project, files, execute, preflight, resolver, resolve }
}

describeWindows('bounded Main C# Run discovery (real filesystem, production M1-05 evaluator, mocked process)', () => {
  it.each(['App.csproj', 'src/App/App.csproj', 'src/Ứng dụng # 😀/Console App.csproj'])('resolves one Console: %s', async path => {
    const f = await fixture([path])
    expect((await f.resolve()).resolution).toMatchObject({ state: 'READY', target: { kind: 'csharp-project', relativePath: path } })
    expect(f.execute.mock.calls.map(([, command]) => command.kind)).toEqual(['inventory', 'version', 'evaluate'])
  })
  it('returns no runnable project with no projects, regardless of solution/editor-looking files', async () => {
    const f = await fixture(['App.sln', 'Other.slnx', 'Program.cs'])
    expect((await f.resolve()).resolution).toMatchObject({ state: 'NO_RUNNABLE_PROJECT', candidates: [] })
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('does not use solution membership, active source proximity or LSP target to choose among Consoles', async () => {
    const f = await fixture(['z/Z.csproj', 'a/A.csproj', 'Workspace.sln', 'Other.slnx', 'z/Program.cs'])
    await writeFile(join(f.root, 'Other.slnx'), '<Solution><Project Path="z/Z.csproj" /></Solution>')
    const result = await f.resolve()
    expect(result.resolution).toMatchObject({ state: 'SELECTION_REQUIRED' })
    expect(result.resolution).not.toHaveProperty('target')
    expect(result.assessments.map(a => a.candidate.relativePath)).toEqual(['a/A.csproj', 'z/Z.csproj'])
  })
  it('uses documented exclusions case-insensitively without excluding tests or src', async () => {
    const f = await fixture(['.git/X.csproj', 'NODE_MODULES/X.csproj', 'bin/X.csproj', 'OBJ/X.csproj',
      'dist/X.csproj', 'build/X.csproj', 'out/X.csproj', 'tests/Test.csproj', 'src/App.csproj'], { 'tests/Test.csproj': { IsTestProject: 'true' } })
    expect((await f.resolve()).assessments.map(a => a.candidate.relativePath)).toEqual(['src/App.csproj', 'tests/Test.csproj'])
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(2)
  })
  it('deduplicates canonical/case aliases and keeps stable order despite reversed enumeration', async () => {
    const f = await fixture(['App.csproj', 'Z.csproj'])
    const list = f.files.listDirectory.bind(f.files)
    vi.spyOn(f.files, 'listDirectory').mockImplementation(async (id, path) => [...await list(id, path),
      { name: 'app.csproj', relativePath: 'app.csproj', kind: 'file', isSymbolicLink: false }].reverse() as FileEntry[])
    const first = await f.resolve(), second = await f.resolve()
    expect(first).toEqual(second)
    expect(first.assessments.map(a => a.candidate.relativePath)).toEqual(['App.csproj', 'Z.csproj'])
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(4)
  })
  it('excludes junctions including outside-root and cyclic links', async () => {
    const f = await fixture(['App.csproj', 'nested/B.csproj'])
    const outside = await mkdtemp(join(tmpdir(), 'run-targets-outside-'))
    cleanups.push(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'External.csproj'), '')
    await symlink(outside, join(f.root, 'external'), 'junction')
    await symlink(f.root, join(f.root, 'nested', 'cycle'), 'junction')
    expect((await f.resolve()).assessments.map(a => a.candidate.relativePath)).toEqual(['App.csproj', 'nested/B.csproj'])
  })
  it('fails closed when a directory becomes an outside junction after listing', async () => {
    const f = await fixture(['src/App.csproj'])
    const outside = await mkdtemp(join(tmpdir(), 'run-targets-outside-'))
    cleanups.push(() => rm(outside, { recursive: true, force: true }))
    const list = f.files.listDirectory.bind(f.files)
    vi.spyOn(f.files, 'listDirectory').mockImplementation(async (id, path) => {
      const result = await list(id, path)
      if (!path) { await rm(join(f.root, 'src'), { recursive: true }); await symlink(outside, join(f.root, 'src'), 'junction') }
      return result
    })
    expect((await f.resolve()).resolution.state).toBe('FAILED')
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('surfaces a project that disappears between discovery and evaluation alongside a valid candidate', async () => {
    const f = await fixture(['App.csproj', 'Broken.csproj'])
    const evaluate = f.preflight.evaluate.bind(f.preflight)
    vi.spyOn(f.preflight, 'evaluate').mockImplementation(async (request, signal) => {
      if (request.relativePath === 'Broken.csproj') await unlink(join(f.root, request.relativePath))
      return evaluate(request, signal)
    })
    const result = await f.resolve()
    expect(result.resolution.state).toBe('SELECTION_REQUIRED')
    expect(result.assessments[1]).toMatchObject({ candidate: { eligibility: 'UNASSESSABLE', reason: 'INVALID_PROJECT' } })
  })
  it('does not accept a changed canonical identity returned by evaluation', async () => {
    const f = await fixture(['App.csproj', 'Other.csproj'])
    const evaluate = f.preflight.evaluate.bind(f.preflight)
    vi.spyOn(f.preflight, 'evaluate').mockImplementation(async (request, signal) => {
      const result = await evaluate(request, signal)
      if (request.relativePath === 'App.csproj' && result.ok) return { ...result, evaluation: { ...result.evaluation,
        target: { ...result.evaluation.target, canonicalFile: join(f.root, 'Other.csproj') } } }
      return result
    })
    expect((await f.resolve()).assessments[0].detail).toBe('PROJECT_CHANGED')
  })
  it('revalidates an earlier project when it disappears while a later candidate is evaluated', async () => {
    const f = await fixture(['App.csproj', 'Other.csproj'])
    const evaluate = f.preflight.evaluate.bind(f.preflight)
    vi.spyOn(f.preflight, 'evaluate').mockImplementation(async (request, signal) => {
      if (request.relativePath === 'Other.csproj') await unlink(join(f.root, 'App.csproj'))
      return evaluate(request, signal)
    })
    const result = await f.resolve()
    expect(result.resolution.state).toBe('SELECTION_REQUIRED')
    expect(result.assessments[0].detail).toBe('PROJECT_CHANGED')
  })
  it('rejects an unauthorized project before listing or evaluation', async () => {
    const f = await fixture(['App.csproj'])
    await f.projects.closeProject()
    const list = vi.spyOn(f.files, 'listDirectory')
    expect((await f.resolve()).resolution.state).toBe('FAILED')
    expect(list).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled()
  })
  it('rejects outside-root canonical paths from authorization without evaluating', async () => {
    const f = await fixture(['App.csproj'])
    vi.spyOn(f.files, 'authorizeRunFile').mockResolvedValue({ canonicalRoot: f.root, canonicalFile: 'C:\\outside\\App.csproj' })
    expect((await f.resolve()).resolution.state).toBe('FAILED')
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('cancels before traversal and during a production M1-05 probe', async () => {
    const f = await fixture(['App.csproj']), controller = new AbortController()
    controller.abort()
    expect((await f.resolve(controller.signal)).failure).toBe('CANCELLED')
    expect(f.execute).not.toHaveBeenCalled()
    const during = new AbortController()
    f.execute.mockImplementation(async () => { during.abort(); throw new RunProbeError('CANCELLED') })
    expect((await f.resolve(during.signal)).failure).toBe('CANCELLED')
  })
  it('aborts probes and removes subscriptions when project closes during evaluation', async () => {
    const f = await fixture(['App.csproj'])
    const subscribe = f.projects.subscribe.bind(f.projects), removals = vi.fn()
    vi.spyOn(f.projects, 'subscribe').mockImplementation(listener => { const remove = subscribe(listener); return () => { removals(); remove() } })
    f.execute.mockImplementation(async (_exe, _command, _cwd, signal) => {
      await f.projects.closeProject()
      expect(signal.aborted).toBe(true)
      throw new RunProbeError('CANCELLED')
    })
    expect((await f.resolve()).failure).toBe('PROJECT_CHANGED')
    expect(removals).toHaveBeenCalledTimes(1)
  })
  it.each([CSHARP_RUN_DISCOVERY_LIMITS.maximumEntries, CSHARP_RUN_DISCOVERY_LIMITS.maximumEntries + 1])('bounds traversal at %i entries', async count => {
    const f = await fixture([])
    vi.spyOn(f.files, 'listDirectory').mockResolvedValue(Array.from({ length: count }, (_, i) => ({
      name: `${i}.txt`, relativePath: `${i}.txt`, kind: 'file', isSymbolicLink: false,
    })))
    expect((await f.resolve()).resolution.state).toBe(count === CSHARP_RUN_DISCOVERY_LIMITS.maximumEntries ? 'NO_RUNNABLE_PROJECT' : 'FAILED')
    expect(f.execute).not.toHaveBeenCalled()
  })
  it.each([64, 65])('bounds unique candidates at %i before any evaluation on overflow', async count => {
    const f = await fixture(Array.from({ length: count }, (_, i) => `${i}.csproj`))
    const result = await f.resolve()
    expect(result.resolution.state).toBe(count === 64 ? 'SELECTION_REQUIRED' : 'FAILED')
    if (count > 64) { expect(result.failure).toBe('DISCOVERY_LIMIT_EXCEEDED'); expect(f.execute).not.toHaveBeenCalled() }
  })
  it('rejects oversized and traversal listing paths before authorization', async () => {
    const f = await fixture([])
    const list = vi.spyOn(f.files, 'listDirectory')
    for (const path of ['../outside.csproj', 'a'.repeat(4097) + '.csproj']) {
      list.mockResolvedValue([{ name: 'App.csproj', relativePath: path, kind: 'file', isSymbolicLink: false }])
      expect((await f.resolve()).resolution.state).toBe('FAILED')
    }
    expect(f.execute).not.toHaveBeenCalled()
  })
})

describeWindows('evaluated Console classification and resolution cardinality', () => {
  it.each<[Partial<EvaluatedRunProperties>, string, string]>([
    [{ OutputType: 'Library' }, 'LIBRARY', 'INELIGIBLE'], [{ OutputType: 'WinExe' }, 'NOT_EXE', 'INELIGIBLE'],
    [{ UsingMicrosoftNETSdkWeb: 'true' }, 'WEB', 'INELIGIBLE'], [{ IsTestProject: 'true' }, 'TEST', 'INELIGIBLE'],
    [{ UseWPF: 'true' }, 'WPF', 'INELIGIBLE'], [{ UseWindowsForms: 'true' }, 'WINDOWS_FORMS', 'INELIGIBLE'],
    [{ UsingMicrosoftNETSdk: 'false' }, 'NOT_SDK_STYLE', 'INELIGIBLE'],
    [{ OutputType: '' }, 'UNRESOLVED_METADATA', 'UNASSESSABLE'], [{ UsingMicrosoftNETSdk: '' }, 'UNRESOLVED_METADATA', 'UNASSESSABLE'],
    [{ UseWPF: 'unknown' }, 'UNRESOLVED_METADATA', 'UNASSESSABLE'], [{ TargetFramework: '' }, 'UNRESOLVED_METADATA', 'UNASSESSABLE'],
    [{ TargetFramework: '', TargetFrameworks: 'net8.0;net10.0' }, 'MULTIPLE_FRAMEWORKS', 'INELIGIBLE'],
    [{ TargetFrameworks: 'net8.0' }, 'MULTIPLE_FRAMEWORKS', 'INELIGIBLE'],
    [{ TargetFramework: 'net8.0;net10.0' }, 'MULTIPLE_FRAMEWORKS', 'INELIGIBLE'],
    [{ TargetFramework: 'net999.0' }, 'UNSUPPORTED_FRAMEWORK', 'INELIGIBLE'],
    [{ TargetFramework: 'net48', TargetFrameworkIdentifier: '.NETFramework' }, 'UNSUPPORTED_FRAMEWORK', 'INELIGIBLE'],
    [{ TargetFramework: 'net8.0-android' }, 'UNSUPPORTED_FRAMEWORK', 'INELIGIBLE'],
    [{ TargetFrameworkVersion: 'v9.0' }, 'UNSUPPORTED_FRAMEWORK', 'INELIGIBLE'],
    [{ TargetFrameworkIdentifier: '.NETStandard' }, 'UNSUPPORTED_FRAMEWORK', 'INELIGIBLE'],
    [{ TargetFrameworkIdentifier: '', TargetFrameworkVersion: '' }, 'CONSOLE', 'ELIGIBLE'],
    [{ TargetFramework: 'net10.0', TargetFrameworkVersion: 'v10.0' }, 'CONSOLE', 'ELIGIBLE'],
    [{ TargetFramework: 'net8.0-windows10.0.19041.0' }, 'CONSOLE', 'ELIGIBLE'],
  ])('classifies evaluated overrides %j', async (facts, detail, eligibility) => {
    const f = await fixture(['App.csproj'], { 'App.csproj': facts })
    const result = await f.resolve()
    expect(result.assessments[0]).toMatchObject({ detail, candidate: { eligibility } })
    expect(result.resolution.state).toBe(eligibility === 'ELIGIBLE' ? 'READY' : eligibility === 'INELIGIBLE' ? 'NO_RUNNABLE_PROJECT' : 'FAILED')
  })
  it('does not certify a target newer than its effective SDK', async () => {
    const f = await fixture(['App.csproj'], { 'App.csproj': { TargetFramework: 'net10.0', TargetFrameworkVersion: 'v10.0' } })
    const original = f.execute.getMockImplementation()!
    f.execute.mockImplementation((...args) => args[1].kind === 'version' ? Promise.resolve({ exitCode: 0, stdout: '8.0.410', stderr: '' }) : original(...args))
    expect((await f.resolve()).assessments[0].detail).toBe('UNSUPPORTED_FRAMEWORK')
  })
  it('returns exactly one Console among ineligible library/web/test candidates', async () => {
    const f = await fixture(['App.csproj', 'Library.csproj', 'Web.csproj', 'Test.csproj'], {
      'Library.csproj': { OutputType: 'Library' }, 'Web.csproj': { UsingMicrosoftNETSdkWeb: 'true' }, 'Test.csproj': { IsTestProject: 'true' },
    })
    expect((await f.resolve()).resolution).toMatchObject({ state: 'READY', target: { relativePath: 'App.csproj' } })
  })
  it.each(['malformed', 'sdk', 'timeout', 'cleanup'] as const)('surfaces %s failures without leaking stderr or choosing a partial result', async mode => {
    const f = await fixture(['App.csproj', 'Broken.csproj'])
    const evaluate = f.preflight.evaluate.bind(f.preflight)
    vi.spyOn(f.preflight, 'evaluate').mockImplementation((request, signal) => request.relativePath === 'App.csproj' ? evaluate(request, signal)
      : Promise.resolve(mode === 'sdk' ? { ok: false, reason: 'SDK_SELECTION_FAILED', sdk: { ok: false,
        dependency: { state: 'INVALID_CONFIGURATION', reason: 'SDK_SELECTION_FAILED' }, detail: 'INVALID_GLOBAL_JSON' } }
        : { ok: false, reason: 'PREFLIGHT_FAILED', detail: mode === 'timeout' ? 'TIMEOUT' : mode === 'cleanup' ? 'CLEANUP_FAILED' : 'EVALUATION_FAILED' }))
    const result = await f.resolve()
    expect(result.resolution.state).toBe(mode === 'cleanup' ? 'FAILED' : 'SELECTION_REQUIRED')
    expect(result.resolution).not.toHaveProperty('target')
  })
  it.each(['missing', 'selection'] as const)('propagates %s SDK failure from real M1-05 resolution', async failure => {
    const f = await fixture(['App.csproj'])
    f.execute.mockImplementation(async (_exe, command) => ({ exitCode: command.kind === 'inventory' ? 0 : 1, stderr: 'private stderr',
      stdout: command.kind === 'inventory' && failure !== 'missing' ? '8.0.410 [C:\\dotnet\\sdk]' : '' }))
    // Inventory itself must be clean; stderr on failed version stays private.
    const previous = f.execute.getMockImplementation()!
    f.execute.mockImplementation(async (...args) => { const result = await previous(...args); return args[1].kind === 'inventory' ? { ...result, stderr: '' } : result })
    const result = await f.resolve()
    expect(result.resolution).toMatchObject({ state: 'DEPENDENCY_FAILED', dependency: {
      state: failure === 'missing' ? 'MISSING' : 'INVALID_CONFIGURATION',
    } })
    expect(JSON.stringify(result)).not.toContain('private stderr')
  })
})

describeWindows('untrusted recursive ProjectReference graph', () => {
  it('authorizes nested relative/absolute/duplicate references, evaluates each node once and accepts libraries', async () => {
    const refs = { 'src/App.csproj': ['../lib/Library.csproj', '../lib/Library.csproj'] }
    const f = await fixture(['src/App.csproj', 'lib/Library.csproj'], { 'lib/Library.csproj': { OutputType: 'Library' } }, refs)
    refs['src/App.csproj'].push(join(f.root, 'lib/Library.csproj'))
    expect((await f.resolve()).resolution.state).toBe('READY')
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(2)
  })
  it('evaluates explicitly referenced in-root projects even in excluded discovery directories', async () => {
    const f = await fixture(['App.csproj', 'obj/Library.csproj'], { 'obj/Library.csproj': { OutputType: 'Library' } }, { 'App.csproj': ['obj/Library.csproj'] })
    const result = await f.resolve()
    expect(result.resolution.state).toBe('READY')
    expect(result.assessments).toHaveLength(1)
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(2)
  })
  it.each(['../outside.csproj', 'C:\\outside\\App.csproj', 'Missing.csproj', 'C:drive-relative.csproj', 'Program.cs'])('rejects reference %s', async reference => {
    const f = await fixture(['App.csproj'], {}, { 'App.csproj': [reference] })
    const result = await f.resolve()
    expect(result.assessments[0]).toMatchObject({ detail: 'INVALID_REFERENCE', candidate: { reason: 'INVALID_PROJECT_REFERENCE' } })
    expect(result.resolution.state).toBe('FAILED')
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(1)
  })
  it('rejects a reference through an outside junction', async () => {
    const f = await fixture(['App.csproj'], {}, { 'App.csproj': ['external/Library.csproj'] })
    const outside = await mkdtemp(join(tmpdir(), 'run-ref-outside-'))
    cleanups.push(() => rm(outside, { recursive: true, force: true }))
    await writeFile(join(outside, 'Library.csproj'), '')
    await symlink(outside, join(f.root, 'external'), 'junction')
    expect((await f.resolve()).assessments[0].detail).toBe('INVALID_REFERENCE')
  })
  it('detects a reference cycle and propagates failure to its ancestor without repeated evaluation', async () => {
    const f = await fixture(['App.csproj', 'A.csproj', 'B.csproj'], { 'A.csproj': { OutputType: 'Library' }, 'B.csproj': { OutputType: 'Library' } },
      { 'App.csproj': ['A.csproj'], 'A.csproj': ['B.csproj'], 'B.csproj': ['A.csproj'] })
    const result = await f.resolve()
    expect(result.assessments.every(a => a.detail === 'REFERENCE_CYCLE')).toBe(true)
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(3)
  })
  it('propagates an unassessable transitive library without rejecting an independent Console', async () => {
    const f = await fixture(['App.csproj', 'Other.csproj', 'obj/A.csproj', 'obj/B.csproj'], { 'obj/A.csproj': { OutputType: 'Library' } },
      { 'App.csproj': ['obj/A.csproj'], 'obj/A.csproj': ['B.csproj'] })
    const evaluate = f.preflight.evaluate.bind(f.preflight)
    vi.spyOn(f.preflight, 'evaluate').mockImplementation((request, signal) => request.relativePath === 'obj/B.csproj'
      ? Promise.resolve({ ok: false, reason: 'PREFLIGHT_FAILED', detail: 'TIMEOUT' }) : evaluate(request, signal))
    const result = await f.resolve()
    expect(result.resolution.state).toBe('SELECTION_REQUIRED')
    expect(result.assessments[0]).toMatchObject({ detail: 'REFERENCE_FAILED', candidate: { reason: 'INVALID_PROJECT_REFERENCE' } })
    expect(result.assessments[1].candidate.eligibility).toBe('ELIGIBLE')
  })
  it('bounds the recursive reference graph, including projects omitted by discovery', async () => {
    const paths = ['App.csproj', ...Array.from({ length: 64 }, (_, i) => `obj/${i}.csproj`)]
    const refs: Record<string, string[]> = { 'App.csproj': ['obj/0.csproj'] }
    for (let i = 0; i < 63; ++i) refs[`obj/${i}.csproj`] = [`${i + 1}.csproj`]
    const f = await fixture(paths, {}, refs)
    const result = await f.resolve()
    expect(result.failure).toBe('DISCOVERY_LIMIT_EXCEEDED')
    expect(result.resolution).not.toHaveProperty('target')
    expect(f.execute.mock.calls.filter(([, c]) => c.kind === 'evaluate')).toHaveLength(64)
  })
})

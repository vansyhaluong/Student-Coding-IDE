import { describe, expect, it, vi } from 'vitest'
import type { ProjectId, RunEvent, RunExecutionPhase } from '../../src/shared/contracts'
import { CSharpRunStrategy, evaluatedCsharpRuntime } from '../../src/main/services/run/csharp-run-strategy'
import { CsharpRunPreparation } from '../../src/main/services/run/csharp-run-preparation'
import type { CsharpRunEvaluation, CsharpRunPreflightResult } from '../../src/main/services/run/csharp-run-preflight'
import type { CsharpRunSelectionResult } from '../../src/main/services/run/csharp-run-target-store'
import { RunService } from '../../src/main/services/run/run-service'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import { runPlanFingerprint, type RunPreparationContext } from '../../src/main/services/run/run-strategy'
import type { PipedProcessEvent, PipedRunProcess } from '../../src/main/services/run/piped-process-adapter'
import { sourceGuardError } from '../../src/main/services/run/run-source-guard'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const request = { kind: 'csharp-project' as const, projectId, relativePath: 'App.csproj', dirty: false }
const target = { projectId, relativePath: request.relativePath, canonicalRoot: 'C:\\Project Việt # 😀',
  canonicalFile: 'C:\\Project Việt # 😀\\App.csproj' }
function facts(): CsharpRunEvaluation {
  return { target, runtime: { executable: 'C:\\Program Files\\dotnet\\dotnet.exe', cwd: target.canonicalRoot,
    effectiveSdk: { version: '8.0.410', major: 8, prerelease: false }, installedSdks: [] },
  properties: { OutputType: 'Exe', TargetFramework: 'net8.0', TargetFrameworks: '',
    TargetFrameworkIdentifier: '.NETCoreApp', TargetFrameworkVersion: 'v8.0', UsingMicrosoftNETSdk: 'true',
    UsingMicrosoftNETSdkWeb: '', UseWPF: '', UseWindowsForms: '', IsTestProject: '' }, projectReferences: [] }
}
function setup() {
  const selection: CsharpRunSelectionResult = { resolution: { state: 'READY', projectId,
    target: request, candidates: [] }, assessments: [], selection: 'AUTOMATIC' }
  const store = { resolve: vi.fn(async () => selection) }
  const evaluator = { evaluate: vi.fn(async (): Promise<CsharpRunPreflightResult> => ({ ok: true, evaluation: facts() })) }
  const close = vi.fn(async () => {})
  const preparation = new CsharpRunPreparation(() => ({ store, evaluator, close }))
  const manager = new ProcessManager(), events: RunEvent[] = [], phases: RunExecutionPhase[] = []
  const children: { process: PipedRunProcess; emit(event: PipedProcessEvent): void; finish(code?: number): void }[] = []
  const adapter = { create: vi.fn((_spec: unknown, emit: (event: PipedProcessEvent) => void) => {
    let released = false, exited = false
    const finish = (code = 0) => {
      if (!exited) { exited = true; emit({ type: 'exit', exitCode: code }) }
      emit({ type: 'stdout-eof' }); emit({ type: 'stderr-eof' })
    }
    const process: PipedRunProcess = { ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 10 },
      settled: Promise.resolve(), close: async () => { finish(); released = true }, isReleased: () => released }
    children.push({ process, emit, finish }); return process
  }) }
  const check = vi.fn(async () => {})
  const onPhase = vi.fn((_owner: number, _session: unknown, phase: RunExecutionPhase) => { phases.push(phase) })
  const run = new RunService({ authorize: async () => target, resolveRuntime: context => preparation.resolve(context) },
    [new CSharpRunStrategy()], { manager, adapter, onEvent: (_owner, event) => events.push(event), onPhase,
      sourceGuard: { open: () => ({ check, assertValid: () => {}, release: () => {} }) } })
  const wait = (count: number) => vi.waitFor(() => expect(children).toHaveLength(count))
  const terminal = (state: string) => vi.waitFor(() => expect(events.filter(e => e.type === 'exit')).toMatchObject([
    { session: { state } },
  ]))
  return { run, store, evaluator, close, manager, events, phases, adapter, children, check, onPhase, wait, terminal }
}

describe('M1-09 CSharpRunStrategy', () => {
  it('creates immutable M1-04 commands with separate argv, candidate cwd and no shell', () => {
    const strategy = new CSharpRunStrategy(), plan = strategy.preparePlan(target, evaluatedCsharpRuntime(facts()))
    expect(plan.steps.map(s => s.execution.args)).toEqual([
      ['build', target.canonicalFile, '--configuration', 'Debug', '--disable-build-servers', '-nodeReuse:false'],
      ['run', '--project', target.canonicalFile, '--configuration', 'Debug', '--no-build', '--no-restore',
        '--no-launch-profile', '--disable-build-servers'],
    ])
    for (const step of plan.steps) {
      expect(step.execution).toMatchObject({ cwd: target.canonicalRoot, shell: false, environmentAdditions: {} })
      expect(Object.isFrozen(step.execution.args)).toBe(true)
    }
    expect(Object.isFrozen(plan)).toBe(true)
    expect(() => strategy.prepare()).toThrow()
    expect(() => strategy.preparePlan(target, { executable: facts().runtime.executable })).toThrow()
  })
  it.each(['OutputType', 'UsingMicrosoftNETSdkWeb', 'IsTestProject', 'UseWPF', 'UseWindowsForms',
    'TargetFrameworks', 'TargetFramework'] as const)('rejects ineligible %s evaluated facts', key => {
    const base = facts(), value = key === 'OutputType' ? 'Library'
      : key === 'TargetFramework' ? 'net999.0' : key === 'TargetFrameworks' ? 'net8.0;net10.0' : 'true'
    expect(() => new CSharpRunStrategy().preparePlan(target,
      evaluatedCsharpRuntime({ ...base, properties: { ...base.properties, [key]: value } }))).toThrow()
  })
  it('fingerprints effective SDK changes even when host and argv are unchanged', () => {
    const strategy = new CSharpRunStrategy(), base = facts()
    const before = strategy.preparePlan(target, evaluatedCsharpRuntime(base))
    const after = strategy.preparePlan(target, evaluatedCsharpRuntime({ ...base,
      runtime: { ...base.runtime, effectiveSdk: { version: '10.0.112', major: 10, prerelease: false } } }))
    expect(runPlanFingerprint('identity', target, before)).not.toBe(runPlanFingerprint('identity', target, after))
  })
  it('builds then executes in one session, streams both pipes and releases all resources', async () => {
    const h = setup(), session = await h.run.startPlannedRun(request, 7)
    await h.wait(1); h.children[0].emit({ type: 'stdout', data: 'build' }); h.children[0].finish()
    await h.wait(2); expect(h.children[0].process.isReleased()).toBe(true)
    h.children[1].emit({ type: 'stderr', data: 'error stream' }); h.children[1].finish()
    await h.terminal('EXITED')
    expect(h.phases).toEqual(['PREPARING', 'BUILD_RESTORE', 'EXECUTING'])
    expect(h.events.every(e => e.session.sessionId === session.sessionId)).toBe(true)
    expect(h.store.resolve).toHaveBeenCalledTimes(3); expect(h.evaluator.evaluate).toHaveBeenCalledTimes(3)
    expect(h.close).toHaveBeenCalledTimes(3); expect(h.check).toHaveBeenCalledTimes(5)
    expect(h.manager.size).toBe(0); await h.run.stop()
  })
  it.each([['build', 1, 'BUILD_OR_RESTORE_FAILED'], ['run', 23, 'EXECUTION_FAILED']] as const)(
    'classifies nonzero %s exit without launching another step', async (step, code, reason) => {
      const h = setup(); await h.run.startPlannedRun(request, 7); await h.wait(1)
      if (step === 'run') { h.children[0].finish(); await h.wait(2) }
      h.children.at(-1)!.finish(code); await h.terminal('FAILED')
      expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', error: expect.objectContaining({
        details: expect.objectContaining({ reason, exitCode: code }),
      }) }))
      expect(h.children).toHaveLength(step === 'build' ? 1 : 2); expect(h.manager.size).toBe(0)
    })
  it.each(['SELECTION_REQUIRED', 'NO_RUNNABLE_PROJECT', 'DEPENDENCY_FAILED'] as const)(
    '%s does not launch', async state => {
      const h = setup()
      h.store.resolve.mockResolvedValue({ resolution: { state, projectId, candidates: [],
        ...(state === 'DEPENDENCY_FAILED' ? { dependency: { state: 'MISSING', reason: 'DOTNET_SDK_MISSING' } } : {}) } as CsharpRunSelectionResult['resolution'],
        assessments: [], selection: 'NONE' })
      await h.run.startPlannedRun(request, 7); await h.terminal('FAILED')
      expect(h.adapter.create).not.toHaveBeenCalled(); expect(h.evaluator.evaluate).not.toHaveBeenCalled()
    })
  it('rejects a selected target belonging to a different project', async () => {
    const h = setup(), base = facts()
    h.evaluator.evaluate.mockResolvedValue({ ok: true, evaluation: { ...base,
      target: { ...target, projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId } } })
    await h.run.startPlannedRun(request, 7); await h.terminal('FAILED'); expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it.each([1, 4])('dirty source checkpoint %s blocks the next launch', async checkpoint => {
    const h = setup(); let calls = 0
    h.check.mockImplementation(async () => { if (++calls === checkpoint) throw sourceGuardError('SOURCE_DIRTY') })
    await h.run.startPlannedRun(request, 7)
    if (checkpoint === 4) { await h.wait(1); h.children[0].finish() }
    await h.terminal('FAILED'); expect(h.children).toHaveLength(checkpoint === 1 ? 0 : 1)
  })
  it('SDK drift after build blocks execution', async () => {
    const h = setup(); await h.run.startPlannedRun(request, 7); await h.wait(1)
    const base = facts()
    h.evaluator.evaluate.mockResolvedValue({ ok: true, evaluation: { ...base, runtime: { ...base.runtime,
      effectiveSdk: { version: '10.0.112', major: 10, prerelease: false } } } })
    h.children[0].finish(); await h.terminal('FAILED'); expect(h.children).toHaveLength(1)
  })
  it.each(['MISSING', 'INVALID_CONFIGURATION'] as const)('propagates %s SDK failure safely', async state => {
    const h = setup()
    h.evaluator.evaluate.mockResolvedValue({ ok: false, reason: 'PREFLIGHT_FAILED', sdk: { ok: false,
      dependency: state === 'MISSING' ? { state, reason: 'DOTNET_HOST_MISSING' } : { state, reason: 'SDK_SELECTION_FAILED' },
      detail: 'SDK_RESOLUTION_FAILED' } })
    await h.run.startPlannedRun(request, 7); await h.terminal('FAILED')
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', error: expect.objectContaining({
      details: expect.objectContaining({ reason: state === 'MISSING' ? 'DEPENDENCY_MISSING' : 'INVALID_CONFIGURATION' }),
    }) }))
    expect(h.adapter.create).not.toHaveBeenCalled(); expect(h.manager.size).toBe(0)
  })
  it('deleted target after build cannot reuse earlier evaluation', async () => {
    const h = setup(); await h.run.startPlannedRun(request, 7); await h.wait(1)
    h.evaluator.evaluate.mockResolvedValue({ ok: false, reason: 'INVALID_PROJECT', detail: 'PROJECT_CHANGED' })
    h.children[0].finish(); await h.terminal('FAILED'); expect(h.children).toHaveLength(1)
  })
  it.each(['spawn', 'observation'] as const)('classifies %s failure and cleans the session', async mode => {
    const h = setup()
    if (mode === 'spawn') h.adapter.create.mockImplementation(() => { throw new Error('private native detail') })
    await h.run.startPlannedRun(request, 7)
    if (mode === 'observation') { await h.wait(1); h.children[0].emit({ type: 'error', message: 'private native detail' }) }
    await h.terminal('FAILED')
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'error', error: expect.objectContaining({
      details: { reason: mode === 'spawn' ? 'SPAWN_FAILED' : 'OBSERVATION_FAILED',
        ...(mode === 'spawn' ? { phase: 'BUILD_RESTORE' } : {}) },
    }) }))
    expect(JSON.stringify(h.events)).not.toContain('private native detail'); expect(h.manager.size).toBe(0)
  })
  it.each(['build', 'execute', 'transition'] as const)('Stop during %s prevents further creation', async phase => {
    const h = setup(), session = await h.run.startPlannedRun(request, 7); await h.wait(1)
    if (phase === 'transition') h.onPhase.mockImplementation((_owner, _session, next) => {
      if (next === 'EXECUTING') void h.run.stopRun(session.sessionId, 7)
    })
    if (phase !== 'build') h.children[0].finish()
    if (phase === 'execute') await h.wait(2)
    if (phase !== 'transition') await h.run.stopRun(session.sessionId, 7)
    await h.terminal('CANCELLED'); expect(h.children).toHaveLength(phase === 'execute' ? 2 : 1)
    expect(h.manager.size).toBe(0)
  })
  it('retains failed preparation cleanup and blocks replacement until retry', async () => {
    const h = setup(); h.close.mockRejectedValue(new Error('cleanup'))
    await h.run.startPlannedRun(request, 7)
    await vi.waitFor(() => expect(h.events).toContainEqual(expect.objectContaining({ type: 'state',
      session: expect.objectContaining({ state: 'STOPPING' }) })))
    await expect(h.run.startPlannedRun(request, 7)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(h.manager.size).toBe(1); expect(h.adapter.create).not.toHaveBeenCalled()
    h.close.mockResolvedValue(); await h.run.stop(); expect(h.manager.size).toBe(0)
  })
  it('legacy public start does not enable C# execution', async () => {
    const h = setup(); await expect(h.run.startRun({ projectId, relativePath: request.relativePath, dirty: false }, 7))
      .rejects.toMatchObject({ code: 'UNSUPPORTED' })
    expect(h.store.resolve).not.toHaveBeenCalled(); expect(h.adapter.create).not.toHaveBeenCalled()
  })
  it('requires owned preparation before creating SDK resources', async () => {
    const create = vi.fn(), preparation = new CsharpRunPreparation(create)
    await expect(preparation.resolve({ strategyKind: 'csharp-project', target })).rejects.toThrow()
    const controller = new AbortController(); controller.abort()
    const context: RunPreparationContext = { signal: controller.signal, resourceOwnerId: 'owner', registerResource: vi.fn() }
    await expect(preparation.resolve({ strategyKind: 'csharp-project', target, preparation: context })).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })
})

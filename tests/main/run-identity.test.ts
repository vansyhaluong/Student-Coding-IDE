import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RunService } from '../../src/main/services/run/run-service'
import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import type { PreparedRun, RunRuntimeContext, RunStrategy } from '../../src/main/services/run/run-strategy'
import type { ProjectId, StartRunRequest } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const request = { projectId, relativePath: 'main.js', dirty: false }
const execution: PreparedRun = { executable: 'C:\\node\\node.exe', args: ['--fixed'],
  cwd: 'C:\\project', shell: false, environmentAdditions: {} }

function setup() {
  const authority = {
    authorize: vi.fn(async (target: StartRunRequest) => ({ projectId: target.projectId,
      relativePath: target.relativePath, canonicalRoot: 'C:\\project',
      canonicalFile: win32.join('C:\\project', target.relativePath) })),
    resolveRuntime: vi.fn<(context: RunRuntimeContext) => Promise<{ executable: string }>>(
      async () => ({ executable: execution.executable })),
  }
  const strategy: RunStrategy = { kind: 'javascript-file', supports: target => target.relativePath.endsWith('.js'),
    prepare: vi.fn((_target, runtime) => ({ ...execution, executable: runtime.executable })) }
  const strategies = [strategy]
  const service = new RunService(authority, strategies)
  const manager = new ProcessManager()
  const adapter = { create: vi.fn(() => ({ ownership: { mode: 'LEGACY_ROOT_OWNED' as const, rootPid: 1 },
    settled: Promise.resolve(), isReleased: () => true, close: async () => {} })) }
  const launch = (id: Awaited<ReturnType<RunService['prepare']>>['session']['sessionId']) =>
    service.launchPrepared(id, 7, adapter, manager, vi.fn())
  return { authority, strategy, strategies, service, manager, adapter, launch }
}

describe('M1-02 canonical identity and execution authorization', () => {
  it('deduplicates canonical aliases independent of argv, but isolates projects and different targets', async () => {
    const h = setup()
    const first = await h.service.prepare(request, 7)
    vi.mocked(h.strategy.prepare).mockReturnValue({ ...execution, args: [] })
    await expect(h.service.prepare({ ...request, relativePath: 'MAIN.js' }, 7)).rejects.toThrow(/released first/)
    const other = await h.service.prepare({ ...request, relativePath: 'other.js' }, 7)
    const project = await h.service.prepare({ ...request,
      projectId: 'project_abcdef1234567890abcdef12' as ProjectId }, 7)
    expect(new Set([first.identity, other.identity, project.identity]).size).toBe(3)
    expect(first.execution.args).toEqual(['--fixed'])
    expect(other.execution.args).toEqual([])
    expect(first.session).not.toHaveProperty('identity')
    expect(first.session).not.toHaveProperty('fingerprint')
  })

  it('passes immutable authorized target and trusted kind to contextual runtime resolution', async () => {
    const h = setup()
    h.authority.resolveRuntime.mockImplementation(async context => {
      expect(context.strategyKind).toBe('javascript-file')
      expect(context.target.canonicalFile).toBe('C:\\project\\main.js')
      expect(Object.isFrozen(context)).toBe(true)
      expect(Object.isFrozen(context.target)).toBe(true)
      return { executable: 'C:\\trusted\\node.exe' }
    })
    const prepared = await h.service.prepare(request, 7)
    expect(prepared.execution.executable).toBe('C:\\trusted\\node.exe')
    await (await h.launch(prepared.session.sessionId)).close()
    expect(h.authority.resolveRuntime).toHaveBeenCalledTimes(2)
  })

  it('snapshots the registration list and rejects ambiguous or duplicate strategy registrations', async () => {
    const h = setup()
    h.strategies.length = 0
    expect((await h.service.prepare(request, 7)).session.state).toBe('STARTING')
    expect(() => new RunService(h.authority, [h.strategy, h.strategy])).toThrow(/invalid/i)
    const ambiguous = new RunService(h.authority, [h.strategy, { ...h.strategy, kind: 'csharp-project' }])
    await expect(ambiguous.prepare(request, 7)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const unregistered = new RunService(h.authority, [])
    await expect(unregistered.prepare(request, 7)).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('resolves multiple injected strategy contexts without a Node fallback (test doubles only)', async () => {
    const h = setup()
    const fake: RunStrategy = { kind: 'csharp-project', supports: target => target.relativePath.endsWith('.csproj'),
      prepare: (_target, runtime) => ({ ...execution, executable: runtime.executable }) }
    const service = new RunService(h.authority, [h.strategy, fake])
    h.authority.resolveRuntime.mockImplementation(async context => ({
      executable: context.strategyKind === 'javascript-file' ? 'C:\\node\\node.exe' : 'C:\\fake\\runtime.exe',
    }))
    const js = await service.prepare(request, 7)
    const project = await service.prepare({ ...request, relativePath: 'nested/App.csproj' }, 7)
    expect(js.execution.executable).toBe('C:\\node\\node.exe')
    expect(project.execution.executable).toBe('C:\\fake\\runtime.exe')
    expect(JSON.parse(project.identity)).toEqual([projectId, 'csharp-project', 'c:\\project\\nested\\app.csproj'])
    const production = new RunService(h.authority, [new JavaScriptRunStrategy()])
    await expect(production.prepare({ ...request, relativePath: 'App.csproj' }, 7))
      .rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })

  it.each(['canonicalFile', 'canonicalRoot'] as const)('rejects invalid %s before resolving runtime', async field => {
    const h = setup()
    h.authority.authorize.mockResolvedValueOnce({ ...request, canonicalFile: 'C:\\project\\main.js',
      canonicalRoot: 'C:\\project', [field]: 'relative' })
    await expect(h.service.prepare(request, 7)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(h.authority.resolveRuntime).not.toHaveBeenCalled()
  })

  it('rejects canonical target substitution even when the complete argv stays identical', async () => {
    const h = setup()
    const prepared = await h.service.prepare(request, 7)
    h.authority.authorize.mockResolvedValueOnce({ ...request, canonicalRoot: 'C:\\project',
      canonicalFile: 'C:\\project\\other.js' })
    await expect(h.launch(prepared.session.sessionId)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
    await (await h.launch(prepared.session.sessionId)).close()
  })

  it.each<Partial<PreparedRun>>([
    { executable: 'C:\\other\\node.exe' }, { args: ['--changed'] },
    { cwd: 'C:\\project\\nested' }, { environmentAdditions: { MODE: 'changed' } },
  ])('rejects execution fingerprint drift before registration/spawn: %j', async change => {
    const h = setup()
    const prepared = await h.service.prepare(request, 7)
    vi.mocked(h.strategy.prepare).mockReturnValueOnce({ ...execution, ...change })
    await expect(h.launch(prepared.session.sessionId)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(h.adapter.create).not.toHaveBeenCalled()
    expect(h.manager.size).toBe(0)
    await (await h.launch(prepared.session.sessionId)).close()
  })

  it('rejects runtime drift and released preparations after async revalidation', async () => {
    const h = setup()
    const prepared = await h.service.prepare(request, 7)
    h.authority.resolveRuntime.mockResolvedValueOnce({ executable: 'C:\\new\\node.exe' })
    await expect(h.launch(prepared.session.sessionId)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    h.authority.resolveRuntime.mockImplementationOnce(async () => {
      h.service.releasePreparation(prepared.session.sessionId, 7)
      return { executable: execution.executable }
    })
    await expect(h.launch(prepared.session.sessionId)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(h.adapter.create).not.toHaveBeenCalled()
  })

  it('retains immutable execution snapshots and canonicalizes environment entry order', async () => {
    const h = setup(), args = ['--fixed'], environmentAdditions = { B: '2', A: '1' }
    vi.mocked(h.strategy.prepare).mockReturnValueOnce({ ...execution, args, environmentAdditions })
    const prepared = await h.service.prepare(request, 7)
    args.push('injected'); environmentAdditions.A = 'changed'
    expect(prepared.execution.args).toEqual(['--fixed'])
    expect(prepared.execution.environmentAdditions).toEqual({ A: '1', B: '2' })
    expect(Object.isFrozen(prepared.execution.args)).toBe(true)
    expect(Object.isFrozen(prepared.execution.environmentAdditions)).toBe(true)
    expect(Object.isFrozen(h.service.getPreparation(prepared.session.sessionId, 7))).toBe(true)
    vi.mocked(h.strategy.prepare).mockReturnValueOnce({ ...execution, environmentAdditions: { A: '1', B: '2' } })
    await (await h.launch(prepared.session.sessionId)).close()
  })
})

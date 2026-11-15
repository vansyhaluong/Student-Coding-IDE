import { JavaScriptRunStrategy } from '../../src/main/services/run/javascript-run-strategy'
import { describe, expect, it, vi } from 'vitest'
import { NodeRuntimeDetector } from '../../src/main/services/dependencies/node-runtime'
import { RunService } from '../../src/main/services/run/run-service'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import type { ProjectId } from '../../src/shared/contracts'
import type { PipedRunProcess } from '../../src/main/services/run/piped-process-adapter'

describe('Phase 4B PATH-only Node runtime', () => {
  it('resolves node.exe from Main PATH in order, including spaces and quoted entries', async () => {
    const resolveFile = vi.fn(async (path: string) => path.includes('Program Files') ? path : null)
    const detector = new NodeRuntimeDetector({ Path: 'C:\\missing;"C:\\Program Files\\nodejs";C:\\later' }, { resolveFile })
    expect(await detector.detect()).toEqual({ state: 'AVAILABLE', runtime: { executable: 'C:\\Program Files\\nodejs\\node.exe' } })
    expect(resolveFile.mock.calls.map(([path]) => path)).toEqual(['C:\\missing\\node.exe', 'C:\\Program Files\\nodejs\\node.exe'])
  })
  it('does not search cwd, relative entries, PATHEXT scripts, settings or bundled Node', async () => {
    const resolveFile = vi.fn(async () => null)
    const detector = new NodeRuntimeDetector({ PATH: ';.;relative;C:relative;\\tools;/tools', PATHEXT: '.CMD;.BAT' }, { resolveFile })
    expect(await detector.detect()).toEqual({ state: 'MISSING' })
    expect(resolveFile).not.toHaveBeenCalled()
    await expect(detector.resolve()).rejects.toMatchObject({ code: 'DEPENDENCY_MISSING' })
  })
  it('supports a fully qualified UNC PATH directory', async () => {
    const detector = new NodeRuntimeDetector({ PATH: '\\\\server\\tools' }, { resolveFile: async (path) => path })
    expect(await detector.resolve()).toEqual({ executable: '\\\\server\\tools\\node.exe' })
  })
  it.each(['relative.exe', '\\tools\\node.exe', 'C:\\tools\\cmd.exe', 'C:\\tools\\node.exe\0'])('rejects invalid resolution %s', async (path) => {
    const detector = new NodeRuntimeDetector({ PATH: 'C:\\tools' }, { resolveFile: async () => path })
    expect(await detector.detect()).toEqual({ state: 'INVALID_CONFIGURATION' })
    await expect(detector.resolve()).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
  it('returns safe invalid state for permission errors without disclosing their path', async () => {
    const detector = new NodeRuntimeDetector({ PATH: 'C:\\tools' }, { resolveFile: async () => { throw new Error('private path') } })
    await expect(detector.resolve()).rejects.not.toThrow('private path')
    expect(await detector.detect()).toEqual({ state: 'INVALID_CONFIGURATION' })
  })
})

describe('Phase 4B RunService internal launch seam', () => {
  const projectId = 'project_1234567890abcdef12345678' as ProjectId
  function setup() {
    const authority = { authorize: vi.fn(async () => ({ projectId, relativePath: 'index.js',
      canonicalRoot: 'C:\\project', canonicalFile: 'C:\\project\\index.js' })),
    resolveRuntime: vi.fn(async () => ({ executable: 'C:\\node\\node.exe' })) }
    const service = new RunService(authority, [new JavaScriptRunStrategy()])
    const manager = new ProcessManager()
    let released = false
    const native: PipedRunProcess = { ownership: { mode: 'LEGACY_ROOT_OWNED', rootPid: 1 },
      settled: Promise.resolve(), isReleased: () => released,
      close: vi.fn(async () => { released = true }) }
    const adapter = { create: vi.fn(() => native) }
    return { authority, service, manager, native, adapter }
  }
  it('registers before launch, observes through the port and cleans only after native release', async () => {
    const { service, manager, adapter, native, authority } = setup()
    const prepared = await service.prepare({ projectId, relativePath: 'index.js', dirty: false }, 7)
    adapter.create.mockImplementationOnce(() => { expect(manager.size).toBe(1); return native })
    const observe = vi.fn()
    const process = await service.launchPrepared(prepared.session.sessionId, 7, adapter, manager, observe)
    expect(authority.authorize).toHaveBeenCalledTimes(2)
    expect(adapter.create).toHaveBeenCalledWith(prepared.execution, observe)
    expect(() => service.releasePreparation(prepared.session.sessionId, 7)).toThrow(/live process/)
    await expect(service.launchPrepared(prepared.session.sessionId, 7, adapter, manager, observe)).rejects.toThrow(/already launched/)
    await process.close()
    expect(manager.size).toBe(0)
    expect(() => service.getPreparation(prepared.session.sessionId, 7)).toThrow(/not owned/)
  })
  it('retains ownership on cleanup failure and supports a later explicit cleanup attempt', async () => {
    const { service, manager, adapter, native } = setup()
    const prepared = await service.prepare({ projectId, relativePath: 'index.js', dirty: false }, 7)
    vi.mocked(native.close).mockRejectedValueOnce(new Error('cleanup failed'))
    await service.launchPrepared(prepared.session.sessionId, 7, adapter, manager, vi.fn())
    await expect(manager.stop()).rejects.toThrow('Owned resource cleanup failed')
    expect(manager.size).toBe(1)
    await manager.stop()
    expect(manager.size).toBe(0)
  })
  it('unregisters a failed spawn without reporting a running process', async () => {
    const { service, manager, adapter } = setup()
    const prepared = await service.prepare({ projectId, relativePath: 'index.js', dirty: false }, 7)
    adapter.create.mockImplementationOnce(() => { throw new Error('spawn failed') })
    await expect(service.launchPrepared(prepared.session.sessionId, 7, adapter, manager, vi.fn())).rejects.toThrow('spawn failed')
    expect(manager.size).toBe(0)
    service.releasePreparation(prepared.session.sessionId, 7)
  })
  it('rejects unauthorized owner and changed authorization before native creation', async () => {
    const { service, manager, adapter, authority } = setup()
    const prepared = await service.prepare({ projectId, relativePath: 'index.js', dirty: false }, 7)
    await expect(service.launchPrepared(prepared.session.sessionId, 8, adapter, manager, vi.fn())).rejects.toThrow(/not owned/)
    authority.authorize.mockRejectedValueOnce(new Error('project switched'))
    await expect(service.launchPrepared(prepared.session.sessionId, 7, adapter, manager, vi.fn())).rejects.toThrow('project switched')
    expect(adapter.create).not.toHaveBeenCalled()
  })
})

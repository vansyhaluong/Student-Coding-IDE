import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { GitDocumentOwners } from '../../src/main/services/git/git-document-owners'
import { GitOperationLifecycle } from '../../src/main/services/git/git-operation-lifecycle'
import { GitLifecycleIpcService } from '../../src/main/ipc/git-lifecycle-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { ProjectService } from '../../src/main/services/project/project-service'
import { GIT_CONTEXT_CHANNEL } from '../../src/shared/contracts/git-lifecycle'
import { GIT_CHANNELS, type ProjectId } from '../../src/shared/contracts'

function frame(token: string, processId = 10) {
  return { frameToken: token, processId, routingId: Number(token.replace(/\D/g, '')) || 1,
    detached: false, isDestroyed: () => false }
}
function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
async function setup() {
  const projects = new ProjectService({ realpath: async (path) => path,
    stat: async () => ({ isDirectory: () => true }), mkdir: async () => {}, rmdir: async () => {} }, 'win32')
  const project = await projects.openRoot('C:\\a')
  const runner = { execute: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })), stop: vi.fn(async () => {}) }
  const lifecycle = new GitOperationLifecycle(projects,
    { getStatus: (projectId: ProjectId) => ({ projectId, state: 'AVAILABLE' }), subscribeStatus: () => () => {} }, runner)
  lifecycle.start()
  const documents = new GitDocumentOwners(lifecycle)
  const old = frame('document1')
  const owner = Object.assign(new EventEmitter(), { id: 1, mainFrame: old, isDestroyed: () => false })
  documents.observe(owner as unknown as Parameters<GitDocumentOwners['observe']>[0])
  const commit = (next = owner.mainFrame) => {
    owner.mainFrame = next
    owner.emit('did-frame-navigate', {}, 'file:///app.html', -1, '', true, next.processId, next.routingId)
  }
  const navigate = () => owner.emit('did-start-navigation', {}, 'file:///app.html', false, true)
  const status = { entries: [], didHitLimit: false }
  const git = { getState: vi.fn(), getStatus: vi.fn(async () => status), getBranches: vi.fn(), getHistory: vi.fn(),
    stage: vi.fn(), unstage: vi.fn(), commit: vi.fn(), switchBranch: vi.fn() }
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (channel, fn) => { handlers.set(channel, fn) },
    removeHandler: (channel) => { handlers.delete(channel) } })
  const ipc = new GitLifecycleIpcService(registry, git, lifecycle, (context) => documents.assertCurrent(context))
  ipc.start()
  const send = (caller: ReturnType<typeof frame> | null, channel: string, payload: unknown) =>
    handlers.get(channel)!({ sender: { id: owner.id }, senderFrame: caller }, payload)
  const context = (caller = owner.mainFrame) => send(caller, GIT_CONTEXT_CHANNEL, { projectId: project.id })
  const generation = async (caller = owner.mainFrame) => {
    const result = await context(caller)
    expect(result).toMatchObject({ ok: true })
    return (result as { value: { generation: string } }).value.generation
  }
  const request = (token: string) => ({ identity: { requestId: 'request', generation: token, projectId: project.id },
    payload: { projectId: project.id } })
  return { projects, project, runner, lifecycle, documents, owner, old, git, commit, navigate, send, context, generation, request,
    stop: async () => { ipc.stop(); documents.stop(); await lifecycle.stop(); await projects.stop() } }
}

describe('Git document ownership remediation through production IPC', () => {
  it('rejects context before commit and after owner loss without restoring on demand', async () => {
    const f = await setup()
    expect(await f.context()).toMatchObject({ ok: false, error: { details: { reason: 'stale-document' } } })
    f.commit()
    const token = await f.generation()
    f.navigate()
    for (let i = 0; i < 3; i++) {
      expect(await f.context(f.old)).toMatchObject({ ok: false, error: { details: { reason: 'stale-document' } } })
    }
    expect(() => f.lifecycle.getContext(f.project.id, 1)).toThrow()
    expect(await f.send(f.old, GIT_CHANNELS.getStatus, f.request(token))).toMatchObject({
      value: { result: { ok: false, error: { details: { reason: 'stale-document' } } } } })
    expect(f.git.getStatus).not.toHaveBeenCalled()
    await f.stop()
  })

  it('only a committed new main document obtains a generation; old tokens and stale callers cannot dispatch', async () => {
    const f = await setup()
    f.commit()
    const oldToken = await f.generation()
    f.navigate()
    const next = frame('document2') // same WebContents AND renderer process
    f.owner.mainFrame = next
    expect(await f.context(next)).toMatchObject({ ok: false })
    f.commit(next)
    const token = await f.generation(next)
    expect(token).not.toBe(oldToken)
    expect(await f.context(f.old)).toMatchObject({ ok: false })
    // Even possession of the new document's valid semantic token cannot authorize the old frame.
    expect(await f.send(f.old, GIT_CHANNELS.getStatus, f.request(token))).toMatchObject({
      value: { result: { ok: false, error: { details: { reason: 'stale-document' } } } } })
    expect(await f.send(next, GIT_CHANNELS.getStatus, f.request(oldToken))).toMatchObject({
      value: { result: { ok: false, error: { details: { reason: 'stale-generation' } } } } })
    expect(f.git.getStatus).not.toHaveBeenCalled()
    expect(await f.send(next, GIT_CHANNELS.getStatus, f.request(token))).toMatchObject({ value: { result: { ok: true } } })
    expect(f.git.getStatus).toHaveBeenCalledOnce()
    await f.stop()
  })

  it('repeated navigation cannot resurrect older documents or accept mismatched commit events', async () => {
    const f = await setup(), oldFrames = [f.old]
    f.commit()
    const tokens = new Set([await f.generation()])
    for (let i = 2; i <= 5; i++) {
      f.navigate()
      // A late commit for the revoked document must not restore it.
      f.commit(f.owner.mainFrame)
      expect(await f.context()).toMatchObject({ ok: false })
      const next = frame(`document${i}`)
      f.owner.mainFrame = next
      f.owner.emit('did-frame-navigate', {}, '', -1, '', true, next.processId, -1)
      expect(await f.context(next)).toMatchObject({ ok: false })
      f.commit(next)
      const token = await f.generation()
      expect(tokens.has(token)).toBe(false)
      tokens.add(token)
      for (const old of oldFrames) {
        expect(await f.context(old)).toMatchObject({ ok: false })
        expect(await f.send(old, GIT_CHANNELS.getStatus, f.request(token))).toMatchObject({ value: { result: { ok: false } } })
      }
      oldFrames.push(next)
    }
    expect(f.git.getStatus).not.toHaveBeenCalled()
    await f.stop()
    expect(f.owner.eventNames()).toHaveLength(0)
  })

  it('rejects missing, detached, destroyed and subframe callers; same-document navigation retains availability', async () => {
    const f = await setup()
    f.commit()
    const token = await f.generation()
    for (const invalid of [null, { ...f.old, detached: true }, { ...f.old, isDestroyed: () => true }, frame('subframe9')]) {
      expect(await f.send(invalid, GIT_CONTEXT_CHANNEL, { projectId: f.project.id })).toMatchObject({ ok: false })
    }
    f.owner.emit('did-start-navigation', {}, '', true, true)
    f.owner.emit('did-start-navigation', {}, '', false, false)
    expect(await f.generation()).toBe(token)
    await f.stop()
  })

  it('pending reads remain cancelled when the new document commits before the old reply returns', async () => {
    const f = await setup(), entered = barrier(), release = barrier()
    f.commit()
    const token = await f.generation()
    let signal: AbortSignal | undefined
    f.git.getStatus.mockImplementation(async () => {
      await f.lifecycle.commands.execute('C:\\Git\\git.exe', ['status'], 'C:\\a')
      return { entries: [], didHitLimit: false }
    })
    f.runner.execute.mockImplementation(async (...args: unknown[]) => {
      signal = (args[3] as { signal: AbortSignal }).signal
      entered.release(); await release.promise
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const pending = f.send(f.old, GIT_CHANNELS.getStatus, f.request(token))
    await entered.promise
    f.navigate(); f.commit(frame('document2'))
    expect(signal?.aborted).toBe(true)
    await f.generation()
    release.release()
    expect(await pending).toMatchObject({ value: { result: { ok: false, error: { code: 'PROCESS_CANCELLED' } } } })
    await f.stop()
  })

  it('dispatched mutation drains across document replacement and still holds the project transition', async () => {
    const f = await setup(), entered = barrier(), release = barrier()
    f.commit()
    const token = await f.generation()
    f.git.commit.mockImplementation(async () => {
      await f.lifecycle.commands.execute('C:\\Git\\git.exe', ['commit', '-m', 'test'], 'C:\\a')
      return { applied: true, status: { entries: [], didHitLimit: false }, refreshRequired: false }
    })
    f.runner.execute.mockImplementation(async (...args: unknown[]) => {
      expect((args[3] as { signal?: AbortSignal }).signal).toBeUndefined()
      entered.release(); await release.promise
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const pending = f.send(f.old, GIT_CHANNELS.commit, { ...f.request(token), payload: { projectId: f.project.id, message: 'test' } })
    await entered.promise
    f.navigate(); f.commit(frame('document2'))
    const fresh = await f.generation()
    expect(await f.send(f.owner.mainFrame, GIT_CHANNELS.getStatus, f.request(fresh))).toMatchObject({ value: { result: { ok: false, error: { details: { reason: 'busy' } } } } })
    const closing = f.projects.closeProject()
    expect(f.projects.getActiveProject()?.id).toBe(f.project.id)
    release.release()
    expect(await pending).toMatchObject({ value: { result: { ok: true, value: { applied: true, status: null, refreshRequired: true } } } })
    await closing
    expect(f.runner.execute).toHaveBeenCalledOnce()
    await f.stop()
  })
})

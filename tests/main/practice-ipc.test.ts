import { afterEach, expect, it, vi } from 'vitest'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { PracticeIpcService } from '../../src/main/ipc/practice-ipc-service'
import { createPracticeStore } from '../../src/main/services/learning/practice-store'
import { PRACTICE_CHANNELS } from '../../src/shared/contracts/practice'
import { createPracticeBridge } from '../../src/preload/bridge/practice'
import { DomainError } from '../../src/main/errors/app-error'
import { sourceRegistry } from '../fixtures/learning/package-registry'

afterEach(() => vi.useRealTimers())
async function fixture() {
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } })
  const store = createPracticeStore('unused-in-this-test.json')
  const update = vi.spyOn(store, 'updateWith').mockResolvedValue()
  const authorize = vi.fn()
  const publish = vi.fn()
  const packages = await sourceRegistry()
  const service = new PracticeIpcService(registry, store, authorize, publish, packages)
  service.start()
  const invoke = vi.fn(async (channel: string, payload: unknown, owner = 1) => handlers.get(channel)!({ sender: { id: owner } }, payload))
  const on = vi.fn(), removeListener = vi.fn()
  const bridge = createPracticeBridge({ invoke, on, removeListener })
  return { service, packages, handlers, invoke, authorize, update, publish, bridge, on, removeListener }
}
it('validates requests before dispatch and enforces trusted-frame authorization for draft reads/writes', async () => {
  const f = await fixture()
  expect((await f.bridge.load()).ok).toBe(true)
  const draft = { exerciseId: 'ch2-01', language: 'csharp', code: '' }
  for (const payload of [null, { ...draft, exerciseId: '../../x' }, { ...draft, language: 'python' }, { ...draft, code: 'x'.repeat(262145) }, { ...draft, command: 'execute' }]) {
    expect(await f.invoke(PRACTICE_CHANNELS.save, payload)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  }
  expect(f.update).not.toHaveBeenCalled()
  f.authorize.mockImplementationOnce(() => { throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Denied', retryable: false }) })
  expect(await f.bridge.save(draft as never)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  expect(f.update).not.toHaveBeenCalled()
  expect((await f.bridge.save(draft as never)).ok).toBe(true)
  expect(f.update).toHaveBeenCalledOnce()
  f.invoke.mockResolvedValueOnce({ ok: true, value: { exercises: [], state: {}, recovered: false } })
  expect((await f.bridge.load()).ok).toBe(false)
  await f.service.stop(); await f.packages.stop(); expect(f.handlers.size).toBe(0)
}, 30000)
it('waits for the correct owner/token close flush, rejects stale replies and resumes on failure/timeout', async () => {
  const f = await fixture()
  vi.useFakeTimers()
  const pending = f.service.prepareClose(1)
  const token = f.publish.mock.calls[0][2].token
  expect(await f.invoke(PRACTICE_CHANNELS.resolveClose, { token, saved: true }, 2)).toMatchObject({ ok: false })
  expect(await f.bridge.resolveClose(token, true)).toMatchObject({ ok: true })
  expect(await pending).toBe(true)
  expect(await f.bridge.resolveClose(token, true)).toMatchObject({ ok: false })
  const failed = f.service.prepareClose(1)
  const nextToken = f.publish.mock.calls.at(-1)![2].token
  await f.bridge.resolveClose(nextToken, false)
  expect(await failed).toBe(false)
  expect(f.publish).toHaveBeenLastCalledWith(1, PRACTICE_CHANNELS.resume, {})
  const timedOut = f.service.prepareClose(1)
  await vi.advanceTimersByTimeAsync(15000)
  expect(await timedOut).toBe(false)
  await f.service.stop(); await f.packages.stop()
})
it('bridges semantic close events only and unsubscribes listeners', async () => {
  const f = await fixture(), listener = vi.fn()
  const remove = f.bridge.onPrepareClose(listener)
  const wrapped = f.on.mock.calls[0][1]
  wrapped({}, { token: '../unsafe' }); expect(listener).not.toHaveBeenCalled()
  const token = '11111111-1111-1111-1111-111111111111'
  wrapped({}, { token }); expect(listener).toHaveBeenCalledWith(token)
  remove(); expect(f.removeListener).toHaveBeenCalledWith(PRACTICE_CHANNELS.prepareClose, wrapped)
  await f.service.stop(); await f.packages.stop()
})

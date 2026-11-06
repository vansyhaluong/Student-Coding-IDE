import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedExecutionCoordinator, type InferenceAdmission } from '../../src/main/services/learning/smart-hints/execution-coordinator'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { request, capture, output, start, reference } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const services: SmartHintsService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.stop(); vi.useRealTimers() })
function fixture() {
  let now = 1000000
  const reserve = vi.fn<(signal: AbortSignal) => Promise<void>>(async () => {})
  const clock = () => now, coordinator = new SharedExecutionCoordinator(clock, reserve)
  const scope = (controller = new AbortController()) => ({ signal: controller.signal, deadline: now + 10000, cancel: () => controller.abort() })
  const admit = () => {
    const result = coordinator.admit(scope())
    if (!result.ok) throw Error(result.code)
    return result.admission
  }
  return { coordinator, reserve, clock, scope, admit, advance: (ms: number) => { now += ms } }
}

describe('Main-private shared execution admission and reservation', () => {
  it('excludes a fake consumer while Smart Hints is running and vice versa', async () => {
    const f = fixture(), pending = gate<unknown>(), run = vi.fn(async () => pending.promise)
    const service = new SmartHintsService({ mode: 'FAKE', run }, f.clock, undefined, { timeoutMs: 10000 }, undefined, f.coordinator)
    services.push(service)
    const prepare = async (owner: number) => {
      const q = request()
      return service.prepare(owner, 'shared', q, () => {}, async generation => capture(q, generation))
    }
    const fake = f.admit(), p = await prepare(1)
    expect(service.start(1, 'shared', start(p))).toMatchObject({ state: 'FAILED', code: 'BUSY' })
    expect(run).not.toHaveBeenCalled()
    fake.release()
    const next = await prepare(1)
    service.start(1, 'shared', start(next))
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
    expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'BUSY' })
    pending.resolve(output)
    await vi.waitFor(() => expect(service.status(1, 'shared', reference(next)).state).toBe('COMPLETE'))
    const after = f.admit(); after.release()
  })
  it('shares exact minute/hour windows and retains consumed rate slots after release', () => {
    const f = fixture(), beginning = f.clock()
    for (let batch = 0; batch < 5; batch++) {
      for (let i = 0; i < 6; i++) f.admit().release()
      expect(f.coordinator.rateLimitReset()).toBe(batch === 4 ? beginning + 3600000 : f.clock() + 60000)
      expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'RATE_LIMIT' })
      if (batch < 4) f.advance(60000)
    }
    f.advance(3600000 - (f.clock() - beginning) - 1)
    expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'RATE_LIMIT' })
    f.advance(1)
    const allowed = f.admit(); allowed.release()
    expect(f.reserve).not.toHaveBeenCalled() // Metadata/pre-inference failures never touch the daily ledger.
  })
  it('deduplicates concurrent reservations, including failures, with no retry/refund', async () => {
    const f = fixture(), pending = gate<void>(), failed = new Error('synthetic reservation failure')
    f.reserve.mockImplementationOnce(async () => { await pending.promise; throw failed })
    const admission = f.admit(), signal = f.scope().signal
    const a = admission.reserveInference(signal), b = admission.reserveInference(signal)
    expect(a).toBe(b)
    await Promise.resolve(); expect(f.reserve).toHaveBeenCalledOnce()
    const rejection = expect(a).rejects.toBe(failed)
    pending.resolve(); await rejection
    await expect(admission.reserveInference(signal)).rejects.toBe(failed)
    expect(f.reserve).toHaveBeenCalledOnce()
    admission.release(); await f.coordinator.drain()
  })
  it('an early release cannot overlap pending ledger I/O or reuse an old lease', async () => {
    const f = fixture(), pending = gate<void>()
    f.reserve.mockImplementationOnce(() => pending.promise)
    const admission = f.admit(), reservation = admission.reserveInference(f.scope().signal)
    await Promise.resolve()
    admission.release()
    expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'BUSY' })
    const rejection = expect(reservation).rejects.toMatchObject({ code: 'TIMEOUT' })
    pending.resolve(); await rejection; await f.coordinator.drain()
    const next = f.admit()
    admission.release()
    await expect(admission.reserveInference(f.scope().signal)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'BUSY' })
    next.release()
  })
  it.each(['cancel', 'deadline', 'shutdown'])('%s prevents reservation without releasing unsettled execution', async mode => {
    const f = fixture(), controller = new AbortController(), result = f.coordinator.admit(f.scope(controller))
    if (!result.ok) throw Error()
    if (mode === 'cancel') controller.abort()
    if (mode === 'deadline') f.advance(10000)
    if (mode === 'shutdown') f.coordinator.beginShutdown()
    await expect(result.admission.reserveInference(controller.signal)).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(f.reserve).not.toHaveBeenCalled()
    if (mode !== 'deadline') expect(controller.signal.aborted).toBe(true)
    if (mode !== 'shutdown') expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'BUSY' })
    result.admission.release(); await f.coordinator.drain()
    if (mode === 'shutdown') expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'TIMEOUT' })
  })
  it('consumer cancellation waits for its cleanup before another admission', async () => {
    const f = fixture(), controller = new AbortController(), result = f.coordinator.admit(f.scope(controller))
    if (!result.ok) throw Error()
    let drained = false
    const cancellation = f.coordinator.cancelActive().then(() => { drained = true })
    await Promise.resolve()
    expect(controller.signal.aborted).toBe(true); expect(drained).toBe(false)
    expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'BUSY' })
    result.admission.release(); await cancellation
    expect(drained).toBe(true)
  })
  it('Smart Hints keeps its 10s timer and slot until an abort-ignoring provider settles', async () => {
    vi.useFakeTimers()
    const f = fixture(), pending = gate<unknown>(), run = vi.fn(async () => pending.promise)
    const service = new SmartHintsService({ mode: 'FAKE', run }, f.clock, undefined, { timeoutMs: 10000 }, undefined, f.coordinator)
    services.push(service)
    const q = request(), p = await service.prepare(1, 'timeout', q, () => {}, async generation => capture(q, generation))
    service.start(1, 'timeout', start(p)); await Promise.resolve()
    f.advance(10000); await vi.advanceTimersByTimeAsync(10000)
    expect(service.status(1, 'timeout', reference(p))).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(f.coordinator.admit(f.scope())).toEqual({ ok: false, code: 'BUSY' })
    pending.resolve(output); await service.stop()
    const next: InferenceAdmission = f.admit(); next.release()
    expect(service.status.bind(service, 1, 'timeout', reference(p))).toThrow()
  })
})

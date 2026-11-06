import { afterEach, expect, it, vi } from 'vitest'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { SelectionFixError } from '../../src/main/services/learning/smart-hints/selection-fix-diagnostics'
import { request, capture, fixAction, start, reference } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const services: SmartHintsService[] = []
afterEach(async () => { for (const service of services.splice(0)) await service.stop() })
function fixture() {
  const run = vi.fn(async () => ({ kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'Synthetic advice.' }))
  const availability = vi.fn(async (language: string) => language === 'javascript')
  const ready = vi.fn(async () => {}), dispose = vi.fn(async () => {})
  const service = new SmartHintsService({ mode: 'FAKE', run }, Date.now, undefined, { timeoutMs: 30000 },
    { availability, preflight: async () => ({ assertReady: ready, verify: async () => {}, dispose }) })
  services.push(service)
  return { service, run, availability, ready, dispose }
}
it('advertises only freshly probed parser languages, with no inference or reservation', async () => {
  const f = fixture()
  expect(f.service.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
  const [a, b] = await Promise.all([f.service.probeCapabilities(), f.service.probeCapabilities()])
  expect(a).toEqual(b); expect(a).toMatchObject({ suggestFixMode: 'SELECTION_V1', suggestFixLanguages: ['javascript'] })
  expect(f.availability).toHaveBeenCalledTimes(2); expect(f.run).not.toHaveBeenCalled(); expect(f.service.rateLimitReset()).toBeNull()
  const q = request({ language: 'csharp', action: fixAction() })
  await expect(f.service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))).rejects.toThrow()
  expect(f.run).not.toHaveBeenCalled(); expect(f.service.rateLimitReset()).toBeNull()
})
it('runtime changes disable that language and do not dispatch inference or grant a proposal', async () => {
  const f = fixture(); await f.service.probeCapabilities()
  const q = request({ action: fixAction() }), p = await f.service.prepare(1, 'doc', q, () => {}, async g => capture(q, g))
  f.ready.mockRejectedValueOnce(new SelectionFixError('PROVIDER', 'GUARD_RUNTIME', 'ASSET_CHANGED'))
  f.service.start(1, 'doc', start(p))
  await vi.waitFor(() => expect(f.service.status(1, 'doc', reference(p))).toMatchObject({ state: 'FAILED', code: 'PROVIDER' }))
  expect(f.service.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
  expect(f.run).not.toHaveBeenCalled(); expect(f.dispose).toHaveBeenCalledOnce()
})
it('provider rotation aborts a pending local probe and drops its late availability', async () => {
  const f = fixture(), held = gate<boolean>()
  f.availability.mockImplementation(() => held.promise)
  const probe = f.service.probeCapabilities()
  await vi.waitFor(() => expect(f.availability).toHaveBeenCalledTimes(2))
  const rotating = f.service.configureProvider()
  held.resolve(true); await Promise.all([probe, rotating])
  expect(f.service.capabilities()).toMatchObject({ enabled: false, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
  expect(f.run).not.toHaveBeenCalled()
})
it('parser exceptions fail closed independently from other actions', async () => {
  const f = fixture(); f.availability.mockRejectedValue(new Error('PRIVATE_CANARY'))
  expect(await f.service.probeCapabilities()).toMatchObject({ enabled: true, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
  expect(f.run).not.toHaveBeenCalled()
})

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveUiAcceptance, liveUiApproval, LIVE_UI_SAMPLES, type LiveUiOptions } from '../../src/main/services/learning/smart-hints/live-ui-acceptance'
import type { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { capture, request, start, reference, output } from '../fixtures/learning/smart-hints'

const flags = ['--sh4-live-ui', '--live-ui-approved', '--free-tier-confirmed', '--samples-only-confirmed',
  '--approval-id', 'offline-test', '--budget', '2', '--project-id', 'sample-project']
const roots: string[] = [], services: SmartHintsService[] = []
afterEach(async () => { await Promise.all(services.splice(0).map(s => s.stop())); vi.useRealTimers(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup(patch: Partial<LiveUiOptions> = {}, response = 'ok') {
  const root = await mkdtemp(join(tmpdir(), 'sh4-ui-')); roots.push(root)
  const send = vi.fn(async (r: Request) => {
    if (r.method === 'GET') return Response.json({ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 })
    if (response === '429') return Response.json({}, { status: 429 })
    if (response === 'pending') return new Promise<Response>((_, reject) => r.signal.addEventListener('abort', () => reject(Error('abort')), { once: true }))
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: response === 'invalid' ? '{broken' : JSON.stringify(output) }] } }] })
  })
  const readKey = vi.fn(() => 'AQ.SYNTHETIC_ONLY_LIVE_UI'), confirm = vi.fn(async () => true)
  const options: LiveUiOptions = { development: true, argv: flags, evidenceRoot: root, readKey, confirm, transport: { send }, ...patch }
  const service = await createLiveUiAcceptance(options)
  if (service) services.push(service)
  return { service: service!, options, root, send, readKey, confirm }
}
async function run(service: SmartHintsService, patch: Parameters<typeof request>[0] = {}) {
  const q = request({ exerciseId: 'ch2-01', source: LIVE_UI_SAMPLES.javascript, ...patch })
  const prepared = await service.prepare(1, 'scope', q, () => {}, async g => capture(q, g))
  service.start(1, 'scope', start(prepared))
  return reference(prepared)
}
describe('SH-4 live UI Main launcher gate + real Gemini adapter/service, fake HTTP only', () => {
  it.each(['--live-ui-approved', '--free-tier-confirmed', '--samples-only-confirmed', '--budget', '--project-id', '--approval-id'])(
    'missing %s cannot provision or read key', async flag => {
      const args = flags.filter((value, i) => value !== flag && !(flags[i - 1] === flag && !flag.endsWith('confirmed') && flag !== '--live-ui-approved'))
      const readKey = vi.fn(), confirm = vi.fn()
      await expect(setup({ argv: args, readKey, confirm })).rejects.toThrow('SH4_UI_GATE_INVALID')
      expect(readKey).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled()
    })
  it.each(['0', '-1', '31', '1.5', '01', 'Infinity', 'abc'])('rejects invalid budget %s', budget => {
    expect(() => liveUiApproval(flags.map(v => v === '2' ? budget : v))).toThrow()
  })
  it('packaged or normal development is disabled before dialog, disk or secret access', async () => {
    for (const patch of [{ development: false }, { argv: [] }]) {
      const f = await setup(patch)
      expect(f.service).toBeUndefined(); expect(f.readKey).not.toHaveBeenCalled(); expect(f.confirm).not.toHaveBeenCalled()
      expect(f.send).not.toHaveBeenCalled(); expect(await readdir(f.root)).toEqual([])
    }
  })
  it('cancel terms or missing key sends nothing; opening enabled UI sends nothing', async () => {
    const cancelled = await setup({ confirm: async () => false })
    expect(cancelled.service.capabilities().enabled).toBe(false); expect(cancelled.readKey).not.toHaveBeenCalled()
    const missing = await setup({ readKey: () => undefined })
    expect(missing.service.capabilities().enabled).toBe(false)
    const f = await setup(); expect(f.service.capabilities().enabled).toBe(true); expect(f.send).not.toHaveBeenCalled()
  })
  it('one launch per approval; budget reservation is durable, no GET/POST after exhaustion or renewal on relaunch', async () => {
    const f = await setup()
    for (let i = 0; i < 2; i++) {
      const ref = await run(f.service)
      await vi.waitFor(() => expect(f.service.status(1, 'scope', ref).state).toBe('COMPLETE'))
    }
    const exhausted = await run(f.service)
    await vi.waitFor(() => expect(f.service.status(1, 'scope', exhausted)).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' }))
    expect(f.send).toHaveBeenCalledTimes(4)
    expect(await readdir(join(f.root, 'offline-test'))).toEqual(['approval.json', 'inference-1.json', 'inference-2.json'])
    expect(await readFile(join(f.root, 'offline-test', 'approval.json'), 'utf8')).not.toContain('SYNTHETIC')
    const readKey = vi.fn()
    await expect(createLiveUiAcceptance({ ...f.options, readKey })).rejects.toThrow()
    expect(readKey).not.toHaveBeenCalled()
  })
  it.each([{ exerciseId: 'ch2-02' }, { source: LIVE_UI_SAMPLES.javascript + '// private' }, { source: 'my personal source' }])(
    'rejects non-sample capture before model GET: %j', async patch => {
      const f = await setup(), ref = await run(f.service, patch)
      await vi.waitFor(() => expect(f.service.status(1, 'scope', ref)).toMatchObject({ state: 'FAILED', code: 'INVALID_INPUT' }))
      expect(f.send).not.toHaveBeenCalled()
    })
  it.each(['429', 'invalid'])('API %s consumes reservation without retry', async response => {
    const f = await setup({}, response), ref = await run(f.service)
    await vi.waitFor(() => expect(f.service.status(1, 'scope', ref)).toMatchObject({ state: 'FAILED', code: response === '429' ? 'RATE_LIMIT' : 'INVALID_RESPONSE' }))
    expect(f.send).toHaveBeenCalledTimes(2); expect(await readdir(join(f.root, 'offline-test'))).toContain('inference-1.json')
  })
  it('expired approval sends no HTTP', async () => {
    let now = Date.now()
    const f = await setup({ clock: () => now }); now += 30 * 60000
    const ref = await run(f.service)
    await vi.waitFor(() => expect(f.service.status(1, 'scope', ref)).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' }))
    expect(f.send).not.toHaveBeenCalled()
  })
  it('shutdown aborts pending HTTP, disables capability and preserves spent slot', async () => {
    const f = await setup({}, 'pending'); await run(f.service)
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(2))
    const signal = f.send.mock.calls[1][0].signal
    await f.service.stop(); expect(signal.aborted).toBe(true); expect(f.service.capabilities().enabled).toBe(false)
    expect(await readdir(join(f.root, 'offline-test'))).toContain('inference-1.json')
  })
  it('30s UI acceptance timeout aborts transport, retains reservation and cleans timers', async () => {
    vi.useFakeTimers()
    const f = await setup({}, 'pending'), ref = await run(f.service)
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(30001)
    expect(f.service.status(1, 'scope', ref)).toMatchObject({ state: 'FAILED', code: 'TIMEOUT' })
    expect(f.send.mock.calls[1][0].signal.aborted).toBe(true)
    await f.service.stop(); expect(vi.getTimerCount()).toBe(0)
    expect(await readdir(join(f.root, 'offline-test'))).toContain('inference-1.json')
  })
  it('unverifiable model stops before reservation or POST', async () => {
    const send = vi.fn(async () => Response.json({ name: 'models/other-model' }))
    const f = await setup({ transport: { send } }), ref = await run(f.service)
    await vi.waitFor(() => expect(f.service.status(1, 'scope', ref)).toMatchObject({ state: 'FAILED', code: 'PROVIDER' }))
    expect(send).toHaveBeenCalledTimes(1)
    expect(await readdir(join(f.root, 'offline-test'))).toEqual(['approval.json'])
  })
  it('safe Main notices distinguish key, approval and exhausted budget without emitting key material', async () => {
    const missing = vi.fn(), invalid = vi.fn(), cancelled = vi.fn(), used = vi.fn(), exhausted = vi.fn()
    await setup({ readKey: () => undefined, notice: missing })
    expect(missing).toHaveBeenCalledWith('SH4_UI_KEY_MISSING')
    await setup({ readKey: () => 'invalid', notice: invalid })
    expect(invalid).toHaveBeenCalledWith('SH4_UI_KEY_FORMAT_INVALID')
    await setup({ confirm: async () => false, notice: cancelled })
    expect(cancelled).toHaveBeenCalledWith('SH4_UI_APPROVAL_CANCELLED')
    const f = await setup({ notice: used })
    const readKey = vi.fn()
    await expect(createLiveUiAcceptance({ ...f.options, notice: used, readKey })).rejects.toThrow()
    expect(used).toHaveBeenCalledWith('SH4_UI_APPROVAL_ALREADY_USED'); expect(readKey).not.toHaveBeenCalled()
    const one = await setup({ argv: flags.map(v => v === '2' ? '1' : v), notice: exhausted })
    const ref = await run(one.service); await vi.waitFor(() => expect(one.service.status(1, 'scope', ref).state).toBe('COMPLETE'))
    const noBudget = await run(one.service); await vi.waitFor(() => expect(one.service.status(1, 'scope', noBudget)).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' }))
    expect(exhausted).toHaveBeenCalledWith('SH4_UI_BUDGET_EXHAUSTED')
    expect(JSON.stringify([missing.mock.calls, invalid.mock.calls, cancelled.mock.calls, used.mock.calls, exhausted.mock.calls])).not.toContain('AQ.SYNTHETIC')
  })
  it('budget3 stays three across capability probes; fourth action sends no model GET or POST', async () => {
    const f = await setup({ argv: flags.map(v => v === '2' ? '3' : v) })
    for (let i = 0; i < 3; i++) {
      expect(f.service.capabilities().enabled).toBe(true)
      const ref = await run(f.service)
      await vi.waitFor(() => expect(f.service.status(1, 'scope', ref).state).toBe('COMPLETE'))
    }
    const ref = await run(f.service)
    await vi.waitFor(() => expect(f.service.status(1, 'scope', ref)).toMatchObject({ state: 'FAILED', code: 'RATE_LIMIT' }))
    expect(f.send).toHaveBeenCalledTimes(6)
    expect((await readdir(join(f.root, 'offline-test'))).filter(name => name.startsWith('inference-'))).toHaveLength(3)
    expect(JSON.parse(await readFile(join(f.root, 'offline-test', 'approval.json'), 'utf8')).budget).toBe(3)
  })
})

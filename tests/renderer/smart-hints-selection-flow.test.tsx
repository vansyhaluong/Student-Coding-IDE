/** @vitest-environment jsdom */
import { webcrypto, randomUUID } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSmartHints } from '../../src/renderer/src/features/learning/practice/use-smart-hints'
import { SmartHintsPanel } from '../../src/renderer/src/features/learning/practice/SmartHintsPanel'
import { selectedRange, type PracticeFixSnapshot } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { GeminiSmartHintsAdapter, GEMINI_MODEL } from '../../src/main/services/learning/smart-hints/gemini-provider'
import { SelectionFixError } from '../../src/main/services/learning/smart-hints/selection-fix-diagnostics'
import { createSmartHintsBridge } from '../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { SMART_HINT_CHANNELS as C, type SmartPrepare, type SmartStart, type SmartReference, type SmartRetire } from '../../src/shared/contracts/smart-hints'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'
import { capture } from '../fixtures/learning/smart-hints'
import { gate } from '../fixtures/learning/analysis'

const services: SmartHintsService[] = []
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(async () => { cleanup(); for (const s of services.splice(0)) await s.stop(); vi.unstubAllGlobals() })

function fixture(options: { language?: ExerciseLanguage; selection?: string; languages?: ExerciseLanguage[]; output?: unknown; preflightError?: boolean } = {}) {
  const language = options.language ?? 'javascript'
  const source = language === 'javascript'
    ? 'function solve(x) {\n const value = x;\n return value;\n}\nconst tail = 1;'
    : 'public class Solution {\n public int Solve(int x) {\n int value = x;\n return value;\n }\n}'
  const data = { source, revision: 1, version: 1, modelId: randomUUID(), epoch: 0, selectionEpoch: 0,
    selection: selectedRange(source, source.indexOf('return value;'), source.indexOf('return value;') + 13)! }
  if (options.selection) {
    const at = options.selection === 'value' ? source.indexOf('value;') : source.indexOf(options.selection)
    data.selection = selectedRange(source, at, at + options.selection.length)!
  }
  let prepareGate: ReturnType<typeof gate<void>> | undefined, providerGate: ReturnType<typeof gate<void>> | undefined
  const reserve = vi.fn(async () => {}), verify = vi.fn(async () => {}), dispose = vi.fn(async () => {})
  const availability = vi.fn(async (l: ExerciseLanguage) => (options.languages ?? ['csharp', 'javascript']).includes(l))
  const send = vi.fn(async (r: Request) => {
    if (r.method === 'GET') return Response.json({ name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 })
    const body = await r.json(), input = JSON.parse(body.contents[0].parts[0].text)
    if (providerGate) await providerGate.promise
    const output = input.action.kind === 'HINT'
      ? { kind: 'HINT', level: input.action.level, paragraphs: [`Hint ${input.action.level}`], nextQuestion: 'Next?', evidence: [] }
      : options.output ?? { kind: 'EDIT_PROPOSAL', replacementText: input.action.selection.text === 'value' ? 'value + 1'
        : input.action.selection.text.replace('return value;', 'return value + 1;'), rationale: 'Synthetic focused change.', evidence: [] }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(output) }] } }] })
  })
  const service = new SmartHintsService(new GeminiSmartHintsAdapter({ send }, { value: () => 'SYNTHETIC_D65_ONLY_KEY', clear() {} }, { beforeInference: reserve }),
    Date.now, undefined, { timeoutMs: 30000 }, { availability, preflight: async () => {
      if (options.preflightError) throw new SelectionFixError('INVALID_INPUT', 'PREFLIGHT', 'TARGET')
      return { assertReady: async () => {}, verify, dispose }
    } })
  services.push(service)
  const invoke = vi.fn(async (channel: string, value: unknown) => {
    try {
      if (channel === C.capabilities) return { ok: true, value: await service.probeCapabilities() }
      if (channel === C.prepare) {
        const q = value as SmartPrepare
        const result = await service.prepare(1, 'document', q, () => {}, async g => capture(q, g))
        if (prepareGate) await prepareGate.promise
        return { ok: true, value: result }
      }
      if (channel === C.start) return { ok: true, value: service.start(1, 'document', value as SmartStart) }
      if (channel === C.status) return { ok: true, value: service.status(1, 'document', value as SmartReference) }
      if (channel === C.cancel) return { ok: true, value: service.cancel(1, 'document', value as SmartReference) }
      if (channel === C.retireContext) { service.retireContext(1, 'document', value as SmartRetire); return { ok: true, value: null } }
    } catch { return { ok: false, error: { code: 'INVALID_INPUT', message: 'Safe denial', retryable: false } } }
    throw Error('Unexpected channel')
  })
  const api = createSmartHintsBridge({ invoke, on: vi.fn(), removeListener: vi.fn() }, createLearningOrder())
  let controller!: ReturnType<typeof useSmartHints>
  const snapshot = (): PracticeFixSnapshot => {
    const saved = { ...data }, selection = { ...data.selection }; let frozen = false
    const isCurrent = () => data.epoch === saved.epoch && data.revision === saved.revision && data.version === saved.version
      && data.modelId === saved.modelId && data.source === saved.source && (frozen || data.selectionEpoch === saved.selectionEpoch)
    return { exerciseId: 'synthetic', language, source: saved.source, sourceRevision: saved.revision, selection,
      origin: { kind: 'PRACTICE', modelId: saved.modelId, modelVersion: saved.version, eol: 'LF' }, isCurrent,
      freezeTarget: () => { if (!isCurrent()) return false; frozen = true; return true } }
  }
  function Harness() {
    const hints = useSmartHints({ active: true, locked: false, exerciseId: 'synthetic', language, source: data.source, sourceRevision: data.revision }, api)
    controller = hints
    return <><button onClick={hints.show}>Open</button>{hints.open && <SmartHintsPanel hints={hints} onClose={hints.close} onExplain={() => {}}
      selectionFixReadiness={{ exerciseId: 'synthetic', language, sourceRevision: data.revision, state: 'READY', range: data.selection, selectedBytes: data.selection.text.length }}
      onAction={kind => { const s = snapshot(); void hints.begin(kind === 'SUGGEST_FIX' ? { kind, selection: s.selection }
        : kind === 'HINT' ? { kind, level: hints.view.hints.length ? 2 : 1 } : { kind }, s) }} onPreview={() => {}} />}</>
  }
  const ui = render(<Harness />)
  return { ...ui, service, data, send, invoke, reserve, verify, dispose, snapshot,
    get controller() { return controller },
    rerenderData(patch: Partial<typeof data>) { Object.assign(data, patch); ui.rerender(<Harness />) },
    select(text: string) { data.selectionEpoch++; const at = data.source.indexOf(text); data.selection = selectedRange(data.source, at, at + text.length)!; controller.selectionChanged(); ui.rerender(<Harness />) },
    holdPrepare() { prepareGate = gate<void>(); return prepareGate }, holdProvider() { providerGate = gate<void>(); return providerGate } }
}
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function open() { await click('Open'); await screen.findByText('Google Gemini · gemini-3.1-flash-lite') }
async function consent() { await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot') }

describe('D6-5 panel → typed preload → Main → fake Gemini → canonical proposal', () => {
  it.each(['value', 'return value;', 'const value = x;\n return value;', 'function solve(x) {\n const value = x;\n return value;\n}'])('exact frozen target %j, consent then one inference', async selection => {
    const f = fixture({ selection }); await open(); await click('Suggest Fix'); const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Gemini nhận toàn bộ source và vùng chọn'); expect(f.send).not.toHaveBeenCalled()
    await consent(); await screen.findByRole('button', { name: 'Diff Preview' })
    expect(f.reserve).toHaveBeenCalledOnce(); expect(f.verify).toHaveBeenCalledOnce()
    expect(f.send.mock.calls.map(([r]) => r.method)).toEqual(['GET', 'POST'])
    const fix = f.controller.previewFix()!
    expect(fix.result.output).toMatchObject({ edits: [{ startOffset: f.data.selection.startOffset, endOffset: f.data.selection.endOffset, expectedOldText: selection }] })
    expect(fix.source).toBe(f.data.source); expect(fix.candidate).not.toBe(fix.source)
    expect(fix.consume()).toBe(true); expect(fix.consume()).toBe(false)
  })
  it('selection change before consent cancels just Fix and preserves Hint progression', async () => {
    const f = fixture(); await open(); await click('Get Hint · Level 1'); await consent(); await screen.findByText('Hint 1')
    await click('Suggest Fix'); await screen.findByRole('dialog')
    act(() => f.select('value'))
    expect(screen.queryByRole('dialog')).toBeNull(); expect(f.reserve).toHaveBeenCalledOnce()
    await waitFor(() => expect(f.invoke.mock.calls.some(([c]) => c === C.cancel)).toBe(true))
    expect(f.invoke.mock.calls.some(([c]) => c === C.retireContext)).toBe(false)
    await click('Get Hint · Level 2'); await consent(); await screen.findByText('Hint 2')
    expect(f.reserve).toHaveBeenCalledTimes(2)
  })
  it('late prepare ACK is cancelled by reference, not by retiring Hint context', async () => {
    const f = fixture(), held = f.holdPrepare(); await open(); await click('Suggest Fix')
    await waitFor(() => expect(f.invoke.mock.calls.some(([c]) => c === C.prepare)).toBe(true))
    act(() => f.select('value')); await act(async () => { held.resolve() })
    await waitFor(() => expect(f.invoke.mock.calls.some(([c]) => c === C.cancel)).toBe(true))
    expect(f.invoke.mock.calls.some(([c]) => c === C.retireContext)).toBe(false)
    expect(f.reserve).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('a cancelled Fix capability reply cannot overwrite a newer Hint consent', async () => {
    const f = fixture(), held = gate<void>(), actual = f.invoke.getMockImplementation()!
    f.invoke.mockImplementationOnce(async (...args) => { const value = await actual(...args); await held.promise; return value })
    let old!: Promise<void>
    act(() => { const s = f.snapshot(); old = f.controller.begin({ kind: 'SUGGEST_FIX', selection: s.selection }, s) })
    await waitFor(() => expect(f.invoke).toHaveBeenCalledOnce())
    act(() => { f.select('value') })
    act(() => { void f.controller.begin({ kind: 'HINT', level: 1 }, f.snapshot()) })
    await screen.findByRole('dialog')
    await act(async () => { held.resolve(); await old })
    expect(screen.getByRole('dialog').textContent).toContain('Hint Level 1')
    expect(f.reserve).not.toHaveBeenCalled()
    await consent(); await screen.findByText('Hint 1')
    expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('after consent cursor movement keeps target and preview bound to the original selection', async () => {
    const f = fixture(), held = f.holdProvider(); await open(); await click('Suggest Fix'); await consent()
    await waitFor(() => expect(f.reserve).toHaveBeenCalledOnce()); const original = { ...f.data.selection }
    act(() => f.select('value')); await act(async () => held.resolve()); await screen.findByRole('button', { name: 'Diff Preview' })
    expect(f.controller.previewFix()!.result.output).toMatchObject({ edits: [{ startOffset: original.startOffset, endOffset: original.endOffset, expectedOldText: original.text }] })
    expect(f.invoke.mock.calls.some(([c]) => c === C.cancel || c === C.retireContext)).toBe(false)
  })
  it.each(['revision', 'model', 'source'] as const)('%s changes reject a late response without a preview grant', async mode => {
    const f = fixture(), held = f.holdProvider(); await open(); await click('Suggest Fix'); await consent()
    await waitFor(() => expect(f.reserve).toHaveBeenCalledOnce())
    act(() => { f.rerenderData(mode === 'revision' ? { revision: 2 } : mode === 'model' ? { modelId: randomUUID(), version: 2 } : { source: f.data.source + ' ', revision: 2 }); f.controller.invalidate('EDIT') })
    await act(async () => held.resolve())
    expect(f.controller.previewFix()).toBeUndefined(); expect(screen.queryByRole('button', { name: 'Diff Preview' })).toBeNull()
    expect(f.controller.canRetry).toBe(false)
    expect(f.reserve).toHaveBeenCalledOnce()
  })
  it.each([
    { kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'Synthetic advice only.' },
    { kind: 'EDIT_PROPOSAL', replacementText: 'x + 1', rationale: 'Synthetic', evidence: ['R9'] },
  ])('NO_FIX/invalid wire never exposes a Diff or grant %#', async output => {
    const f = fixture({ output }); await open(); await click('Suggest Fix'); await consent()
    if (output.kind === 'NO_FIX') await screen.findByText('Synthetic advice only.')
    else await screen.findByRole('alert')
    expect(f.controller.previewFix()).toBeUndefined(); expect(screen.queryByRole('button', { name: 'Diff Preview' })).toBeNull()
    expect(f.verify).not.toHaveBeenCalled(); expect(f.reserve).toHaveBeenCalledOnce()
  })
  it('parser unavailable leaves Fix disabled while Hint stays available; probes are free of inference', async () => {
    const f = fixture({ languages: [] }); await open()
    expect((screen.getByRole('button', { name: 'Suggest Fix' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Get Hint · Level 1' }) as HTMLButtonElement).disabled).toBe(false)
    expect(f.service.capabilities()).toMatchObject({ suggestFixMode: 'DISABLED', suggestFixLanguages: [] })
    expect(f.send).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('preflight rejection leaves an actionable failure instead of an indefinite recovery/poll loop', async () => {
    const f = fixture({ preflightError: true }); await open(); await click('Suggest Fix')
    await screen.findByRole('alert')
    expect(f.controller.busy).toBe(false); expect(f.controller.canRetry).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull(); expect(f.controller.previewFix()).toBeUndefined()
    expect(f.reserve).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
    expect(f.invoke.mock.calls.filter(([c]) => c === C.prepare)).toHaveLength(1)
    expect(f.invoke.mock.calls.some(([c]) => c === C.start || c === C.status)).toBe(false)
  })
})

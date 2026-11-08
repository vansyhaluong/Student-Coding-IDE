/** @vitest-environment jsdom */
import { useEffect, useRef, useState } from 'react'
import { webcrypto, randomUUID } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { Exercise, ExerciseLanguage } from '../../src/shared/contracts/practice'
import { SMART_HINT_CHANNELS as C, type SmartPrepare, type SmartStart, type SmartReference, type SmartRetire } from '../../src/shared/contracts/smart-hints'
import { PracticeWorkspace } from '../../src/renderer/src/features/learning/practice/PracticeWorkspace'
import type { useSubmission } from '../../src/renderer/src/features/learning/practice/use-submission'
import { capturePracticeSelection, createPracticeFixSelectionBinding, type PracticeHintEditor, type PracticeFixReadiness } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { applySmartFix } from '../../src/renderer/src/features/learning/practice/smart-hint-edits'
import { createSmartHintsBridge } from '../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { chatIpcFixture, chatEnvelope } from '../fixtures/learning/chat-ipc'
import { capture, snapshot as runSnapshot } from '../fixtures/learning/smart-hints'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { cancelSmartHintsOperation } from '../../src/main/ipc/exercise-ipc-service'

const host = vi.hoisted(() => ({ monaco: undefined as unknown, ready: undefined as (() => void) | undefined,
  model: undefined as editor.ITextModel | undefined, select: undefined as (() => void) | undefined, execute: vi.fn() }))
type Monaco = typeof import('monaco-editor/editor/editor.api')
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: {
  Uri: { parse: (s: string) => (host.monaco as Monaco).Uri.parse(s) }, editor: {
    createModel: (s: string, l: string, uri: unknown) => (host.monaco as Monaco).editor.createModel(s, l, uri as import('monaco-editor').Uri),
    createDiffEditor: () => ({ onDidUpdateDiff: (cb: () => void) => { host.ready = cb; return { dispose() {} } },
      getLineChanges: () => [], setModel() {}, dispose() {}, layout() {}, updateOptions() {} }),
  },
} }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeDescription', () => ({ PracticeDescription: () => <div>Description</div> }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({ PracticeEditor: (props: {
  exercise: Exercise; language: ExerciseLanguage; code: string; sourceRevision: number; applyBlocked: boolean;
  onChange(s: string): void; onHintEditor?(e: PracticeHintEditor | undefined): void; onFixSelectionReadiness?(r: PracticeFixReadiness): void
}) => {
  const latest = useRef(props); latest.current = props
  useEffect(() => {
    const m = host.monaco as Monaco, id = randomUUID()
    const model = m.editor.createModel(props.code, props.language, m.Uri.parse(`practice:///${props.exercise.id}/solution.${props.language === 'javascript' ? 'js' : 'cs'}`))
    host.model = model
    const start = props.code.indexOf('return n;'), end = start + 'return n;'.length
    let range = m.Selection.fromPositions(model.getPositionAt(start), model.getPositionAt(end))
    const listeners = new Set<() => void>()
    const ed = { getModel: () => model, getSelection: () => range, getSelections: () => [range],
      getScrollTop: () => 0, getScrollLeft: () => 0, setScrollPosition() {}, focus() {},
      onDidChangeCursorSelection: (cb: () => void) => { listeners.add(cb); return { dispose: () => listeners.delete(cb) } },
      onDidChangeModel: () => ({ dispose() {} }), onDidChangeModelContent: (cb: () => void) => model.onDidChangeContent(cb),
      pushUndoStop: () => model.pushStackElement(), executeEdits: (_s: string, edits: editor.IIdentifiedSingleEditOperation[]) => {
        host.execute(); model.pushEditOperations([range], edits, () => [range]); return true
      },
    } as unknown as editor.IStandaloneCodeEditor
    const binding = createPracticeFixSelectionBinding(ed, () => ({ exerciseId: latest.current.exercise.id,
      language: latest.current.language, source: latest.current.code, sourceRevision: latest.current.sourceRevision, modelId: id }),
    value => latest.current.onFixSelectionReadiness?.(value))
    host.select = () => { range = new m.Selection(1, 1, 1, 3); listeners.forEach(f => f()) }
    props.onHintEditor?.({ capture: () => capturePracticeSelection(ed, latest.current.exercise.id, latest.current.language, id), captureFix: binding.capture,
      focus() {}, applyFix: fix => applySmartFix(ed, fix, { exerciseId: latest.current.exercise.id, language: latest.current.language,
        source: latest.current.code, sourceRevision: latest.current.sourceRevision, modelId: id, blocked: latest.current.applyBlocked },
      (a, b, c, d) => new m.Selection(a, b, c, d)) })
    const sub = model.onDidChangeContent(() => latest.current.onChange(model.getValue()))
    return () => { sub.dispose(); binding.dispose(); latest.current.onHintEditor?.(undefined); model.dispose(); host.model = undefined }
  }, [])
  return <pre aria-label="Unified test editor">{props.code}</pre>
} }))

const fixtures: Awaited<ReturnType<typeof chatIpcFixture>>[] = []
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  host.monaco = await import('monaco-editor/editor/editor.api')
  ;(host.monaco as Monaco).languages.register({ id: 'javascript' })
  ;(host.monaco as Monaco).languages.register({ id: 'csharp' })
}, 30000)
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }); host.execute.mockClear()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(async () => { cleanup(); (host.monaco as Monaco).editor.getModels().forEach(m => m.dispose()); for (const f of fixtures.splice(0)) await f.close(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function gate<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function fixture() {
  const verify = vi.fn(async () => {}), dispose = vi.fn(async () => {})
  const f = await chatIpcFixture({ availability: async () => true, preflight: async () => ({ assertReady: async () => {}, verify, dispose }) })
  fixtures.push(f)
  const original = f.send.getMockImplementation()!
  let output: unknown, held: ReturnType<typeof gate<void>> | undefined, fail = false, hintCount = 0
  f.send.mockImplementation(async r => {
    if (r.method === 'GET') return original(r)
    const input = JSON.parse((await r.clone().json()).contents.at(-1).parts[0].text)
    if (held) await held.promise
    if (fail) return new Response('', { status: 503 })
    const kind = input.action?.kind
    return Response.json(chatEnvelope(output ?? (kind === 'HINT' ? { kind, thinking: `UI_HINT_${++hintCount}`, steps: ['Use the input.'], code: { language: input.language, text: 'return n + 1;' }, evidence: [] }
      : kind === 'ANALYZE' ? { kind: 'ANALYSIS', hypotheses: ['UI_ANALYZE'], suggestions: [], evidence: [] }
        : kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'UI_EXPLAIN', variables: 'Variable', controlFlow: 'Flow', algorithm: 'Algorithm', illustrativeExamples: [] }
          : kind === 'SUGGEST_FIX' ? { kind: 'EDIT_PROPOSAL', replacementText: 'return n + 1;', rationale: 'UI_FIX', evidence: [] }
            : { kind: 'CHAT_REPLY', text: 'UI_CHAT' })))
  })
  const invoke = vi.fn(async (c: string, value: unknown) => {
    try {
      const s = f.config.service
      if (c === C.capabilities) return { ok: true, value: await s.probeCapabilities() }
      if (c === C.prepare) { const q = value as SmartPrepare; return { ok: true, value: await s.prepare(1, 'document', q, () => {}, async g => capture(q, g)) } }
      if (c === C.start) return { ok: true, value: s.start(1, 'document', value as SmartStart) }
      if (c === C.status) return { ok: true, value: s.status(1, 'document', value as SmartReference) }
      if (c === C.cancel) return { ok: true, value: cancelSmartHintsOperation(s, 1, 'document', value as SmartReference) }
      if (c === C.retireContext) { s.retireContext(1, 'document', value as SmartRetire); return { ok: true, value: null } }
    } catch { return { ok: false, error: { code: 'INVALID_INPUT', message: 'Denied', retryable: false } } }
    throw Error('Unexpected channel')
  })
  const smartHints = createSmartHintsBridge({ invoke, on: vi.fn(), removeListener: vi.fn() }, createLearningOrder())
  window.studentIde = { learning: { chat: f.api, smartHints } } as StudentIdeApi
  const exercise: Exercise = { ...exercises[0], id: 'synthetic' }, run = vi.fn(), submit = vi.fn(), collapseSidebar = vi.fn()
  const initial = f.context.kind === 'PRACTICE' ? f.context.source : ''
  const execution = runSnapshot('javascript')
  function Harness({ active = true }: { active?: boolean }) {
    const [code, setCode] = useState(initial), [revision, setRevision] = useState(1)
    return <PracticeWorkspace active={active} onAssistantOpen={collapseSidebar} exercises={[]} drafts={[]} chapter={2} exercise={exercise} language="javascript" code={code} sourceRevision={revision}
      ready locked={false} execution={{ status: 'idle', busy: false, message: '', snapshot: execution }} onRun={run}
      submission={{ view: { busy: false }, submit } as unknown as ReturnType<typeof useSubmission>} onOpen={() => {}} onLanguage={() => {}} onRestore={() => false}
      onEdit={value => { setCode(value); setRevision(r => r + 1) }} onReplace={value => { setCode(value); setRevision(r => r + 1) }} />
  }
  const ui = render(<Harness />)
  await screen.findByLabelText('Unified test editor')
  await click('Learning Assistant'); await screen.findByText('Ready')
  await waitFor(() => expect((screen.getByText('Suggest Fix') as HTMLButtonElement).disabled).toBe(false))
  return { ...f, ...ui, invoke, verify, dispose, initial, run, submit, collapseSidebar, Harness,
    output: (v: unknown) => { output = v }, fail: () => { fail = true },
    hold: () => { held = gate<void>(); return held } }
}
async function click(name: string | RegExp) { await act(async () => {
  const dialog = screen.queryByRole('dialog'), button = dialog && within(dialog).queryByRole('button', { name })
  fireEvent.click(button || screen.getByRole('button', { name }))
}) }
async function action(label: string, result: string) {
  const previous = new Set([...log().querySelectorAll<HTMLElement>('[data-timeline-id]')].map(row => row.dataset.timelineId))
  await waitFor(() => expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(false))
  await click(label); await screen.findByRole('dialog')
  let row!: HTMLElement
  await waitFor(() => {
    row = [...log().querySelectorAll<HTMLElement>('[data-operation-id]')].find(row => !previous.has(row.dataset.timelineId))!
    expect(row).toBeTruthy()
  })
  await click('Đồng ý gửi snapshot'); await within(row).findByText('Complete'); await within(row).findAllByText(result)
}
async function chat(question = 'Why?') {
  fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: question } })
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false)); await click('Send')
  await screen.findByText('Đồng ý gửi Gemini'); await click('Đồng ý gửi Gemini'); await screen.findByText('UI_CHAT')
}
const log = () => screen.getByRole('log')
describe('C4-B unified panel, real services/coordinator/typed bridges and fake Gemini', () => {
  it('C4-E Discard on the proposal card uses existing cancellation and preserves editor source', async () => {
    const f = await fixture(); await action('Suggest Fix', 'UI_FIX')
    expect(screen.getByRole('button', { name: 'Review Diff' })).toBeTruthy()
    await click('Discard')
    expect(screen.queryByRole('button', { name: 'Review Diff' })).toBeNull()
    expect(host.model?.getValue()).toBe(f.initial); expect(host.execute).not.toHaveBeenCalled()
    expect(f.invoke.mock.calls.some(([c]) => c === C.cancel)).toBe(true)
  })
  it('docks Chat after the editor, collapses the sidebar on open and preserves the editor on close', async () => {
    const f = await fixture(), model = host.model
    const panel = screen.getByRole('complementary', { name: 'Learning Assistant' })
    const body = panel.parentElement!
    expect(body.classList.contains('practice-body')).toBe(true)
    expect(body.dataset.assistantOpen).toBe('true')
    expect(panel.previousElementSibling?.classList.contains('practice-split')).toBe(true)
    expect(f.collapseSidebar).toHaveBeenCalledOnce()
    const trigger = screen.getByRole('button', { name: 'Learning Assistant' })
    expect(trigger.querySelector('svg')).toBeTruthy(); expect(trigger.textContent).toBe('')
    await click('Đóng Learning Assistant')
    expect(body.dataset.assistantOpen).toBe('false')
    expect(host.model).toBe(model); expect(model?.isDisposed()).toBe(false)
    expect(document.activeElement).toBe(trigger)
    await click('Learning Assistant'); await screen.findByText('Ready')
    expect(f.collapseSidebar).toHaveBeenCalledTimes(2)
    expect(host.model).toBe(model)
  })

  it('C4-C releases the shared UI lease after delayed COMPLETE history refresh', async () => {
    const f = await fixture(), pending = gate<void>(), original = f.api.getSession
    let delayed = false
    vi.spyOn(f.api, 'getSession').mockImplementation(async q => {
      const result = await original(q)
      if (result.ok && result.value.messages.length === 2 && !delayed) { delayed = true; await pending.promise }
      return result
    })
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'First turn' } }); await click('Send')
    await screen.findByText('Đồng ý gửi Gemini'); await click('Đồng ý gửi Gemini')
    await waitFor(() => expect(delayed).toBe(true))
    expect((screen.getByRole('button', { name: 'Hint' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { pending.resolve(); await pending.promise })
    await screen.findByText('UI_CHAT')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Hint' }) as HTMLButtonElement).disabled).toBe(false))
    await action('Hint', 'UI_HINT_1')
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(2)
  })
  it('orders Chat and all four actions in one timeline and preserves completed Hint cards', async () => {
    const f = await fixture(); await chat(); await action('Hint', 'UI_HINT_1')
    await action('Analyze Code & Run', 'UI_ANALYZE'); await action('Explain Selected Code (Practice)', 'UI_EXPLAIN')
    await action('Suggest Fix', 'UI_FIX')
    expect([...log().querySelectorAll('[data-timeline-id]')].map(el => el.querySelector('strong')?.textContent)).toEqual(['Bạn', 'Hint', 'Analyze', 'Explain', 'Suggest Fix'])
    expect(screen.getAllByRole('complementary', { name: 'Learning Assistant' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Smart Hints' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy()
    expect(f.run).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled(); expect(host.execute).not.toHaveBeenCalled()
    const explain = f.invoke.mock.calls.filter(([c]) => c === C.prepare).map(([, q]) => q as SmartPrepare).find(q => q.action.kind === 'EXPLAIN')!
    expect(explain.action).toMatchObject({ selection: { text: 'return n;' } }); expect(explain.run).not.toBeNull()
  }, 15000)
  it('does not replay Quick Action cards or mint edit authority from Chat', async () => {
    const f = await fixture(); await action('Hint', 'UI_HINT_1'); await chat()
    const post = f.send.mock.calls.filter(([r]) => r.method === 'POST').at(-1)![0]
    expect(JSON.stringify(await post.clone().json())).not.toContain('UI_HINT_1')
    expect(screen.queryByText('Review Diff')).toBeNull(); expect(host.execute).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy()
  })
  it('keeps one identity from prepare/loading through COMPLETE, without inference before consent', async () => {
    const f = await fixture(); await click('Analyze Code & Run'); await screen.findByRole('dialog')
    const row = log().querySelector('[data-timeline-id]')!, id = row.getAttribute('data-timeline-id')
    expect(f.send).not.toHaveBeenCalled(); await click('Đồng ý gửi snapshot'); await screen.findByText('UI_ANALYZE')
    expect(log().querySelector('[data-timeline-id]')).toBe(row); expect(row.getAttribute('data-timeline-id')).toBe(id)
    expect(f.run).not.toHaveBeenCalled()
  })
  it('shows NO_FIX and provider failure without Apply or retrying', async () => {
    const f = await fixture(); f.output({ kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'UI_NO_FIX' })
    await action('Suggest Fix', 'UI_NO_FIX'); expect(screen.queryByText('Review Diff')).toBeNull()
    f.output(undefined); f.fail(); await click('Analyze Code & Run'); await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot')
    await waitFor(() => expect(within(log()).getByRole('alert')).toBeTruthy())
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(2)
  })
  it('blocks Quick Actions and editor context requests while Chat owns the slot', async () => {
    const f = await fixture(), held = f.hold()
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'Pending' } }); await click('Send')
    expect((screen.getByRole('button', { name: 'Analyze Code & Run', hidden: true }) as HTMLButtonElement).disabled).toBe(true)
    await click('Đồng ý gửi Gemini'); await waitFor(() => expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1))
    await click('Analyze Code & Run'); expect(f.invoke.mock.calls.filter(([c]) => c === C.prepare)).toHaveLength(0)
    await click('Cancel'); await screen.findByText('Cancelled'); held.resolve()
    expect(host.execute).not.toHaveBeenCalled()
  })
  it('blocks Chat during a Quick Action and cancellation retains completed Hint levels', async () => {
    const f = await fixture(); await action('Hint', 'UI_HINT_1')
    const held = f.hold(); await click('Analyze Code & Run'); await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot')
    expect((screen.getByLabelText('Câu hỏi') as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Hint' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Hủy yêu cầu AI'); held.resolve()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Hint' }) as HTMLButtonElement).disabled).toBe(false))
    expect(f.invoke.mock.calls.filter(([c]) => c === C.retireContext)).toHaveLength(0)
    expect(screen.getByText('UI_HINT_1')).toBeTruthy()
  })
  it('reviews canonical Diff, applies only manually, and uses native model Undo/Redo', async () => {
    const f = await fixture(); await action('Suggest Fix', 'UI_FIX'); expect(host.execute).not.toHaveBeenCalled()
    await click('Review Diff'); await screen.findByRole('dialog'); act(() => host.ready?.())
    expect(host.model?.getValue()).toBe(f.initial)
    await click('Apply Fix'); expect(host.execute).toHaveBeenCalledOnce(); expect(host.model?.getValue()).toContain('return n + 1;')
    await act(async () => { await host.model?.undo() }); expect(host.model?.getValue()).toBe(f.initial)
    await act(async () => { await host.model?.redo() }); expect(host.model?.getValue()).toContain('return n + 1;')
    expect(f.verify).toHaveBeenCalledOnce(); expect(f.run).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled()
    expect(screen.queryByText('Review Diff')).toBeNull()
  })
  it('Discard removes proposal authority while preserving code and completed Hints', async () => {
    const f = await fixture(); await action('Hint', 'UI_HINT_1'); await action('Suggest Fix', 'UI_FIX')
    await click('Review Diff'); await screen.findByRole('dialog'); await click('Discard')
    expect(host.model?.getValue()).toBe(f.initial); expect(host.execute).not.toHaveBeenCalled()
    expect(screen.queryByText('Review Diff')).toBeNull(); expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy()
  })
  it('chat and cursor movement do not retire a consented frozen Fix proposal', async () => {
    const f = await fixture(); await action('Suggest Fix', 'UI_FIX')
    act(() => host.select?.()); await chat()
    expect(screen.getByText('Review Diff')).toBeTruthy(); expect(host.execute).not.toHaveBeenCalled()
    expect(f.invoke.mock.calls.filter(([c]) => c === C.retireContext)).toHaveLength(0)
  })
  it('source edit makes old cards reference-only and removes Diff authority', async () => {
    await fixture(); await action('Suggest Fix', 'UI_FIX')
    act(() => host.model?.pushEditOperations([], [{ range: (host.monaco as Monaco).Range.fromPositions({ lineNumber: 1, column: 1 }), text: '// edit\r\n' }], () => []))
    await waitFor(() => expect(screen.queryByText('Review Diff')).toBeNull())
    expect(screen.getAllByText('UI_FIX')).toHaveLength(2); expect(screen.getByText('Snapshot trước · chỉ tham khảo')).toBeTruthy()
    expect(host.execute).not.toHaveBeenCalled()
  })
  it('closing clears the timeline, cancels pending work, and reopening starts at Hint 1', async () => {
    const f = await fixture(); await action('Hint', 'UI_HINT_1')
    await click('Đóng Learning Assistant'); expect(screen.queryByRole('log')).toBeNull()
    await click('Learning Assistant'); await screen.findByText('Ready')
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy(); expect(screen.queryByText('UI_HINT_1')).toBeNull()
    expect(f.run).not.toHaveBeenCalled()
  })
  it('Cancel on Hint 2 preserves Main Hint results and permits a new consented Hint 2', async () => {
    const f = await fixture(); await action('Hint', 'UI_HINT_1')
    await click('Hint'); await screen.findByRole('dialog'); await click('Hủy')
    expect(f.invoke.mock.calls.filter(([c]) => c === C.retireContext)).toHaveLength(0)
    await action('Hint', 'UI_HINT_2')
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy()
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(2)
  })
  it('shares the unchanged Main rate window across Chat and Quick Actions', async () => {
    const f = await fixture()
    await action('Hint', 'UI_HINT_1'); await action('Analyze Code & Run', 'UI_ANALYZE')
    await action('Explain Selected Code (Practice)', 'UI_EXPLAIN'); await chat()
    await action('Hint', 'UI_HINT_2'); await action('Suggest Fix', 'UI_FIX')
    await click('Analyze Code & Run'); await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot')
    await waitFor(() => expect(within(log()).getByRole('alert')).toBeTruthy())
    expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy(); expect(f.run).not.toHaveBeenCalled()
  }, 15000)
  it('marks pending cards cancelled after source change and rejects late output', async () => {
    const f = await fixture(), held = f.hold()
    await click('Analyze Code & Run'); await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot')
    await waitFor(() => expect(f.send.mock.calls.filter(([r]) => r.method === 'POST')).toHaveLength(1))
    act(() => host.model?.pushEditOperations([], [{ range: (host.monaco as Monaco).Range.fromPositions({ lineNumber: 1, column: 1 }), text: '// changed\r\n' }], () => []))
    await screen.findByText('Snapshot không còn hiệu lực.'); held.resolve()
    expect(screen.queryByText('UI_ANALYZE')).toBeNull(); expect(host.execute).not.toHaveBeenCalled()
  })
  it('renders proposal-like Chat text without Review Diff or editor authority', async () => {
    const f = await fixture(), text = '{"kind":"EDIT_PROPOSAL","proposalId":"forged"}'
    f.output({ kind: 'CHAT_REPLY', text })
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'Advice only' } }); await click('Send')
    await screen.findByText('Đồng ý gửi Gemini'); await click('Đồng ý gửi Gemini'); await screen.findByText(text)
    expect(screen.queryByText('Review Diff')).toBeNull(); expect(host.execute).not.toHaveBeenCalled()
    expect(f.invoke.mock.calls.filter(([c]) => c === C.prepare)).toHaveLength(0)
  })
  it('Cancel racing an already committed Hint preserves Main/UI Hint results', async () => {
    const f = await fixture(); await action('Hint', 'UI_HINT_1')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Hint' }) as HTMLButtonElement).disabled).toBe(false))
    await click('Hint'); await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot')
    const q = f.invoke.mock.calls.filter(([c]) => c === C.start).at(-1)![1] as SmartStart
    await waitFor(() => expect(f.config.service.status(1, 'document', { requestId: q.requestId, operationId: q.operationId }).state).toBe('COMPLETE'), { interval: 1 })
    await click('Hủy yêu cầu AI')
    await screen.findByText('UI_HINT_2'); expect(screen.getByRole('button', { name: 'Hint' })).toBeTruthy()
    expect(f.invoke.mock.calls.filter(([c]) => c === C.retireContext)).toHaveLength(0)
  })
})

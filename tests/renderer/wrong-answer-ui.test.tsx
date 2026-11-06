/** @vitest-environment jsdom */
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { AppResult } from '../../src/shared/contracts/app-error'
import type { Exercise, ExerciseLanguage, ExerciseType, ExerciseValue } from '../../src/shared/contracts/practice'
import type { SubmissionApi, SubmissionDiagnostic, SubmissionStatus, SubmissionHistory } from '../../src/shared/contracts/submission'
import { useSubmission } from '../../src/renderer/src/features/learning/practice/use-submission'
import { PracticeWorkspace } from '../../src/renderer/src/features/learning/practice/PracticeWorkspace'
import { WrongAnswerPanel } from '../../src/renderer/src/features/learning/practice/WrongAnswerPanel'
import { publicDiagnostic } from '../fixtures/learning/wa-diagnostic'
import { transportUuid, availableStores } from '../fixtures/learning/submission-transport'

vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: ({ code, onChange }: { code: string; onChange(code: string): void }) =>
    <textarea aria-label="Practice code" value={code} onChange={e => onChange(e.target.value)} />,
}))
vi.mock('../../src/renderer/src/features/learning/practice/SubmissionSourceViewer', () => ({
  SubmissionSourceViewer: ({ code }: { code: string }) => <pre aria-label="Saved code">{code}</pre>,
}))
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const unavailable = { kind: 'DETAIL_UNAVAILABLE' as const, reason: 'NO_VERIFIED_PUBLIC_DETAIL' as const }
const exercise: Exercise = { id: 'wa-synthetic', chapter: 2, title: 'Synthetic exercise', difficulty: 'Easy',
  description: 'Return a value.', constraints: [], functionName: 'Solve', parameters: [{ name: 'value', type: 'string' }], returnType: 'string',
  languages: { csharp: { monacoId: 'csharp', starter: '// csharp' }, javascript: { monacoId: 'javascript', starter: '// js' } },
  samples: [{ args: ['public 🙂'], expected: 'public 🙂' }], source: { url: 'https://leetcode.com/problems/example/', publisher: 'Fixture', usage: 'Synthetic' } }
const makeStatus = (change: Partial<SubmissionStatus> = {}): SubmissionStatus => {
  const result: SubmissionStatus = {
  reference: { sessionId: `exercise_${transportUuid(1)}`, generation: 1, submissionId: transportUuid(101) }, exerciseId: exercise.id,
  language: 'javascript', sourceRevision: 4, sequence: 1, stage: 'RUNTIME', verdict: null, storage: { state: 'not-requested' }, ...change,
  }
  if (result.diagnostic === undefined) delete result.diagnostic
  return result
}
const wa = (change: Partial<SubmissionStatus> = {}) => makeStatus({ stage: 'STORAGE', verdict: 'WrongAnswer',
  diagnostic: publicDiagnostic(), counts: { total: 6, attempted: 1, passed: 0 }, storage: { state: 'pending' }, sequence: 2, ...change })
const settled = (change: Partial<SubmissionStatus> = {}) => wa({ stage: 'SETTLED', storage: { state: 'failed', reason: 'FULL' }, sequence: 3, ...change })
const emptyHistory = (): Extract<SubmissionHistory, { ok: true }> => ({ ok: true, stores: availableStores(), coverage: 'COMPLETE',
  countScope: 'ALL_SELECTED', knownCount: 0, total: 0, rows: [], nextCursor: null })
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function flush() { await act(async () => {}) }

function fixture() {
  const listeners = new Set<(s: SubmissionStatus) => void>(), retired: ((s: SubmissionStatus) => void)[] = []
  const api = {
    submit: vi.fn<SubmissionApi['submit']>().mockResolvedValue(ok(makeStatus())),
    current: vi.fn<SubmissionApi['current']>().mockResolvedValue(ok(makeStatus())),
    status: vi.fn<SubmissionApi['status']>().mockResolvedValue(ok(makeStatus())),
    retry: vi.fn<SubmissionApi['retry']>().mockResolvedValue(ok(makeStatus())),
    history: vi.fn<SubmissionApi['history']>().mockResolvedValue(ok(emptyHistory())), source: vi.fn<SubmissionApi['source']>(),
    completion: vi.fn<SubmissionApi['completion']>(async r => ok({ ok: true, exerciseId: r.exerciseId, state: 'NOT_COMPLETED', accepted: { state: 'MISSING', readable: true } })),
    context: vi.fn<SubmissionApi['context']>().mockResolvedValue(ok(null)),
    onChanged: vi.fn<SubmissionApi['onChanged']>(fn => { listeners.add(fn); return () => { listeners.delete(fn); retired.push(fn) } }),
  }
  const analysis = { prepare: vi.fn(), start: vi.fn(), status: vi.fn(), cancel: vi.fn() }, onRun = vi.fn(), restore = vi.fn()
  window.studentIde = { learning: { submission: api, analysis } } as unknown as StudentIdeApi
  const initial = { active: true, language: 'javascript' as ExerciseLanguage, exerciseId: exercise.id, blocked: false }
  function Harness(props: typeof initial) {
    const [code, setCode] = useState('captured source'), [revision, setRevision] = useState(4)
    const submission = useSubmission({ ...props, code, sourceRevision: revision }, api)
    const currentExercise = props.exerciseId === exercise.id ? exercise : { ...exercise, id: props.exerciseId }
    const replace = (value: string) => { setCode(value); setRevision(n => n + 1) }
    return <div className="learning-workspace"><button type="button" onClick={() => void submission.submit()}>Attempt Submit directly</button>
      <PracticeWorkspace exercise={currentExercise} chapter={2} exercises={[]} drafts={[]} language={props.language} code={code} ready locked={false}
        active={props.active} submission={submission} sourceRevision={revision} execution={{ status: 'idle', busy: false, message: 'No Run result' }} onRun={onRun}
        onOpen={vi.fn()} onLanguage={vi.fn()} onEdit={replace} onReplace={replace} onRestore={request => {
          restore(request); if (request.expectedDraftRevision !== revision || request.expectedDraftCode !== code) return false
          replace(request.code); return true
        }} /></div>
  }
  const view = render(<Harness {...initial} />)
  const emit = (s: SubmissionStatus) => act(() => { for (const fn of [...listeners]) fn(s) })
  const submit = async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit' })); await flush() }
  const showWa = async (s = wa()) => { await submit(); emit(s); await flush() }
  return { ...view, api, emit, submit, showWa, onRun, analysis, restore, retired,
    rerender: (changes: Partial<typeof initial>) => view.rerender(<Harness {...initial} {...changes} />) }
}
const resizeCallbacks = new Set<() => void>()
beforeEach(() => {
  resizeCallbacks.clear()
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: () => void) { resizeCallbacks.add(callback) }
    observe = vi.fn(); unobserve = vi.fn(); disconnect = () => { resizeCallbacks.delete(this.callback) }
  })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('WA-B2 diagnostic presentation', () => {
  it.each(['javascript', 'csharp'] as const)('renders exact public values and %s without inventing a failure path', language => {
    const s = wa({ language })
    render(<WrongAnswerPanel status={s} staleSource={false} onCheck={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Wrong Answer' })).toBeTruthy()
    expect(screen.getByText(language === 'csharp' ? 'C#' : 'JavaScript')).toBeTruthy()
    expect(screen.getByText('Public sample 1')).toBeTruthy()
    for (const [label, value] of [['Input', publicDiagnostic().input], ['Your Output', 'wrong'], ['Expected Output', 'public 🙂']] as const) {
      expect(screen.getByLabelText(`${label} value`).textContent).toBe(JSON.stringify(value, null, 2))
    }
    expect(screen.queryByText(/phần tử|case index|hidden/i)).toBeNull()
  })
  it.each([unavailable, { ...unavailable, reason: 'DETAIL_LIMIT_EXCEEDED' as const }, undefined])('renders truthful fallback for %j', diagnostic => {
    render(<WrongAnswerPanel status={wa({ diagnostic })} staleSource={false} onCheck={vi.fn()} />)
    expect(screen.getByText('Kết quả trả về không khớp kết quả mong đợi trong bộ kiểm thử chính thức.')).toBeTruthy()
    expect(screen.getByText('Lần Submit này chưa có chi tiết kiểm thử được phép hiển thị. Bạn có thể sử dụng Run để kiểm tra các test case mẫu.')).toBeTruthy()
    for (const heading of ['Input', 'Your Output', 'Expected Output']) expect(screen.queryByRole('heading', { name: heading })).toBeNull()
    expect(screen.queryByText(/HIDDEN_CASE|NO_VERIFIED_PUBLIC_DETAIL|DETAIL_LIMIT_EXCEEDED/)).toBeNull()
  })
  it.each<[ExerciseType, ExerciseValue]>([['int32', -2147483648], ['boolean', false], ['string', '<img src=x onerror=alert(1)> 🙂\n'],
    ['int32[]', [1, -2, 3]], ['string[]', ['é', '🙂']], ['int32[][]', [[1, 2], [3, 4]]], ['string', '🙂'.repeat(1500)]])('renders safe typed %s values', (type, actual) => {
    const diagnostic: SubmissionDiagnostic = { ...publicDiagnostic(), parameterTypes: [type], input: [actual], returnType: type, actual, expected: actual }
    const view = render(<WrongAnswerPanel status={wa({ diagnostic })} staleSource={false} onCheck={vi.fn()} />)
    expect(screen.getByLabelText('Your Output value').textContent).toBe(JSON.stringify(actual, null, 2))
    expect(view.container.querySelector('img, script')).toBeNull()
    expect(screen.getByLabelText('Your Output value').tabIndex).toBe(0)
  })
  it.each(['pending', 'unknown', 'saved', 'failed'] as const)('keeps %s storage independent of WA and truthful counts', storage => {
    render(<WrongAnswerPanel status={wa({ stage: storage === 'saved' || storage === 'failed' ? 'SETTLED' : 'STORAGE', storage: storage === 'unknown'
      ? { state: storage, recoveryPending: true } : storage === 'saved' ? { state: storage, recordKey: { storeKind: 'FAILED', recordId: transportUuid(10) } }
        : storage === 'failed' ? { state: storage, reason: 'FULL' } : { state: storage } })} staleSource={false} onCheck={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Wrong Answer' })).toBeTruthy()
    if (storage === 'saved') {
      expect(screen.queryByText('saved · Đã xác minh bản ghi được lưu.')).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Lưu trữ' })).toBeNull()
    } else expect(screen.getByText(new RegExp(`^${storage} ·`))).toBeTruthy()
    expect(screen.getByText('Tổng số test')).toBeTruthy(); expect(screen.getByText('Số test đã chạy')).toBeTruthy()
    expect(screen.getByText('Số test vượt qua trước khi Judge dừng')).toBeTruthy()
    expect(screen.queryByText(/test thất bại|hidden test/i)).toBeNull()
  })
  it.each([{ ...wa(), caseIndex: 3 }, wa({ diagnostic: { ...publicDiagnostic(), visibility: 'hidden', actual: 'PRIVATE_CANARY' } as never }),
    wa({ diagnostic: { ...unavailable, reason: 'PRIVATE_CANARY' } as never }), wa({ verdict: 'Accepted' }), wa({ stage: 'RUNTIME' })])('rejects malformed/private or nonqualified status', status => {
    const view = render(<WrongAnswerPanel status={status} staleSource={false} onCheck={vi.fn()} />)
    expect(view.container.textContent).toBe('')
  })
})

describe('WA-B2 real Submit observer / Practice tab lifecycle', () => {
  it.each(['pending', 'unknown'] as const)('auto-opens during STORAGE/%s without waiting for History or stealing focus', async storage => {
    const f = fixture(), editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
    editor.focus(); editor.setSelectionRange(2, 5)
    await f.showWa(wa({ storage: storage === 'pending' ? { state: storage } : { state: storage, recoveryPending: true } }))
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toContain('Wrong Answer')
    const tabs = screen.getAllByRole('tab').filter(t => ['Description', 'Solution', 'Submissions', 'Wrong Answer'].includes(t.textContent!))
    expect(tabs.map(t => t.textContent)).toEqual(['Description', 'Solution', 'Submissions', 'Wrong Answer'])
    expect(screen.getByRole('tab', { name: 'Wrong Answer' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(editor); expect(editor.selectionStart).toBe(2)
    expect(screen.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
    expect(f.api.history).not.toHaveBeenCalled(); expect(f.api.submit).toHaveBeenCalledOnce()
    for (const call of Object.values(f.analysis)) expect(call).not.toHaveBeenCalled()
  })
  it('does not reselect WA after duplicate/poll/storage updates or manual tab navigation', async () => {
    const f = fixture(); await f.showWa()
    fireEvent.click(screen.getByRole('tab', { name: 'Description' }))
    f.emit(wa()); f.emit(wa({ sequence: 1 })); f.emit(wa({ sequence: 4, storage: { state: 'unknown', recoveryPending: true } })); f.emit(settled({ sequence: 5 }))
    expect(screen.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Submissions' })); await flush()
    expect(screen.getByRole('tab', { name: 'Wrong Answer' })).toBeTruthy()
    expect(f.api.history).toHaveBeenCalledOnce(); expect(f.api.context).not.toHaveBeenCalled()
  })
  it.each(['Accepted', 'RuntimeError', 'InfrastructureFailure', 'CancelledInvalidated'] as const)('does not open WA for %s', async verdict => {
    const f = fixture(); await f.submit(); f.emit(makeStatus({ stage: 'SETTLED', verdict }))
    expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
  })
  it('ignores a provisional runtime WA and opens final WA without diagnostic using fallback', async () => {
    const f = fixture(); await f.submit(); f.emit(makeStatus({ verdict: 'WrongAnswer' }))
    expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
    f.emit(settled({ diagnostic: undefined }))
    expect(screen.getByText(/Lần Submit này chưa có chi tiết/)).toBeTruthy()
  })
  it('recovers lost ACK with status only and no duplicate Submit', async () => {
    const f = fixture(); f.api.submit.mockRejectedValueOnce(Error('lost ACK'))
    f.api.current.mockResolvedValueOnce(ok(wa()))
    await f.submit(); await waitFor(() => expect(screen.getByRole('region', { name: 'Wrong Answer details' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Attempt Submit directly' })); await flush()
    expect(f.api.submit).toHaveBeenCalledOnce(); expect(f.api.current).toHaveBeenCalledOnce()
  })
  it('keeps WA for rejected local clicks and retires it only after a new guarded Attempt starts, even with same revision', async () => {
    const f = fixture(); await f.showWa(settled())
    f.rerender({ blocked: true }); fireEvent.click(screen.getByRole('button', { name: 'Attempt Submit directly' })); await flush()
    expect(screen.getByRole('tab', { name: 'Wrong Answer' })).toBeTruthy(); expect(f.api.submit).toHaveBeenCalledOnce()
    f.rerender({ blocked: false }); const ack = deferred<AppResult<SubmissionStatus>>()
    f.api.submit.mockReturnValueOnce(ack.promise); fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
    expect(screen.getByRole('status', { name: 'Đang chấm bài' })).toBeTruthy()
    const reference = { sessionId: `exercise_${transportUuid(2)}`, generation: 2, submissionId: transportUuid(102) }
    await act(async () => ack.resolve(ok(makeStatus({ reference }))))
    f.emit(settled({ sequence: 100 })); expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
    f.emit(settled({ reference, diagnostic: { ...publicDiagnostic(), actual: 'second submit' } }))
    expect(screen.getByLabelText('Your Output value').textContent).toBe('"second submit"')
    expect(f.api.submit.mock.calls.map(c => c[0].sourceRevision)).toEqual([4, 4])
  })
  it.each(['Accepted', 'RuntimeError'] as const)('keeps previous WA retired after new %s attempt', async verdict => {
    const f = fixture(); await f.showWa(settled())
    f.api.submit.mockResolvedValueOnce(ok(makeStatus({ reference: { ...makeStatus().reference, generation: 2, submissionId: transportUuid(102) }, stage: 'SETTLED', verdict })))
    await f.submit(); expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
  })
  it.each(['language', 'exercise', 'leave', 'pagehide'] as const)('retires WA on %s and drops late callbacks', async mode => {
    const f = fixture(); await f.showWa(settled())
    if (mode === 'language') f.rerender({ language: 'csharp' })
    if (mode === 'exercise') f.rerender({ exerciseId: 'other' })
    if (mode === 'leave') f.rerender({ active: false })
    if (mode === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')))
    expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
    act(() => f.retired.forEach(fn => fn(settled({ sequence: 100 }))))
    expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
    if (mode === 'leave') { f.rerender({ active: true }); expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull() }
  })
  it('keeps captured evidence while Editor changes and Run/Test Result remain independent', async () => {
    const f = fixture(); await f.showWa(settled())
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' })
    fireEvent.change(editor, { target: { value: 'edited later' } })
    expect(within(screen.getByRole('region', { name: 'Wrong Answer details' })).getByText('Code đã thay đổi. Kết quả này thuộc source lúc bấm Submit.')).toBeTruthy()
    expect(screen.getByLabelText('Your Output value').textContent).toBe('"wrong"')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(f.onRun).toHaveBeenCalledOnce(); expect(f.api.submit).toHaveBeenCalledOnce()
    expect(screen.getByRole('tab', { name: 'Wrong Answer' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('textbox', { name: 'Practice code' })).toBe(editor)
  })
  it('navigates dynamic tabs by keyboard with ARIA relationships and focusable values', async () => {
    const f = fixture(); await f.showWa(settled())
    const tab = screen.getByRole('tab', { name: 'Wrong Answer' }), panel = document.getElementById(tab.getAttribute('aria-controls')!)!
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
    fireEvent.keyDown(tab, { key: 'Home' }); expect(screen.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(document.activeElement!, { key: 'End' }); expect(document.activeElement).toBe(tab)
    fireEvent.keyDown(tab, { key: 'ArrowLeft' }); expect(screen.getByRole('tab', { name: 'Submissions' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' }); expect(document.activeElement).toBe(tab)
    expect(within(screen.getByRole('region', { name: 'Wrong Answer details' })).getByLabelText('Input value').tabIndex).toBe(0)
  })
  it('retains dynamic tab overflow controls when resized to a narrow pane', async () => {
    const f = fixture(); await f.showWa(settled())
    const tab = screen.getByRole('tab', { name: 'Wrong Answer' }), list = tab.closest('[role="tablist"]')!
    const viewport = list.parentElement!, root = viewport.parentElement!
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 260 })
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 260 })
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 700 })
    const scroll = vi.fn(); viewport.scrollBy = scroll
    act(() => resizeCallbacks.forEach(fn => fn()))
    const right = screen.getByRole<HTMLButtonElement>('button', { name: 'Scroll tabs right' })
    expect(right.disabled).toBe(false); fireEvent.click(right); expect(scroll).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Wrong Answer' })).toBe(tab)
    expect(screen.getByRole('region', { name: 'Wrong Answer details' })).toBeTruthy()
  })
  it('does not publish a delayed ACK after changing language/context', async () => {
    const f = fixture(), ack = deferred<AppResult<SubmissionStatus>>()
    f.api.submit.mockReturnValueOnce(ack.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    f.rerender({ language: 'csharp' })
    await act(async () => ack.resolve(ok(settled())))
    expect(screen.queryByRole('tab', { name: 'Wrong Answer' })).toBeNull()
    expect(f.api.submit).toHaveBeenCalledOnce()
  })
  it('shows only committed History rows and preserves Source/confirmed Restore without replacing WA evidence', async () => {
    const f = fixture(); await f.showWa(settled())
    f.api.history.mockResolvedValue(ok({ ...emptyHistory(), total: 1, knownCount: 1, rows: [{ key: { storeKind: 'FAILED', recordId: transportUuid(11) },
      submissionId: transportUuid(111), exerciseId: exercise.id, language: 'javascript', verdict: 'WrongAnswer', submittedAt: '2026-10-28T00:00:00.000Z',
      packageVersion: 3, source: { reference: 'opaque', revision: 4, byteLength: 8 } }] }))
    f.api.source.mockResolvedValue(ok({ ok: true, stores: availableStores(), reference: 'opaque', key: { storeKind: 'FAILED', recordId: transportUuid(11) },
      submissionId: transportUuid(111), sourceRevision: 4, offset: 0, nextOffset: 8, totalBytes: 8, eof: true, code: 'restored' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Submissions' })); await flush()
    expect(screen.getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Status', 'Language', 'Submitted At'])
    expect(screen.getAllByRole('row')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' })); await flush()
    const details = within(screen.getByRole('region', { name: 'Submission Details' }))
    fireEvent.click(details.getByRole('button', { name: 'Restore to Editor' }))
    fireEvent.click(details.getByRole('button', { name: 'Xác nhận Restore' })); await flush()
    expect(f.restore).toHaveBeenCalledOnce(); expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Practice code' }).value).toBe('restored')
    fireEvent.click(screen.getByRole('tab', { name: 'Wrong Answer' }))
    expect(screen.getByLabelText('Your Output value').textContent).toBe('"wrong"')
    expect(within(screen.getByRole('region', { name: 'Wrong Answer details' })).getByText(/Code đã thay đổi/)).toBeTruthy(); expect(f.api.submit).toHaveBeenCalledOnce()
    for (const call of Object.values(f.analysis)) expect(call).not.toHaveBeenCalled()
  })
})

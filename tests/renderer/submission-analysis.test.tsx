/** @vitest-environment jsdom */
import { StrictMode, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubmissionAnalysis } from '../../src/renderer/src/features/learning/practice/SubmissionAnalysis'
import { SubmissionDetails } from '../../src/renderer/src/features/learning/practice/SubmissionDetails'
import { SubmissionAnalysisService } from '../../src/main/services/learning/analysis/service'
import { createAnalysisBridge } from '../../src/preload/bridge/analysis'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import type { Analysis, AnalysisApi, AnalysisStatus } from '../../src/shared/contracts/analysis'
import type { AppResult, StudentIdeApi } from '../../src/shared/contracts'
import type { HistoryRow } from '../../src/renderer/src/features/learning/practice/use-submission-history'

vi.mock('../../src/renderer/src/features/learning/practice/SubmissionSourceViewer', () => ({
  SubmissionSourceViewer: ({ code }: { code: string }) => <textarea aria-label="Saved source" value={code} readOnly />,
}))
const id = (n = 1) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`
const row = (n = 1): HistoryRow => ({ key: { storeKind: 'ACCEPTED', recordId: id(n) }, submissionId: id(n),
  exerciseId: `synthetic-${n}`, language: 'javascript', verdict: 'Accepted', submittedAt: '2026-10-28T10:00:00.000Z',
  source: { reference: `opaque_saved_reference_${n}`, revision: 7, byteLength: 8 } })
const advisory: Analysis = { schemaVersion: 1, algorithmAnalysis: 'Đọc dữ liệu.\n\nTính kết quả.',
  timeComplexity: { bigO: 'O(n)', explanation: 'Duyệt một lần.' }, spaceComplexity: { bigO: 'O(1)', explanation: 'Dùng biến tạm.' },
  codeQuality: ['Tên biến dễ đọc.'], improvements: ['Kiểm tra biên dữ liệu.'] }
const ok = <T,>(value: T): AppResult<T> => ({ ok: true, value })
const broken = { ok: false as const, error: { code: 'INTERNAL_ERROR' as const, message: 'PRIVATE_RAW apiKey TOKEN C:\\private', retryable: false } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function tick(ms = 500) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const stops: (() => Promise<void>)[] = []
beforeEach(() => { vi.useFakeTimers() })
afterEach(async () => { cleanup(); for (const stop of stops.splice(0)) await stop(); vi.useRealTimers(); vi.unstubAllGlobals() })
function fixture(selection = row(), options: { active?: boolean; ready?: boolean } = {}) {
  let current: AnalysisStatus, requestId = ''
  const prepared = (): AnalysisStatus => ({ requestId, sequence: 1, state: 'PREPARED', captureToken: 'opaque_capture_token',
    expiresAt: Date.now() + 60_000, consentVersion: 1, submissionId: selection.submissionId, exerciseId: selection.exerciseId,
    language: selection.language, packageVersion: 2, sourceBytes: selection.source.byteLength, statementBytes: 48 })
  const api = {
    prepare: vi.fn<AnalysisApi['prepare']>(async q => { requestId = q.requestId; current = prepared(); return ok(current) }),
    start: vi.fn<AnalysisApi['start']>(async () => { current = { requestId, sequence: 2, state: 'RUNNING' }; return ok(current) }),
    status: vi.fn<AnalysisApi['status']>(async () => ok(current)),
    cancel: vi.fn<AnalysisApi['cancel']>(async q => { current = { requestId: q.requestId, sequence: (current?.sequence ?? 0) + 1, state: 'CANCELLED' }; return ok(current) }),
  }
  window.studentIde = { learning: { analysis: api } } as unknown as StudentIdeApi
  const props = { row: selection, active: options.active ?? true, sourceReady: options.ready ?? true }
  const view = render(<SubmissionAnalysis {...props} />)
  const result = (sequence = 3, analysis = advisory) => { current = { requestId, sequence, state: 'COMPLETE', advisory: true, analysis } }
  return { ...view, api, props, selection, prepared, result, set: (status: AnalysisStatus) => { current = status },
    get requestId() { return requestId } }
}

describe('D3 consent and real semantic operations', () => {
  it.each(['Accepted', 'WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError', 'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded'] as const)('offers analysis for saved %s only; opening Details never dispatches', async verdict => {
    const selection = { ...row(), verdict, key: { ...row().key, storeKind: verdict === 'Accepted' ? 'ACCEPTED' as const : 'FAILED' as const } }
    const f = fixture(selection)
    expect(screen.getByRole('button', { name: 'Phân tích lời giải' }).hasAttribute('disabled')).toBe(false)
    await tick(1500); expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it.each([{ verdict: 'Ungraded' }, { key: { ...row().key, storeKind: 'FAILED' } }, { submissionId: 'forged' },
    { source: { ...row().source, reference: '' } }])('hides analysis for invalid saved context %j', changes => {
    const f = fixture({ ...row(), ...changes } as HistoryRow)
    expect(screen.queryByRole('button', { name: 'Phân tích lời giải' })).toBeNull(); expect(f.api.prepare).not.toHaveBeenCalled()
  })
  it('hides while inactive, disables until saved Source is ready, and has no fake fallback without API', async () => {
    const f = fixture(row(), { active: false }); expect(screen.queryByRole('button', { name: 'Phân tích lời giải' })).toBeNull()
    f.rerender(<SubmissionAnalysis {...f.props} active sourceReady={false} />)
    expect(screen.getByRole('button', { name: 'Phân tích lời giải' }).hasAttribute('disabled')).toBe(true)
    await click('Phân tích lời giải'); expect(f.api.prepare).not.toHaveBeenCalled()
    window.studentIde = { learning: {} } as unknown as StudentIdeApi
    f.rerender(<SubmissionAnalysis {...f.props} active />)
    expect(screen.getByRole('button', { name: 'Phân tích lời giải' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText('O(n)')).toBeNull()
  })
  it.each([0, 16385])('leaves %i-byte saved capture eligibility to Main and displays its refusal without Start', async byteLength => {
    const f = fixture({ ...row(), source: { ...row().source, byteLength } })
    f.api.prepare.mockImplementationOnce(async q => ok({ requestId: q.requestId, sequence: 1, state: 'FAILED', code: 'SOURCE_UNAVAILABLE' }))
    await click('Phân tích lời giải'); expect(screen.getByRole('alert').textContent).toContain('source đã lưu')
    expect(f.api.start).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('prepares only opaque reference; shows scope/bytes and requires fresh consent v1', async () => {
    const f = fixture(); await click('Phân tích lời giải')
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận phân tích lời giải' })
    expect(within(dialog).getByText('JavaScript')).toBeTruthy(); expect(within(dialog).getByText('8 bytes')).toBeTruthy()
    expect(within(dialog).getByText('48 bytes')).toBeTruthy(); expect(dialog.textContent).toContain('packageVersion')
    expect(dialog.textContent).toContain('hidden Official Tests, Expected, Judge internals')
    expect(f.api.prepare).toHaveBeenCalledExactlyOnceWith({ requestId: f.requestId, sourceReference: f.selection.source.reference })
    await tick(1500); expect(f.api.start).not.toHaveBeenCalled()
    await click('Đồng ý phân tích')
    expect(f.api.start).toHaveBeenCalledExactlyOnceWith({ requestId: f.requestId, captureToken: 'opaque_capture_token', consentVersion: 1 })
    expect(screen.getByRole('status').textContent).toContain('Đang phân tích')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
  it('cancel and Escape close consent without start; later operation needs new explicit consent', async () => {
    const f = fixture(); await click('Phân tích lời giải'); const first = f.requestId
    await act(async () => { fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }) })
    expect(f.api.cancel).toHaveBeenCalledWith({ requestId: first }); expect(f.api.start).not.toHaveBeenCalled()
    await click('Phân tích lời giải'); expect(f.requestId).not.toBe(first)
    await click('Hủy'); expect(f.api.start).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('preparing supports cancellation while ACK is pending and ignores its late prepared reply', async () => {
    const f = fixture(), ack = deferred<AppResult<AnalysisStatus>>()
    f.api.prepare.mockReturnValueOnce(ack.promise)
    await click('Phân tích lời giải')
    expect(screen.getByRole('button', { name: 'Đồng ý phân tích' }).hasAttribute('disabled')).toBe(true)
    const requestId = f.api.prepare.mock.calls[0][0].requestId
    await click('Hủy')
    await act(async () => ack.resolve(ok({ ...f.prepared(), requestId })))
    expect(screen.queryByRole('dialog')).toBeNull(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('double-click/re-render/draft-unrelated row recreation keeps exactly one prepare and one start', async () => {
    const f = fixture()
    await act(async () => { const b = screen.getByRole('button', { name: 'Phân tích lời giải' }); fireEvent.click(b); fireEvent.click(b) })
    await act(async () => { const b = screen.getByRole('button', { name: 'Đồng ý phân tích' }); fireEvent.click(b); fireEvent.click(b) })
    f.rerender(<SubmissionAnalysis {...f.props} row={{ ...f.selection, source: { ...f.selection.source } }} />)
    await tick(2000)
    expect(f.api.prepare).toHaveBeenCalledOnce(); expect(f.api.start).toHaveBeenCalledOnce()
    expect(f.api.status.mock.calls.every(([q]) => q.requestId === f.requestId)).toBe(true)
    expect(f.api.cancel).not.toHaveBeenCalled()
  })
  it('lost prepare ACK recovers via status under same requestId without re-prepare', async () => {
    const f = fixture(), prepare = f.api.prepare.getMockImplementation()!
    f.api.prepare.mockImplementationOnce(async q => { await prepare(q); throw Error('LOST_ACK PRIVATE') })
    await click('Phân tích lời giải'); await tick()
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(f.api.prepare).toHaveBeenCalledOnce(); expect(f.api.start).not.toHaveBeenCalled()
    expect(f.api.status).toHaveBeenCalledWith({ requestId: f.requestId })
  })
  it('lost start ACK recovers completed result through status, never starts again', async () => {
    const f = fixture(); await click('Phân tích lời giải')
    f.api.start.mockImplementationOnce(async () => { f.result(); throw Error('LOST_ACK PRIVATE') })
    await click('Đồng ý phân tích'); await tick()
    expect(screen.getByRole('heading', { name: 'Phân tích thuật toán' })).toBeTruthy()
    await tick(3000); expect(f.api.start).toHaveBeenCalledOnce(); expect(f.api.prepare).toHaveBeenCalledOnce()
  })
  it('polls while start ACK hangs; late regressing ACK cannot reopen loading or consent', async () => {
    const f = fixture(), ack = deferred<AppResult<AnalysisStatus>>(); await click('Phân tích lời giải')
    f.api.start.mockReturnValueOnce(ack.promise); await click('Đồng ý phân tích'); f.result(); await tick()
    await act(async () => ack.resolve(ok({ requestId: f.requestId, sequence: 2, state: 'RUNNING' })))
    expect(screen.getByRole('heading', { name: 'Phân tích thuật toán' })).toBeTruthy()
    const calls = f.api.status.mock.calls.length; await tick(2000); expect(f.api.status).toHaveBeenCalledTimes(calls)
  })
  it('regressing sequence cannot reopen consent and foreign result is rejected safely', async () => {
    const f = fixture(); await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    f.set(f.prepared()); await tick(); expect(screen.queryByRole('dialog')).toBeNull()
    f.set({ requestId: 'foreign', sequence: 99, state: 'COMPLETE', advisory: true, analysis: advisory }); await tick()
    expect(screen.getByRole('alert').textContent).toContain('không hợp lệ'); expect(screen.queryByText('O(n)')).toBeNull()
  })
  it('checks TTL at consent time without dispatch', async () => {
    const f = fixture(); await click('Phân tích lời giải'); vi.setSystemTime(Date.now() + 60001)
    await click('Đồng ý phân tích'); expect(f.api.start).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('hết hạn')
  })
  it('cancel running analysis clears results and ignores late completion even with a higher sequence', async () => {
    const f = fixture(), status = deferred<AppResult<AnalysisStatus>>()
    await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    f.api.status.mockReturnValueOnce(status.promise); await tick(); await click('Hủy phân tích')
    await act(async () => status.resolve(ok({ requestId: f.requestId, sequence: 99, state: 'COMPLETE', advisory: true, analysis: advisory })))
    expect(screen.queryByText('O(n)')).toBeNull(); expect(screen.getByRole('status').textContent).toContain('Đã hủy')
    expect(f.api.start).toHaveBeenCalledOnce()
  })
  it('lost cancel ACK recovers cancellation via same status reference without a new analysis', async () => {
    const f = fixture(), cancel = f.api.cancel.getMockImplementation()!
    await click('Phân tích lời giải'); await click('Đồng ý phân tích'); const previous = f.requestId
    f.api.cancel.mockImplementationOnce(async q => { await cancel(q); throw Error('LOST_CANCEL_ACK') })
    await click('Hủy phân tích'); await tick()
    expect(screen.getByRole('status').textContent).toContain('Đã hủy')
    expect(f.api.status).toHaveBeenLastCalledWith({ requestId: previous }); expect(f.api.prepare).toHaveBeenCalledOnce()
  })
  it('same sequence cannot replace a running status with new result data', async () => {
    const f = fixture(); await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    f.result(2); await tick(); expect(screen.queryByText('O(n)')).toBeNull()
    f.result(3); await tick(); expect(screen.getByText('O(n)')).toBeTruthy()
  })
})

describe('D3 result/error and stale isolation', () => {
  it('renders exactly five sections as inert text with AI/runtime/judge distinctions', async () => {
    const f = fixture(); await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    const injection = '<img src=x onerror="throw 1"><svg onload="throw 1"><script>throw 1</script>'
    f.result(3, { ...advisory, algorithmAnalysis: injection + '\n\nĐoạn thứ hai.', improvements: [injection] }); await tick()
    for (const name of ['Phân tích thuật toán', 'Time Complexity', 'Space Complexity', 'Đánh giá chất lượng code', 'Đề xuất cải thiện']) expect(screen.getByRole('heading', { name })).toBeTruthy()
    expect(f.container.querySelectorAll('.submission-analysis-result h3').length).toBe(5)
    expect(screen.getByText('Đoạn thứ hai.')).toBeTruthy(); expect(screen.getAllByText(injection).length).toBe(2)
    expect(f.container.querySelector('img,script,[onload],[onerror]')).toBeNull()
    expect(screen.getByText('Kết quả AI chỉ mang tính tham khảo.')).toBeTruthy()
    expect(screen.getByText(/không phải Runtime thực đo/)).toBeTruthy(); expect(screen.getByText(/không phải Memory thực đo/)).toBeTruthy()
    expect(screen.getByText(/độc lập với kết quả Judge/)).toBeTruthy()
  })
  it.each(['KEY_UNAVAILABLE', 'SOURCE_UNAVAILABLE', 'INVALID_INPUT', 'CONTENT_VERSION_MISMATCH', 'CAPTURE_EXPIRED', 'TIMEOUT',
    'NETWORK_ERROR', 'PROVIDER_ERROR', 'INVALID_RESPONSE', 'RESPONSE_LIMIT', 'INCOMPLETE_OUTPUT', 'CONTEXT_INVALID',
    'AUTHENTICATION', 'BALANCE', 'RATE_LIMIT', 'REQUEST_REJECTED', 'BUSY', 'ALREADY_USED'] as const)('shows safe Vietnamese %s and never retries provider', async code => {
    const f = fixture(); await click('Phân tích lời giải')
    f.api.start.mockResolvedValueOnce(ok({ requestId: f.requestId, sequence: 2, state: 'FAILED', code }))
    await click('Đồng ý phân tích'); expect(screen.getByRole('alert').textContent).toBeTruthy()
    await tick(5000); expect(f.api.start).toHaveBeenCalledOnce(); expect(f.api.prepare).toHaveBeenCalledOnce()
    expect(screen.queryByText('O(n)')).toBeNull(); expect(f.container.textContent).not.toMatch(/PRIVATE|apiKey|TOKEN|C:\\private/)
  })
  it('owner denial stops polling, discards consent and sanitizes raw diagnostics', async () => {
    const f = fixture(); await click('Phân tích lời giải')
    f.api.status.mockResolvedValueOnce({ ...broken, error: { ...broken.error, code: 'PERMISSION_DENIED' } }); await tick()
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByRole('alert').textContent).toContain('Ngữ cảnh')
    expect(f.container.textContent).not.toContain('PRIVATE'); const calls = f.api.status.mock.calls.length
    await tick(3000); expect(f.api.status).toHaveBeenCalledTimes(calls); expect(f.api.start).not.toHaveBeenCalled()
  })
  it.each([{ submissionId: id(9) }, { exerciseId: 'foreign' }, { language: 'csharp' }, { sourceBytes: 99 }])('rejects prepared identity mismatch %j before consent/start', async changes => {
    const f = fixture(), prepare = f.api.prepare.getMockImplementation()!
    f.api.prepare.mockImplementationOnce(async q => {
      const result = await prepare(q); if (!result.ok) return result
      return ok({ ...result.value, ...changes } as AnalysisStatus)
    })
    await click('Phân tích lời giải'); expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('không hợp lệ'); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('refuses a completed analysis received before explicit consent', async () => {
    const f = fixture(), prepare = f.api.prepare.getMockImplementation()!
    f.api.prepare.mockImplementationOnce(async q => { await prepare(q); f.result(); return ok({ requestId: q.requestId, sequence: 3, state: 'COMPLETE', advisory: true, analysis: advisory }) })
    await click('Phân tích lời giải'); expect(screen.queryByText('O(n)')).toBeNull(); expect(f.api.start).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('không hợp lệ')
  })
  it.each([{ analysis: { ...advisory, verdict: 'Accepted' } }, { advisory: false }, { raw: 'PRIVATE_BODY' }])('refuses malformed result %j instead of rendering provider data', async changes => {
    const f = fixture(); await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    f.set({ requestId: f.requestId, sequence: 3, state: 'COMPLETE', advisory: true, analysis: advisory, ...changes } as unknown as AnalysisStatus)
    await tick(); expect(screen.getByRole('alert').textContent).toContain('không hợp lệ'); expect(screen.queryByText('O(n)')).toBeNull()
    expect(f.container.textContent).not.toContain('PRIVATE_BODY')
  })
  it('status transport failures are bounded; manual status check retains requestId and never starts again', async () => {
    const f = fixture(); await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    f.api.status.mockResolvedValue(broken); await tick(5000)
    const calls = f.api.status.mock.calls.length; expect(calls).toBe(4); await tick(5000); expect(f.api.status).toHaveBeenCalledTimes(calls)
    expect(f.container.textContent).not.toContain('PRIVATE'); await click('Kiểm tra trạng thái')
    expect(f.api.status).toHaveBeenLastCalledWith({ requestId: f.requestId }); expect(f.api.start).toHaveBeenCalledOnce()
  })
  it.each(['submission', 'exercise', 'inactive', 'unmount', 'pagehide'] as const)('cancels on %s and never displays a late result', async change => {
    const f = fixture(), pending = deferred<AppResult<AnalysisStatus>>()
    await click('Phân tích lời giải'); await click('Đồng ý phân tích'); const previous = f.requestId
    f.api.status.mockReturnValueOnce(pending.promise); await tick()
    if (change === 'unmount') f.unmount()
    else if (change === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')))
    else f.rerender(<SubmissionAnalysis {...f.props} row={change === 'submission' ? row(2) : change === 'exercise' ? { ...row(), exerciseId: 'other-exercise' } : row()}
      active={change !== 'inactive'} />)
    await act(async () => pending.resolve(ok({ requestId: previous, sequence: 99, state: 'COMPLETE', advisory: true, analysis: advisory })))
    expect(f.api.cancel).toHaveBeenCalledWith({ requestId: previous }); expect(screen.queryByText('O(n)')).toBeNull()
  })
  it('React StrictMode does not create or replay operations on effect re-mount', async () => {
    const f = fixture(); f.unmount()
    render(<StrictMode><SubmissionAnalysis {...f.props} /></StrictMode>)
    expect(f.api.prepare).not.toHaveBeenCalled(); await click('Phân tích lời giải'); await click('Đồng ý phân tích')
    await tick(1500); expect(f.api.prepare).toHaveBeenCalledOnce(); expect(f.api.start).toHaveBeenCalledOnce()
  })
  it('polling does not steal keyboard focus from the consent action', async () => {
    fixture(); await click('Phân tích lời giải')
    const agree = screen.getByRole('button', { name: 'Đồng ý phân tích' }); agree.focus()
    await tick(1500); expect(document.activeElement).toBe(agree)
  })
  it('actual unprovisioned D2 service behind typed Preload yields KEY_UNAVAILABLE only after consent, no fake result', async () => {
    const service = new SubmissionAnalysisService(); stops.push(() => service.stop())
    const selection = row()
    const ipc = { invoke: vi.fn(async (channel: string, q: unknown) => {
      const request = q as { requestId: string; sourceReference: string; captureToken: string; consentVersion: 1 }
      if (channel === 'analysis:prepare') return ok(service.prepare(1, 'scope', request, () => {}, async () => ({
        submissionId: selection.submissionId, exerciseId: selection.exerciseId,
        input: { language: selection.language, source: 'return 1', publicStatement: 'Synthetic public statement', packageVersion: 2 },
      })))
      if (channel === 'analysis:start') return ok(service.start(1, 'scope', request))
      if (channel === 'analysis:cancel') return ok(service.cancel(1, 'scope', request.requestId))
      return ok(service.status(1, 'scope', request.requestId))
    }), on: vi.fn(), removeListener: vi.fn() }
    const api = createAnalysisBridge(ipc, createLearningOrder())
    window.studentIde = { learning: { analysis: api } } as unknown as StudentIdeApi
    render(<SubmissionAnalysis row={selection} active sourceReady />)
    await click('Phân tích lời giải'); await tick()
    expect(ipc.invoke.mock.calls.some(([c]) => c === 'analysis:start')).toBe(false)
    await click('Đồng ý phân tích')
    expect(screen.getByRole('alert').textContent).toContain('chưa được cấu hình'); expect(screen.queryByText('O(n)')).toBeNull()
  })
  it('Details temporarily hides analysis, makes no analysis requests and preserves saved source/Restore', async () => {
    const f = fixture(); f.unmount()
    const selection = row(), onRestore = vi.fn(), source = vi.fn(async () => ok({ ok: true, stores: {
      ACCEPTED: { state: 'AVAILABLE', readable: true }, FAILED: { state: 'MISSING', readable: true } },
    reference: selection.source.reference, key: selection.key, submissionId: selection.submissionId, sourceRevision: selection.source.revision,
    offset: 0, nextOffset: 8, totalBytes: 8, eof: true, code: 'return 1' }))
    window.studentIde = { learning: { analysis: f.api, submission: { source } } } as unknown as StudentIdeApi
    function Details() {
      const [open, setOpen] = useState(true)
      return open ? <SubmissionDetails row={selection} active language="javascript" sourceRevision={99} draftCode="DRAFT_MUST_NOT_SEND"
        restoreBlocked={false} onBack={() => setOpen(false)} onRestore={onRestore} /> : <p>History</p>
    }
    render(<Details />); await act(async () => {}); await act(async () => { await vi.dynamicImportSettled() })
    expect(screen.queryByRole('button', { name: 'Phân tích lời giải' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Phân tích lời giải' })).toBeNull()
    await tick(1500)
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Saved source' }).value).toBe('return 1')
    expect(onRestore).not.toHaveBeenCalled(); expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Restore to Editor' }).hasAttribute('disabled')).toBe(false)
    await click('← History'); expect(f.api.cancel).not.toHaveBeenCalled()
    expect(screen.queryByText('O(n)')).toBeNull()
  })
})

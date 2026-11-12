/** @vitest-environment jsdom */
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { consentFixture } from '../fixtures/learning/smart-consent'
import { useSmartHints } from '../../src/renderer/src/features/learning/practice/use-smart-hints'
import { SmartHintsPanel } from '../../src/renderer/src/features/learning/practice/SmartHintsPanel'
import { request, fixAction } from '../fixtures/learning/smart-hints'
import { SMART_HINT_CHANNELS as C, type SmartAction } from '../../src/shared/contracts/smart-hints'
import type { PracticeFixSnapshot } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'

const fixtures: ReturnType<typeof consentFixture>[] = []
afterEach(async () => { cleanup(); await Promise.all(fixtures.splice(0).map(f => f.close())) })
async function fixture() {
  const f = consentFixture(); fixtures.push(f)
  const q = request(); let controller!: ReturnType<typeof useSmartHints>
  function Harness() {
    const [data, setData] = useState({ source: q.source, revision: 1, modelVersion: 1, exercise: q.exerciseId, selected: false, active: true })
    const hints = useSmartHints({ active: data.active, locked: false, exerciseId: data.exercise,
      language: q.language, source: data.source, sourceRevision: data.revision }, f.api)
    controller = hints
    const snapshot = (): PracticeFixSnapshot => ({ exerciseId: data.exercise, language: q.language,
      source: data.source, sourceRevision: data.revision,
      origin: { kind: 'PRACTICE', modelId: q.origin.kind === 'PRACTICE' ? q.origin.modelId : '', modelVersion: data.modelVersion, eol: 'LF' },
      selection: fixAction(data.source).selection, isCurrent: () => true, freezeTarget: () => true })
    const begin = (kind: 'HINT' | 'ANALYZE' | 'SUGGEST_FIX') => {
      const s = snapshot()
      const action: SmartAction = kind === 'SUGGEST_FIX' ? data.selected ? { kind, selection: s.selection } : { kind: 'DETECT_ISSUES' } : { kind }
      void hints.begin(action, s)
    }
    return <>
      <button onClick={hints.show}>Open</button>
      <button onClick={() => setData(d => ({ ...d, source: d.source + '\n', revision: d.revision + 1, modelVersion: d.modelVersion + 1 }))}>Edit source</button>
      <button onClick={() => setData(d => ({ ...d, modelVersion: d.modelVersion + 1 }))}>Bump model version</button>
      <button onClick={() => setData(d => ({ ...d, exercise: 'other' }))}>Change exercise</button>
      <button onClick={() => setData(d => ({ ...d, selected: !d.selected }))}>Select code</button>
      <button onClick={() => { f.evidence(true) }}>Add Run</button>
      <button onClick={() => setData(d => ({ ...d, active: false }))}>Leave Learning</button>
      {hints.open && <SmartHintsPanel hints={hints} onClose={hints.close} onAction={begin}
        onExplain={() => { const s = snapshot(); void hints.begin({ kind: 'EXPLAIN', selection: s.selection }, s) }}
        selectionFixReadiness={data.selected ? { state: 'READY', exerciseId: data.exercise, language: q.language, sourceRevision: data.revision,
          range: fixAction(data.source).selection, selectedBytes: 6 } : { state: 'UNAVAILABLE', reason: 'NO_SELECTION', exerciseId: data.exercise, language: q.language, sourceRevision: data.revision }} />}
    </>
  }
  const ui = render(<Harness />)
  await act(async () => { fireEvent.click(screen.getByText('Open')) })
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Analyze Code & Run' }).disabled).toBe(false))
  return { ...f, ...ui, controller: () => controller }
}
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function confirm(remember = true) {
  if (!remember) fireEvent.click(screen.getByRole('checkbox', { name: 'Ghi nhớ trong phiên học này' }))
  await click('Đồng ý gửi snapshot')
}
async function result(f: Awaited<ReturnType<typeof fixture>>, count: number) {
  await waitFor(() => expect(f.run).toHaveBeenCalledTimes(count))
  await waitFor(() => expect(f.controller().view.phase).toBe('result'))
}
it('first action shows compact consent with remember enabled and technical details collapsed', async () => {
  const f = await fixture(); await click('Hint')
  const dialog = await screen.findByRole('dialog', { name: 'Cho phép AI hỗ trợ bài này?' })
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true)
  expect(dialog.textContent).toContain('toàn bộ mã nguồn hiện tại')
  expect(dialog.textContent).toContain('Google Gemini')
  expect(dialog.querySelector('details')?.open).toBe(false)
  expect(f.run).not.toHaveBeenCalled(); await click('Hủy'); expect(f.run).not.toHaveBeenCalled()
})
it('remembered consent skips later equal-scope actions and survives source edits and panel closure', async () => {
  const f = await fixture(); await click('Hint'); await screen.findByRole('dialog'); await confirm(); await result(f, 1)
  await click('Analyze Code & Run'); await result(f, 2); expect(screen.queryByRole('dialog')).toBeNull()
  await click('Edit source'); await click('Analyze Code & Run'); await result(f, 3)
  expect(screen.queryByRole('dialog')).toBeNull()
  await click('Bump model version'); await click('Analyze Code & Run'); await result(f, 4)
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => { f.controller().close() }); await click('Open')
  await click('Analyze Code & Run'); await result(f, 5)
  const starts = f.invoke.mock.calls.filter(([name]) => name === C.start).map(([, value]) => value as { consent: { mode: string } })
  expect(starts.map(v => v.consent.mode)).toEqual(['SESSION', 'REUSE', 'REUSE', 'REUSE', 'REUSE'])
})
it('unchecked remember asks again and cancellation never dispatches the second action', async () => {
  const f = await fixture(); await click('Analyze Code & Run'); await screen.findByRole('dialog'); await confirm(false); await result(f, 1)
  await click('Hint'); await screen.findByRole('dialog'); await click('Hủy')
  expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
})
it('selection and Run scope expansion each ask again, then allow narrower F5 detection', async () => {
  const f = await fixture(); await click('Hint'); await screen.findByRole('dialog'); await confirm(); await result(f, 1)
  await click('Explain Selected Code (Practice)'); await screen.findByRole('dialog'); expect(f.run).toHaveBeenCalledOnce()
  await confirm(); await result(f, 2)
  await click('Select code'); await click('Suggest Fix'); await result(f, 3); expect(screen.queryByRole('dialog')).toBeNull()
  await click('Add Run'); await click('Analyze Code & Run'); await screen.findByRole('dialog')
  expect(screen.getByRole('dialog').textContent).toContain('Có kèm kết quả Run public')
  await confirm(); await result(f, 4)
  await click('Select code'); await click('Suggest Fix'); await result(f, 5)
  expect(f.run.mock.calls[4][0].action.kind).toBe('DETECT_ISSUES'); expect(screen.queryByRole('dialog')).toBeNull()
})
it('changing exercise asks again, revoke clears Main permission and ending Learning retires it', async () => {
  const f = await fixture(); await click('Hint'); await screen.findByRole('dialog'); await confirm(); await result(f, 1)
  await click('Change exercise'); await click('Analyze Code & Run'); await screen.findByRole('dialog')
  await confirm(); await result(f, 2)
  await click('Thu hồi quyền AI trong phiên học')
  await click('Analyze Code & Run'); await screen.findByRole('dialog'); expect(f.run).toHaveBeenCalledTimes(2)
  await confirm(); await result(f, 3)
  const prepared = await f.prepare(request({ exerciseId: 'other' })); expect(prepared.consent.reusable).toBe(true)
  await click('Leave Learning')
  const after = await f.prepare(request({ exerciseId: 'other' })); expect(after.consent.reusable).toBe(false)
})
it('uncertain revocation blocks new starts until acknowledged and can be retried', async () => {
  const f = await fixture(); await click('Hint'); await screen.findByRole('dialog'); await confirm(); await result(f, 1)
  const realRevoke = f.api.revokeConsent.bind(f.api)
  vi.spyOn(f.api, 'revokeConsent').mockResolvedValueOnce({ ok: false, error: { code: 'INVALID_INPUT', message: 'denied', retryable: false } })
  await click('Thu hồi quyền AI trong phiên học'); expect(screen.getByRole('alert').textContent).toContain('Chưa xác nhận')
  await click('Analyze Code & Run'); expect(f.run).toHaveBeenCalledOnce(); expect(screen.queryByRole('dialog')).toBeNull()
  vi.mocked(f.api.revokeConsent).mockImplementation(realRevoke)
  await click('Thu hồi quyền AI trong phiên học'); await click('Analyze Code & Run'); await screen.findByRole('dialog')
})

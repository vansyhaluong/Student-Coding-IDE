import { useState } from 'react'
import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'

// Presentation input only. 9E must supply successfully persisted Accepted records.
export interface SavedAcceptedView { id: string; language: ExerciseLanguage; code: string; verdict: 'Accepted'; saved: true }
export function MySolutions({ solutions, onRestore, disabled }: {
  solutions: readonly SavedAcceptedView[]; onRestore(code: string): void; disabled: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const accepted = solutions.filter(s => s.verdict === 'Accepted' && s.saved === true)
  const solution = accepted.find(s => s.id === selected)
  return <section aria-label="My Solutions" className="practice-solutions">
    <h3>My Solutions</h3>
    {!accepted.length && <p>Chưa có lời giải Submit Accepted đã lưu. Tính năng lưu lời giải sẽ có ở Phase 9E.</p>}
    {accepted.map(s => <button type="button" key={s.id} onClick={() => { setSelected(s.id); setConfirm(false) }}>Accepted · {s.id}</button>)}
    {solution && <><pre aria-label="Code Accepted">{solution.code}</pre>
      <button type="button" disabled={disabled} onClick={() => setConfirm(true)}>Restore Accepted Solution</button></>}
    {confirm && solution && <div role="alertdialog" aria-modal="false" aria-label="Xác nhận Restore Accepted Solution">
      <p>Ghi đè Draft hiện tại bằng lời giải Accepted đã chọn?</p>
      <button type="button" disabled={disabled} onClick={() => { onRestore(solution.code); setConfirm(false) }}>Xác nhận Restore</button>
      <button type="button" onClick={() => setConfirm(false)}>Hủy</button>
    </div>}
  </section>
}

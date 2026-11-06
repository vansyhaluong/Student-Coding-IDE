/** @vitest-environment jsdom */
import { webcrypto } from 'node:crypto'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSmartHints } from '../../src/renderer/src/features/learning/practice/use-smart-hints'
import { SmartHintsPanel } from '../../src/renderer/src/features/learning/practice/SmartHintsPanel'
import type { SmartHintsApi } from '../../src/shared/contracts/smart-hints'
import { request, fixAction } from '../fixtures/learning/smart-hints'

beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const ok = <T,>(value: T) => ({ ok: true as const, value })
function fixture(legacy = false) {
  const cap = { enabled: true, providerMode: 'GEMINI_FREE', applyEnabled: true, consentVersion: 1,
    ...(!legacy ? { suggestFixMode: 'DISABLED', suggestFixLanguages: [] } : {}) }
  const api = { capabilities: vi.fn(async () => ok(cap)), prepare: vi.fn(), start: vi.fn(), status: vi.fn(), cancel: vi.fn(), retireContext: vi.fn() }
  const q = request({ action: fixAction() })
  const hook = renderHook(() => useSmartHints({ active: true, locked: false, exerciseId: q.exerciseId,
    language: q.language, source: q.source, sourceRevision: q.sourceRevision }, api as unknown as SmartHintsApi))
  return { api, q, ...hook }
}
it('D6-2 Renderer rejects legacy capabilities, without fallback or prepare', async () => {
  const f = fixture(true)
  await act(async () => { f.result.current.show() })
  await waitFor(() => expect(f.result.current.checking).toBe(false))
  expect(f.result.current.capabilities).toBeUndefined(); expect(f.api.prepare).not.toHaveBeenCalled()
})
it('D6-2 Fix stays disabled independently from Hint/Analyze/Explain; direct hook Fix cannot dispatch', async () => {
  const f = fixture()
  await act(async () => { f.result.current.show() })
  await waitFor(() => expect(f.result.current.capabilities?.enabled).toBe(true))
  render(<SmartHintsPanel hints={f.result.current} onClose={() => {}} onAction={() => {}} onExplain={() => {}} />)
  expect((screen.getByRole('button', { name: 'Suggest Fix' }) as HTMLButtonElement).disabled).toBe(true)
  for (const name of ['Get Hint · Level 1', 'Analyze Code & Run', 'Explain Selected Code (Practice)'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false)
  await act(async () => { await f.result.current.begin(f.q.action, { exerciseId: f.q.exerciseId, language: f.q.language,
    source: f.q.source, origin: f.q.origin, isCurrent: () => true }) })
  expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled(); expect(f.api.retireContext).not.toHaveBeenCalled()
})

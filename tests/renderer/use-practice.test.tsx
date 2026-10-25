/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StudentIdeApi } from '../../src/shared/contracts'
import { usePractice } from '../../src/renderer/src/features/learning/practice/use-practice'
import { exercises } from '../fixtures/learning/legacy-exercises'

afterEach(cleanup)

it('shares the bounded catalogue load across StrictMode effect replay, including later pages', async () => {
  let finish!: () => void
  const pending = new Promise<void>(resolve => { finish = resolve })
  let reading = false
  const list = vi.fn(async (request: { cursor?: string }) => {
    if (reading) return { ok: false as const, error: { code: 'PROCESS_FAILED', message: 'Busy', retryable: true } }
    reading = true
    await pending
    reading = false
    const next = request.cursor === undefined
    return { ok: true as const, value: { items: [{ id: next ? 'ch2-01' : 'ch2-02', chapter: 2, title: 'Synthetic public summary', difficulty: 'easy' as const, hasDraft: false, available: true }], nextCursor: next ? 'fixture:1' : null, recovered: false } }
  })
  const exercise = exercises[0]
  const detail = vi.fn(async () => ({ ok: true as const, value: { exercise, language: 'csharp' } }))
  const draft = vi.fn(async () => ({ ok: true as const, value: { text: '', nextOffset: null, exists: false, revision: 'a'.repeat(64) } }))
  window.studentIde = { learning: { practice: { list, detail, draft, save: vi.fn(), onPrepareClose: () => () => {}, onResume: () => () => {} } } } as unknown as StudentIdeApi
  const view = renderHook(() => usePractice(true), { reactStrictMode: true })
  expect(list).toHaveBeenCalledTimes(1)
  await act(async () => { finish() })
  await waitFor(() => expect(view.result.current.ready).toBe(true))
  expect(view.result.current.error).toBeNull()
  expect(view.result.current.summaries.map(item => item.id)).toEqual(['ch2-01', 'ch2-02'])
  expect(list).toHaveBeenCalledTimes(2)
  await act(async () => { await view.result.current.open(exercise.id) })
  expect(detail).toHaveBeenCalledTimes(1)
  expect(view.result.current.exercises).toEqual([exercise])
  expect(view.result.current.error).toBeNull()
})

it('keeps failures visible and starts a fresh load on explicit retry', async () => {
  const list = vi.fn()
    .mockResolvedValueOnce({ ok: false, error: { code: 'PROCESS_FAILED', message: 'Unavailable', retryable: true } })
    .mockResolvedValueOnce({ ok: true, value: { items: [], nextCursor: null, recovered: false } })
  window.studentIde = { learning: { practice: { list, save: vi.fn(), onPrepareClose: () => () => {}, onResume: () => () => {} } } } as unknown as StudentIdeApi
  const view = renderHook(() => usePractice(true), { reactStrictMode: true })
  await waitFor(() => expect(view.result.current.error).not.toBeNull())
  expect(view.result.current.ready).toBe(false)
  expect(list).toHaveBeenCalledTimes(1)
  act(() => { view.result.current.retry() })
  await waitFor(() => expect(view.result.current.ready).toBe(true))
  expect(view.result.current.error).toBeNull()
  expect(list).toHaveBeenCalledTimes(2)
})

it('rejects an empty nonterminal page without unbounded pagination', async () => {
  const list = vi.fn(async () => ({ ok: true as const, value: { items: [], nextCursor: 'fixture:1', recovered: false } }))
  window.studentIde = { learning: { practice: { list, save: vi.fn(), onPrepareClose: () => () => {}, onResume: () => () => {} } } } as unknown as StudentIdeApi
  const view = renderHook(() => usePractice(true), { reactStrictMode: true })
  await waitFor(() => expect(view.result.current.error).not.toBeNull())
  expect(view.result.current.ready).toBe(false)
  expect(list).toHaveBeenCalledTimes(1)
})

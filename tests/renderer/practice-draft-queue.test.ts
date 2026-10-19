import { afterEach, expect, it, vi } from 'vitest'
import { DraftQueue } from '../../src/renderer/src/features/learning/practice/draft-queue'

afterEach(() => vi.useRealTimers())
const draft = { exerciseId: 'ch2-01', language: 'csharp' as const, code: 'one' }
it('debounces 500ms, saves newest code and flushes immediately for navigation/exit', async () => {
  vi.useFakeTimers()
  const save = vi.fn(async () => ({ ok: true as const, value: null }))
  const queue = new DraftQueue({ save }, vi.fn())
  queue.enqueue(draft); queue.enqueue({ ...draft, code: 'two' })
  await vi.advanceTimersByTimeAsync(499); expect(save).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1); expect(save).toHaveBeenCalledExactlyOnceWith({ ...draft, code: 'two' })
  queue.enqueue({ ...draft, language: 'javascript', code: 'js' })
  await queue.flush(); expect(save).toHaveBeenCalledTimes(2); expect(queue.hasPending()).toBe(false)
})
it('retains edits arriving during a write, serializes writes and preserves latest selected language', async () => {
  let release!: () => void
  const save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true, value: null }) }))
    .mockResolvedValue({ ok: true, value: null })
  const queue = new DraftQueue({ save }, vi.fn())
  queue.enqueue(draft); const first = queue.flush()
  queue.enqueue({ ...draft, language: 'javascript', code: 'js' })
  queue.enqueue({ ...draft, code: 'new csharp' })
  expect(queue.flush()).toBe(first); release(); expect(await first).toBe(true)
  expect(save.mock.calls.map(c => c[0].code)).toEqual(['one', 'js', 'new csharp'])
})
it('reports write failure, retains pending draft and supports retry without false success', async () => {
  const report = vi.fn()
  const save = vi.fn().mockResolvedValueOnce({ ok: false, error: {} }).mockResolvedValue({ ok: true, value: null })
  const queue = new DraftQueue({ save }, report); queue.enqueue(draft)
  expect(await queue.flush()).toBe(false); expect(queue.hasPending()).toBe(true)
  expect(report).toHaveBeenLastCalledWith(expect.stringContaining('Không thể lưu'))
  expect(await queue.flush()).toBe(true); expect(queue.hasPending()).toBe(false)
  expect(report).toHaveBeenLastCalledWith(null)
})

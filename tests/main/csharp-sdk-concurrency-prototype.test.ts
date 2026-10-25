import { describe, expect, it } from 'vitest'
import { PrototypeVerifier } from '../fixtures/learning/sdk-concurrency-pool'

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
describe('isolated SDK bounded concurrency accounting/lifecycle', () => {
  it('rejects bounds above the experimental limits', () => {
    expect(() => new PrototypeVerifier(() => {}, 5)).toThrow('Invalid prototype bounds')
    expect(() => new PrototypeVerifier(() => {}, 4, 64 * 1024 ** 2 + 1)).toThrow('Invalid prototype bounds')
  })
  it('admits exactly four tasks and holds credits until parsing completes', async () => {
    const pool = new PrototypeVerifier(() => {}), entered = deferred(), release = deferred(), buffers = new Set<Buffer>(); let calls = 0
    const task = pool.ordered([0, 1, 2, 3, 4, 5], async n => {
      await pool.reserve(16 * 1024 ** 2)
      const data = Buffer.alloc(16 * 1024 ** 2); buffers.add(data)
      try { if (++calls === 4) entered.resolve(); await release.promise; return n }
      finally { buffers.delete(data) }
    }, () => {})
    await entered.promise; expect(pool.metrics).toMatchObject({ active: 4, bytes: 64 * 1024 ** 2, peakTasks: 4 })
    expect([...buffers].reduce((sum, b) => sum + b.byteLength, 0)).toBe(64 * 1024 ** 2)
    release.resolve(); await task
    expect(pool.metrics).toMatchObject({ active: 0, bytes: 0, pendingCredits: 0, completed: 6, peakBytes: 64 * 1024 ** 2 })
    expect(buffers.size).toBe(0)
  })
  it('serializes full-size buffers without rejecting legal 64MiB files', async () => {
    const pool = new PrototypeVerifier(() => {}); const values: number[] = []
    await pool.ordered([0, 1, 2, 3], async n => { await pool.reserve(64 * 1024 ** 2); await Promise.resolve(); return n }, n => { values.push(n) })
    expect(values).toEqual([0, 1, 2, 3]); expect(pool.metrics).toMatchObject({ peakBytes: 64 * 1024 ** 2, bytes: 0, pendingCredits: 0, active: 0 })
  })
  it('keeps original ordered error despite a later faster failure; drains every started task', async () => {
    const pool = new PrototypeVerifier(() => {}), gate = deferred(), started = deferred(), first = Error('first'), later = Error('later'); let settled = false
    const work = pool.ordered([0, 1, 2, 3, 4], async n => {
      await pool.reserve(1); if (n === 0) { started.resolve(); await gate.promise; throw first } if (n === 1) throw later; return n
    }, () => {}).catch(e => { settled = true; return e })
    await started.promise; await Promise.resolve(); expect(settled).toBe(false); gate.resolve()
    expect(await work).toBe(first); expect(pool.metrics).toMatchObject({ active: 0, bytes: 0, completed: 4 })
  })
  it.each(['cancellation', 'deadline', 'shutdown'])('retains pending work and wakes credit waiters on %s', async () => {
    let stopped = false; const reason = Error('owned stop'), gate = deferred(), entered = deferred()
    const pool = new PrototypeVerifier(() => { if (stopped) throw reason }); let settled = false
    const work = pool.ordered([0, 1, 2, 3, 4], async n => {
      await pool.reserve(64 * 1024 ** 2); entered.resolve(); await gate.promise; if (stopped) throw reason; return n
    }, () => {}).catch(e => { settled = true; return e })
    await entered.promise; stopped = true; await Promise.resolve(); expect(settled).toBe(false); gate.resolve()
    expect(await work).toBe(reason); expect(pool.metrics).toMatchObject({ active: 0, bytes: 0, pendingCredits: 0, completed: 4 })
  })
  it('never commits later metadata before earlier verification and drains on commit failure', async () => {
    const pool = new PrototypeVerifier(() => {}), commits: number[] = [], failure = Error('duplicate')
    await expect(pool.ordered([0, 1, 2, 3, 4], async n => { await pool.reserve(1); return n }, n => {
      commits.push(n); if (n === 1) throw failure
    })).rejects.toBe(failure)
    expect(commits).toEqual([0, 1]); expect(pool.metrics).toMatchObject({ bytes: 0, active: 0, completed: 4 })
  })
})

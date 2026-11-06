import { describe, expect, it, vi } from 'vitest'
import { createSubmissionBridge } from '../../src/preload/bridge/submission'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { SUBMISSION_CHANNELS as C, type SubmissionStatus } from '../../src/shared/contracts/submission'
import { transportStatus } from '../fixtures/learning/submission-transport'
import { publicDiagnostic, hiddenCanary } from '../fixtures/learning/wa-diagnostic'

function status(sequence = 0, generation = 1): SubmissionStatus {
  return { ...transportStatus(generation, sequence), exerciseId: 'wa-synthetic', verdict: 'WrongAnswer', diagnostic: publicDiagnostic() }
}
const request = { exerciseId: 'wa-synthetic', language: 'javascript' as const, sourceRevision: 4, code: 'synthetic' }
function fixture() {
  let listener: Parameters<IpcRendererLike['on']>[1] | undefined
  const invoke = vi.fn<(c: string, p: unknown) => Promise<unknown>>(async () => ({ ok: true, value: status() }))
  const api = createSubmissionBridge({ invoke, on: (_c, l) => { listener = l }, removeListener() { listener = undefined } })
  const changed = vi.fn(); api.onChanged(changed)
  return { api, invoke, changed, emit: (v: unknown) => listener?.({}, v) }
}
describe('WA-B1 typed Preload diagnostic boundaries', () => {
  it('clones nested evidence and rejects duplicate/stale events, foreign ref/context and changed evidence', async () => {
    const f = fixture(); const first = await f.api.submit(request)
    expect(first).toMatchObject({ ok: true, value: { diagnostic: publicDiagnostic() } })
    if (first.ok && first.value.diagnostic?.kind === 'PUBLIC_SAMPLE_MISMATCH') first.value.diagnostic.input[0] = 'caller mutation'
    f.emit(status(2)); expect(f.changed).toHaveBeenCalledTimes(1)
    f.changed.mock.calls[0][0].diagnostic.input[0] = 'listener mutation'
    f.emit(status(2)); f.emit(status(1)); f.emit(status(4, 2))
    f.emit({ ...status(4), language: 'csharp' }); f.emit({ ...status(4), reference: { ...status().reference, submissionId: status(0, 3).reference.submissionId } })
    f.emit({ ...status(4), diagnostic: { ...publicDiagnostic(), actual: 'different operation evidence' } })
    expect(f.changed).toHaveBeenCalledTimes(1)
    f.emit(status(5)); expect(f.changed).toHaveBeenCalledTimes(2)
    expect(f.changed.mock.calls[1][0].diagnostic).toEqual(publicDiagnostic())
  })
  it('rejects malformed/private diagnostics on invokes/events and sanitizes errors', async () => {
    const f = fixture(); await f.api.submit(request)
    for (const diagnostic of [{ ...publicDiagnostic(), caseIndex: 0, stdout: hiddenCanary },
      { ...publicDiagnostic(), actual: '🙂'.repeat(40000) }, { ...publicDiagnostic(), actual: 1 },
      { kind: 'DETAIL_UNAVAILABLE', reason: hiddenCanary }, { ...publicDiagnostic(), packageVersion: 0 }]) {
      const bad = { ...status(10), diagnostic }
      f.emit(bad); f.invoke.mockResolvedValueOnce({ ok: true, value: bad })
      expect((await f.api.status(status().reference)).ok).toBe(false)
    }
    expect(f.changed).not.toHaveBeenCalled()
    f.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'PROCESS_FAILED', message: hiddenCanary, details: { diagnostic: hiddenCanary }, retryable: true } })
    expect(JSON.stringify(await f.api.status(status().reference))).not.toContain(hiddenCanary)
  })
  it('recovers lost ACK with same diagnostic, then retires late response across context epoch', async () => {
    const f = fixture(); f.invoke.mockRejectedValueOnce(Error('lost ACK'))
    expect((await f.api.submit(request)).ok).toBe(false)
    expect(await f.api.current()).toMatchObject({ ok: true, value: { diagnostic: publicDiagnostic() } })
    let resolve!: (v: unknown) => void
    f.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const late = f.api.status(status().reference)
    f.invoke.mockResolvedValueOnce({ ok: true, value: null }); await f.api.context({ reason: 'LEARNING_LEFT' })
    resolve({ ok: true, value: status(10) }); expect((await late).ok).toBe(false)
    f.emit(status(11)); expect(f.changed).not.toHaveBeenCalled()
    expect(f.invoke.mock.calls.filter(c => c[0] === C.submit)).toHaveLength(1)
  })
})

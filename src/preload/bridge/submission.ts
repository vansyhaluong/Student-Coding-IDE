import { SUBMISSION_CHANNELS as C, type SubmissionApi, type SubmissionStatus, type SubmissionReference } from '../../shared/contracts/submission'
import { validateSubmitRequest, validateSubmissionReference, validateSubmissionHistoryRequest, validateSubmissionCompletionRequest,
  validateSubmissionSourceRequest, validateSubmissionContext, isSubmissionStatus, isSubmissionHistory,
  isSubmissionCompletion, isSubmissionSource } from '../../shared/contracts/submission-validation'
import type { AppResult } from '../../shared/contracts/app-error'
import type { ValidationResult } from '../../shared/contracts/validation'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { createLearningOrder, type LearningOrder } from './learning-order'

interface UnloadPort { addEventListener(event: 'unload', listener: () => void): void; removeEventListener(event: 'unload', listener: () => void): void }
const invalid = <T>(operation: string): AppResult<T> => ({ ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid or stale submission request.', operation, retryable: false } })
const same = (a: SubmissionReference, b: SubmissionReference) => a.sessionId === b.sessionId && a.generation === b.generation && a.submissionId === b.submissionId
const context = (a: SubmissionStatus, b: SubmissionStatus) => a.exerciseId === b.exerciseId && a.language === b.language && a.sourceRevision === b.sourceRevision
export function createSubmissionBridge(ipc: IpcRendererLike,
  lifetime: UnloadPort | undefined = typeof window === 'undefined' ? undefined : window,
  order: LearningOrder = createLearningOrder()): SubmissionApi {
  const listeners = new Set<(s: SubmissionStatus) => void>()
  let current: SubmissionStatus | undefined, buffered: SubmissionStatus | undefined, pending = 0, subscribed = false, disposed = false
  const accept = (s: SubmissionStatus) => {
    if (current && s.reference.generation === current.reference.generation
      && (!same(current.reference, s.reference) || !context(current, s) || s.sequence < current.sequence)) return false
    if (!order.accept('SUBMIT', s.reference.sessionId, s.reference.generation)) return false
    current = structuredClone(s); return true
  }
  const wrapped = (_event: unknown, v: unknown) => {
    if (disposed || !subscribed || !isSubmissionStatus(v)) return
    if (pending && (!current || v.reference.generation > current.reference.generation)) {
      if (!buffered || v.reference.generation > buffered.reference.generation
        || v.reference.generation === buffered.reference.generation && v.sequence > buffered.sequence) buffered = structuredClone(v)
      return
    }
    if (!current || !same(current.reference, v.reference) || !context(current, v) || v.sequence <= current.sequence
      || !order.current('SUBMIT', v.reference.sessionId, v.reference.generation)) return
    current = structuredClone(v)
    for (const listener of [...listeners]) if (listeners.has(listener)) {
      try { listener(structuredClone(v)) } catch { /* Isolate consumers, never replay an invoke. */ }
    }
  }
  const call = async <Q, R>(channel: string, request: ValidationResult<Q>, valid: (v: unknown) => v is R): Promise<AppResult<R>> => {
    if (disposed || !request.ok) return invalid(channel)
    const epoch = order.epoch
    try {
      const result = parseAppResult(await invokeSafely(ipc, channel, request.value), valid, channel)
      if (disposed || epoch !== order.epoch) return invalid(channel)
      // Do not forward arbitrary error messages/details/paths from any response.
      return result.ok ? { ok: true, value: structuredClone(result.value) }
        : { ok: false, error: { code: result.error.code, message: 'The submission request could not be completed.', operation: channel,
          retryable: channel === C.submit ? false : result.error.retryable } }
    } catch { return invalid(channel) }
  }
  const adopt = (value: SubmissionStatus): boolean => {
    if (!accept(value)) return false
    const bufferedStatus = buffered
    if (!pending) buffered = undefined
    if (bufferedStatus && same(bufferedStatus.reference, value.reference)) wrapped({}, bufferedStatus)
    return true
  }
  const dispose = () => {
    disposed = true; current = undefined; buffered = undefined; listeners.clear()
    if (subscribed) ipc.removeListener(C.changed, wrapped)
    subscribed = false; lifetime?.removeEventListener('unload', dispose)
  }
  lifetime?.addEventListener('unload', dispose)
  return {
    async submit(request) {
      const checked = validateSubmitRequest(request)
      if (pending || disposed || !checked.ok) return invalid(C.submit)
      pending++
      const result = await call(C.submit, checked, isSubmissionStatus)
      pending--
      if (!result.ok) { buffered = undefined; return result } // Lost ACK is never replayed.
      if (result.value.exerciseId !== checked.value.exerciseId || result.value.language !== checked.value.language
        || result.value.sourceRevision !== checked.value.sourceRevision || !adopt(result.value)) return invalid(C.submit)
      return { ok: true, value: structuredClone(current!) }
    },
    async current() {
      const previous = current
      pending++
      const result = await call(C.current, { ok: true, value: {} }, (v): v is SubmissionStatus | null => v === null || isSubmissionStatus(v))
      pending--
      if (result.ok && result.value && !adopt(result.value)) return invalid(C.current)
      if (result.ok && result.value === null) {
        if (current !== previous) return invalid(C.current)
        current = undefined; buffered = undefined
      }
      return result.ok && result.value && current ? { ok: true, value: structuredClone(current) } : result
    },
    async status(reference) {
      const r = validateSubmissionReference(reference), result = await call(C.status, r, isSubmissionStatus)
      if (result.ok && (!r.ok || !same(result.value.reference, r.value) || !accept(result.value))) return invalid(C.status)
      return result
    },
    async retry(reference) {
      const r = validateSubmissionReference(reference), result = await call(C.retry, r, isSubmissionStatus)
      if (result.ok && (!r.ok || !same(result.value.reference, r.value) || !accept(result.value))) return invalid(C.retry)
      return result
    },
    async history(request) {
      const r = validateSubmissionHistoryRequest(request), result = await call(C.history, r, isSubmissionHistory)
      if (result.ok && result.value.ok && r.ok) {
        const h = result.value, q = r.value, selected = q.scope && q.scope !== 'ALL' ? [q.scope] : ['ACCEPTED', 'FAILED'] as const
        if (h.rows.length > (q.limit ?? 32) || h.rows.some(row => !selected.includes(row.key.storeKind)
          || q.exerciseId !== undefined && row.exerciseId !== q.exerciseId || q.language !== undefined && row.language !== q.language
          || q.packageVersion !== undefined && row.packageVersion !== q.packageVersion)
          || h.coverage === 'COMPLETE' && selected.some(k => !h.stores[k].readable || h.stores[k].state === 'RECOVERED')) return invalid(C.history)
      }
      return result
    },
    async completion(request) {
      const r = validateSubmissionCompletionRequest(request), result = await call(C.completion, r, isSubmissionCompletion)
      if (result.ok && result.value.ok && (!r.ok || result.value.exerciseId !== r.value.exerciseId)) return invalid(C.completion)
      return result
    },
    async source(request) {
      const r = validateSubmissionSourceRequest(request), result = await call(C.source, r, isSubmissionSource)
      if (result.ok && result.value.ok && (!r.ok || result.value.reference !== r.value.reference || result.value.offset !== r.value.offset
        || result.value.nextOffset - result.value.offset > (r.value.limit ?? 32768))) return invalid(C.source)
      return result
    },
    async context(request) {
      const r = validateSubmissionContext(request)
      if (!r.ok || disposed) return invalid(C.context)
      order.invalidate(); current = undefined; buffered = undefined
      return call(C.context, r, (v): v is null => v === null)
    },
    onChanged(listener) {
      if (disposed) return () => {}
      const callback = (s: SubmissionStatus) => listener(s); listeners.add(callback)
      if (!subscribed) { subscribed = true; ipc.on(C.changed, wrapped) }
      let removed = false
      return () => { if (removed) return; removed = true; listeners.delete(callback)
        if (!listeners.size && subscribed) { subscribed = false; ipc.removeListener(C.changed, wrapped) } }
    },
  }
}

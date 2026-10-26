import { useEffect, useRef, useState } from 'react'
import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { SubmissionApi, SubmissionStatus, SubmitRequest } from '../../../../../shared/contracts/submission'
import { isSubmissionCompletion, isSubmissionStatus, validateSubmitRequest } from '../../../../../shared/contracts/submission-validation'

interface Input { active: boolean; exerciseId?: string; language: ExerciseLanguage; code: string; sourceRevision: number; blocked: boolean }
export interface SubmissionView {
  busy: boolean
  status?: SubmissionStatus
  error?: string
  completion: 'LOADING' | 'COMPLETED' | 'NOT_COMPLETED' | 'UNKNOWN'
  possibleDataLoss: boolean
}
interface Attempt { request: SubmitRequest; status?: SubmissionStatus; savedObserved: boolean; afterGeneration: number }
interface Context {
  key: string; live: boolean; attempt?: Attempt; observing: boolean; completionRead: number; highestGeneration: number
  timer?: ReturnType<typeof setTimeout>; remove(): void
}
const idle: SubmissionView = { busy: false, completion: 'LOADING', possibleDataLoss: false }
const observationError = 'Chưa xác nhận được trạng thái Submit. Không gửi lại; hãy kiểm tra trạng thái.'
const sameReference = (a: SubmissionStatus, b: SubmissionStatus) => a.reference.sessionId === b.reference.sessionId
  && a.reference.generation === b.reference.generation && a.reference.submissionId === b.reference.submissionId

/** Observes E5's existing operation. Local tokens discard stale UI work, never grant commit authority. */
export function useSubmission(input: Input, api: SubmissionApi | undefined = window.studentIde.learning.submission) {
  const key = input.active && input.exerciseId ? `${input.exerciseId}/${input.language}` : ''
  const latest = useRef(input)
  latest.current = input
  const context = useRef<Context | undefined>(undefined)
  const [state, setState] = useState<{ key: string; view: SubmissionView }>({ key: '', view: idle })
  const current = (ctx: Context) => ctx.live && context.current === ctx
  const update = (ctx: Context, change: Partial<SubmissionView>) => {
    if (current(ctx)) setState(s => ({ key: ctx.key, view: { ...(s.key === ctx.key ? s.view : idle), ...change } }))
  }
  const completion = async (ctx: Context) => {
    if (!api || !current(ctx)) return
    const read = ++ctx.completionRead
    try {
      const result = await api.completion({ exerciseId: ctx.key.split('/')[0] })
      if (!current(ctx) || read !== ctx.completionRead) return
      if (!result.ok || !isSubmissionCompletion(result.value) || !result.value.ok
        || result.value.exerciseId !== ctx.key.split('/')[0]) throw Error('Unavailable completion')
      update(ctx, { completion: result.value.state, possibleDataLoss: result.value.accepted.warning === 'POSSIBLE_DATA_LOSS' })
    } catch { if (read === ctx.completionRead) update(ctx, { completion: 'UNKNOWN', possibleDataLoss: false }) }
  }
  const accept = (ctx: Context, value: unknown) => {
    const attempt = ctx.attempt
    if (!current(ctx) || !attempt || !isSubmissionStatus(value)) return false
    const request = attempt.request, previous = attempt.status
    if (value.reference.generation <= attempt.afterGeneration || value.exerciseId !== request.exerciseId || value.language !== request.language || value.sourceRevision !== request.sourceRevision
      || previous && (!sameReference(previous, value) || value.sequence < previous.sequence)) return false
    if (previous && value.sequence === previous.sequence) return true
    attempt.status = value
    ctx.highestGeneration = value.reference.generation
    update(ctx, { status: value, busy: value.stage !== 'SETTLED', error: undefined })
    if (value.storage.state === 'saved' && !attempt.savedObserved) {
      attempt.savedObserved = true
      void completion(ctx)
    }
    if (value.stage === 'SETTLED') clearTimeout(ctx.timer)
    return true
  }
  const observe = async (ctx: Context, retry = false) => {
    if (!api || !current(ctx) || !ctx.attempt || ctx.observing) return
    ctx.observing = true
    clearTimeout(ctx.timer)
    const attempt = ctx.attempt, before = attempt.status
    try {
      const result = before ? await (retry ? api.retry(before.reference) : api.status(before.reference)) : await api.current()
      if (!current(ctx) || ctx.attempt !== attempt) return
      if (!result.ok || !result.value || !accept(ctx, result.value)) {
        // A newer event may beat/reject an older invoke response. Preserve it.
        if (attempt.status === before) update(ctx, { error: observationError })
      }
    } catch { if (ctx.attempt === attempt && attempt.status === before) update(ctx, { error: observationError }) }
    finally {
      ctx.observing = false
      if (current(ctx) && ctx.attempt && ctx.attempt.status?.stage !== 'SETTLED') {
        ctx.timer = setTimeout(() => { void observe(ctx) }, 1000)
      }
    }
  }
  useEffect(() => {
    if (!key || !api) return
    const ctx: Context = { key, live: true, observing: false, completionRead: 0, highestGeneration: 0, remove: () => {} }
    context.current = ctx
    setState({ key, view: idle })
    ctx.remove = api.onChanged(value => {
      // Before ACK, current()/the invoke response binds the Main reference first.
      if (ctx.attempt?.status) accept(ctx, value)
    })
    void completion(ctx)
    const retire = (reason: 'CONTEXT_CHANGED' | 'LEARNING_LEFT') => {
      if (!ctx.live) return
      ctx.live = false; clearTimeout(ctx.timer); ctx.remove()
      // E5 retains the operation/lease through actual settlement after invalidation.
      if (ctx.attempt) void api.context({ reason }).catch(() => {})
      if (context.current === ctx) context.current = undefined
    }
    const leave = () => retire('LEARNING_LEFT')
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      retire(!latest.current.active ? 'LEARNING_LEFT' : 'CONTEXT_CHANGED')
    }
    // Edits keep the immutable in-flight capture; exercise/language/leave retire it.
  }, [api, key])
  const submit = async () => {
    const ctx = context.current, source = latest.current
    if (!api || !ctx || !current(ctx) || ctx.key !== key || !source.active || source.blocked
      || ctx.attempt && ctx.attempt.status?.stage !== 'SETTLED') return
    const request = validateSubmitRequest({ exerciseId: source.exerciseId, language: source.language, code: source.code, sourceRevision: source.sourceRevision })
    if (!request.ok) return
    const attempt: Attempt = { request: request.value, savedObserved: false, afterGeneration: ctx.highestGeneration }
    ctx.attempt = attempt
    update(ctx, { busy: true, status: undefined, error: undefined })
    try {
      const result = await api.submit(attempt.request)
      if (!current(ctx) || ctx.attempt !== attempt) return
      if ((!result.ok || !accept(ctx, result.value)) && !attempt.status) update(ctx, { error: observationError })
    } catch { if (!attempt.status) update(ctx, { error: observationError }) }
    // Never replay Submit, including missing ACK. current() recovers its Main ref.
    if (current(ctx) && ctx.attempt === attempt && attempt.status?.stage !== 'SETTLED') void observe(ctx)
  }
  const view = state.key === key && key && api ? state.view : { ...idle, completion: 'UNKNOWN' as const }
  const valid = validateSubmitRequest({ exerciseId: input.exerciseId, language: input.language, code: input.code, sourceRevision: input.sourceRevision }).ok
  const disabledReason = !api ? 'Submit chưa khả dụng.' : !key ? 'Hãy mở bài tập để Submit.'
    : input.blocked ? 'Chờ Run hoặc lưu Draft hoàn tất.' : view.busy ? 'Submit đang được xử lý; không gửi lại.'
      : !valid ? 'Code không hợp lệ hoặc vượt giới hạn 262.144 ký tự của Submit.' : undefined
  return { view, disabledReason, submit,
    staleSource: !!view.status && (view.status.sourceRevision !== input.sourceRevision || context.current?.attempt?.request.code !== input.code),
    checkStatus: () => { const ctx = context.current; if (ctx) void observe(ctx, true) },
    refreshCompletion: () => { const ctx = context.current; if (ctx) void completion(ctx) },
  }
}

import { useEffect, useRef, useState } from 'react'
import type { ExerciseApi, ExerciseRunRequest, ExerciseSnapshot, ExerciseStopRequest } from '../../../../../shared/contracts/exercise'
import { validateExerciseSnapshot } from '../../../../../shared/contracts/exercise-validation'
import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { CsharpFailureKind } from '../../../../../shared/contracts/csharp-execution'
import type { JavascriptFailureKind } from '../../../../../shared/contracts/javascript-execution'

export const javascriptFailureMessage: Record<JavascriptFailureKind, string> = {
  NODE_MISSING: 'Chưa tìm thấy Node.js 24.x đã cài đặt.',
  NODE_INCOMPATIBLE: 'Node.js đã cài đặt không phù hợp hoặc không hợp lệ.',
  SYNTAX_ERROR: 'Syntax error: kiểm tra cú pháp và chữ ký hàm.',
  RUNTIME_ERROR: 'Runtime error: hàm gặp lỗi hoặc trả về dữ liệu không hợp lệ.',
  PROTOCOL_FAILURE: 'Protocol error: không thể đọc kết quả thực thi hợp lệ.',
  TIMEOUT: 'Thực thi đã dừng vì vượt thời gian cho phép.',
  JOB_MEMORY_LIMIT: 'Thực thi đã dừng vì vượt giới hạn bộ nhớ.',
  OUTPUT_LIMIT: 'Thực thi đã dừng vì vượt giới hạn đầu ra.',
  INFRASTRUCTURE_FAILURE: 'Không thể hoàn tất thực thi hoặc thu hồi tài nguyên an toàn.',
}

export const csharpFailureMessage: Record<CsharpFailureKind, string> = {
  SDK_MISSING: 'Chưa tìm thấy .NET SDK 10.x đã cài đặt.',
  SDK_INCOMPATIBLE: '.NET SDK đã cài đặt không phù hợp hoặc không hợp lệ.',
  COMPILE_ERROR: 'Không thể biên dịch. Kiểm tra cú pháp và chữ ký hàm.',
  RUNTIME_ERROR: 'Hàm gặp lỗi khi chạy hoặc trả về dữ liệu không hợp lệ.',
  TIMEOUT: 'Thực thi đã dừng vì vượt thời gian cho phép.',
  JOB_MEMORY_LIMIT: 'Thực thi đã dừng vì vượt giới hạn bộ nhớ.',
  OUTPUT_LIMIT: 'Thực thi đã dừng vì vượt giới hạn đầu ra.',
  INFRASTRUCTURE_FAILURE: 'Không thể hoàn tất thực thi hoặc thu hồi tài nguyên an toàn.',
}

export interface ExerciseRunView {
  status: 'idle' | 'running' | 'error' | 'unsupported' | 'cancelled' | 'cleanup-pending' | 'finished'
  busy: boolean
  message: string
  snapshot?: ExerciseSnapshot
}
const idle: ExerciseRunView = { status: 'idle', busy: false, message: 'Chưa có kết quả thực thi.' }
interface Attempt { request: ExerciseRunRequest; snapshot?: ExerciseSnapshot; terminal: boolean; stopSent: boolean }
interface Context {
  key: string; live: boolean; highestGeneration: number; attempt?: Attempt; reason: ExerciseStopRequest['reason']
  timer?: ReturnType<typeof setTimeout>; remove(): void
}
function viewFor(s: ExerciseSnapshot): ExerciseRunView {
  if (s.phase === 'cleanup') return { status: 'cleanup-pending', busy: true, snapshot: s,
    message: s.cleanup.state === 'FAILED' ? 'Chưa thu hồi xong tài nguyên. Phiên vẫn được giữ để xử lý an toàn.' : 'Đang thu hồi tài nguyên…' }
  if (s.phase !== 'finished') return { status: 'running', busy: true, snapshot: s,
    message: s.phase === 'prepare' ? 'Đang chuẩn bị…' : s.phase === 'compile' ? 'Đang biên dịch…' : 'Đang chạy…' }
  if (s.cleanup.proof === 'HISTORY_UNVERIFIED') return { status: 'finished', busy: false, snapshot: s,
    message: 'Đã kết thúc. Tài nguyên được giữ cách ly vì chưa đủ bằng chứng thu hồi.' }
  const cancelled = ['CONTEXT_CHANGED', 'LEARNING_LEFT', 'OWNER_LOST', 'SHUTDOWN'].includes(s.reason ?? '')
  const failure = s.javascript?.result.failure ?? s.csharp?.result.failure
  const failureMessage = s.javascript?.result.failure ? javascriptFailureMessage[s.javascript.result.failure.kind]
    : s.csharp?.result.failure ? csharpFailureMessage[s.csharp.result.failure.kind] : undefined
  const message = cancelled ? 'Đã dừng thực thi.' : failureMessage ? failureMessage : s.reason === 'COMPLETED' ? 'Đã kết thúc thực thi.'
    : s.reason?.endsWith('_TIMEOUT') ? 'Thực thi đã dừng vì vượt thời gian cho phép.'
      : s.reason === 'OUTPUT_LIMIT' ? 'Thực thi đã dừng vì vượt giới hạn đầu ra.'
        : s.reason === 'JOB_MEMORY_LIMIT' ? 'Thực thi đã dừng vì vượt giới hạn bộ nhớ.'
          : 'Không thể hoàn tất thực thi.'
  return { status: cancelled ? 'cancelled' : !failure && s.reason === 'COMPLETED' ? 'finished' : 'error', busy: false, message, snapshot: s }
}

/** Renderer observes Main-issued references; local context tokens only discard stale UI work. */
export function useExerciseRuntime(input: { active: boolean; exerciseId?: string; language: ExerciseLanguage },
  api: ExerciseApi | undefined = window.studentIde.learning.exercise) {
  const key = input.active && input.exerciseId ? `${input.exerciseId}/${input.language}` : ''
  const latest = useRef({ key, active: input.active })
  latest.current = { key, active: input.active }
  const context = useRef<Context | undefined>(undefined)
  const [state, setState] = useState<{ key: string; view: ExerciseRunView }>({ key: '', view: idle })
  const current = (ctx: Context, attempt?: Attempt) => ctx.live && context.current === ctx && (!attempt || ctx.attempt === attempt)
  const stop = (ctx: Context, attempt: Attempt) => {
    const s = attempt.snapshot
    if (!api || !s || attempt.terminal || attempt.stopSent) return
    attempt.stopSent = true
    // Best effort only. Main retains ownership/tasks on IPC failure or caller timeout.
    void api.stop({ sessionId: s.sessionId, generation: s.generation, reason: ctx.reason }).catch(() => {})
  }
  const retire = (ctx: Context, reason: ExerciseStopRequest['reason']) => {
    if (!ctx.live) return
    ctx.reason = reason; ctx.live = false
    clearTimeout(ctx.timer); ctx.remove()
    if (ctx.attempt) stop(ctx, ctx.attempt)
  }
  const accept = (ctx: Context, attempt: Attempt, value: unknown, admission = false): boolean => {
    const result = validateExerciseSnapshot(value)
    if (!result.ok) return false
    const s = result.value, previous = attempt.snapshot
    if (s.exerciseId !== attempt.request.exerciseId || s.language !== attempt.request.language || s.sourceRevision !== attempt.request.sourceRevision
      || admission && s.generation <= ctx.highestGeneration
      || (!admission && (!previous || s.sessionId !== previous.sessionId || s.generation !== previous.generation || s.sequence <= previous.sequence))) return false
    if (admission) ctx.highestGeneration = s.generation
    attempt.snapshot = s; attempt.terminal = s.phase === 'finished' && s.cleanup.state === 'FINALIZED'
    if (!current(ctx, attempt)) { stop(ctx, attempt); return false }
    setState({ key: ctx.key, view: viewFor(s) })
    if (attempt.terminal) clearTimeout(ctx.timer)
    return true
  }
  const probe = async (ctx: Context, attempt: Attempt) => {
    if (!api || !current(ctx, attempt) || attempt.terminal || !attempt.snapshot) return
    const s = attempt.snapshot
    try {
      const result = await api.snapshot({ sessionId: s.sessionId, generation: s.generation })
      if (!current(ctx, attempt) || attempt.terminal) return
      // A newer authorized event may beat this in-flight invoke. Its older
      // response is correctly rejected by Preload; never overwrite that event
      // with a transport error or stop observing the live operation.
      if (attempt.snapshot && attempt.snapshot.sequence > s.sequence) {
        ctx.timer = setTimeout(() => { void probe(ctx, attempt) }, 500)
        return
      }
      if (!result.ok) throw Error('Snapshot unavailable')
      const validated = validateExerciseSnapshot(result.value)
      if (!validated.ok || validated.value.sessionId !== s.sessionId || validated.value.generation !== s.generation
        || validated.value.exerciseId !== attempt.request.exerciseId || validated.value.language !== attempt.request.language
        || validated.value.sourceRevision !== attempt.request.sourceRevision) throw Error('Invalid snapshot')
      accept(ctx, attempt, result.value)
      if (!attempt.terminal) ctx.timer = setTimeout(() => { void probe(ctx, attempt) }, 500)
    } catch {
      if (current(ctx, attempt) && !attempt.terminal) {
        if (attempt.snapshot && attempt.snapshot.sequence > s.sequence) ctx.timer = setTimeout(() => { void probe(ctx, attempt) }, 500)
        else setState({ key: ctx.key, view: { status: 'error', busy: true,
          message: 'Không thể cập nhật trạng thái thực thi. Phiên chưa được xác nhận thu hồi.' } })
      }
    }
  }
  useEffect(() => {
    if (!key || !api) { setState({ key, view: idle }); return }
    const ctx: Context = { key, live: true, highestGeneration: 0, reason: 'CONTEXT_CHANGED', remove: () => {} }
    context.current = ctx; setState({ key, view: idle })
    const remove = api.onChanged(s => { if (current(ctx) && ctx.attempt) accept(ctx, ctx.attempt, s) })
    let removed = false
    ctx.remove = () => { if (!removed) { removed = true; remove() } }
    const leave = () => retire(ctx, 'LEARNING_LEFT')
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      retire(ctx, !latest.current.active || latest.current.key === ctx.key ? 'LEARNING_LEFT' : 'CONTEXT_CHANGED')
      if (context.current === ctx) context.current = undefined
    }
    // Context lifecycle intentionally excludes code revisions and callback identities.
  }, [api, key])
  const run = async (request: ExerciseRunRequest) => {
    const ctx = context.current
    if (!ctx || ctx.key !== key || !current(ctx) || ctx.attempt && !ctx.attempt.terminal) return
    if (!api) return
    const attempt: Attempt = { request: { ...request }, terminal: false, stopSent: false }
    if (request.exerciseId !== input.exerciseId || request.language !== input.language) return
    ctx.attempt = attempt
    setState({ key, view: { status: 'running', busy: true, message: 'Đang chuẩn bị…' } })
    try {
      const result = await api.run(attempt.request)
      if (!result.ok) {
        if (current(ctx, attempt)) {
          ctx.attempt = undefined
          setState({ key, view: { status: result.error.code === 'UNSUPPORTED' ? 'unsupported' : 'error', busy: false,
            message: result.error.code === 'UNSUPPORTED' ? 'Ngôn ngữ này chưa có backend thực thi. Chưa có kết quả chạy.' : 'Không thể bắt đầu thực thi. Hãy thử lại sau.' } })
        }
        return
      }
      if (!accept(ctx, attempt, result.value, true)) {
        if (current(ctx, attempt)) setState({ key, view: { status: 'error', busy: true, message: 'Không thể xác nhận phiên thực thi.' } })
        return
      }
      void probe(ctx, attempt)
    } catch {
      if (current(ctx, attempt)) {
        ctx.attempt = undefined
        setState({ key, view: { status: 'error', busy: false, message: 'Không thể bắt đầu thực thi. Hãy thử lại sau.' } })
      }
    }
  }
  return { view: state.key === key ? state.view : idle, run }
}

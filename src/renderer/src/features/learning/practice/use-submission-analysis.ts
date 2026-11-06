import { useCallback, useEffect, useRef, useState } from 'react'
import { ANALYSIS_CONSENT_VERSION, type Analysis, type AnalysisApi, type AnalysisFailureCode,
  type AnalysisStatus } from '../../../../../shared/contracts/analysis'
import { isAnalysisStatus } from '../../../../../shared/contracts/analysis-validation'
import { submissionInteger, submissionUuid } from '../../../../../shared/contracts/submission-validation'
import type { AppResult } from '../../../../../shared/contracts/app-error'
import type { HistoryRow } from './use-submission-history'

type Prepared = Extract<AnalysisStatus, { state: 'PREPARED' }>
export interface AnalysisView {
  phase: 'idle' | 'preparing' | 'consent' | 'starting' | 'running' | 'recovering' | 'cancelling' | 'cancelled' | 'error' | 'result'
  prepared?: Prepared; analysis?: Analysis; message?: string; canCheck?: boolean
}
export const analysisMessages: Record<AnalysisFailureCode, string> = {
  KEY_UNAVAILABLE: 'Dịch vụ AI chưa được cấu hình. Chưa gửi source tới DeepSeek.',
  SOURCE_UNAVAILABLE: 'Không thể lấy source đã lưu. Hãy quay lại và tải lại History.',
  CONTENT_VERSION_MISMATCH: 'Phiên bản đề bài không khớp submission đã lưu. Không thể phân tích bản này.',
  CAPTURE_EXPIRED: 'Xác nhận đã hết hạn. Hãy đóng phân tích và bắt đầu lại.',
  INVALID_INPUT: 'Submission hoặc xác nhận không hợp lệ. Hãy mở lại từ History.',
  ALREADY_USED: 'Yêu cầu này đã được sử dụng. Hãy kiểm tra trạng thái hiện tại.',
  CANCELLED: 'Đã hủy phân tích.', CONTEXT_INVALID: 'Ngữ cảnh đã thay đổi. Hãy mở lại submission từ History.',
  TIMEOUT: 'Phân tích quá thời gian chờ. Yêu cầu không được tự gửi lại.',
  NETWORK_ERROR: 'Không kết nối được dịch vụ AI. Yêu cầu không được tự gửi lại.',
  AUTHENTICATION: 'Dịch vụ AI chưa xác thực được. Hãy thử lại khi dịch vụ sẵn sàng.',
  BALANCE: 'Dịch vụ AI hiện không đủ hạn mức để phân tích.',
  RATE_LIMIT: 'Dịch vụ AI đang giới hạn yêu cầu. Hãy thử lại sau.',
  PROVIDER_ERROR: 'Dịch vụ AI không hoàn tất phân tích. Yêu cầu không được tự gửi lại.',
  REQUEST_REJECTED: 'Dịch vụ AI từ chối yêu cầu phân tích này.',
  INVALID_RESPONSE: 'Phản hồi AI không hợp lệ nên không được hiển thị.',
  RESPONSE_LIMIT: 'Phản hồi AI vượt giới hạn cho phép nên không được hiển thị.',
  INCOMPLETE_OUTPUT: 'Phản hồi AI chưa đầy đủ nên không được hiển thị.',
  BUSY: 'Một phân tích khác đang hoạt động. Hãy đóng yêu cầu đó trước.',
}
const failures = ['WrongAnswer', 'CompilationError', 'SyntaxError', 'RuntimeError', 'TimeLimitExceeded', 'MemoryLimitExceeded', 'OutputLimitExceeded']
export function analysisEligible(row: HistoryRow): boolean {
  return submissionUuid(row.submissionId) && submissionUuid(row.key.recordId)
    && (row.key.storeKind === 'ACCEPTED' && row.verdict === 'Accepted' || row.key.storeKind === 'FAILED' && failures.includes(row.verdict))
    && ['csharp', 'javascript'].includes(row.language) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(row.exerciseId)
    && /^[A-Za-z0-9_-]{1,512}$/.test(row.source.reference) && submissionInteger(row.source.revision)
    && submissionInteger(row.source.byteLength) // Main owns capture limits; never truncate or substitute source here.
}
interface Operation {
  id: string; sequence: number; started: boolean; cancelling: boolean; released: boolean; terminal: boolean; cancelInFlight?: boolean
  prepared?: Prepared; lastStatus?: AnalysisStatus; timer?: ReturnType<typeof setTimeout>; polling: boolean; failures: number
}
interface Context { live: boolean; op?: Operation }
const idle: AnalysisView = { phase: 'idle' }
const uncertain = 'Chưa xác nhận được trạng thái. Kiểm tra lại hoặc hủy; yêu cầu phân tích không được tự gửi lại.'

/** Presentation lifecycle only. Main retains all saved capture/provider authority. */
export function useSubmissionAnalysis(row: HistoryRow, active: boolean, sourceReady: boolean,
  api: AnalysisApi | undefined = window.studentIde?.learning?.analysis) {
  const key = JSON.stringify([row.exerciseId, row.language, row.submissionId, row.key.storeKind,
    row.key.recordId, row.source.reference, row.source.revision, row.source.byteLength])
  const current = useRef<Context | undefined>(undefined)
  const [state, setState] = useState<{ key: string; view: AnalysisView }>({ key, view: idle })
  const eligible = analysisEligible(row)
  const controls = useRef<{ begin(): void; consent(): void; cancel(): void; check(): void } | undefined>(undefined)
  useEffect(() => {
    if (!active || !api || !eligible) return
    const ctx: Context = { live: true }; current.current = ctx
    const live = (op?: Operation) => ctx.live && current.current === ctx && (!op || ctx.op === op)
    const publish = (view: AnalysisView, op?: Operation) => { if (live(op)) setState({ key, view }) }
    const clear = (op: Operation) => { clearTimeout(op.timer); op.timer = undefined }
    const abandon = (op: Operation) => { clear(op); void api.cancel({ requestId: op.id }).catch(() => {}) }
    const error = (op: Operation, code: AnalysisFailureCode) => { clear(op); op.terminal = true; publish({ phase: 'error', message: analysisMessages[code] }, op) }
    const schedule = (op: Operation) => {
      clear(op)
      if (live(op) && !op.released && !op.terminal) op.timer = setTimeout(() => { void poll(op) }, 500)
    }
    const accept = (op: Operation, raw: unknown) => {
      if (!live(op) || op.released || op.terminal) return
      if (!isAnalysisStatus(raw) || raw.requestId !== op.id) { error(op, 'INVALID_RESPONSE'); abandon(op); return }
      if (raw.sequence < op.sequence) { schedule(op); return }
      const value = raw.sequence === op.sequence && op.lastStatus ? op.lastStatus : raw
      op.sequence = value.sequence
      op.lastStatus = structuredClone(value)
      if (op.cancelling && value.state !== 'CANCELLED') {
        publish({ phase: 'recovering', message: 'Đang xác nhận hủy phân tích…', canCheck: true }, op); schedule(op); return
      }
      switch (value.state) {
        case 'PREPARING': publish({ phase: 'preparing' }, op); schedule(op); break
        case 'PREPARED':
          if (value.submissionId !== row.submissionId || value.exerciseId !== row.exerciseId || value.language !== row.language
            || value.sourceBytes !== row.source.byteLength || value.consentVersion !== ANALYSIS_CONSENT_VERSION) {
            error(op, 'INVALID_RESPONSE'); abandon(op); return
          }
          if (Date.now() >= value.expiresAt) { error(op, 'CAPTURE_EXPIRED'); return }
          op.prepared = structuredClone(value)
          publish(op.started ? { phase: 'recovering', message: uncertain, canCheck: true } : { phase: 'consent', prepared: op.prepared }, op)
          schedule(op); break
        case 'RUNNING':
          if (!op.started) { error(op, 'INVALID_RESPONSE'); abandon(op); return }
          publish({ phase: 'running' }, op); schedule(op); break
        case 'COMPLETE':
          if (!op.started) { error(op, 'INVALID_RESPONSE'); abandon(op); return }
          clear(op); op.terminal = true; publish({ phase: 'result', analysis: value.analysis }, op); break
        case 'FAILED': error(op, value.code); break
        case 'CANCELLED':
          clear(op); op.terminal = true; op.released = true; publish({ phase: 'cancelled', message: analysisMessages.CANCELLED }, op); break
      }
    }
    const failed = (op: Operation, result?: AppResult<AnalysisStatus>) => {
      if (!live(op) || op.released || op.terminal) return
      if (result && !result.ok && ['PERMISSION_DENIED', 'PROCESS_CANCELLED'].includes(result.error.code)) {
        error(op, 'CONTEXT_INVALID'); abandon(op); return
      }
      publish({ phase: 'recovering', message: uncertain, canCheck: true }, op)
      if (++op.failures <= 3) schedule(op)
      else clear(op)
    }
    async function poll(op: Operation) {
      if (!live(op) || op.released || op.terminal || op.polling) return
      op.polling = true
      try {
        const result = await api!.status({ requestId: op.id })
        if (!live(op)) return
        if (result.ok) { op.failures = 0; accept(op, result.value) }
        else failed(op, result)
      } catch { failed(op) }
      finally { op.polling = false }
    }
    const invoke = async (op: Operation, call: () => Promise<AppResult<AnalysisStatus>>) => {
      schedule(op) // Poll even if the mutation ACK never arrives; never replay prepare/start.
      try {
        const result = await call()
        if (!live(op) || op.terminal || op.released) return
        if (result.ok) accept(op, result.value)
        else if (result.error.code === 'INVALID_INPUT') error(op, 'INVALID_INPUT')
        else failed(op, result)
      } catch { failed(op) }
    }
    const cancel = () => {
      const op = ctx.op
      if (!live(op) || !op || op.released || op.cancelInFlight) return
      op.cancelling = true; op.terminal = false; op.cancelInFlight = true; clear(op); publish({ phase: 'cancelling' }, op)
      void invoke(op, () => api.cancel({ requestId: op.id })).finally(() => { op.cancelInFlight = false })
    }
    controls.current = {
      begin() {
        if (!live() || ctx.op && !ctx.op.released) return
        const op: Operation = { id: crypto.randomUUID(), sequence: -1, started: false, cancelling: false,
          released: false, terminal: false, polling: false, failures: 0 }
        ctx.op = op; publish({ phase: 'preparing' }, op)
        void invoke(op, () => api.prepare({ requestId: op.id, sourceReference: row.source.reference }))
      },
      consent() {
        const op = ctx.op
        if (!op || !live(op) || op.started || op.cancelling || op.released || !op.prepared) return
        if (Date.now() >= op.prepared.expiresAt) { error(op, 'CAPTURE_EXPIRED'); return }
        op.started = true; clear(op); publish({ phase: 'starting' }, op)
        void invoke(op, () => api.start({ requestId: op.id, captureToken: op.prepared!.captureToken,
          consentVersion: ANALYSIS_CONSENT_VERSION }))
      }, cancel,
      check() { const op = ctx.op; if (op && live(op)) { op.failures = 0; void poll(op) } },
    }
    publish(idle)
    const retire = () => { if (!ctx.live) return; ctx.live = false; if (ctx.op) abandon(ctx.op); if (current.current === ctx) current.current = undefined }
    const leave = () => { publish({ phase: 'error', message: analysisMessages.CONTEXT_INVALID }); retire() }
    window.addEventListener('pagehide', leave)
    return () => { window.removeEventListener('pagehide', leave); retire() }
    // Primitive identity survives incidental row object recreation and unrelated draft edits.
  }, [api, active, eligible, key])
  const cancel = useCallback(() => controls.current?.cancel(), [])
  return {
    view: state.key === key && active ? state.view : idle,
    available: !!api && eligible,
    begin: () => { if (active && sourceReady && eligible) controls.current?.begin() },
    consent: () => { if (active) controls.current?.consent() },
    cancel, check: () => controls.current?.check(),
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExerciseLanguage } from '../../../../../shared/contracts/practice'
import type { SmartHintsApi, SmartAction, SmartPrepare, SmartStatus, SmartCapabilities, SmartRetire, SmartFailure } from '../../../../../shared/contracts/smart-hints'
import { isSmartCapabilities, isSmartStatus, validateSmartPrepare, isSmartOutput, smartCandidate } from '../../../../../shared/contracts/smart-hints-validation'
import { isCanonicalSelectionFix, type SmartFix } from './smart-hint-edits'
import type { SmartSourceSnapshot, PracticeFixSnapshot } from './smart-hints-selection'

type Prepared = Extract<SmartStatus, { state: 'PREPARED' }>
type Complete = Extract<SmartStatus, { state: 'COMPLETE' }>
export interface SmartHintsView {
  requestId?: string; operationId?: string; action?: SmartAction['kind']
  phase: 'idle' | 'preparing' | 'consent' | 'starting' | 'running' | 'recovering' | 'result' | 'error' | 'cancelled'
  prepared?: Prepared; result?: Complete; message?: string; hints: Complete[]; canCheck?: boolean
}
interface Operation {
  q: SmartPrepare; snapshot: SmartSourceSnapshot; fingerprint: string; selectionFingerprint?: string
  sequence: number; binding?: string; signature?: string; status?: SmartStatus; started: boolean; pending: boolean
  polling: boolean; failures: number; timer?: ReturnType<typeof setTimeout>
  cancelling?: boolean
}
interface Context {
  live: boolean; id: string; key: string; code: string; sourceKey?: string; used: boolean
  origin: SmartSourceSnapshot['origin']
  op?: Operation; hints: Complete[]; expiry?: ReturnType<typeof setTimeout>; expiresAt?: number
}
const idle: SmartHintsView = { phase: 'idle', hints: [] }
const uncertain = 'Chưa xác nhận được trạng thái. Kiểm tra lại hoặc hủy; yêu cầu không được tự gửi lại.'
const messages: Record<SmartFailure, string> = {
  UNCONFIGURED: 'AI hoặc bộ kiểm tra vùng chọn chưa sẵn sàng. Chưa gửi source.', INVALID_INPUT: 'Vùng chọn hoặc snapshot không được hỗ trợ. Hãy chọn biểu thức, các câu lệnh trong cùng hàm hoặc toàn bộ hàm hợp lệ.',
  CONTEXT_STALE: 'Source hoặc ngữ cảnh đã thay đổi. Hãy yêu cầu lại.', CAPTURE_EXPIRED: 'Xác nhận đã hết hạn. Hãy yêu cầu lại.',
  LIMIT_EXCEEDED: 'Nội dung vượt giới hạn Smart Hints. Không gửi phần source bị cắt.', BUSY: 'Một yêu cầu AI khác đang hoạt động.',
  CONSENT_REQUIRED: 'Cần xác nhận cho snapshot này.', CANCELLED: 'Đã hủy yêu cầu.', TIMEOUT: 'AI quá thời gian chờ. Không tự gửi lại yêu cầu.',
  NETWORK: 'Không kết nối được AI. Không tự gửi lại yêu cầu.', AUTH: 'Dịch vụ AI chưa xác thực được.', BALANCE: 'Dịch vụ AI không đủ hạn mức.',
  RATE_LIMIT: 'Đã đạt giới hạn yêu cầu. Hãy thử lại sau.', PROVIDER: 'AI chưa hoàn tất yêu cầu.', INVALID_RESPONSE: 'Phản hồi không hợp lệ nên không được hiển thị.',
  DUPLICATE_HINT: 'Gợi ý bị lặp nên không được hiển thị. Bạn có thể thử lại sau.',
}
async function fingerprint(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('')
}
function isFixSnapshot(snapshot: SmartSourceSnapshot): snapshot is PracticeFixSnapshot {
  return snapshot.origin.kind === 'PRACTICE' && !!snapshot.selection
    && 'freezeTarget' in snapshot && typeof snapshot.freezeTarget === 'function' && 'sourceRevision' in snapshot
}
export function useSmartHints(input: { active: boolean; locked: boolean; exerciseId?: string; language: ExerciseLanguage; source: string; sourceRevision: number },
  api: SmartHintsApi | undefined = window.studentIde?.learning?.smartHints) {
  const key = JSON.stringify([input.active, input.locked, input.exerciseId, input.language, input.sourceRevision])
  const latest = useRef({ ...input, key }); latest.current = { ...input, key }
  const current = useRef<Context | undefined>(undefined), admission = useRef(false), mounted = useRef(false)
  const [open, setOpen] = useState(false), [capabilities, setCapabilities] = useState<SmartCapabilities>()
  const capability = useRef<SmartCapabilities | undefined>(undefined)
  const capabilityProbe = useRef(0), latestApi = useRef(api); latestApi.current = api
  const [checking, setChecking] = useState(false)
  const [state, setState] = useState<{ ctx?: Context; view: SmartHintsView }>({ view: idle })
  const permission = useRef<{ id: string; remembered: boolean; blocked?: boolean } | undefined>(undefined)
  const [canRevokeConsent, setCanRevokeConsent] = useState(false), [consentError, setConsentError] = useState('')
  const revoking = useRef(false)
  const valid = (ctx: Context, op?: Operation) => mounted.current && ctx.live && current.current === ctx
    && latest.current.active && !latest.current.locked && latest.current.key === ctx.key && latest.current.source === ctx.code
    && (!op || ctx.op === op && op.snapshot.isCurrent())
  const publish = (ctx: Context, view: Omit<SmartHintsView, 'hints'>) => {
    if (valid(ctx)) setState({ ctx, view: { requestId: ctx.op?.q.requestId, operationId: ctx.op?.status?.operationId,
      action: ctx.op?.q.action.kind, ...view, hints: [...ctx.hints] } })
  }
  const retire = (ctx: Context, reason: SmartRetire['reason']) => {
    ctx.live = false; clearTimeout(ctx.op?.timer); clearTimeout(ctx.expiry)
    ctx.hints = []
    if (ctx.used && api) void api.retireContext({ clientContextId: ctx.id, reason }).catch(() => {})
  }
  const invalidate = useCallback((reason: SmartRetire['reason'] = 'EDIT') => {
    const ctx = current.current
    if (ctx) retire(ctx, reason)
    current.current = undefined; admission.current = false
    if (mounted.current) setState({ view: idle })
  }, [api])
  const endPermission = useCallback(() => {
    const old = permission.current; permission.current = undefined
    if (mounted.current) { setCanRevokeConsent(false); setConsentError('') }
    if (old && api) void api.revokeConsent({ sessionId: old.id }).catch(() => {})
  }, [api])
  useEffect(() => () => endPermission(), [api, input.active, input.exerciseId, input.language, endPermission])
  useEffect(() => {
    mounted.current = true; capability.current = undefined; setCapabilities(undefined); setChecking(false)
    const leave = () => { endPermission(); invalidate('LEARNING_LEFT'); setOpen(false) }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      mounted.current = false; capabilityProbe.current++; const ctx = current.current; if (ctx) retire(ctx, 'LEARNING_LEFT'); current.current = undefined
    }
  }, [api])
  useEffect(() => {
    const ctx = current.current
    if (ctx && !valid(ctx)) invalidate(input.active ? 'EDIT' : 'LEARNING_LEFT')
    if (!input.active || !input.exerciseId) setOpen(false)
  }, [key, input.source, api])
  const probe = useCallback(async (refresh = false) => {
    if (capability.current && !refresh) return capability.current.enabled
    if (!api || !latest.current.active || latest.current.locked) return false
    const probeId = ++capabilityProbe.current
    if (refresh) { capability.current = undefined; setCapabilities(undefined) }
    setChecking(true)
    try {
      const r = await api.capabilities()
      // Capabilities belong to Main/provider provisioning, not the editor source
      // revision. Source/action guards remain in begin/valid/snapshot.isCurrent.
      if (!mounted.current || latestApi.current !== api || capabilityProbe.current !== probeId
        || !latest.current.active || latest.current.locked || !r.ok || !isSmartCapabilities(r.value)) return false
      capability.current = r.value; setCapabilities(r.value); return r.value.enabled
    } catch { return false } finally { if (mounted.current && capabilityProbe.current === probeId) setChecking(false) }
  }, [api])
  const show = useCallback(() => { setOpen(true); void probe(true) }, [probe])
  useEffect(() => {
    const changed = () => {
      endPermission(); invalidate('EDIT'); capability.current = undefined; setCapabilities(undefined)
      if (open) void probe(true)
    }
    const checked = () => { if (open) void probe(true) }
    window.addEventListener('smart-hints-configuration-changed', changed)
    window.addEventListener('smart-hints-readiness-changed', checked)
    return () => {
      window.removeEventListener('smart-hints-configuration-changed', changed)
      window.removeEventListener('smart-hints-readiness-changed', checked)
    }
  }, [open, probe, invalidate, endPermission])
  const expire = (ctx: Context, at: number) => {
    ctx.expiresAt = Math.min(ctx.expiresAt ?? at, at)
    clearTimeout(ctx.expiry)
    ctx.expiry = setTimeout(() => {
      if (!valid(ctx)) return
      retire(ctx, 'EDIT'); current.current = undefined
      setState({ view: { ...idle, message: 'Phiên gợi ý đã hết hạn. Hãy yêu cầu lại.' } })
    }, Math.max(0, ctx.expiresAt - Date.now()))
  }
  const cancelFix = (ctx: Context, op: Operation, message: string) => {
    if (ctx.op !== op) return
    clearTimeout(op.timer); op.pending = false; ctx.op = undefined; admission.current = false
    clearTimeout(ctx.expiry); ctx.expiresAt = undefined
    if (ctx.hints.length) expire(ctx, Math.min(...ctx.hints.map(h => h.expiresAt)))
    // Cancel only this operation. Cursor changes must not retire the source/Hint session.
    if (op.status) void api?.cancel({ requestId: op.q.requestId, operationId: op.status.operationId }).catch(() => {})
    publish(ctx, { phase: 'cancelled', message, requestId: op.q.requestId, operationId: op.status?.operationId, action: op.q.action.kind })
  }
  const selectionChanged = useCallback(() => {
    const ctx = current.current, op = ctx?.op
    if (ctx && op?.q.action.kind === 'SUGGEST_FIX' && !op.started && !op.snapshot.isCurrent())
      cancelFix(ctx, op, 'Vùng chọn đã thay đổi. Hãy chọn đoạn code và yêu cầu Suggest Fix lại.')
  }, [api])
  const accept = (ctx: Context, op: Operation, value: unknown): boolean => {
    if (!valid(ctx, op)) return false
    const bad = () => {
      clearTimeout(op.timer); op.pending = false
      retire(ctx, 'EDIT'); current.current = undefined
      setState({ view: { ...idle, phase: 'error', message: messages.INVALID_RESPONSE } })
      return false
    }
    if (!isSmartStatus(value)) return bad()
    const b = value.binding, q = op.q
    if (value.requestId !== q.requestId || b.clientContextId !== ctx.id || b.exerciseId !== q.exerciseId || b.language !== q.language
      || b.sourceRevision !== q.sourceRevision || b.fingerprint !== op.fingerprint || b.sourceBytes !== new TextEncoder().encode(q.source).length
      || JSON.stringify(b.origin) !== JSON.stringify(q.origin) || b.action.kind !== q.action.kind
      || (b.action.kind === 'EXPLAIN' || b.action.kind === 'SUGGEST_FIX') && (q.action.kind !== b.action.kind || !('selection' in q.action) || b.action.selection.fingerprint !== op.selectionFingerprint
        || b.action.selection.startOffset !== q.action.selection.startOffset || b.action.selection.endOffset !== q.action.selection.endOffset
        || b.action.selection.startLine !== q.action.selection.startLine || b.action.selection.startColumn !== q.action.selection.startColumn
        || b.action.selection.endLine !== q.action.selection.endLine || b.action.selection.endColumn !== q.action.selection.endColumn)
      || op.status && value.operationId !== op.status.operationId || op.binding && op.binding !== JSON.stringify(b)) return bad()
    if (value.sequence < op.sequence) return true
    if (value.sequence === op.sequence) {
      if (op.signature !== JSON.stringify(value)) return bad()
      if (op.started && value.state === 'PREPARED') publish(ctx, { phase: 'recovering', canCheck: true, message: uncertain })
      return true
    }
    op.sequence = value.sequence; op.binding = JSON.stringify(b); op.signature = JSON.stringify(value); op.status = structuredClone(value)
    if (value.state === 'PREPARED') {
      if (value.expiresAt <= Date.now()) return bad()
      if (value.consent) {
        const previous = permission.current
        permission.current = { id: value.consent.sessionId,
          remembered: value.consent.reusable || previous?.id === value.consent.sessionId && previous.remembered }
        setCanRevokeConsent(permission.current.remembered)
      }
      expire(ctx, value.expiresAt)
      if (!op.started && value.consent?.reusable) void consent('REUSE')
      else publish(ctx, op.started ? { phase: 'recovering', canCheck: true, message: uncertain } : { phase: 'consent', prepared: value })
    } else if (value.state === 'PREPARING' || value.state === 'RUNNING') publish(ctx, { phase: 'running' })
    else if (value.state === 'COMPLETE') {
      if (value.expiresAt <= Date.now() || !isSmartOutput(value.output, q.action, q.source,
        value.runContext.kind === 'RUN_PUBLIC' ? value.runContext.observations.map(x => x.evidenceId) : [],
        q.origin.kind === 'PRACTICE' ? q.origin.eol : undefined, q.language)
        || value.output.kind === 'EDIT_PROPOSAL' && !isCanonicalSelectionFix(q.source, b, value.output)) return bad()
      clearTimeout(op.timer); op.pending = false
      // The consent timer belongs to the prepare token, not to the completed result.
      clearTimeout(ctx.expiry); ctx.expiresAt = ctx.hints.length ? Math.min(...ctx.hints.map(h => h.expiresAt)) : undefined
      if (value.output.kind === 'HINT') ctx.hints = [value]
      expire(ctx, value.expiresAt); publish(ctx, { phase: 'result', result: value })
    } else {
      clearTimeout(op.timer); op.pending = false; clearTimeout(ctx.expiry); ctx.expiresAt = undefined
      if (ctx.hints.length) expire(ctx, Math.min(...ctx.hints.map(h => h.expiresAt)))
      const message = value.state === 'FAILED' ? value.code === 'TIMEOUT' && q.action.kind === 'SUGGEST_FIX' && capability.current?.providerMode === 'GEMINI_FREE'
        ? 'Suggest Fix đã hết thời gian chờ tối đa 30 giây. Yêu cầu đã được hủy; không tự gửi lại.' : messages[value.code] : 'Phiên gợi ý đã kết thúc.'
      publish(ctx, { phase: value.state === 'FAILED' ? 'error' : 'cancelled', message })
    }
    return true
  }
  const recover = (ctx: Context, op: Operation) => { if (valid(ctx, op)) publish(ctx, { phase: 'recovering', canCheck: true, message: uncertain }) }
  const poll = async (ctx: Context, op: Operation) => {
    if (!api || !valid(ctx, op) || op.polling || !op.pending) return
    // A manual recovery check owns the next poll; retire the older scheduled one.
    clearTimeout(op.timer); op.timer = undefined
    op.polling = true
    try {
      const r = op.status ? await api.status({ requestId: op.q.requestId, operationId: op.status.operationId }) : await api.prepare(op.q)
      if (!valid(ctx, op)) return
      if (!r.ok) { op.failures++; recover(ctx, op) } else { op.failures = 0; accept(ctx, op, r.value) }
    } catch { op.failures++; recover(ctx, op) }
    finally {
      op.polling = false
      if (valid(ctx, op) && op.pending && op.started && op.failures < 3) op.timer = setTimeout(() => { void poll(ctx, op) }, 500)
    }
  }
  const begin = useCallback(async (action: SmartAction, snapshot: SmartSourceSnapshot) => {
    if (action.kind === 'SUGGEST_FIX' && (!isFixSnapshot(snapshot) || snapshot.sourceRevision !== latest.current.sourceRevision
      || JSON.stringify(action.selection) !== JSON.stringify(snapshot.selection))) return
    if (admission.current || revoking.current || permission.current?.blocked || !api || !latest.current.active || latest.current.locked || !latest.current.exerciseId
      || snapshot.exerciseId !== latest.current.exerciseId || !snapshot.isCurrent()) return
    let ctx = current.current
    if (ctx?.expiresAt !== undefined && ctx.expiresAt <= Date.now()) { retire(ctx, 'EDIT'); ctx = undefined; current.current = undefined }
    if (ctx?.op?.pending && valid(ctx)) return
    const sourceKey = JSON.stringify([snapshot.language, snapshot.source, snapshot.origin])
    if (ctx && (!valid(ctx) || ctx.sourceKey !== sourceKey)) { retire(ctx, 'EDIT'); ctx = undefined }
    if (!ctx) {
      ctx = { live: true, id: crypto.randomUUID(), key: latest.current.key, code: latest.current.source, sourceKey, origin: snapshot.origin, used: false, hints: [] }
      current.current = ctx
    }
    const owner = ctx
    admission.current = true; setOpen(true)
    const q: SmartPrepare = { requestId: crypto.randomUUID(), clientContextId: owner.id, exerciseId: latest.current.exerciseId!, language: snapshot.language,
      sourceRevision: latest.current.sourceRevision, source: snapshot.source, origin: snapshot.origin, action: structuredClone(action), run: null }
    if (snapshot.origin.kind === 'PRACTICE') q.run = run.current
    const op: Operation = { q, snapshot, fingerprint: '', sequence: -1, started: false, pending: true, polling: false, failures: 0 }
    owner.op = op
    publish(owner, { phase: 'preparing' })
    try {
      if (!await probe()) { op.pending = false; if (valid(owner, op)) publish(owner, { phase: 'idle', message: 'AI chưa sẵn sàng hoặc chưa được cấu hình. Chưa gửi source.' }); return }
      if (!valid(owner, op)) { if (valid(owner) && owner.op === op && action.kind === 'SUGGEST_FIX') cancelFix(owner, op, 'Vùng chọn đã thay đổi. Hãy yêu cầu lại.'); return }
      if (snapshot.origin.kind === 'PRACTICE' && snapshot.source !== latest.current.source) { invalidate('EDIT'); return }
      if (action.kind === 'SUGGEST_FIX' && (capability.current?.suggestFixMode !== 'SELECTION_V1'
        || !capability.current.suggestFixLanguages.includes(q.language))) { op.pending = false; publish(owner, { phase: 'idle', message: 'Suggest Fix chưa sẵn sàng cho ngôn ngữ này.' }); return }
      if (!validateSmartPrepare(q).ok) { op.pending = false; publish(owner, { phase: 'error', message: messages.LIMIT_EXCEEDED }); return }
      const [hash, selectedHash] = await Promise.all([fingerprint(q.source), action.kind === 'EXPLAIN' || action.kind === 'SUGGEST_FIX' ? fingerprint(action.selection.text) : Promise.resolve(undefined)])
      if (!valid(owner, op)) { if (valid(owner) && owner.op === op && action.kind === 'SUGGEST_FIX') cancelFix(owner, op, 'Vùng chọn đã thay đổi. Hãy yêu cầu lại.'); return }
      op.fingerprint = hash; op.selectionFingerprint = selectedHash; owner.used = true
      const result = await api.prepare(q)
      if (!valid(owner, op)) {
        if (valid(owner)) {
          // A late ACK belongs only to this old Fix, never to a newer operation/context.
          if (result.ok && result.value.requestId === q.requestId)
            void api.cancel({ requestId: q.requestId, operationId: result.value.operationId }).catch(() => {})
          if (owner.op === op) cancelFix(owner, op, 'Snapshot đã thay đổi. Hãy yêu cầu lại.')
        } else void api.retireContext({ clientContextId: owner.id, reason: 'EDIT' }).catch(() => {})
        return
      }
      if (result.ok) accept(owner, op, result.value)
      else if (action.kind === 'SUGGEST_FIX') {
        op.pending = false; publish(owner, { phase: 'error', message: messages.INVALID_INPUT })
      } else recover(owner, op)
    } catch {
      if (valid(owner, op)) {
        if (action.kind === 'SUGGEST_FIX') { op.pending = false; publish(owner, { phase: 'error', message: 'Chưa xác nhận được vùng chọn. Hãy chọn lại đoạn code và yêu cầu Suggest Fix mới.' }) }
        else publish(owner, { phase: 'recovering', canCheck: !!owner.op, message: uncertain })
      }
    }
    finally {
      if (current.current === owner && owner.op === op) admission.current = false
    }
  }, [api, probe, invalidate])
  const run = useRef<SmartPrepare['run']>(null)
  const setRun = useCallback((value: SmartPrepare['run']) => { run.current = value }, [])
  const consent = useCallback(async (remember: boolean | 'REUSE' = true) => {
    const ctx = current.current, op = ctx?.op
    if (ctx && op?.q.action.kind === 'SUGGEST_FIX' && !op.started && !op.snapshot.isCurrent()) {
      cancelFix(ctx, op, 'Vùng chọn đã thay đổi. Hãy yêu cầu lại.'); return
    }
    if (!api || !ctx || !op || !valid(ctx, op) || op.started || op.status?.state !== 'PREPARED' || permission.current?.blocked || revoking.current) return
    if (op.status.expiresAt <= Date.now()) { invalidate('EDIT'); return }
    if (op.q.action.kind === 'SUGGEST_FIX' && (!isFixSnapshot(op.snapshot) || !op.snapshot.freezeTarget())) {
      cancelFix(ctx, op, 'Vùng chọn đã thay đổi. Hãy yêu cầu lại.'); return
    }
    op.started = true; clearTimeout(ctx.expiry); ctx.expiresAt = undefined; publish(ctx, { phase: 'starting' })
    if (ctx.hints.length) expire(ctx, Math.min(...ctx.hints.map(h => h.expiresAt)))
    try {
      const descriptor = op.status.consent
      const r = await api.start({ requestId: op.q.requestId, operationId: op.status.operationId, captureToken: op.status.captureToken, consentVersion: 1, consentGranted: true,
        ...(descriptor ? { consent: { sessionId: descriptor.sessionId, mode: remember === 'REUSE' ? 'REUSE' : remember ? 'SESSION' : 'ONCE' } } : {}) })
      if (valid(ctx, op) && r.ok && descriptor && remember && permission.current?.id === descriptor.sessionId) {
        permission.current.remembered = true; setCanRevokeConsent(true)
      }
      if (valid(ctx, op)) { if (r.ok) accept(ctx, op, r.value); else recover(ctx, op) }
    } catch { recover(ctx, op) }
    if (valid(ctx, op) && op.pending) op.timer = setTimeout(() => { void poll(ctx, op) }, 500)
  }, [api, invalidate])
  const revokeConsent = useCallback(async () => {
    const p = permission.current
    if (!p || !api || revoking.current) return
    p.blocked = true; revoking.current = true; setConsentError('')
    if (current.current?.op?.pending) invalidate('EDIT')
    try {
      const result = await api.revokeConsent({ sessionId: p.id })
      if (!mounted.current || permission.current !== p) return
      if (result.ok) { permission.current = undefined; setCanRevokeConsent(false) }
      else { setCanRevokeConsent(true); setConsentError('Chưa xác nhận được việc thu hồi quyền AI. Nhấn thu hồi để thử lại.') }
    } catch {
      if (mounted.current && permission.current === p) { setCanRevokeConsent(true); setConsentError('Chưa xác nhận được việc thu hồi quyền AI. Nhấn thu hồi để thử lại.') }
    } finally { revoking.current = false }
  }, [api, invalidate])
  const check = useCallback(() => { const ctx = current.current; if (ctx?.op) void poll(ctx, ctx.op) }, [api])
  const cancel = useCallback(() => {
    const ctx = current.current, op = ctx?.op
    if (ctx && op && op.q.action.kind === 'HINT' && op.started && op.status && api) {
      if (op.cancelling || !valid(ctx, op)) return
      op.cancelling = true; clearTimeout(op.timer)
      publish(ctx, { phase: 'recovering', message: 'Đang xác nhận hủy Hint…' })
      const reference = { requestId: op.q.requestId, operationId: op.status.operationId }
      void api.cancel(reference).then(result => {
        if (valid(ctx, op)) { if (result.ok) accept(ctx, op, result.value); else recover(ctx, op) }
      }).catch(() => recover(ctx, op)).finally(() => { op.cancelling = false })
      return
    }
    if (ctx && op) { cancelFix(ctx, op, op.q.action.kind === 'SUGGEST_FIX' ? 'Đã hủy Suggest Fix.' : 'Đã hủy yêu cầu AI.'); return }
    setState({ view: { ...idle, phase: 'cancelled', message: 'Đã hủy yêu cầu AI.' } })
  }, [invalidate])
  const close = useCallback(() => { invalidate('EDIT'); setOpen(false) }, [invalidate])
  const retry = useCallback(() => {
    const ctx = current.current, op = ctx?.op
    if (ctx && op && op.q.action.kind !== 'SUGGEST_FIX' && valid(ctx, op) && !op.pending) void begin(op.q.action, op.snapshot)
  }, [begin])
  const retireSolution = useCallback((blockId: string) => {
    const origin = current.current?.origin
    if (origin?.kind === 'SOLUTION' && origin.blockId === blockId) invalidate('LANGUAGE')
  }, [invalidate])
  const previewFix = (): SmartFix | undefined => {
    const ctx = current.current, op = ctx?.op, result = op?.status
    if (!ctx || !op || !valid(ctx, op) || result?.state !== 'COMPLETE' || result.output.kind !== 'EDIT_PROPOSAL'
      || !isCanonicalSelectionFix(op.q.source, result.binding, result.output)
      || result.binding.origin.kind !== 'PRACTICE' || result.binding.fingerprint !== op.fingerprint
      || result.expiresAt <= Date.now() || ctx.expiresAt !== undefined && ctx.expiresAt <= Date.now()) return undefined
    const candidate = smartCandidate(op.q.source, result.output.edits, result.binding.origin.eol)
    if (candidate === undefined) return undefined
    let consumed = false
    // Clone and freeze so preview and Apply share the exact validated proposal.
    const copy = structuredClone(result)
    if (copy.output.kind === 'EDIT_PROPOSAL') { copy.output.edits.forEach(Object.freeze); Object.freeze(copy.output.edits) }
    Object.freeze(copy.output); Object.freeze(copy.binding.origin)
    if (copy.binding.action.kind === 'SUGGEST_FIX') Object.freeze(copy.binding.action.selection)
    Object.freeze(copy.binding.action); Object.freeze(copy.binding); Object.freeze(copy)
    const isCurrent = () => !consumed && valid(ctx, op) && op.status === result && result.expiresAt > Date.now()
      && (ctx.expiresAt === undefined || ctx.expiresAt > Date.now())
      && result.binding.fingerprint === op.fingerprint && op.snapshot.isCurrent()
    return Object.freeze({ result: copy, source: op.q.source, candidate, isCurrent,
      consume: () => { if (!isCurrent()) return false; consumed = true; invalidate('EDIT'); return true } })
  }
  const view = state.ctx && (!valid(state.ctx) || state.ctx.expiresAt !== undefined && state.ctx.expiresAt <= Date.now()
    || state.ctx.op && !state.ctx.op.snapshot.isCurrent()) ? idle : state.view
  const ctx = current.current, op = ctx?.op
  return { open, show, close, begin, consent, cancel, check, retry, invalidate, retireSolution, setRun, capabilities, previewFix, selectionChanged,
    revokeConsent, canRevokeConsent, consentError,
    isBusy: () => admission.current || !!current.current?.op?.pending,
    language: input.language, frozenSelection: ctx && op?.q.action.kind === 'SUGGEST_FIX' && valid(ctx, op) ? op.q.action.selection : undefined,
    checking, view, capturedSource: ctx && op && valid(ctx, op) ? op.q.source : undefined,
    canRetry: !!ctx && !!op && op.q.action.kind !== 'SUGGEST_FIX' && valid(ctx, op) && !op.pending && view.phase === 'error',
    busy: checking || ['preparing', 'consent', 'starting', 'running', 'recovering'].includes(view.phase) }
}

import { useEffect, useRef, useState } from 'react'
import { CHAT_POLICY, type ChatContextInput, type ChatPrepared, type ChatScope, type ChatSession, type ChatStatus, type LearningChatApi } from '../../../../shared/contracts/learning-chat'
import type { SmartSourceSnapshot } from './practice/smart-hints-selection'

const identity = (c: ChatContextInput) => c.kind === 'LEARNING' ? `${c.courseId}/${c.chapter}` : `${c.exerciseId}/${c.language}`
const terminal = (s: ChatStatus) => ['COMPLETE', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(s.state)
// A remounted panel shares the same single-session bridge. Finish the previous
// panel's close before admitting a new open, including rapid close/reopen.
const lifetimes = new WeakMap<LearningChatApi, Promise<void>>()
function enqueueLifecycle(api: LearningChatApi, work: () => Promise<void>) {
  const next = (lifetimes.get(api) ?? Promise.resolve()).then(work)
  lifetimes.set(api, next.catch(() => {}))
  return next
}

/** Owns presentation only. History is always refreshed from Main. */
export function useLearningAssistant(context: ChatContextInput | undefined, capture?: () => SmartSourceSnapshot | undefined,
  api: LearningChatApi = window.studentIde.learning.chat) {
  const [session, setSession] = useState<ChatSession>()
  const [status, setStatus] = useState<ChatStatus>()
  const [phase, setPhase] = useState('Loading')
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState<ChatScope>('QUESTION_ONLY')
  const [preview, setPreview] = useState('')
  const [requestId, setRequestId] = useState<string>()
  const owner = useRef<{ session?: ChatSession; context?: ChatContextInput; epoch: number; busy: boolean; operation?: ChatStatus; snapshot?: SmartSourceSnapshot; cancelRequested?: boolean }>({ epoch: 0, busy: false })
  const current = owner.current
  const key = JSON.stringify(context)
  const valid = (epoch: number) => current.epoch === epoch
  const fail = () => { setError('Không thể thực hiện yêu cầu. Hãy đóng và mở lại Learning Assistant để thử lại.'); setPhase('Failed') }
  const selectionCurrent = () => {
    const frozen = current.snapshot, now = capture?.()
    return !frozen || frozen.isCurrent() && !!now && now.isCurrent() && frozen.source === now.source
      && JSON.stringify(frozen.origin) === JSON.stringify(now.origin) && JSON.stringify(frozen.selection) === JSON.stringify(now.selection)
  }
  async function closeCurrent(reason: 'PANEL_CLOSED' | 'CONTEXT_CHANGED') {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = current.session
      if (!s) return
      const fetched = await api.getSession({ sessionId: s.sessionId })
      const latest = fetched.ok ? fetched.value : s
      const result = await api.closeSession({ sessionId: latest.sessionId, revision: latest.revision, reason })
      if (result.ok) { current.session = undefined; return }
    }
    throw Error('CHAT_CLOSE_FAILED')
  }

  useEffect(() => {
    const epoch = ++current.epoch
    const previousOperation = current.operation
    if (context && current.context && identity(context) !== identity(current.context)) { setScope('QUESTION_ONLY'); setQuestion('') }
    current.busy = true; current.operation = undefined; current.snapshot = undefined; current.cancelRequested = false
    setSession(undefined); setStatus(undefined); setRequestId(undefined); setError(''); setPreview(''); setPhase('Loading')
    if (!api) { fail(); return }
    void enqueueLifecycle(api, async () => {
      if (!valid(epoch)) return
      if (previousOperation && !terminal(previousOperation)) await api.cancel({ sessionId: previousOperation.sessionId,
        requestId: previousOperation.requestId, operationId: previousOperation.operationId })
      let old = current.session
      if (!context) {
        // Await a fresh Monaco snapshot. updateContext preserves reference history
        // while invalidating replay; closing here would discard it on every edit.
        if (valid(epoch)) setPhase('Loading')
        return
      }
      const before = current.context
      if (old) {
        const fetched = await api.getSession({ sessionId: old.sessionId })
        // Main may already have retired the old Learning context through
        // Submit/navigation. Opening the new context also retires any remnant.
        current.session = fetched.ok ? fetched.value : undefined
        old = current.session
      }
      const replacedModel = before?.kind === 'PRACTICE' && context.kind === 'PRACTICE'
        && JSON.stringify(before) !== JSON.stringify(context) && context.sourceRevision <= before.sourceRevision
      if (old && before && (identity(before) !== identity(context) || replacedModel)) {
        await closeCurrent('CONTEXT_CHANGED')
      }
      const result = current.session
        ? await api.updateContext({ sessionId: current.session.sessionId, revision: current.session.revision, context })
        : await api.openSession({ context })
      if (!result.ok) { if (valid(epoch)) fail(); return }
      current.session = result.value; current.context = context
      if (!valid(epoch)) return
      const fetched = await api.getSession({ sessionId: result.value.sessionId })
      if (!valid(epoch)) return
      if (!fetched.ok) { fail(); return }
      current.session = fetched.value; current.busy = false
      setSession(fetched.value); setPhase('Ready')
    }).catch(() => { if (valid(epoch)) fail() })
    return () => { current.epoch++; current.busy = true }
  // Context is compared by value, including source and Monaco identity/version.
  }, [key, api])

  useEffect(() => () => {
    current.epoch++; current.busy = true
    if (!api) return
    void enqueueLifecycle(api, async () => {
      const operation = current.operation
      // Freeze the terminal outcome before reading the revision for close.
      // Otherwise inference could commit between getSession and closeSession.
      if (operation && !terminal(operation)) await api.cancel({ sessionId: operation.sessionId,
        requestId: operation.requestId, operationId: operation.operationId })
      await closeCurrent('PANEL_CLOSED')
    }).catch(() => { /* Document destruction is also retired by Main. */ })
  }, [api, current])

  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => {
      current.epoch++; current.busy = true; setPhase('Expired'); setStatus(undefined)
    }, Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [session?.sessionId, session?.expiresAt, current])

  async function accept(value: ChatStatus, epoch: number) {
    if (!valid(epoch)) return
    const previous = current.operation
    if (previous && (value.operationId !== previous.operationId || value.sequence < previous.sequence || terminal(previous)
      || previous.state === 'RUNNING' && value.state === 'PREPARED')) return
    current.operation = value; setStatus(value); setPhase(value.state === 'RUNNING' ? 'Loading' : value.state === 'COMPLETE' ? 'Complete' : value.state === 'FAILED' ? 'Failed' : value.state === 'CANCELLED' ? 'Cancelled' : value.state === 'EXPIRED' ? 'Expired' : 'Consent')
    if (value.state === 'COMPLETE') {
      const fetched = await api.getSession({ sessionId: value.sessionId })
      if (!valid(epoch)) return
      if (!fetched.ok) { fail(); return }
      current.session = fetched.value; setSession(fetched.value); setQuestion('')
    }
    if (terminal(value)) current.busy = false
  }
  useEffect(() => {
    if (!status || !['RUNNING', 'PREPARED'].includes(status.state)) return
    const epoch = current.epoch
    let disposed = false, timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        if (!selectionCurrent()) { await cancel(); return }
        const result = await api.status({ sessionId: status.sessionId, requestId: status.requestId, operationId: status.operationId })
        if (disposed || !valid(epoch)) return
        if (!result.ok) { current.busy = false; fail(); return }
        await accept(result.value, epoch)
        if (!disposed && valid(epoch) && !terminal(result.value)) timer = setTimeout(() => { void poll() }, 350)
      } catch { if (!disposed && valid(epoch)) { current.busy = false; fail() } }
    }
    timer = setTimeout(() => { void poll() }, 350)
    return () => { disposed = true; clearTimeout(timer) }
  // The operation identity/state changes restart this single-flight polling loop.
  }, [status?.operationId, status?.state, api])

  async function send() {
    if (current.busy || !current.session || !context) return
    if (!question.trim() || new TextEncoder().encode(question).length > CHAT_POLICY.questionBytes) { setError('Nhập câu hỏi từ 1 đến 4096 bytes.'); return }
    const snapshot = context.kind === 'PRACTICE' ? capture?.() : undefined
    if (context.kind === 'PRACTICE' && (!snapshot || !snapshot.isCurrent() || snapshot.source !== context.source
      || snapshot.exerciseId !== context.exerciseId || snapshot.language !== context.language || snapshot.origin.kind !== 'PRACTICE'
      || snapshot.origin.modelId !== context.modelId || snapshot.origin.modelVersion !== context.modelVersion)) { setError('Code Editor đã thay đổi hoặc chưa sẵn sàng. Hãy thử lại.'); return }
    if (scope !== 'QUESTION_ONLY' && (!snapshot || scope === 'QUESTION_WITH_SELECTION' && !snapshot.selection)) { setError('Hãy chọn code trong Code Editor.'); return }
    const epoch = current.epoch, s = current.session
    const id = crypto.randomUUID(); setRequestId(id)
    current.busy = true; current.operation = undefined; current.cancelRequested = false; current.snapshot = scope === 'QUESTION_WITH_SELECTION' ? snapshot : undefined
    setError(''); setStatus(undefined); setPhase('Loading')
    setPreview(scope === 'QUESTION_ONLY' ? '' : scope === 'QUESTION_WITH_SOURCE' ? snapshot!.source : snapshot!.selection!.text)
    try {
      const base = { sessionId: s.sessionId, revision: s.revision, requestId: id, question }
      const result = await api.prepare(scope === 'QUESTION_ONLY' ? { ...base, scope, attachment: null }
        : scope === 'QUESTION_WITH_SOURCE' ? { ...base, scope, attachment: { source: snapshot!.source } }
          : { ...base, scope, attachment: { source: snapshot!.source, selection: snapshot!.selection! } })
      if (!valid(epoch)) return
      if (!result.ok) { current.busy = false; fail(); return }
      if (current.cancelRequested) {
        current.operation = result.value
        await cancel(); return
      }
      await accept(result.value, epoch)
    } catch { if (valid(epoch)) { current.busy = false; fail() } }
  }
  async function confirm() {
    const prepared = current.operation
    if (prepared?.state !== 'PREPARED' || phase !== 'Consent') return
    if (!selectionCurrent()) { await cancel(); setError('Vùng chọn đã thay đổi. Hãy chuẩn bị lại câu hỏi.'); return }
    if (Date.now() >= (prepared as ChatPrepared).expiresAt) { await cancel(); setPhase('Expired'); return }
    const epoch = current.epoch
    setPhase('Loading')
    // Lock synchronously against repeated clicks before React renders.
    current.operation = { ...prepared, state: 'RUNNING' }
    try {
      const result = await api.start({ sessionId: prepared.sessionId, requestId: prepared.requestId, operationId: prepared.operationId,
        consentToken: prepared.consentToken, consentVersion: 1, consentGranted: true, digest: prepared.manifest.digest })
      if (!valid(epoch)) return
      if (!result.ok) { current.busy = false; fail(); return }
      await accept(result.value, epoch)
    } catch { if (valid(epoch)) { current.busy = false; fail() } }
  }
  async function cancel() {
    const operation = current.operation, epoch = current.epoch
    if (!operation) { if (current.busy) current.cancelRequested = true; return }
    if (terminal(operation)) return
    try {
      const result = await api.cancel({ sessionId: operation.sessionId, requestId: operation.requestId, operationId: operation.operationId })
      if (!valid(epoch)) return
      if (!result.ok) { current.busy = false; fail(); return }
      await accept(result.value, epoch)
    } catch { if (valid(epoch)) { current.busy = false; fail() } }
  }
  return { session, status, requestId, phase, error, question, setQuestion, scope, setScope, preview, send, confirm, cancel,
    isBusy: () => current.busy,
    busy: phase === 'Loading' || phase === 'Consent', canSend: !!session && !current.busy }
}

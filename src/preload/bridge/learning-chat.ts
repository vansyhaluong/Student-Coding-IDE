import { CHAT_CHANNELS as C, CHAT_POLICY as P, type LearningChatApi, type ChatSession, type ChatStatus,
  type ChatPrepare, type ChatReference, type ChatSend, type ChatContextInput, type ChatContext } from '../../shared/contracts/learning-chat'
import { validateChatOpen, validateChatClose, validateChatSessionReference, validateChatUpdate, validateChatPrepare, validateChatSend,
  validateChatReference, isChatSession, isChatStatus } from '../../shared/contracts/learning-chat-validation'
import type { AppResult } from '../../shared/contracts/app-error'
import type { ValidationResult } from '../../shared/contracts/validation'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { LIFECYCLE_CHANNELS } from '../../shared/contracts/lifecycle'
import { isLifecycleStatus } from './lifecycle'

/** Correlation only, no business/session history or authority in Preload. */
export function createLearningChatBridge(ipc: IpcRendererLike,
  lifetime: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = typeof window === 'undefined' ? undefined : window): LearningChatApi {
  let epoch = 0, disposed = false
  let session: Pick<ChatSession, 'sessionId' | 'generation' | 'revision' | 'context' | 'providerGeneration'> | undefined
  let turn: { requestId: string; operationId?: string; sequence: number; binding?: string; signature?: string; state?: ChatStatus['state']; key: string } | undefined
  const invalid = <T>(operation: string): AppResult<T> => ({ ok: false, error: { code: 'INVALID_INPUT', operation,
    message: 'Invalid or stale Learning Chat request.', retryable: false } })
  const dispose = () => {
    disposed = true; epoch++; session = undefined; turn = undefined
    lifetime?.removeEventListener('unload', dispose)
    ipc.removeListener(LIFECYCLE_CHANNELS.statusChanged, stopping)
  }
  const stopping = (_event: unknown, value: unknown) => {
    // Main seals admission and retires sessions at STOPPING. Revoke transport
    // correlations before React's shutdown unmount can enqueue a late close.
    if (isLifecycleStatus(value) && (value.state === 'STOPPING' || value.state === 'STOPPED')) dispose()
  }
  ipc.on(LIFECYCLE_CHANNELS.statusChanged, stopping)
  lifetime?.addEventListener('unload', dispose)
  const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('')
  async function context(input: ChatContextInput): Promise<ChatContext> {
    if (input.kind === 'LEARNING') return input
    const { source, ...rest } = input; return { ...rest, sourceFingerprint: await hash(source) }
  }
  async function call<Q, T>(channel: string, checked: ValidationResult<Q>, valid: (v: unknown) => v is T,
    accept: (value: T) => boolean, expectedEpoch = epoch): Promise<AppResult<T>> {
    if (disposed || !checked.ok || new TextEncoder().encode(JSON.stringify(checked.value)).length > P.requestBytes) return invalid(channel)
    const result = parseAppResult(await invokeSafely(ipc, channel, checked.value), valid, channel)
    if (disposed || epoch !== expectedEpoch) return invalid(channel)
    if (!result.ok) return result
    if (new TextEncoder().encode(JSON.stringify(result.value)).length > P.requestBytes || !accept(result.value)) return invalid(channel)
    return result
  }
  const remember = (s: ChatSession) => { session = { sessionId: s.sessionId, generation: s.generation, revision: s.revision,
    context: s.context, providerGeneration: s.providerGeneration } }
  const same = (s: ChatSession) => !!session && s.sessionId === session.sessionId && s.generation === session.generation
    && s.providerGeneration === session.providerGeneration && s.revision >= session.revision && JSON.stringify(s.context) === JSON.stringify(session.context)
  async function operation(channel: string, checked: ValidationResult<ChatReference | ChatSend | ChatPrepare>): Promise<AppResult<ChatStatus>> {
    if (disposed || !checked.ok || !session || checked.value.sessionId !== session.sessionId) return invalid(channel)
    const q = checked.value, before = epoch
    if (channel === C.prepare) {
      const request = q as ChatPrepare, key = await hash(JSON.stringify(request))
      if (disposed || epoch !== before || request.revision !== session?.revision || turn?.requestId === request.requestId && turn.key !== key) return invalid(channel)
      if (turn?.requestId !== q.requestId) { epoch++; turn = { requestId: q.requestId, sequence: -1, key } }
    } else if (!turn || turn.requestId !== q.requestId || turn.operationId !== (q as { operationId: string }).operationId) return invalid(channel)
    const current = turn!, localEpoch = epoch, bound = session
    return call(channel, checked, isChatStatus, s => {
      if (!session || session !== bound || turn !== current || s.sessionId !== session.sessionId || s.requestId !== current.requestId
        || s.binding.sessionId !== session.sessionId || s.binding.generation !== session.generation
        || s.binding.providerGeneration !== session.providerGeneration || s.binding.revision !== session.revision
        || JSON.stringify(s.binding.context) !== JSON.stringify(session.context) || s.sequence < current.sequence
        || current.operationId && s.operationId !== current.operationId
        || current.binding && JSON.stringify(s.binding) !== current.binding
        || current.sequence === s.sequence && current.signature !== JSON.stringify(s)
        || current.state && ['COMPLETE', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(current.state) && current.signature !== JSON.stringify(s)) return false
      if (channel === C.prepare && (s.state !== 'PREPARED' || s.sequence !== 0 || s.binding.scope !== (q as ChatPrepare).scope)) return false
      current.operationId = s.operationId; current.binding = JSON.stringify(s.binding); current.sequence = s.sequence
      current.signature = JSON.stringify(s); current.state = s.state
      return true
    }, localEpoch)
  }
  return {
    openSession: async request => {
      const q = validateChatOpen(request); if (!q.ok || disposed) return invalid(C.openSession)
      const before = ++epoch; turn = undefined; session = undefined
      const target = await context(q.value.context)
      if (epoch !== before || disposed) return invalid(C.openSession)
      return call(C.openSession, q, isChatSession, s => {
        if (JSON.stringify(s.context) !== JSON.stringify(target)) return false
        remember(s); return true
      }, before)
    },
    getSession: request => {
      const q = validateChatSessionReference(request)
      if (!q.ok || q.value.sessionId !== session?.sessionId) return Promise.resolve(invalid(C.getSession))
      return call(C.getSession, q, isChatSession, s => {
        if (!same(s)) return false
        if (s.revision !== session!.revision) turn = undefined
        remember(s); return true
      })
    },
    updateContext: async request => {
      const q = validateChatUpdate(request)
      if (!q.ok || q.value.sessionId !== session?.sessionId || q.value.revision !== session.revision || disposed) return invalid(C.updateContext)
      const before = ++epoch, old = session; turn = undefined
      const target = await context(q.value.context)
      if (epoch !== before || disposed) return invalid(C.updateContext)
      return call(C.updateContext, q, isChatSession, s => {
        if (s.sessionId !== old.sessionId || s.generation !== old.generation || s.providerGeneration !== old.providerGeneration
          || s.revision < old.revision || JSON.stringify(s.context) !== JSON.stringify(target)) return false
        remember(s); return true
      }, before)
    },
    closeSession: request => {
      const q = validateChatClose(request)
      if (!q.ok || q.value.sessionId !== session?.sessionId || q.value.revision !== session.revision) return Promise.resolve(invalid(C.closeSession))
      epoch++; session = undefined; turn = undefined
      return call(C.closeSession, q, (v): v is null => v === null, () => true)
    },
    prepare: async request => {
      const result = await operation(C.prepare, validateChatPrepare(request))
      return result.ok ? result.value.state === 'PREPARED' ? { ok: true, value: result.value } : invalid(C.prepare) : result
    },
    start: request => operation(C.start, validateChatSend(request)),
    status: request => operation(C.status, validateChatReference(request)),
    cancel: request => operation(C.cancel, validateChatReference(request)),
  }
}

import { SMART_HINT_CHANNELS as C, type SmartHintsApi, type SmartStatus, type SmartPrepare, type SmartReference } from '../../shared/contracts/smart-hints'
import { validateSmartPrepare, validateSmartStart, validateSmartReference, validateSmartRetire,
  isSmartStatus, isSmartCapabilities } from '../../shared/contracts/smart-hints-validation'
import type { AppResult } from '../../shared/contracts/app-error'
import type { ValidationResult } from '../../shared/contracts/validation'
import type { IpcRendererLike } from './lifecycle'
import type { LearningOrder } from './learning-order'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

export function createSmartHintsBridge(ipc: IpcRendererLike, order: LearningOrder,
  lifetime: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = typeof window === 'undefined' ? undefined : window): SmartHintsApi {
  let disposed = false, epoch = 0
  let current: { requestId: string; context: string; operationId?: string; sequence: number; binding?: string; signature?: string; requestKey?: string;
    request?: Pick<SmartPrepare, 'exerciseId' | 'language' | 'sourceRevision' | 'origin'> & { actionKind: SmartPrepare['action']['kind']; level?: number } } | undefined
  const invalid = <T>(operation: string): AppResult<T> => ({ ok: false, error: {
    code: 'INVALID_INPUT', operation, message: 'Invalid or stale Smart Hints request.', retryable: false } })
  const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('')
  const dispose = () => { disposed = true; epoch++; current = undefined; lifetime?.removeEventListener('unload', dispose) }
  lifetime?.addEventListener('unload', dispose)
  async function call<Q extends { requestId: string }>(channel: string, checked: ValidationResult<Q>): Promise<AppResult<SmartStatus>> {
    if (disposed || !checked.ok) return invalid(channel)
    const id = checked.value.requestId, learningEpoch = order.epoch
    if (channel === C.prepare) {
      const q = checked.value as unknown as SmartPrepare
      if (current?.requestId === id) {
        const owner = current, before = epoch
        if (!owner.requestKey || owner.requestKey !== await hash(JSON.stringify(q)).catch(() => undefined) || disposed || current !== owner
          || epoch !== before || order.epoch !== learningEpoch) return invalid(channel)
      }
      if (!current || current.requestId !== id) {
        epoch++; current = { requestId: id, context: q.clientContextId, sequence: -1,
          request: { exerciseId: q.exerciseId, language: q.language, sourceRevision: q.sourceRevision, origin: q.origin,
            actionKind: q.action.kind, level: q.action.kind === 'HINT' ? q.action.level : undefined } }
      }
    } else if (!current || current.requestId !== id || current.operationId !== (checked.value as unknown as SmartReference).operationId) return invalid(channel)
    const localEpoch = epoch
    try {
      // Start IPC synchronously so retire/cancel ordering stays unchanged while hashes resolve.
      const reply = invokeSafely(ipc, channel, checked.value).then(value => value, () => undefined)
      let expectedAction: string | undefined, sourceHash: string | undefined, sourceBytes: number | undefined
      if (channel === C.prepare) {
        const q = checked.value as unknown as SmartPrepare
        sourceHash = await hash(q.source); sourceBytes = new TextEncoder().encode(q.source).length
        if (q.action.kind === 'EXPLAIN' || q.action.kind === 'SUGGEST_FIX') {
          const { text, ...range } = q.action.selection
          expectedAction = JSON.stringify({ kind: q.action.kind, selection: { ...range, fingerprint: await hash(text) } })
        } else expectedAction = JSON.stringify(q.action)
        const requestKey = await hash(JSON.stringify(q))
        if (disposed || epoch !== localEpoch || order.epoch !== learningEpoch || !current) return invalid(channel)
        current.requestKey = requestKey // Keep only a digest, never a retained source/selection copy.
      }
      const result = parseAppResult(await reply, isSmartStatus, channel)
      if (disposed || epoch !== localEpoch || order.epoch !== learningEpoch || !current || current.requestId !== id) return invalid(channel)
      if (!result.ok) return invalid(channel)
      const s = result.value, q = current.request
      if (s.requestId !== id || s.binding.clientContextId !== current.context || s.sequence < current.sequence
        || expectedAction !== undefined && (JSON.stringify(s.binding.action) !== expectedAction
          || s.binding.fingerprint !== sourceHash || s.binding.sourceBytes !== sourceBytes)
        || s.sequence === current.sequence && current.signature !== JSON.stringify(s)
        || current.operationId && current.operationId !== s.operationId || current.binding && current.binding !== JSON.stringify(s.binding)
        || q && (s.binding.exerciseId !== q.exerciseId || s.binding.language !== q.language || s.binding.sourceRevision !== q.sourceRevision
          || JSON.stringify(s.binding.origin) !== JSON.stringify(q.origin) || s.binding.action.kind !== q.actionKind
          || s.binding.action.kind === 'HINT' && s.binding.action.level !== q.level)) return invalid(channel)
      current.operationId = s.operationId; current.sequence = s.sequence; current.binding = JSON.stringify(s.binding); current.signature = JSON.stringify(s)
      return { ok: true, value: structuredClone(s) }
    } catch { return invalid(channel) }
  }
  return {
    capabilities: async () => {
      if (disposed) return invalid(C.capabilities)
      const before = epoch, learningEpoch = order.epoch
      const result = parseAppResult(await invokeSafely(ipc, C.capabilities, {}), isSmartCapabilities, C.capabilities)
      return disposed || epoch !== before || order.epoch !== learningEpoch ? invalid(C.capabilities) : result
    },
    prepare: q => call(C.prepare, validateSmartPrepare(q)), start: q => call(C.start, validateSmartStart(q)),
    status: q => call(C.status, validateSmartReference(q)), cancel: q => call(C.cancel, validateSmartReference(q)),
    async retireContext(request) {
      const checked = validateSmartRetire(request)
      if (disposed || !checked.ok) return invalid(C.retireContext)
      if (current?.context === request.clientContextId) { epoch++; current = undefined }
      const before = order.epoch
      const result = parseAppResult(await invokeSafely(ipc, C.retireContext, checked.value), (v): v is null => v === null, C.retireContext)
      return disposed || before !== order.epoch || !result.ok ? invalid(C.retireContext) : result
    },
  }
}

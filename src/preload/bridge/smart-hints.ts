import { SMART_HINT_CHANNELS as C, type SmartHintsApi, type SmartStatus, type SmartPrepare, type SmartReference } from '../../shared/contracts/smart-hints'
import { validateSmartPrepare, validateSmartStart, validateSmartReference, validateSmartRetire, validateSmartConsentReference,
  isSmartStatus, isSmartCapabilities } from '../../shared/contracts/smart-hints-validation'
import type { AppResult } from '../../shared/contracts/app-error'
import type { ValidationResult } from '../../shared/contracts/validation'
import type { IpcRendererLike } from './lifecycle'
import type { LearningOrder } from './learning-order'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'
import { validatePrepareHintApply, isHintApplyProposal, smartCandidate, validateConsumeHintApply, validateDiscardHintApply, isHintApplyFailure } from '../../shared/contracts/smart-hints-validation'

export function createSmartHintsBridge(ipc: IpcRendererLike, order: LearningOrder,
  lifetime: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = typeof window === 'undefined' ? undefined : window): SmartHintsApi {
  let disposed = false, epoch = 0
  let current: { requestId: string; context: string; operationId?: string; sequence: number; binding?: string; signature?: string; requestKey?: string;
    hintPreparationId?: string; hintRequestHash?: string; hintProposalSignature?: string; hintProposalId?: string; hintRetired?: boolean
    request?: Pick<SmartPrepare, 'exerciseId' | 'language' | 'sourceRevision' | 'origin'> & { actionKind: SmartPrepare['action']['kind'] } } | undefined
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
            actionKind: q.action.kind } }
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
          || JSON.stringify(s.binding.origin) !== JSON.stringify(q.origin) || s.binding.action.kind !== q.actionKind)) return invalid(channel)
      current.operationId = s.operationId; current.sequence = s.sequence; current.binding = JSON.stringify(s.binding); current.signature = JSON.stringify(s)
      return { ok: true, value: structuredClone(s) }
    } catch { return invalid(channel) }
  }
  return {
    async revokeConsent(request) {
      const checked = validateSmartConsentReference(request), learningEpoch = order.epoch
      if (disposed || !checked.ok) return invalid(C.revokeConsent)
      const result = parseAppResult(await invokeSafely(ipc, C.revokeConsent, checked.value), (v): v is null => v === null, C.revokeConsent)
      return disposed || order.epoch !== learningEpoch ? invalid(C.revokeConsent) : result
    },
    async prepareHintApply(request) {
      const checked = validatePrepareHintApply(request), before = epoch, learningEpoch = order.epoch, owner = current
      if (!checked.ok || disposed || !owner || owner.requestId !== checked.value.hint.requestId
        || owner.operationId !== checked.value.hint.operationId || owner.request?.actionKind !== 'HINT') return invalid(C.prepareHintApply)
      const q = checked.value
      if (owner.hintRetired || owner.hintPreparationId && owner.hintPreparationId !== q.requestId) return invalid(C.prepareHintApply)
      owner.hintPreparationId = q.requestId
      try {
        const result = parseAppResult(await invokeSafely(ipc, C.prepareHintApply, q), isHintApplyProposal, C.prepareHintApply)
        const fingerprint = await hash(q.source)
        if (disposed || epoch !== before || order.epoch !== learningEpoch || current !== owner || owner.hintRetired
          || owner.hintPreparationId !== q.requestId) return invalid(C.prepareHintApply)
        if (!result.ok) {
          if (!isHintApplyFailure(result.error, q) || owner.hintProposalId) return invalid(C.prepareHintApply)
          if (result.error.retryable) owner.hintPreparationId = undefined
          else owner.hintRetired = true
          return structuredClone(result)
        }
        const p = result.value
        if (p.requestId !== q.requestId || JSON.stringify(p.hint) !== JSON.stringify(q.hint) || JSON.stringify(p.binding) !== owner.binding
          || p.binding.fingerprint !== fingerprint || p.binding.exerciseId !== q.exerciseId || p.binding.language !== q.language
          || p.binding.packageVersion !== q.packageVersion || p.binding.sourceRevision !== q.sourceRevision
          || JSON.stringify(p.binding.origin) !== JSON.stringify(q.origin)
          || smartCandidate(q.source, p.output.edits, q.origin.eol) === undefined
          || p.target.kind === 'SELECTION' && (!q.selection || p.target.startOffset !== q.selection.startOffset || p.target.endOffset !== q.selection.endOffset)
          || p.target.kind === 'PARSER_RESOLVED' && q.selection !== null && q.selection.startOffset !== q.selection.endOffset) return invalid(C.prepareHintApply)
        const requestHash = await hash(JSON.stringify(q))
        if (disposed || epoch !== before || order.epoch !== learningEpoch || current !== owner || owner.hintRetired) return invalid(C.prepareHintApply)
        owner.hintRequestHash = requestHash; owner.hintProposalSignature = JSON.stringify(p); owner.hintProposalId = p.proposalId
        return { ok: true, value: structuredClone(p) }
      } catch { return invalid(C.prepareHintApply) }
    },
    async consumeHintApply(request) {
      const checked = validateConsumeHintApply(request), owner = current, before = epoch, learningEpoch = order.epoch
      if (!checked.ok || disposed || !owner || owner.hintRetired || owner.hintProposalId !== checked.value.proposalId) return invalid(C.consumeHintApply)
      try {
        const q = checked.value, digest = await hash(JSON.stringify(q.preparation))
        if (disposed || epoch !== before || order.epoch !== learningEpoch || current !== owner || owner.hintRetired || digest !== owner.hintRequestHash) return invalid(C.consumeHintApply)
        owner.hintRetired = true // One attempt even if acknowledgement becomes uncertain.
        const result = parseAppResult(await invokeSafely(ipc, C.consumeHintApply, q), isHintApplyProposal, C.consumeHintApply)
        if (!result.ok || disposed || epoch !== before || order.epoch !== learningEpoch || current !== owner
          || JSON.stringify(result.value) !== owner.hintProposalSignature) return invalid(C.consumeHintApply)
        return result
      } catch { return invalid(C.consumeHintApply) }
    },
    async discardHintApply(request) {
      const checked = validateDiscardHintApply(request), owner = current, before = epoch, learningEpoch = order.epoch
      if (!checked.ok || disposed || !owner || owner.requestId !== checked.value.hint.requestId
        || owner.operationId !== checked.value.hint.operationId || owner.hintPreparationId !== checked.value.requestId) return invalid(C.discardHintApply)
      owner.hintRetired = true
      const result = parseAppResult(await invokeSafely(ipc, C.discardHintApply, checked.value), (v): v is null => v === null, C.discardHintApply)
      return disposed || epoch !== before || order.epoch !== learningEpoch || current !== owner ? invalid(C.discardHintApply) : result
    },
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

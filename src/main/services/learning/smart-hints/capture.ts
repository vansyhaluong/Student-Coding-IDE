import type { ExercisePackageRegistry } from '../content/exercise-package-registry'
import type { SmartPrepare, SmartBinding, SmartRunContext, SmartAction, SmartBoundAction } from '../../../../shared/contracts/smart-hints'
import { SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import { smartBytes, smartText, validateSmartPrepare } from '../../../../shared/contracts/smart-hints-validation'
import { publicRunPackage, sourceFingerprint, type PublicRunReceipt } from './public-run-receipt'
import type { HintImplementationState } from './hint-context'

export interface SmartCapture {
  action: SmartAction
  binding: SmartBinding; source: string; statement: string; constraints: string[]
  signature: { functionName: string; parameters: { name: string; type: string }[]; returnType: string }
  /** Trusted package identity, Main-private; never serialized to provider or status. */
  signatureIdentity: { version: number; hash: string }
  runContext: SmartRunContext
  /** Main-owned starter snapshot and derived Hint state; never accepted over IPC. */
  hintTemplate?: string
  hintImplementation?: HintImplementationState
}
export function immutableSmartCapture(value: SmartCapture): SmartCapture {
  const copy: SmartCapture = structuredClone(value)
  const freeze = (v: unknown): void => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.values(v).forEach(freeze); Object.freeze(v)
    }
  }
  freeze(copy)
  return copy
}
export function bindSmartAction(action: SmartAction): SmartBoundAction {
  if (action.kind === 'HINT') return { kind: 'HINT' }
  if (action.kind !== 'EXPLAIN' && action.kind !== 'SUGGEST_FIX') return structuredClone(action)
  const { text, ...range } = action.selection
  return { kind: action.kind, selection: { ...range, fingerprint: sourceFingerprint(text) } }
}
export async function captureSmartHints(registry: Pick<ExercisePackageRegistry, 'acquirePublic'>, request: SmartPrepare,
  generation: number, check: () => void, receipt?: PublicRunReceipt): Promise<SmartCapture> {
  const valid = validateSmartPrepare(request)
  if (!valid.ok) throw Error('INVALID_INPUT')
  request = valid.value // Detach source/range/origin before the first package await.
  check()
  let settled = false
  const tasks = new Set<Promise<unknown>>()
  const lease = await registry.acquirePublic(request.exerciseId, { owner: {}, generation, phase: 'public', check,
    isCurrent: () => { try { check(); return true } catch { return false } },
    retain: task => { tasks.add(task); void task.finally(() => tasks.delete(task)).catch(() => {}) }, canRelease: () => settled })
  try {
    check()
    const m = lease.data.metadata
    if (m.exerciseId !== request.exerciseId || !Number.isSafeInteger(m.packageVersion) || m.packageVersion < 1) throw Error('INVALID_INPUT')
    const signature = { functionName: m.signature.functionName,
      parameters: m.signature.parameters.map(p => ({ name: p.name, type: p.type })), returnType: m.signature.returnType }
    const constraints = [...m.constraints], fingerprint = sourceFingerprint(request.source)
    if (!smartText(m.statement, P.statementBytes) || smartBytes({ signature, constraints }) > P.taskBytes) throw Error('LIMIT_EXCEEDED')
    const binding: SmartBinding = { clientContextId: request.clientContextId, contextGeneration: generation,
      exerciseId: request.exerciseId, language: request.language, packageVersion: m.packageVersion,
      sourceRevision: request.sourceRevision, fingerprint, sourceBytes: Buffer.byteLength(request.source),
      origin: structuredClone(request.origin), action: bindSmartAction(request.action) }
    let runContext: SmartRunContext = { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' }
    const pkg = publicRunPackage(lease.data), ref = request.run
    if (request.origin.kind === 'PRACTICE' && receipt && ref && pkg && Date.now() >= receipt.capturedAt && Date.now() - receipt.capturedAt < P.resultMs
      && receipt.sessionId === ref.sessionId && receipt.generation === ref.generation && receipt.sequence === ref.sequence
      && receipt.exerciseId === request.exerciseId && receipt.language === request.language && receipt.sourceRevision === request.sourceRevision
      && receipt.fingerprint === fingerprint && receipt.packageFingerprint === sourceFingerprint(JSON.stringify(pkg))) runContext = structuredClone(receipt.context)
    if (!pkg && ref) runContext = { kind: 'CODE_ONLY', reason: 'DETAIL_LIMIT_EXCEEDED' }
    return immutableSmartCapture({ binding, action: request.action, source: request.source, statement: m.statement, constraints, signature,
      signatureIdentity: { version: m.signature.version, hash: m.signature.hash }, runContext,
      ...(request.action.kind === 'HINT' ? { hintTemplate: lease.data.starters[request.language] } : {}) })
  } finally { await Promise.allSettled([...tasks]); settled = true; lease.release() }
}

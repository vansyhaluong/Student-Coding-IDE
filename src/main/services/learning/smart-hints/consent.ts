import { randomUUID } from 'node:crypto'
import { DomainError } from '../../../errors/app-error'
import { SMART_HINT_POLICY, type SmartConsentContext, type SmartConsentDecision, type SmartConsentScope } from '../../../../shared/contracts/smart-hints'
import type { SmartCapture } from './capture'
import type { SmartProvider } from './adapter'

interface Permission {
  id: string; document: string; exercise: string; language: string; origin: string
  provider?: SmartProvider; expiresAt: number; grant?: SmartConsentScope
  timer: ReturnType<typeof setTimeout>
}
const denied = () => new DomainError({ code: 'INVALID_INPUT', operation: 'smart-hints-consent', message: 'Invalid or expired AI permission.', retryable: false })
const covers = (grant: SmartConsentScope | undefined, scope: SmartConsentScope) => !!grant
  && (!scope.selection || grant.selection) && (!scope.runEvidence || grant.runEvidence)

/** No source, code ranges, Run content or credential material is retained. */
export class SmartConsentStore {
  private readonly permissions = new Map<number, Permission>()
  constructor(private readonly clock: () => number, private readonly retired: (owner: number, id: string) => void) {}
  describe(owner: number, document: string, capture: SmartCapture, provider?: SmartProvider): SmartConsentContext {
    let p = this.permissions.get(owner)
    const b = capture.binding
    if (p && (p.document !== document || p.exercise !== b.exerciseId || p.language !== b.language
      || p.origin !== b.origin.kind || p.provider !== provider || p.expiresAt <= this.clock())) {
      this.clear(owner); p = undefined
    }
    if (!p) {
      const id = randomUUID(), expiresAt = this.clock() + SMART_HINT_POLICY.sessionMs
      p = { id, document, exercise: b.exerciseId, language: b.language, origin: b.origin.kind, provider, expiresAt,
        timer: setTimeout(() => { if (this.permissions.get(owner)?.id === id) this.clear(owner) }, SMART_HINT_POLICY.sessionMs) }
      this.permissions.set(owner, p)
    }
    const scope: SmartConsentScope = { source: true,
      selection: capture.action.kind === 'EXPLAIN' || capture.action.kind === 'SUGGEST_FIX',
      runEvidence: capture.runContext.kind === 'RUN_PUBLIC' }
    return { sessionId: p.id, expiresAt: p.expiresAt, providerMode: provider?.mode ?? 'DISABLED', scope, reusable: covers(p.grant, scope) }
  }
  live(owner: number, document: string, id: string): boolean {
    const p = this.permissions.get(owner)
    if (p?.expiresAt !== undefined && p.expiresAt <= this.clock()) this.clear(owner)
    return !!p && this.permissions.get(owner) === p && p.document === document && p.id === id
  }
  approve(owner: number, document: string, context: SmartConsentContext, decision?: SmartConsentDecision): void {
    if (!this.live(owner, document, context.sessionId) || decision && decision.sessionId !== context.sessionId) throw denied()
    const p = this.permissions.get(owner)!
    if (decision?.mode === 'REUSE' && !covers(p.grant, context.scope)) throw denied()
    if (decision?.mode === 'SESSION') p.grant = { source: true,
      selection: !!p.grant?.selection || context.scope.selection,
      runEvidence: !!p.grant?.runEvidence || context.scope.runEvidence }
  }
  revoke(owner: number, document: string, id: string): void {
    const p = this.permissions.get(owner)
    // Idempotent revocation never affects a different/newer permission.
    if (!p || p.id !== id) return
    if (p.document !== document) throw denied()
    this.clear(owner)
  }
  clear(owner: number): void {
    const p = this.permissions.get(owner)
    if (!p) return
    this.permissions.delete(owner); clearTimeout(p.timer); this.retired(owner, p.id)
  }
}

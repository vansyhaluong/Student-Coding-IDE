import { randomUUID } from 'node:crypto'
import { DomainError } from '../../../errors/app-error'
import { SMART_HINT_POLICY as P, type SmartPrepare, type SmartReference, type SmartStart, type SmartRetire,
  type SmartStatus, type SmartCapabilities, type SmartFailure, type SmartOutput } from '../../../../shared/contracts/smart-hints'
import { validateSmartPrepare, validateSmartStart, validateSmartReference, validateSmartRetire, isSmartOutput,
  smartBytes, isSmartBinding, isSmartRunContext, smartCandidate } from '../../../../shared/contracts/smart-hints-validation'
import { sourceFingerprint } from './public-run-receipt'
import { bindSmartAction, immutableSmartCapture, type SmartCapture } from './capture'
import { schemaResponseFailure, projectResponseFailure, PROVIDER_FAILURE_SOURCES, type ProviderFailureSource, type SmartResponseFailure } from './response-failure'
import { smartOutputDiagnostic, type SmartOutputDiagnostic } from './validation-diagnostics'
import { SmartProviderError, type SmartProvider, type SmartProviderExecution } from './adapter'
import { assertSelectionFixBinding, constructSelectionFix } from './selection-fix'
import { SelectionFixError, projectSelectionFixDiagnostic, type SelectionFixDiagnostic } from './selection-fix-diagnostics'
import type { SelectionFixGuard, SelectionFixGuardLease, SelectionFixScope } from './selection-fix-guard'
import type { ExerciseLanguage } from '../../../../shared/contracts/practice'
import { SharedExecutionCoordinator } from './execution-coordinator'

export interface SmartExecutionEvent {
  requestId: string; action: SmartPrepare['action']['kind']; state: 'STARTED' | 'COMPLETE' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
  timeoutMs: number; elapsedMs: number; code?: SmartFailure
  schemaValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
  output?: SmartOutputDiagnostic
  providerFailureSource?: ProviderFailureSource
  selectionFix?: SelectionFixDiagnostic
}

interface Operation {
  owner: number; scope: string; request: SmartPrepare; digest: string; operationId: string; token: string
  check(): void; abort: AbortController; capture?: SmartCapture; status?: SmartStatus; prepared: Promise<SmartStatus>
  spent: boolean; expiresAt: number; timer?: ReturnType<typeof setTimeout>; monitor?: ReturnType<typeof setInterval>
  execution?: SmartProviderExecution; startedAt?: number; executionReported?: boolean
  schemaValidation?: SmartExecutionEvent['schemaValidation']
  output?: SmartOutputDiagnostic
  providerFailureSource?: ProviderFailureSource
  selectionFix?: SelectionFixDiagnostic
  guard?: SelectionFixGuardLease
}
interface Session {
  timer?: ReturnType<typeof setTimeout>
  scope: string; generation: number; context?: string; sourceKey?: string; started: number
  seen: Map<string, string>; retired: Set<string>; hints: { digest: string; summary: string }[]; level: number
}
const denied = () => new DomainError({ code: 'INVALID_INPUT', operation: 'smart-hints', message: 'Invalid or stale Smart Hints request.', retryable: false })
/** Main-owned, ephemeral, independent from Run/Submit/D2 generations. */
export class SmartHintsService {
  private operations = new Map<number, Operation>()
  private sessions = new Map<number, Session>()
  private tasks = new Set<Promise<unknown>>()
  private stopped = false
  private fixLanguages: ExerciseLanguage[] = []
  private availabilityProbe?: { provider: SmartProvider; abort: AbortController; task: Promise<SmartCapabilities> }
  constructor(private provider?: SmartProvider, private readonly clock = Date.now,
    private readonly onResponseFailure?: (diagnostic: SmartResponseFailure, requestId: string) => void,
    private readonly execution: { timeoutMs: number; timeoutForAction?(kind: SmartPrepare['action']['kind']): number;
      onExecution?(event: SmartExecutionEvent): void; onTimeout?(): void;
      onSelectionFix?(diagnostic: SelectionFixDiagnostic): void } = { timeoutMs: P.timeoutMs },
    private readonly selectionFixGuard?: SelectionFixGuard,
    private readonly coordinator = new SharedExecutionCoordinator(clock, async () => {})) {
    if (!Number.isSafeInteger(execution.timeoutMs) || execution.timeoutMs < 1 || execution.timeoutMs > 30000) throw denied()
  }
  // Main composition alone provisions a provider. Unconfigured production fails closed.
  /** Read-only local throttle status. Probes never reserve a request. */
  rateLimitReset(): number | null {
    return this.coordinator.rateLimitReset()
  }
  capabilities(): SmartCapabilities {
    const enabled = !this.stopped && !!this.provider && (this.provider.available?.() ?? true)
    const languages = enabled ? [...this.fixLanguages] : []
    return { enabled, providerMode: enabled ? this.provider!.mode : 'DISABLED', applyEnabled: enabled, consentVersion: 1,
      suggestFixMode: languages.length ? 'SELECTION_V1' : 'DISABLED', suggestFixLanguages: languages }
  }
  /** Read-only local parser probe; never dispatches transport or reserves quota. */
  probeCapabilities(): Promise<SmartCapabilities> {
    const provider = this.provider, guard = this.selectionFixGuard
    if (!this.capabilities().enabled || !provider || !guard?.availability
      || !['GEMINI_FREE', 'FAKE'].includes(provider.mode)) return Promise.resolve(this.capabilities())
    if (this.availabilityProbe?.provider === provider) return this.availabilityProbe.task
    const abort = new AbortController(), deadline = this.clock() + 10000
    const scope: SelectionFixScope = { signal: abort.signal, clock: this.clock, deadline, check: () => {
      if (this.stopped || abort.signal.aborted || this.provider !== provider) throw denied()
    } }
    const task = Promise.resolve().then(async () => {
      const languages = ['csharp', 'javascript'] as const
      const ready = await Promise.all(languages.map(async language => {
        try { return await guard.availability!(language, scope) } catch { return false }
      }))
      if (!this.stopped && !abort.signal.aborted && this.provider === provider)
        this.fixLanguages = languages.filter((_, i) => ready[i])
      return this.capabilities()
    }).finally(() => { if (this.availabilityProbe?.abort === abort) this.availabilityProbe = undefined })
    this.availabilityProbe = { provider, abort, task }; this.track(task)
    return task
  }
  /** Main-only settings lifecycle; quotas survive disable/key rotation. */
  async configureProvider(provider?: SmartProvider): Promise<void> {
    this.availabilityProbe?.abort.abort(); this.fixLanguages = []
    for (const owner of [...this.sessions.keys()]) this.invalidate(owner)
    const previous = this.provider; this.provider = undefined; previous?.dispose?.()
    await Promise.allSettled([...this.tasks])
    if (this.stopped) { provider?.dispose?.(); return }
    this.provider = provider
  }
  private track(task: Promise<unknown>): void { this.tasks.add(task); void task.finally(() => this.tasks.delete(task)).catch(() => {}) }
  private live(op: Operation): void {
    if (this.stopped || this.operations.get(op.owner) !== op || op.abort.signal.aborted) throw denied()
    try { op.check() } catch { this.invalidate(op.owner); throw denied() }
  }
  private finish(op: Operation, value: { state: 'FAILED'; code: SmartFailure } | { state: 'CANCELLED' | 'EXPIRED' }): void {
    this.reportExecution(op, value.state, value.state === 'FAILED' ? value.code : undefined)
    if (value.state === 'FAILED' && value.code === 'TIMEOUT') {
      try { this.execution.onTimeout?.() } catch { /* Diagnostics cannot alter cleanup. */ }
    }
    op.spent = true; op.capture = undefined; op.abort.abort(); clearTimeout(op.timer); clearInterval(op.monitor)
    const guard = op.guard; op.guard = undefined
    if (guard) this.track(Promise.resolve().then(() => guard.dispose()))
    if (op.status) {
      const { binding, requestId, operationId, sequence } = op.status
      op.status = { schemaVersion: 1, binding, requestId, operationId, sequence: sequence + 1, ...value }
    }
    // Snapshot contains source/selection: drop it even while an abort settles.
    op.request = { ...op.request, source: '', action: { kind: 'ANALYZE' } }
  }
  private reportExecution(op: Operation, state: SmartExecutionEvent['state'], code?: SmartFailure): void {
    if (!op.execution || op.startedAt === undefined || op.executionReported) return
    if (state !== 'STARTED') op.executionReported = true
    try { this.execution.onExecution?.({ requestId: op.request.requestId, action: op.status!.binding.action.kind,
      state, timeoutMs: op.execution.timeoutMs, elapsedMs: Math.max(0, this.clock() - op.startedAt),
      schemaValidation: op.schemaValidation ?? 'NOT_RUN', ...(code ? { code } : {}),
      ...(op.output ? { output: { ...op.output } } : {}), ...(op.providerFailureSource ? { providerFailureSource: op.providerFailureSource } : {}),
      ...(op.selectionFix ? { selectionFix: { ...op.selectionFix } } : {}) }) }
    catch { /* Diagnostics cannot affect lifecycle or acceptance. */ }
  }
  private guardScope(op: Operation): SelectionFixScope {
    return { signal: op.abort.signal, deadline: op.expiresAt, clock: this.clock, check: () => this.live(op) }
  }
  private fixFailure(op: Operation, error: unknown): void {
    const diagnostic = error instanceof SelectionFixError ? projectSelectionFixDiagnostic(error.selectionFix) : undefined
    if (!diagnostic) return
    if (diagnostic.stage === 'GUARD_RUNTIME') {
      const language = op.capture?.binding.language ?? op.status?.binding.language
      this.fixLanguages = this.fixLanguages.filter(l => l !== language)
    }
    op.selectionFix = diagnostic
    try { this.execution.onSelectionFix?.({ ...diagnostic }) } catch { /* Telemetry is never authority. */ }
  }
  prepare(owner: number, scope: string, value: SmartPrepare, check: () => void,
    capture: (generation: number, check: () => void) => Promise<SmartCapture>): Promise<SmartStatus> {
    const valid = validateSmartPrepare(value)
    if (!valid.ok || this.stopped) throw denied()
    check(); const request = valid.value, digest = sourceFingerprint(JSON.stringify(request)), now = this.clock()
    let session = this.sessions.get(owner)
    if (!session || session.scope !== scope) {
      this.invalidate(owner); session = { scope, generation: 0, started: now, seen: new Map(), retired: new Set(), hints: [], level: 0 }
      this.sessions.set(owner, session)
    }
    const previous = this.operations.get(owner)
    if (session.seen.has(request.requestId)) {
      if (session.seen.get(request.requestId) !== digest || !previous || previous.request.requestId !== request.requestId) throw denied()
      return previous.prepared.then(() => this.status(owner, scope, { requestId: request.requestId, operationId: previous.operationId }))
    }
    if (session.retired.has(request.clientContextId) || session.seen.size >= 128 || session.retired.size >= 128) throw denied()
    const sourceKey = sourceFingerprint(JSON.stringify([request.clientContextId, request.exerciseId, request.language, request.sourceRevision, request.source, request.origin]))
    if (session.sourceKey !== sourceKey || now - session.started >= P.sessionMs) {
      session.hints = []; session.level = 0; session.started = now; session.generation++
      session.sourceKey = sourceKey; session.context = request.clientContextId
      clearTimeout(session.timer)
      const window = session
      session.timer = setTimeout(() => {
        if (this.sessions.get(owner) !== window) return
        window.hints = []; window.level = 0; window.sourceKey = undefined
        const current = this.operations.get(owner)
        if (current) this.finish(current, { state: 'EXPIRED' })
      }, P.sessionMs)
    }
    if (request.action.kind === 'HINT' && request.action.level > session.level + 1) throw denied()
    if (previous && (!previous.status || ['PREPARED', 'RUNNING'].includes(previous.status.state))
      && previous.digest === sourceFingerprint(JSON.stringify({ ...request, requestId: previous.request.requestId }))) throw denied()
    if (previous) this.finish(previous, { state: 'CANCELLED' })
    session.seen.set(request.requestId, digest)
    const op: Operation = { owner, scope, request, digest, operationId: randomUUID(), token: randomUUID(), check,
      abort: new AbortController(), prepared: undefined as unknown as Promise<SmartStatus>, spent: false,
      expiresAt: Math.min(now + P.prepareMs, session.started + P.sessionMs) }
    this.operations.set(owner, op)
    op.monitor = setInterval(() => { try { this.live(op) } catch { this.invalidate(owner, op) } }, 50)
    op.timer = setTimeout(() => this.finish(op, { state: 'EXPIRED' }), Math.max(0, op.expiresAt - now))
    op.prepared = Promise.resolve().then(async () => {
      try {
        this.live(op)
        const result = await capture(session!.generation, () => this.live(op))
        this.live(op)
        if (this.clock() >= op.expiresAt || !isSmartBinding(result.binding) || !isSmartRunContext(result.runContext)
          || result.binding.fingerprint !== sourceFingerprint(request.source) || result.source !== request.source
          || result.binding.clientContextId !== request.clientContextId || result.binding.exerciseId !== request.exerciseId
          || result.binding.language !== request.language || result.binding.sourceRevision !== request.sourceRevision
          || result.binding.sourceBytes !== Buffer.byteLength(request.source)
          || JSON.stringify(result.binding.action) !== JSON.stringify(bindSmartAction(request.action)) || JSON.stringify(result.binding.origin) !== JSON.stringify(request.origin)
          || result.binding.contextGeneration !== session!.generation
          || JSON.stringify(result.action) !== JSON.stringify(request.action)) throw denied()
        op.capture = immutableSmartCapture(result)
        if (op.capture.action.kind === 'SUGGEST_FIX') {
          assertSelectionFixBinding(op.capture)
          if (this.selectionFixGuard?.availability && !this.fixLanguages.includes(op.capture.binding.language)) throw denied()
          if (this.selectionFixGuard) {
            const lease = await this.selectionFixGuard.preflight(op.capture, this.guardScope(op))
            // Retire a lease that arrives after cancellation; never publish a late capture.
            try { this.live(op); if (this.clock() >= op.expiresAt) throw denied() } catch { await lease.dispose(); throw denied() }
            op.guard = lease
          }
        }
        op.status = { schemaVersion: 1, requestId: request.requestId, operationId: op.operationId, sequence: 0,
          binding: op.capture.binding, state: 'PREPARED', captureToken: op.token, expiresAt: op.expiresAt, consentVersion: 1,
          statementBytes: Buffer.byteLength(result.statement), runContextKind: result.runContext.kind }
        return structuredClone(op.status)
      } catch (error) { this.fixFailure(op, error); this.finish(op, { state: 'FAILED', code: 'INVALID_INPUT' }); throw denied() }
    })
    this.track(op.prepared); return op.prepared
  }
  private get(owner: number, scope: string, reference: SmartReference): Operation {
    if (!validateSmartReference(reference).ok || this.stopped) throw denied()
    const op = this.operations.get(owner)
    if (!op || op.scope !== scope || op.operationId !== reference.operationId || op.request.requestId !== reference.requestId || !op.status) throw denied()
    try { op.check() } catch { this.invalidate(owner); throw denied() }
    if (this.clock() >= op.expiresAt && !['EXPIRED', 'CANCELLED', 'FAILED'].includes(op.status.state)) this.finish(op, { state: 'EXPIRED' })
    return op
  }
  status(owner: number, scope: string, reference: SmartReference): SmartStatus { return structuredClone(this.get(owner, scope, reference).status!) }
  start(owner: number, scope: string, value: SmartStart): SmartStatus {
    if (!validateSmartStart(value).ok) throw denied()
    const op = this.get(owner, scope, { requestId: value.requestId, operationId: value.operationId })
    if (value.captureToken !== op.token) throw denied()
    if (op.spent) return structuredClone(op.status!)
    if (op.status!.state !== 'PREPARED' || !op.capture) throw denied()
    const now = this.clock()
    let failure: SmartFailure | undefined
    if (!this.provider || op.capture.action.kind === 'SUGGEST_FIX' && (!op.guard
      || this.selectionFixGuard?.availability && !this.fixLanguages.includes(op.capture.binding.language))) failure = 'UNCONFIGURED'
    if (failure) { this.finish(op, { state: 'FAILED', code: failure }); return structuredClone(op.status!) }
    const timeoutMs = this.execution.timeoutForAction?.(op.capture.binding.action.kind) ?? this.execution.timeoutMs
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw denied()
    this.live(op)
    const admitted = this.coordinator.admit({ signal: op.abort.signal, deadline: Math.min(now + timeoutMs, this.sessions.get(owner)!.started + P.sessionMs),
      cancel: () => this.finish(op, { state: 'CANCELLED' }) })
    if (!admitted.ok) { this.finish(op, { state: 'FAILED', code: admitted.code }); return structuredClone(op.status!) }
    op.spent = true
    const captured = op.capture; op.capture = undefined; clearTimeout(op.timer)
    op.status = { schemaVersion: 1, requestId: value.requestId, operationId: op.operationId, sequence: op.status!.sequence + 1,
      binding: captured.binding, state: 'RUNNING' }
    const session = this.sessions.get(owner)!, history = session.hints.slice(-2).map(s => s.summary)
    op.startedAt = now; op.expiresAt = Math.min(now + timeoutMs, session.started + P.sessionMs)
    op.execution = { requestId: value.requestId, deadline: op.expiresAt, timeoutMs, clock: this.clock,
      reserveInference: admitted.admission.reserveInference }
    this.reportExecution(op, 'STARTED')
    op.timer = setTimeout(() => this.finish(op, { state: 'FAILED', code: 'TIMEOUT' }), Math.max(0, op.expiresAt - now))
    this.track(Promise.resolve().then(async () => {
      try {
        this.live(op)
        if (op.guard) { await op.guard.assertReady(this.guardScope(op)); this.live(op) }
        const wire = await this.provider!.run(captured, history, op.abort.signal, op.execution)
        this.live(op)
        const output = captured.action.kind === 'SUGGEST_FIX' ? constructSelectionFix(captured, wire) : wire
        op.output = smartOutputDiagnostic(output)
        this.live(op)
        if (this.clock() >= op.expiresAt) { this.finish(op, { state: 'FAILED', code: 'TIMEOUT' }); return }
        const evidence = captured.runContext.kind === 'RUN_PUBLIC' ? captured.runContext.observations.map(x => x.evidenceId) : []
        const validOutput = isSmartOutput(output, captured.binding.action, captured.source, evidence,
          captured.binding.origin.kind === 'PRACTICE' ? captured.binding.origin.eol : undefined)
        op.schemaValidation = validOutput ? 'PASS' : 'FAIL'
        if (!validOutput) {
          if (captured.action.kind === 'SUGGEST_FIX') throw new SelectionFixError('INVALID_RESPONSE', 'SH1', 'SH1_REJECTED')
          // Explanations are best effort; a diagnostic exception cannot replace the original code.
          let detail: SmartResponseFailure | undefined
          try { detail = schemaResponseFailure(output, captured.binding.action, evidence, captured.source,
            captured.binding.origin.kind === 'PRACTICE' ? captured.binding.origin.eol : undefined) } catch { /* Keep INVALID_RESPONSE. */ }
          throw new SmartProviderError('INVALID_RESPONSE', detail)
        }
        if (captured.action.kind === 'SUGGEST_FIX' && output.kind === 'EDIT_PROPOSAL') {
          const candidate = smartCandidate(captured.source, output.edits, captured.binding.origin.kind === 'PRACTICE' ? captured.binding.origin.eol : undefined)
          if (candidate === undefined || !op.guard) throw new SelectionFixError('PROVIDER', 'CONSTRUCTION', 'BINDING_MISMATCH')
          await op.guard.verify(candidate, this.guardScope(op)); this.live(op)
        }
        const guard = op.guard; op.guard = undefined
        if (guard) { await guard.dispose(); this.live(op) }
        if (smartBytes({ output, runContext: captured.runContext, binding: captured.binding }) > P.requestBytes) throw new SmartProviderError('LIMIT_EXCEEDED')
        if (output.kind === 'HINT') {
          const summary = output.paragraphs.join(' ').normalize('NFC').replace(/\s+/g, ' ').trim()
          const digest = sourceFingerprint(summary)
          if (session.hints.some(x => x.digest === digest)) { this.finish(op, { state: 'FAILED', code: 'DUPLICATE_HINT' }); return }
          session.hints = [...session.hints, { digest, summary: Array.from(summary).slice(0, P.summaryBytes / 4).join('') }].slice(-3)
          session.level = Math.max(session.level, output.level)
        }
        if (this.clock() >= op.expiresAt) { this.finish(op, { state: 'FAILED', code: 'TIMEOUT' }); return }
        clearTimeout(op.timer); op.expiresAt = Math.min(this.clock() + P.resultMs, session.started + P.sessionMs)
        op.status = { ...op.status!, state: 'COMPLETE', sequence: op.status!.sequence + 1,
          output: structuredClone(output as SmartOutput), runContext: structuredClone(captured.runContext), expiresAt: op.expiresAt,
          proposalId: output.kind === 'EDIT_PROPOSAL' ? randomUUID() : null }
        this.reportExecution(op, 'COMPLETE')
        // Keep monitoring document authority through result TTL; never preserve source in operation state.
        op.request = { ...op.request, source: '', action: { kind: 'ANALYZE' } }
        op.timer = setTimeout(() => this.finish(op, { state: 'EXPIRED' }), Math.max(0, op.expiresAt - this.clock()))
      } catch (error) {
        if (!op.abort.signal.aborted) this.fixFailure(op, error)
        if (!op.abort.signal.aborted && error instanceof SmartProviderError && error.responseFailure) {
          // Best-effort Main-only telemetry must never alter validation or publication.
          try {
            const safe = projectResponseFailure(error.responseFailure)
            if (safe) this.onResponseFailure?.(safe, op.request.requestId)
          } catch { /* Fixed-code failure still wins. */ }
        }
        if (!op.abort.signal.aborted) {
          if (!(error instanceof SmartProviderError) || error.code === 'PROVIDER') {
            // Never copy arbitrary error properties/strings into the diagnostic sink.
            const d = error instanceof SmartProviderError ? Object.getOwnPropertyDescriptor(error, 'providerFailureSource') : undefined
            op.providerFailureSource = d && Object.hasOwn(d, 'value') && PROVIDER_FAILURE_SOURCES.includes(d.value) ? d.value : 'UNEXPECTED_ERROR'
          }
          this.finish(op, { state: 'FAILED', code: error instanceof SmartProviderError ? error.code : 'PROVIDER' })
        }
      } finally { admitted.admission.release() }
    }))
    return structuredClone(op.status)
  }
  cancel(owner: number, scope: string, reference: SmartReference): SmartStatus {
    const op = this.get(owner, scope, reference)
    if (op.status!.state !== 'CANCELLED') this.finish(op, { state: 'CANCELLED' })
    return structuredClone(op.status!)
  }
  retireContext(owner: number, scope: string, value: SmartRetire): boolean {
    if (!validateSmartRetire(value).ok) throw denied()
    const session = this.sessions.get(owner)
    if (!session || session.scope !== scope) return false
    if (session.retired.size >= 128 && !session.retired.has(value.clientContextId)) throw denied()
    session.retired.add(value.clientContextId)
    const op = this.operations.get(owner)
    if (op?.request.clientContextId === value.clientContextId) this.finish(op, { state: 'CANCELLED' })
    if (session.context === value.clientContextId) { session.hints = []; session.level = 0; session.sourceKey = undefined; return true }
    return false
  }
  invalidate(owner: number, expected?: Operation): void {
    const op = this.operations.get(owner)
    if (expected && op !== expected) return
    if (op) this.finish(op, { state: 'CANCELLED' })
    clearTimeout(this.sessions.get(owner)?.timer)
    this.operations.delete(owner); this.sessions.delete(owner)
  }
  beginShutdown(): void { this.stopped = true; this.availabilityProbe?.abort.abort(); this.fixLanguages = []; for (const owner of this.sessions.keys()) this.invalidate(owner); this.provider?.dispose?.() }
  async stop(): Promise<void> { this.beginShutdown(); await Promise.allSettled([...this.tasks]) }
}

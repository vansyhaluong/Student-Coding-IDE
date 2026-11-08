import { HINT_APPLY_MAX_ATTEMPTS, type HintApplyStage, type HintApplyReason } from '../../../../shared/contracts/smart-hints'
import { HintApplyParserError } from './hint-apply-parser'
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
import { MainSelectionFixGuard } from './selection-fix-parser-runtime'
import type { PrepareHintApply, HintApplyProposal, ConsumeHintApply, DiscardHintApply } from '../../../../shared/contracts/smart-hints'
import { validatePrepareHintApply, isHintApplyProposal, validateConsumeHintApply, validateDiscardHintApply } from '../../../../shared/contracts/smart-hints-validation'

export interface SmartExecutionEvent {
  requestId: string; action: SmartPrepare['action']['kind']; state: 'STARTED' | 'COMPLETE' | 'FAILED' | 'CANCELLED' | 'EXPIRED'
  timeoutMs: number; elapsedMs: number; code?: SmartFailure
  schemaValidation: 'NOT_RUN' | 'PASS' | 'FAIL'
  output?: SmartOutputDiagnostic
  providerFailureSource?: ProviderFailureSource
  selectionFix?: SelectionFixDiagnostic
}
export interface HintApplyDiagnostic {
  stage: HintApplyStage; reason: HintApplyReason | 'ACCEPT'; attempt: number
  language: ExerciseLanguage; implementation: 'NO_IMPLEMENTATION' | 'HAS_IMPLEMENTATION' | 'UNCERTAIN'
  guardReason?: SelectionFixDiagnostic['reason']
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
  hintCapture?: SmartCapture
  hintClassification?: SmartCapture['hintImplementation']
  hintAttempts?: Map<string, { digest: string; error?: DomainError }>
  hintApply?: { failure?: DomainError; requestId: string; digest: string; task: Promise<HintApplyProposal>; proposal?: HintApplyProposal; consumed: boolean; consuming?: boolean; abort?(): void; consumeAbort?(): void }
}
interface Session {
  timer?: ReturnType<typeof setTimeout>
  scope: string; generation: number; context?: string; sourceKey?: string; started: number
  seen: Map<string, string>; retired: Set<string>
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
      onSelectionFix?(diagnostic: SelectionFixDiagnostic): void;
      onHintApply?(diagnostic: HintApplyDiagnostic): void } = { timeoutMs: P.timeoutMs },
    private readonly selectionFixGuard?: SelectionFixGuard,
    private readonly coordinator = new SharedExecutionCoordinator(clock, async () => {}),
    private readonly hintParser: Pick<MainSelectionFixGuard, 'classifyHint' | 'validateHintFunction'>
      & Partial<Pick<MainSelectionFixGuard, 'prepareHintApply'>> = new MainSelectionFixGuard()) {
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
    op.hintApply?.abort?.(); op.hintApply?.consumeAbort?.()
    op.spent = true; op.capture = undefined; op.hintCapture = undefined; op.hintApply = undefined; op.hintAttempts = undefined; op.hintClassification = undefined
    op.abort.abort(); clearTimeout(op.timer); clearInterval(op.monitor)
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
      this.invalidate(owner); session = { scope, generation: 0, started: now, seen: new Map(), retired: new Set() }
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
      session.started = now; session.generation++
      session.sourceKey = sourceKey; session.context = request.clientContextId
      clearTimeout(session.timer)
      const window = session
      session.timer = setTimeout(() => {
        if (this.sessions.get(owner) !== window) return
        window.sourceKey = undefined
        const current = this.operations.get(owner)
        if (current) this.finish(current, { state: 'EXPIRED' })
      }, P.sessionMs)
    }
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
        const detached = immutableSmartCapture(result)
        const hintImplementation = request.action.kind === 'HINT' ? await this.hintParser.classifyHint(detached, this.guardScope(op)) : undefined
        this.live(op)
        op.capture = immutableSmartCapture({ ...detached, ...(hintImplementation ? { hintImplementation } : {}) })
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
    // Unified Hint cards have no approved replay policy; never send their text/code
    // to subsequent actions or to Chat. The provider port remains compatible.
    const session = this.sessions.get(owner)!, history: string[] = []
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
          captured.binding.origin.kind === 'PRACTICE' ? captured.binding.origin.eol : undefined, captured.binding.language)
        op.schemaValidation = validOutput ? 'PASS' : 'FAIL'
        if (!validOutput) {
          if (captured.action.kind === 'SUGGEST_FIX') throw new SelectionFixError('INVALID_RESPONSE', 'SH1', 'SH1_REJECTED')
          // Explanations are best effort; a diagnostic exception cannot replace the original code.
          let detail: SmartResponseFailure | undefined
          try { detail = schemaResponseFailure(output, captured.binding.action, evidence, captured.source,
            captured.binding.origin.kind === 'PRACTICE' ? captured.binding.origin.eol : undefined) } catch { /* Keep INVALID_RESPONSE. */ }
          throw new SmartProviderError('INVALID_RESPONSE', detail)
        }
        if (captured.action.kind === 'HINT' && captured.hintImplementation === 'NO_IMPLEMENTATION' && output.kind === 'HINT') {
          if (!await this.hintParser.validateHintFunction(captured, output.code.text, this.guardScope(op))) {
            op.schemaValidation = 'FAIL'
            throw new SmartProviderError('INVALID_RESPONSE')
          }
          this.live(op)
        }
        if (captured.action.kind === 'SUGGEST_FIX' && output.kind === 'EDIT_PROPOSAL') {
          const candidate = smartCandidate(captured.source, output.edits, captured.binding.origin.kind === 'PRACTICE' ? captured.binding.origin.eol : undefined)
          if (candidate === undefined || !op.guard) throw new SelectionFixError('PROVIDER', 'CONSTRUCTION', 'BINDING_MISMATCH')
          await op.guard.verify(candidate, this.guardScope(op)); this.live(op)
        }
        const guard = op.guard; op.guard = undefined
        if (guard) { await guard.dispose(); this.live(op) }
        if (smartBytes({ output, runContext: captured.runContext, binding: captured.binding }) > P.requestBytes) throw new SmartProviderError('LIMIT_EXCEEDED')
        if (this.clock() >= op.expiresAt) { this.finish(op, { state: 'FAILED', code: 'TIMEOUT' }); return }
        clearTimeout(op.timer); op.expiresAt = Math.min(this.clock() + P.resultMs, session.started + P.sessionMs)
        op.status = { ...op.status!, state: 'COMPLETE', sequence: op.status!.sequence + 1,
          output: structuredClone(output as SmartOutput), runContext: structuredClone(captured.runContext), expiresAt: op.expiresAt,
          proposalId: output.kind === 'EDIT_PROPOSAL' ? randomUUID() : null }
        this.reportExecution(op, 'COMPLETE')
        if (captured.action.kind === 'HINT') op.hintClassification = captured.hintImplementation
        // Retain only the private Hint material needed for local proposal validation.
        if (captured.action.kind === 'HINT' && output.kind === 'HINT' && captured.binding.origin.kind === 'PRACTICE'
          && ['NO_IMPLEMENTATION', 'HAS_IMPLEMENTATION'].includes(captured.hintImplementation ?? ''))
          op.hintCapture = immutableSmartCapture({ ...captured, statement: '', constraints: [], runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' } })
        // Ordinary request source is still dropped. Hint material expires with the operation.
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
  /** Local parse-only proposal preparation; never dispatches/reserves inference. */
  prepareHintApply(owner: number, scope: string, value: PrepareHintApply,
    recapture: (request: SmartPrepare, generation: number, check: () => void) => Promise<SmartCapture>): Promise<HintApplyProposal> {
    const checked = validatePrepareHintApply(value)
    if (!checked.ok) throw denied()
    const q = checked.value, op = this.get(owner, scope, q.hint), c = op.hintCapture, status = op.status
    const attempts = op.hintAttempts ??= new Map()
    const failure = (stage: HintApplyStage, reason: HintApplyReason, attempt: number) => new DomainError({
      code: reason === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'INVALID_INPUT', operation: 'prepareHintApply',
      message: `Hint Apply: ${reason} (${stage}).`,
      retryable: (reason === 'TARGET_INVALID' || reason === 'CANDIDATE_INVALID') && attempt < HINT_APPLY_MAX_ATTEMPTS,
      details: { requestId: q.requestId, operationId: q.hint.operationId, stage, reason, attempt,
        remaining: HINT_APPLY_MAX_ATTEMPTS - attempt, noGrant: true } })
    if (status?.state === 'COMPLETE' && status.output.kind === 'HINT' && op.hintClassification === 'UNCERTAIN') {
      try { this.execution.onHintApply?.({ stage: 'CLASSIFICATION', reason: 'UNSUPPORTED', attempt: 1,
        language: status.binding.language, implementation: 'UNCERTAIN' }) } catch { /* Never authority. */ }
      throw failure('CLASSIFICATION', 'UNSUPPORTED', 1)
    }
    if (!c || status?.state !== 'COMPLETE' || status.output.kind !== 'HINT' || !this.hintParser.prepareHintApply
      || c.binding.origin.kind !== 'PRACTICE' || c.binding.exerciseId !== q.exerciseId || c.binding.language !== q.language
      || c.binding.sourceRevision !== q.sourceRevision || c.binding.packageVersion !== q.packageVersion
      || JSON.stringify(c.binding.origin) !== JSON.stringify(q.origin) || c.source !== q.source
      || c.binding.fingerprint !== sourceFingerprint(q.source) || op.expiresAt <= this.clock()
      || !['NO_IMPLEMENTATION', 'HAS_IMPLEMENTATION'].includes(c.hintImplementation ?? ''))
      { if (op.hintApply?.proposal || op.hintApply?.consumed) throw denied()
        throw failure('BINDING', 'STALE', Math.max(1, attempts.size)) }
    const digest = sourceFingerprint(JSON.stringify(q)), seen = attempts.get(q.requestId)
    if (op.hintApply?.consumed || op.hintApply?.proposal && op.hintApply.requestId !== q.requestId) throw denied()
    if (seen) {
      if (seen.digest !== digest) throw denied()
      if (seen.error) return Promise.reject(seen.error)
    }
    if (op.hintApply) {
      const previous = op.hintApply
      if (previous.consumed) throw denied()
      if (previous.requestId === q.requestId && previous.digest === digest) return previous.task.then(proposal => {
        this.live(op)
        if (op.hintApply !== previous || previous.consumed || proposal.expiresAt <= this.clock()) throw denied()
        return structuredClone(proposal)
      })
      if (previous.proposal || !previous.failure?.retryable) throw denied()
    }
    if (attempts.size >= HINT_APPLY_MAX_ATTEMPTS) throw denied()
    const record: { digest: string; error?: DomainError } = { digest }
    attempts.set(q.requestId, record)
    const attempt = attempts.size
    const diagnose = (stage: HintApplyStage, reason: HintApplyDiagnostic['reason'], guardReason?: SelectionFixDiagnostic['reason']) => {
      try { this.execution.onHintApply?.({ stage, reason, attempt, language: c.binding.language,
        implementation: c.hintImplementation as HintApplyDiagnostic['implementation'], ...(guardReason ? { guardReason } : {}) }) } catch { /* Never authority. */ }
    }
    const controller = new AbortController(), deadline = Math.min(op.expiresAt, this.clock() + P.timeoutMs)
    const abort = () => controller.abort()
    op.abort.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, Math.max(0, deadline - this.clock()))
    const check = () => { this.live(op); if (controller.signal.aborted || this.clock() >= deadline) throw denied() }
    const preparation: NonNullable<Operation['hintApply']> = { requestId: q.requestId, digest, consumed: false, task: undefined!, abort }
    op.hintApply = preparation
    const task = Promise.resolve().then(async () => {
      let stage: HintApplyStage = 'BINDING'
      try {
        check()
        const captureRequest: SmartPrepare = { requestId: status.requestId, clientContextId: c.binding.clientContextId,
          exerciseId: c.binding.exerciseId, language: c.binding.language, sourceRevision: c.binding.sourceRevision,
          source: c.source, origin: c.binding.origin, action: { kind: 'HINT' }, run: null }
        const verifyPackage = async () => {
          const captured = await recapture(captureRequest, c.binding.contextGeneration, check)
          check()
          if (JSON.stringify(captured.binding) !== JSON.stringify(c.binding) || captured.source !== c.source
            || JSON.stringify(captured.signatureIdentity) !== JSON.stringify(c.signatureIdentity)
            || JSON.stringify(captured.signature) !== JSON.stringify(c.signature) || captured.hintTemplate !== c.hintTemplate) throw denied()
        }
        await verifyPackage()
        const code = status.output.kind === 'HINT' ? status.output.code.text : ''
        const normalized = code.replace(/\r\n|\n/g, c.binding.origin.kind === 'PRACTICE' && c.binding.origin.eol === 'CRLF' ? '\r\n' : '\n')
        stage = 'PARSER_RUNTIME'
        const parsed = await this.hintParser.prepareHintApply!(c, normalized, c.hintImplementation === 'NO_IMPLEMENTATION' ? null : q.selection, { signal: controller.signal, deadline, clock: this.clock, check })
        stage = 'BINDING'
        check(); await verifyPackage()
        const output: Extract<SmartOutput, { kind: 'EDIT_PROPOSAL' }> = { kind: 'EDIT_PROPOSAL', rationale: 'Áp dụng code từ Hint đã xác thực.', evidence: [],
          edits: [{ startOffset: parsed.start, endOffset: parsed.end, expectedOldText: c.source.slice(parsed.start, parsed.end), replacementText: parsed.replacementText,
            rationale: 'Target đã được parser xác minh trên snapshot gốc.' }] }
        stage = 'SH1'
        if (!isSmartOutput(output, undefined, c.source, [], c.binding.origin.kind === 'PRACTICE' ? c.binding.origin.eol : undefined)
          || smartCandidate(c.source, output.edits, c.binding.origin.kind === 'PRACTICE' ? c.binding.origin.eol : undefined) === undefined) throw denied()
        const proposal: HintApplyProposal = { schemaVersion: 1, requestId: q.requestId, proposalId: randomUUID(), hint: q.hint,
          binding: c.binding, expiresAt: op.expiresAt, target: { kind: c.hintImplementation === 'NO_IMPLEMENTATION' ? 'TEMPLATE_BODY' : 'SELECTION',
            startOffset: parsed.start, endOffset: parsed.end }, output }
        if (!isHintApplyProposal(proposal)) throw denied()
        check(); preparation.proposal = structuredClone(proposal)
        diagnose('SH1', 'ACCEPT')
        return structuredClone(proposal)
      } catch (error) {
        let reason: HintApplyReason = stage === 'BINDING' ? 'STALE' : stage === 'SH1' ? 'CANDIDATE_INVALID' : 'UNSUPPORTED'
        if (error instanceof HintApplyParserError) { stage = error.failure.stage; reason = error.failure.reason }
        try { check(); if (preparation.consumed || op.hintCapture !== c) throw denied() }
        catch { stage = 'BINDING'; reason = 'STALE' }
        const rejected = failure(stage, reason, attempt)
        preparation.failure = rejected; record.error = rejected
        diagnose(stage, reason, error instanceof SelectionFixError ? error.selectionFix.reason : undefined)
        throw rejected
      }
      finally { clearTimeout(timer); op.abort.signal.removeEventListener('abort', abort) }
    })
    preparation.task = task; this.track(task)
    return task.then(proposal => {
      this.live(op)
      if (op.hintApply !== preparation || preparation.consumed || proposal.expiresAt <= this.clock()) throw denied()
      return structuredClone(proposal)
    })
  }
  /** Final public consume gate: no candidate or grant body supplied by Renderer. */
  async consumePreparedHintApply(owner: number, scope: string, value: ConsumeHintApply,
    recapture: (request: SmartPrepare, generation: number, check: () => void) => Promise<SmartCapture>): Promise<HintApplyProposal> {
    const checked = validateConsumeHintApply(value)
    if (!checked.ok) throw denied()
    const { preparation: q, proposalId } = checked.value, op = this.get(owner, scope, q.hint), p = op.hintApply, c = op.hintCapture
    if (!p || p.consuming || p.consumed || !p.proposal || !c || p.proposal.proposalId !== proposalId
      || p.digest !== sourceFingerprint(JSON.stringify(q)) || p.proposal.expiresAt <= this.clock()) throw denied()
    p.consuming = true
    const controller = new AbortController(), deadline = Math.min(op.expiresAt, this.clock() + P.timeoutMs)
    const abort = () => controller.abort(); p.consumeAbort = abort
    op.abort.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, Math.max(0, deadline - this.clock()))
    const check = () => {
      this.live(op)
      if (controller.signal.aborted || this.clock() >= deadline || op.hintApply !== p || p.consumed || op.hintCapture !== c) throw denied()
    }
    try {
      check()
      const captured = await recapture({ requestId: q.hint.requestId, clientContextId: c.binding.clientContextId,
        exerciseId: c.binding.exerciseId, language: c.binding.language, sourceRevision: c.binding.sourceRevision,
        source: c.source, origin: c.binding.origin, action: { kind: 'HINT' }, run: null }, c.binding.contextGeneration, check)
      check()
      if (JSON.stringify(captured.binding) !== JSON.stringify(c.binding) || captured.source !== c.source
        || JSON.stringify(captured.signatureIdentity) !== JSON.stringify(c.signatureIdentity)
        || JSON.stringify(captured.signature) !== JSON.stringify(c.signature) || captured.hintTemplate !== c.hintTemplate) throw denied()
      return this.consumeHintApply(owner, scope, q.hint, proposalId)
    } catch { p.consumed = true; op.hintCapture = undefined; throw denied() }
    finally { clearTimeout(timer); p.consumeAbort = undefined; op.abort.signal.removeEventListener('abort', abort) }
  }
  discardHintApply(owner: number, scope: string, value: DiscardHintApply): void {
    const checked = validateDiscardHintApply(value)
    if (!checked.ok) throw denied()
    const op = this.get(owner, scope, checked.value.hint), p = op.hintApply
    if (p && p.requestId !== checked.value.requestId) throw denied()
    // Even a discard racing prepare's acknowledgement revokes its future authority.
    if (p) { p.consumed = true; p.abort?.(); p.consumeAbort?.() }
    op.hintCapture = undefined
  }
  /** Main-only single-use primitive, reached publicly only through the final gate above. */
  consumeHintApply(owner: number, scope: string, hint: SmartReference, proposalId: string): HintApplyProposal {
    const op = this.get(owner, scope, hint), p = op.hintApply
    if (!p || p.consumed || !p.proposal || p.proposal.proposalId !== proposalId || p.proposal.expiresAt <= this.clock()) throw denied()
    p.consumed = true; op.hintCapture = undefined
    return structuredClone(p.proposal)
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
    if (session.context === value.clientContextId) { session.sourceKey = undefined; return true }
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

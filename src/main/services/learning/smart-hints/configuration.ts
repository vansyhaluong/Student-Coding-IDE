import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DomainError } from '../../../errors/app-error'
import type { SmartHintsReadiness, SmartHintsSettingsSnapshot } from '../../../../shared/contracts/smart-hints-settings'
import { GeminiSmartHintsAdapter, geminiKeyState, GEMINI_MODEL, type GeminiDiagnostic, type GeminiStage, type GeminiResponseDiagnostic } from './gemini-provider'
import { SmartProviderError } from './adapter'
import { checkGeminiConnection } from './gemini-readiness'
import { SmartHintsService, type SmartExecutionEvent } from './service'
import { geminiActionTimeoutMs, SMART_HINT_POLICY as P } from '../../../../shared/contracts/smart-hints'
import type { ProviderTransport } from '../analysis/contracts'
import type { SmartResponseFailure } from './response-failure'
import { smartOutputDiagnostic, type SmartOutputDiagnostic, type SmartValidationDiagnostic } from './validation-diagnostics'
import { projectSelectionFixDiagnostic, type SelectionFixDiagnostic } from './selection-fix-diagnostics'
import type { SelectionFixGuard } from './selection-fix-guard'
import { SharedExecutionCoordinator } from './execution-coordinator'
import { ChatService } from '../chat/service'

declare const __SMART_HINTS_BUILD_ID__: string
const buildIdentity = typeof __SMART_HINTS_BUILD_ID__ === 'undefined' ? 'UNBUNDLED' : __SMART_HINTS_BUILD_ID__

interface ProviderLimit { kind: 'GEMINI_RATE_LIMIT' | 'GEMINI_QUOTA_EXHAUSTED'; retryAt: number | null }
interface Document { version: 2; enabled: boolean; encryptedKey: string | null; usedRequests: number; dailyLimit: number; needsLimitReview: boolean; providerLimit: ProviderLimit | null }
export interface NormalSmartHintsDiagnostic extends Omit<SmartExecutionEvent, 'requestId' | 'output'>, GeminiResponseDiagnostic, SmartOutputDiagnostic {
  stage: GeminiStage | SelectionFixDiagnostic['stage'] | 'DISPATCH'; requestKind: GeminiDiagnostic['requestKind'] | 'NONE'
  httpStatus?: number; timeoutOwner: 'MAIN_SERVICE' | null
  model: typeof GEMINI_MODEL; buildIdentity: string; diagnosticsVersion: 1
  validationReason: SmartValidationDiagnostic['reason'] | null
  validationField: SmartValidationDiagnostic['field'] | null
}
export interface KeyEncryption {
  available(): Promise<boolean>; encrypt(value: string): Promise<Buffer>; decrypt(value: Buffer): Promise<string>
}
export interface SmartHintsConfigurationOptions {
  selectionFixGuard?: SelectionFixGuard
  hintContextParser?: Pick<import('./selection-fix-parser-runtime').MainSelectionFixGuard, 'classifyHint' | 'validateHintFunction'>
    & Partial<Pick<import('./selection-fix-parser-runtime').MainSelectionFixGuard, 'prepareHintApply'>>
  file: string; encryption: KeyEncryption; transport: ProviderTransport
  promptKey(signal: AbortSignal): Promise<string | null>
  confirm(kind: 'ENABLE' | 'BUDGET' | 'REMOVE_KEY', count: number): Promise<boolean>
  cancelPrompt?(): void
  clock?(): number
  onDiagnostic?(diagnostic: NormalSmartHintsDiagnostic): void
  onDiagnosticStoreError?(): void
}
const denied = (message: string) => new DomainError({ code: 'INVALID_INPUT', operation: 'settings:smart-hints', message, retryable: false })
class LocalBudgetError extends SmartProviderError { constructor() { super('RATE_LIMIT') } }
/** Normal application composition. No development/approval-ID/sample gate. */
export class SmartHintsConfiguration {
  readonly name = 'SmartHintsConfiguration'
  readonly service: SmartHintsService
  /** Inject this same instance into future Main consumers; never create another ledger. */
  readonly coordinator: SharedExecutionCoordinator
  readonly chat: ChatService
  private providerGeneration = 1
  private readonly chatRetirement = new Set<(reason: 'PROVIDER_CHANGED' | 'KEY_CHANGED') => void>()
  private document: Document = { version: 2, enabled: false, encryptedKey: null, usedRequests: 0, dailyLimit: 20, needsLimitReview: false, providerLimit: null }
  private reservations: number[] = []
  private get remoteLimit(): ProviderLimit | null { return this.document.providerLimit }
  private state: SmartHintsReadiness = 'DISABLED'
  private key = ''
  private busy = false
  private stopped = false
  private invalidStorage = false
  private writeTail: Promise<void> = Promise.resolve()
  private diagnosticWriteTail: Promise<void> = Promise.resolve()
  private operation?: AbortController
  private readonly clock: () => number
  private readonly traces = new Map<string, GeminiResponseDiagnostic & Pick<NormalSmartHintsDiagnostic, 'stage' | 'requestKind' | 'httpStatus'> & { failure?: SmartResponseFailure; output?: SmartOutputDiagnostic }>()
  constructor(private readonly options: SmartHintsConfigurationOptions) {
    this.clock = options.clock ?? Date.now
    this.coordinator = new SharedExecutionCoordinator(this.clock, signal => this.reserveDaily(signal))
    this.chat = new ChatService({ coordinator: this.coordinator, clock: this.clock,
      contentPolicy: { allows: text => !this.key || ![this.key, Buffer.from(this.key).toString('base64')].some(key => text.includes(key)) },
      provider: { current: () => ({ generation: this.providerGeneration, available: !this.stopped && !this.busy
          && this.document.enabled && !!this.key && this.state === 'READY' && !this.document.needsLimitReview }),
        transport: options.transport, credential: { value: () => this.key },
        onRetire: listener => { this.chatRetirement.add(listener); return () => { this.chatRetirement.delete(listener) } },
        failed: error => this.failed(error), succeeded: async () => {
          if (this.remoteLimit) { this.document.providerLimit = null; await this.persist() }
        } } })
    this.service = new SmartHintsService(undefined, this.clock, (failure, requestId) => {
      const trace = this.traces.get(requestId)
      if (trace) trace.failure = failure // Already projected by Main service; never a public status.
    }, { timeoutMs: geminiActionTimeoutMs('ANALYZE'),
      timeoutForAction: geminiActionTimeoutMs, onExecution: event => {
        if (event.state === 'STARTED') { this.traces.set(event.requestId, { stage: 'DISPATCH', requestKind: 'NONE', maxOutputTokens: P.maxOutputTokens, inferenceDispatched: false,
          finishReason: 'UNOBSERVED', usageMetadata: null, envelopeJsonValidation: 'NOT_RUN', outputJsonValidation: 'NOT_RUN' }); return }
        const trace = this.traces.get(event.requestId); this.traces.delete(event.requestId)
        const selectionFix = projectSelectionFixDiagnostic(event.selectionFix)
        const diagnostic: NormalSmartHintsDiagnostic = { action: event.action, state: event.state, timeoutMs: event.timeoutMs,
          elapsedMs: event.elapsedMs, ...(event.code ? { code: event.code } : {}), stage: selectionFix?.stage ?? trace?.stage ?? 'DISPATCH',
          requestKind: trace?.requestKind ?? 'NONE', ...(trace?.httpStatus === undefined ? {} : { httpStatus: trace.httpStatus }),
          timeoutOwner: event.code === 'TIMEOUT' ? 'MAIN_SERVICE' : null, schemaValidation: event.schemaValidation,
          maxOutputTokens: trace?.maxOutputTokens ?? P.maxOutputTokens, inferenceDispatched: trace?.inferenceDispatched ?? false, finishReason: trace?.finishReason ?? 'UNOBSERVED',
          usageMetadata: trace?.usageMetadata ?? null, envelopeJsonValidation: trace?.envelopeJsonValidation ?? 'NOT_RUN',
          outputJsonValidation: trace?.outputJsonValidation ?? 'NOT_RUN',
          model: GEMINI_MODEL, buildIdentity, diagnosticsVersion: 1,
          outputKind: (event.output ?? trace?.output)?.outputKind ?? 'UNOBSERVED', editCount: (event.output ?? trace?.output)?.editCount ?? null,
          validationReason: trace?.failure?.validation?.reason ?? null, validationField: trace?.failure?.validation?.field ?? null,
          ...(event.providerFailureSource ? { providerFailureSource: event.providerFailureSource } : {}), ...(selectionFix ? { selectionFix } : {}) }
        this.saveDiagnostic(diagnostic)
        try { this.options.onDiagnostic?.(diagnostic) }
        catch { /* Fixed-field diagnostics cannot affect execution or cleanup. */ }
      }, onHintApply: diagnostic => {
        // Keep the last rejection even after a successful retry. One fixed-enum
        // record; no source, candidate, offsets, IDs or exception text.
        if (diagnostic.reason === 'ACCEPT') return
        const data = JSON.stringify({ ...diagnostic, buildIdentity, diagnosticsVersion: 1, observedAt: this.clock() })
        this.diagnosticWriteTail = this.diagnosticWriteTail.then(async () => {
          const target = join(dirname(this.options.file), 'smart-hints-last-hint-apply.json'), temporary = `${target}.${randomUUID()}.tmp`
          await mkdir(dirname(target), { recursive: true })
          try { await writeFile(temporary, data, { flag: 'wx', mode: 0o600 }); await rename(temporary, target) }
          finally { await unlink(temporary).catch(() => {}) }
        }).catch(() => { try { this.options.onDiagnosticStoreError?.() } catch { /* Best effort only. */ } })
      } }, options.selectionFixGuard, this.coordinator, options.hintContextParser)
  }
  private saveDiagnostic(diagnostic: NormalSmartHintsDiagnostic): void {
    if (diagnostic.action !== 'SUGGEST_FIX') return
    const data = JSON.stringify({ ...diagnostic, observedAt: this.clock() })
    this.diagnosticWriteTail = this.diagnosticWriteTail.then(async () => {
      const target = join(dirname(this.options.file), 'smart-hints-last-suggest-fix.json'), temporary = `${target}.${randomUUID()}.tmp`
      await mkdir(dirname(target), { recursive: true })
      try { await writeFile(temporary, data, { flag: 'wx', mode: 0o600 }); await rename(temporary, target) }
      finally { await unlink(temporary).catch(() => {}) }
    }).catch(() => { try { this.options.onDiagnosticStoreError?.() } catch { /* Best effort; no unsafe error text. */ } })
  }
  async start(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.options.file, 'utf8'))
      const legacy = data?.version === 1
      const validLimit = data?.providerLimit === null || data?.providerLimit === undefined || data.providerLimit
        && Object.keys(data.providerLimit).sort().join() === 'kind,retryAt'
        && ['GEMINI_RATE_LIMIT', 'GEMINI_QUOTA_EXHAUSTED'].includes(data.providerLimit.kind)
        && (data.providerLimit.retryAt === null || Number.isSafeInteger(data.providerLimit.retryAt) && data.providerLimit.retryAt > 0)
      if (!data || Object.keys(data).filter(k => legacy || k !== 'providerLimit').sort().join() !== (legacy ? 'enabled,encryptedKey,requestLimit,usedRequests,version' : 'dailyLimit,enabled,encryptedKey,needsLimitReview,usedRequests,version')
        || ![1, 2].includes(data.version) || typeof data.enabled !== 'boolean' || !(data.encryptedKey === null
          || typeof data.encryptedKey === 'string' && data.encryptedKey.length <= 65536 && /^[A-Za-z0-9+/=]+$/.test(data.encryptedKey))
        || !Number.isSafeInteger(data.usedRequests) || data.usedRequests < 0
        || (legacy ? !Number.isSafeInteger(data.requestLimit) || data.requestLimit < data.usedRequests
          : !Number.isSafeInteger(data.dailyLimit) || data.dailyLimit < 1 || data.dailyLimit > 300 || typeof data.needsLimitReview !== 'boolean' || !validLimit)) throw Error('INVALID_CONFIG')
      this.document = legacy ? { version: 2, enabled: data.enabled, encryptedKey: data.encryptedKey,
        usedRequests: data.usedRequests, dailyLimit: Math.min(300, Math.max(1, data.requestLimit)), needsLimitReview: true, providerLimit: null }
        : { ...data, providerLimit: data.providerLimit ?? null }
    } catch (error) {
      if (!(error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        this.state = 'ERROR'; this.invalidStorage = true; return
      }
    }
    try {
      const slots = await readdir(`${this.options.file}.usage`)
      const used = slots.filter(name => /^[1-9][0-9]*\.json$/.test(name)).map(name => Number(name.slice(0, -5)))
      if (used.some(n => !Number.isSafeInteger(n))) throw Error('INVALID_USAGE')
      this.document.usedRequests = Math.max(this.document.usedRequests, ...used, 0)
      for (const name of slots.filter(name => /^[1-9][0-9]*\.json$/.test(name))) {
        const marker = JSON.parse(await readFile(`${this.options.file}.usage/${name}`, 'utf8'))
        if (!marker || Object.keys(marker).join() !== 'reservedAt' || !Number.isSafeInteger(marker.reservedAt) || marker.reservedAt < 0) throw Error('INVALID_USAGE')
        this.reservations.push(marker.reservedAt)
      }
    } catch (error) {
      if (!(error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        this.state = 'ERROR'; this.invalidStorage = true; return
      }
    }
    // Missing timestamps are evidence loss, not invented daily usage or a quota reset.
    if (this.document.usedRequests !== this.reservations.length) { this.state = 'ERROR'; this.invalidStorage = true; return }
    await this.restore()
  }
  private dailyUsed(): number {
    const day = Math.floor(this.clock() / 86400000)
    return this.reservations.filter(t => Math.floor(t / 86400000) >= day).length
  }
  snapshot(): SmartHintsSettingsSnapshot {
    let state = this.state
    const usedRequests = this.dailyUsed(), retryAt = Math.max(this.service.rateLimitReset() ?? 0, this.remoteLimit?.retryAt ?? 0) || null
    if (!this.document.enabled && state !== 'ERROR') state = 'DISABLED'
    else if (state === 'READY') {
      if (usedRequests >= this.document.dailyLimit) state = 'LOCAL_BUDGET_EXHAUSTED'
      else if (this.service.rateLimitReset()) state = 'LOCAL_RATE_LIMIT'
      else if (this.remoteLimit) state = this.remoteLimit.kind
    }
    return { enabled: this.document.enabled, provider: 'GEMINI', model: GEMINI_MODEL,
      hasKey: this.document.encryptedKey !== null, state, usedRequests, requestLimit: this.document.dailyLimit,
      remainingRequests: Math.max(0, this.document.dailyLimit - usedRequests), lifetimeRequests: this.document.usedRequests,
      resetAt: (Math.floor(this.clock() / 86400000) + 1) * 86400000, retryAt, needsLimitReview: this.document.needsLimitReview }
  }
  private persist(): Promise<void> {
    const task = this.writeTail.then(async () => {
      const temporary = `${this.options.file}.${randomUUID()}.tmp`
      await mkdir(dirname(this.options.file), { recursive: true })
      await writeFile(temporary, JSON.stringify(this.document), { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.options.file)
    })
    this.writeTail = task.catch(() => {})
    return task
  }
  private available(): boolean {
    return !this.stopped && this.document.enabled && !!this.key && this.state === 'READY'
      && !this.document.needsLimitReview && this.dailyUsed() < this.document.dailyLimit
      && (!this.remoteLimit?.retryAt || this.clock() >= this.remoteLimit.retryAt)
  }
  private async retireProvider(): Promise<void> {
    this.providerGeneration++
    for (const listener of this.chatRetirement) listener('PROVIDER_CHANGED')
    const drained = this.coordinator.cancelActive()
    await this.service.configureProvider()
    await drained
  }
  private async reserveDaily(signal: AbortSignal): Promise<void> {
    if (!this.available() || signal.aborted) throw new LocalBudgetError()
    this.document.usedRequests++ // No refund or toggle/restart reset, even on uncertain delivery.
    const reservedAt = this.clock(); this.reservations.push(reservedAt)
    try {
      const usage = `${this.options.file}.usage`; await mkdir(usage, { recursive: true })
      await writeFile(`${usage}/${this.document.usedRequests}.json`, JSON.stringify({ reservedAt }), { flag: 'wx', mode: 0o600 })
      await this.persist()
    } catch { this.state = 'ERROR'; throw new SmartProviderError('PROVIDER', undefined, undefined, 'RESERVATION_IO_ERROR') }
    if (signal.aborted || this.stopped || !this.document.enabled) throw new SmartProviderError('TIMEOUT')
  }
  private async restore(): Promise<void> {
    await this.retireProvider(); this.key = ''
    if (!this.document.enabled) { this.state = 'DISABLED'; return }
    if (!this.document.encryptedKey) { this.state = 'MISSING_KEY'; return }
    try {
      if (!await this.options.encryption.available()) { this.state = 'SECURE_STORAGE_UNAVAILABLE'; return }
      this.key = await this.options.encryption.decrypt(Buffer.from(this.document.encryptedKey, 'base64'))
      if (geminiKeyState(this.key) !== 'VALID') { this.key = ''; this.state = 'INVALID_KEY'; return }
      this.state = 'READY'
      await this.service.configureProvider({ mode: 'GEMINI_FREE', available: () => this.available() && !this.service.rateLimitReset(), dispose: () => { this.key = '' },
        run: async (capture, hints, signal, execution) => {
          if (!this.available()) throw new SmartProviderError('RATE_LIMIT')
          const adapter = new GeminiSmartHintsAdapter(this.options.transport, { value: () => this.key, clear: () => { this.key = '' } }, {
            beforeInference: signal => {
              if (!execution?.reserveInference) throw new SmartProviderError('PROVIDER', undefined, undefined, 'UNEXPECTED_ERROR')
              return execution.reserveInference(signal)
            }, onDiagnostic: diagnostic => {
              const previous = execution && this.traces.get(execution.requestId)
              if (execution && previous) {
                const httpStatus = diagnostic.httpStatus ?? (previous.requestKind === diagnostic.requestKind ? previous.httpStatus : undefined)
                this.traces.set(execution.requestId, { stage: diagnostic.stage, requestKind: diagnostic.requestKind,
                  ...(httpStatus === undefined ? {} : { httpStatus }), maxOutputTokens: diagnostic.maxOutputTokens,
                  inferenceDispatched: diagnostic.inferenceDispatched,
                  finishReason: diagnostic.finishReason, usageMetadata: diagnostic.usageMetadata,
                  envelopeJsonValidation: diagnostic.envelopeJsonValidation, outputJsonValidation: diagnostic.outputJsonValidation })
              }
            },
          })
          try {
            const output = await adapter.run(capture, hints, signal, execution)
            const trace = execution && this.traces.get(execution.requestId)
            if (trace) trace.output = smartOutputDiagnostic(output)
            if (this.remoteLimit) {
              this.document.providerLimit = null
              try { await this.persist() } catch { throw new SmartProviderError('PROVIDER', undefined, undefined, 'PERSISTENCE_IO_ERROR') }
            }
            return output
          }
          catch (error) { if (!signal.aborted) await this.failed(error); throw error }
        } })
    } catch { this.key = ''; this.state = 'ERROR' }
  }
  private async failed(error: unknown): Promise<void> {
    if (error instanceof LocalBudgetError) return
    if (!(error instanceof SmartProviderError)) { this.state = 'ERROR'; return }
    if (error.code === 'AUTH') this.state = 'INVALID_KEY'
    else if (error.code === 'RATE_LIMIT') {
      this.document.providerLimit = { kind: error.providerLimit?.kind ?? 'GEMINI_RATE_LIMIT',
        retryAt: error.providerLimit?.retryAfterMs ? this.clock() + error.providerLimit.retryAfterMs : null }
      this.state = 'READY' // Observation is separate from credentials; only a manual request may retry.
      try { await this.persist() } catch { this.state = 'ERROR' }
    }
    else if (error.code === 'NETWORK' || error.code === 'TIMEOUT') this.state = 'OFFLINE'
    else this.state = 'ERROR'
  }
  private async mutate(action: (signal: AbortSignal) => Promise<void>, check: () => void): Promise<SmartHintsSettingsSnapshot> {
    if (this.stopped || this.busy) throw denied('A Smart Hints configuration operation is already active.')
    if (this.invalidStorage) throw denied('Stored AI settings or usage records are invalid. Restore a verified backup; request counters were not reset.')
    check(); this.busy = true; const controller = new AbortController(); this.operation = controller
    try { await action(controller.signal); check(); return this.snapshot() }
    catch (error) {
      if (error instanceof DomainError) throw error
      throw denied('Smart Hints settings could not be changed. Check secure storage and try again.')
    } finally { this.operation = undefined; this.busy = false }
  }
  enable(enabled: boolean, check: () => void): Promise<SmartHintsSettingsSnapshot> {
    return this.mutate(async () => {
      if (enabled && !this.document.enabled && !await this.options.confirm('ENABLE', this.snapshot().remainingRequests)) return
      check(); this.document.enabled = enabled
      if (!enabled) { await this.retireProvider(); this.key = '' }
      await this.persist(); await this.restore()
    }, check)
  }
  configureKey(check: () => void, entry = this.options.promptKey): Promise<SmartHintsSettingsSnapshot> {
    return this.mutate(async signal => {
      if (!await this.options.encryption.available()) throw denied('Windows secure storage is unavailable. No key was requested.')
      await this.retireProvider()
      const secret = { value: await entry(signal) }
      if (secret.value === null) { await this.restore(); return }
      check()
      if (signal.aborted || geminiKeyState(secret.value) !== 'VALID') { secret.value = ''; await this.restore(); throw denied('API key format is invalid. No key was saved.') }
      try { this.document.encryptedKey = (await this.options.encryption.encrypt(secret.value)).toString('base64') }
      finally { secret.value = '' }
      check(); await this.persist(); await this.restore()
    }, check)
  }
  removeKey(check: () => void): Promise<SmartHintsSettingsSnapshot> {
    return this.mutate(async () => {
      if (!await this.options.confirm('REMOVE_KEY', 0)) return
      check(); this.document.enabled = false; this.document.encryptedKey = null
      await this.retireProvider(); this.key = ''; await this.persist(); this.state = 'DISABLED'
    }, check)
  }
  budget(dailyLimit: number, check: () => void): Promise<SmartHintsSettingsSnapshot> {
    return this.mutate(async () => {
      if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 300) throw denied('Choose between 1 and 300 requests per UTC day.')
      if (!await this.options.confirm('BUDGET', dailyLimit)) return
      check(); this.document.dailyLimit = dailyLimit; this.document.needsLimitReview = false
      this.providerGeneration++
      for (const listener of this.chatRetirement) listener('PROVIDER_CHANGED')
      await this.persist()
    }, check)
  }
  checkConnection(check: () => void): Promise<SmartHintsSettingsSnapshot> {
    return this.mutate(async signal => {
      check(); if (!this.document.enabled) return
      if (!this.key) await this.restore()
      if (!this.key) return
      try { await checkGeminiConnection(this.key, this.options.transport, signal); check(); this.state = 'READY' }
      catch (error) { await this.failed(error) }
    }, check)
  }
  cancel(): void { this.operation?.abort(); this.options.cancelPrompt?.() }
  async stop(): Promise<void> {
    this.stopped = true; this.cancel(); this.coordinator.beginShutdown()
    await this.chat.stop(); await this.service.stop(); await this.coordinator.drain()
    this.traces.clear(); this.key = ''; await this.writeTail; await this.diagnosticWriteTail
  }
}

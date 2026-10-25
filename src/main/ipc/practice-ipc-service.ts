import { createHash, randomUUID } from 'node:crypto'
import { PRACTICE_CHANNELS, validateCloseResolution, validateExerciseDraft, validatePracticePage, validatePracticeIdentity,
  validatePracticeDraftRead, type PracticeState, type Exercise, type ExerciseSummary, type PracticePageRequest } from '../../shared/contracts/practice'
import { validateEmptyObject } from '../../shared/contracts/validation'
import type { PersistenceService } from '../services/persistence/persistence-service'
import { savePracticeDraft } from '../services/learning/practice-store'
import type { ExercisePackageRegistry, PublicPackageLease } from '../services/learning/content/exercise-package-registry'
import { publicExercise } from '../services/learning/content/public-exercise-projection'
import { PACKAGE_POLICY as P } from '../services/learning/content/exercise-package-policy'
import type { IpcHandlerRegistry, IpcRequestContext } from './ipc-handler-registry'
import { DomainError } from '../errors/app-error'

export class PracticeIpcService {
  readonly name = 'PracticeIpcService'
  private removers: (() => void)[] = []
  private closing?: { owner: number; token: string; resolve: (saved: boolean) => void }
  private readonly epoch = randomUUID()
  private stopped = false
  private readonly reads = new Set<Promise<unknown>>()
  constructor(private readonly registry: IpcHandlerRegistry, private readonly store: PersistenceService<PracticeState>,
    private readonly authorize: (context: IpcRequestContext) => void,
    private readonly publish: (owner: number, channel: string, payload: unknown) => void,
    private readonly packages?: ExercisePackageRegistry) {}
  private bound<T>(value: T, maximum = P.pageBytes): T {
    if (Buffer.byteLength(JSON.stringify({ ok: true, value })) > maximum) throw new DomainError({ code: 'INVALID_INPUT', message: 'Practice response exceeds its transport limit.', retryable: false })
    return value
  }
  private async content<T>(id: string, context: IpcRequestContext, project: (lease: PublicPackageLease) => T | Promise<T>): Promise<T> {
    this.authorize(context)
    if (!this.packages?.has(id) || this.stopped) throw new DomainError({ code: 'INVALID_INPUT', message: 'Exercise unavailable.', retryable: true })
    let settled = false
    const check = () => { this.authorize(context); if (this.stopped) throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Practice owner closed.', retryable: false }) }
    const lease = await this.packages.acquirePublic(id, { owner: context, generation: 1, phase: 'public', isCurrent: () => {
      try { check(); return true } catch { return false }
    }, check, retain: task => { this.reads.add(task); void task.finally(() => this.reads.delete(task)).catch(() => {}) }, canRelease: () => settled })
    try { check(); return await project(lease) }
    finally { settled = true; lease.release() }
  }
  private async page(request: PracticePageRequest, context: IpcRequestContext) {
    this.authorize(context)
    if (!this.packages || this.packages.status().state !== 'AVAILABLE') throw new DomainError({ code: 'PROCESS_FAILED', message: 'Exercise registry unavailable.', retryable: true })
    const cursor = request.cursor, offset = cursor ? Number(cursor.split(':')[1]) : 0
    if (cursor && !cursor.startsWith(this.epoch + ':')) throw new DomainError({ code: 'INVALID_INPUT', message: 'Stale practice cursor.', retryable: false })
    const ids = [...this.packages.ids()]
    if (offset > ids.length) throw new DomainError({ code: 'INVALID_INPUT', message: 'Invalid practice cursor.', retryable: false })
    const end = Math.min(ids.length, offset + (request.limit ?? P.summaryDefault)), items: ExerciseSummary[] = []
    const packets: ReturnType<PublicPackageLease['packet']>[] = []
    const drafts = this.store.getValue().drafts
    try {
    for (const id of ids.slice(offset, end)) {
      let summary: ExerciseSummary
      try {
        summary = await this.content(id, context, async lease => {
          const m = lease.data.metadata
          const packet = await lease.packetCooperative(JSON.stringify({ id, chapter: m.metadata.chapter, title: m.metadata.title, difficulty: m.metadata.difficulty, available: true, hasDraft: drafts.some(d => d.exerciseId === id) }), P.pageBytes)
          packets.push(packet)
          return packet.data as ExerciseSummary
        })
      } catch (error) {
        this.authorize(context)
        if (this.stopped || this.packages.status().state !== 'AVAILABLE' || this.packages.readiness(id).phase !== 'UNAVAILABLE'
          || this.packages.readiness(id).failure === 'PACKAGE_RESIDENT_LIMIT') throw error
        summary = { id, chapter: null, title: id, difficulty: null, available: false, hasDraft: drafts.some(d => d.exerciseId === id) }
      }
      items.push(summary)
    }
    this.authorize(context)
    return this.bound({ items, nextCursor: end < ids.length ? `${this.epoch}:${end}` : null, recovered: this.store.recovered })
    } finally { packets.forEach(packet => packet.release()) }
  }
  start(): void {
    this.removers = [
      this.registry.register({ channel: PRACTICE_CHANNELS.load, validate: validateEmptyObject,
        handle: async (_, context) => {
          this.authorize(context)
          const state = this.store.getValue(), encoded: string[] = []
          let bytes = Buffer.byteLength(JSON.stringify(state))
          this.bound(state)
          for (const id of this.packages?.ids() ?? []) {
            const text = await this.content(id, context, lease => JSON.stringify(publicExercise(lease.data)))
            bytes += Buffer.byteLength(text) + 1
            if (bytes + 128 > P.pageBytes) throw new DomainError({ code: 'INVALID_INPUT', message: 'Use paged practice access.', retryable: false })
            encoded.push(text)
          }
          return this.bound({ exercises: encoded.map(s => JSON.parse(s) as Exercise), state, recovered: this.store.recovered })
        } }),
      this.registry.register({ channel: PRACTICE_CHANNELS.list, validate: validatePracticePage, handle: (request, context) => this.page(request, context) }),
      this.registry.register({ channel: PRACTICE_CHANNELS.detail, validate: validatePracticeIdentity, handle: (request, context) => this.content(request.exerciseId, context, async lease => {
        const language = this.store.getValue().languages.find(l => l.exerciseId === request.exerciseId)?.language ?? 'csharp'
        const owned = await lease.representCooperative(JSON.stringify({ exercise: publicExercise(lease.data), language }), P.publicDetailBytes)
        try { return this.bound(owned.data as { exercise: Exercise; language: typeof language }, P.publicDetailBytes) } finally { owned.release() }
      }) }),
      this.registry.register({ channel: PRACTICE_CHANNELS.draft, validate: validatePracticeDraftRead, handle: (request, context) => {
        this.authorize(context)
        const draft = this.store.getValue().drafts.find(d => d.exerciseId === request.exerciseId && d.language === request.language)
        const text = draft?.code ?? ''
        const revision = createHash('sha256').update(draft ? '1' : '0').update(text, 'utf16le').digest('hex')
        if (request.revision !== undefined && request.revision !== revision) throw new DomainError({ code: 'INVALID_INPUT', message: 'Draft changed during read; retry.', retryable: true })
        if (request.offset > text.length) throw new DomainError({ code: 'INVALID_INPUT', message: 'Invalid draft position.', retryable: false })
        const end = Math.min(text.length, request.offset + 4096)
        return this.bound({ text: text.slice(request.offset, end), nextOffset: end < text.length ? end : null, exists: !!draft, revision })
      } }),
      this.registry.register({ channel: PRACTICE_CHANNELS.save, validate: validateExerciseDraft,
        handle: async (draft, context) => {
          this.authorize(context)
          if (!this.packages?.has(draft.exerciseId) && !this.store.getValue().drafts.some(d => d.exerciseId === draft.exerciseId)) throw new DomainError({ code: 'INVALID_INPUT', message: 'Unknown exercise.', retryable: false })
          await savePracticeDraft(this.store, draft)
          return null
        } }),
      this.registry.register({ channel: PRACTICE_CHANNELS.resolveClose, validate: validateCloseResolution,
        handle: (request, context) => {
          this.authorize(context)
          if (!this.closing || this.closing.owner !== context.senderId || this.closing.token !== request.token) {
            throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Close request is no longer active.', retryable: false })
          }
          this.closing.resolve(request.saved); return null
        } }),
    ]
  }
  async prepareClose(owner: number): Promise<boolean> {
    if (this.closing) return false
    const token = randomUUID()
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => finish(false), 15000)
      const finish = (saved: boolean) => {
        clearTimeout(timer); this.closing = undefined
        if (!saved) this.resume(owner)
        resolve(saved)
      }
      this.closing = { owner, token, resolve: finish }
      this.publish(owner, PRACTICE_CHANNELS.prepareClose, { token })
    })
  }
  resume(owner: number): void { this.publish(owner, PRACTICE_CHANNELS.resume, {}) }
  beginShutdown(): void { this.stopped = true }
  async stop(): Promise<void> {
    this.beginShutdown()
    this.closing?.resolve(false)
    for (const remove of this.removers.splice(0)) remove()
    await Promise.allSettled([...this.reads])
  }
}

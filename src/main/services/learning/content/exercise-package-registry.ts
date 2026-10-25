import { PackageResidentBudget, type PackageAllocationScope } from './exercise-package-budget'
import type { ExercisePackageDescriptor, PublicPackageDescriptor, ValidatedExercisePackage, ValidatedPublicPackage } from './exercise-package-contracts'
import { PackageValidationError } from './exercise-package-policy'
import { PackageResourceError, type openAnchoredExerciseResources } from './exercise-package-resources'
import { parsePackageJsonWork } from './bounded-package-json'
import { PACKAGE_POLICY as P } from './exercise-package-policy'
import { PackageWorkControl, PackageWorkInterrupted, WORK_BARRIER, WORK_CHECK, ENTRY_WORK, freezePackageWork,
  runPackageWork, runPackageWorkSync, type PackageWork } from './exercise-package-work'

type Resources = Awaited<ReturnType<typeof openAnchoredExerciseResources>>
export interface PackagePrepareOwner {
  readonly owner: object
  readonly generation: number
  readonly phase: 'prepare' | 'public'
  isCurrent(): boolean
  check(): void
  retain(task: Promise<unknown>): void
  /** True only after all uses and required runtime cleanup have settled. */
  canRelease(): boolean
}
export type RegistryFailure = 'PACKAGE_BUSY' | 'PACKAGE_NOT_DECLARED' | 'PACKAGE_NOT_AVAILABLE'
  | 'PACKAGE_CANCELLED' | 'PACKAGE_LEASE_ACTIVE' | 'PACKAGE_LOAD_FAILED'
export class PackageRegistryError extends Error {
  constructor(readonly code: RegistryFailure) { super(code) }
}
export interface PackageBorrow {
  readonly data: ValidatedExercisePackage
  release(): void
}
export interface PackageLease extends PackageBorrow {
  copy(): PackageBorrow
  copyCooperative(): Promise<PackageBorrow>
  represent(json: string, maximum: number, representations?: number): { readonly data: unknown; release(): void }
  packet(json: string, maximum: number): { readonly data: unknown; release(): void }
  representCooperative(json: string, maximum: number, representations?: number): Promise<{ readonly data: unknown; release(): void }>
  packetCooperative(json: string, maximum: number): Promise<{ readonly data: unknown; release(): void }>
}
export interface PublicPackageLease {
  readonly data: ValidatedPublicPackage
  copy(): { readonly data: ValidatedPublicPackage; release(): void }
  copyCooperative(): Promise<{ readonly data: ValidatedPublicPackage; release(): void }>
  represent: PackageLease['represent']
  packet: PackageLease['packet']
  representCooperative: PackageLease['representCooperative']
  packetCooperative: PackageLease['packetCooperative']
  release(): void
}
type Capability = 'public' | 'official'
type Slot = { id: string; capability: Capability; data?: ValidatedExercisePackage; scope: PackageAllocationScope }
type Pin = { context: PackagePrepareOwner; slot: Slot; lease: PackageLease; invalid: boolean; released: boolean; copies: number; releaseRequested: boolean; pending?: Promise<unknown> }
type Flight = { id: string; capability: Capability; context: PackagePrepareOwner; task: Promise<PackageLease>; invalid: boolean }
type Phase = 'DECLARED' | 'LOADING' | 'VERIFIED_RESIDENT' | 'UNAVAILABLE'
type State = 'STARTING' | 'AVAILABLE' | 'UNAVAILABLE' | 'STOPPING' | 'STOPPED'

function code(error: unknown): string {
  if (error instanceof PackageWorkInterrupted) return 'PACKAGE_CANCELLED'
  return error instanceof PackageResourceError || error instanceof PackageValidationError || error instanceof PackageRegistryError
    ? error.code : 'PACKAGE_LOAD_FAILED'
}
const sameOwner = (a: PackagePrepareOwner, b: PackagePrepareOwner): boolean => a.owner === b.owner && a.generation === b.generation

/** One Main instance. Borrowed trees must not outlive their owner lease. This
 * ledger measures logical representations, never physical V8 heap or GC. */
export class ExercisePackageRegistry {
  readonly name = 'ExercisePackageRegistry'
  private state: State = 'STARTING'
  private failure?: string
  private resources?: Resources
  private readonly ledger = new PackageResidentBudget()
  private readonly manifestScope = this.ledger.scope()
  private entries = new Map<string, ExercisePackageDescriptor | PublicPackageDescriptor>()
  private phases = new Map<string, { phase: Phase; failure?: string }>()
  private startup?: Promise<void>
  private stopping?: Promise<void>
  private slot?: Slot
  private pin?: Pin
  private flight?: Flight
  private unpinned?: () => void
  private readonly packets = new Map<() => void, Pin>()
  private packetsDone?: () => void
  constructor(private readonly open: (scope: PackageAllocationScope, control: PackageWorkControl) => Promise<Resources>) {}

  /** Deliberately void: unrelated Project startup does not await disk I/O. */
  start(): void {
    if (this.startup || this.state !== 'STARTING') return
    const control = new PackageWorkControl(() => { if (this.state !== 'STARTING') throw new PackageRegistryError('PACKAGE_CANCELLED') })
    this.startup = Promise.resolve().then(() => this.open(this.manifestScope, control)).then(async resources => {
      if (this.state !== 'STARTING') return
      const entries = new Map<string, ExercisePackageDescriptor | PublicPackageDescriptor>()
      const phases = new Map<string, { phase: Phase; failure?: string }>()
      await runPackageWork((function* (): PackageWork<void> {
        yield WORK_BARRIER
        for (const entry of resources.manifest.packages) {
          yield ENTRY_WORK
          entries.set(entry.exerciseId, entry) // aliases, not cloned trees
          phases.set(entry.exerciseId, { phase: 'DECLARED' })
        }
        yield WORK_BARRIER
      })(), control)
      control.check()
      this.resources = resources; this.entries = entries; this.phases = phases
      this.state = 'AVAILABLE'
    }).catch(error => {
      this.failure = code(error)
      if (this.state === 'STARTING') this.state = 'UNAVAILABLE'
      this.manifestScope.release()
    }).finally(() => { this.manifestScope.clearRaw() })
  }
  whenStarted(): Promise<void> { this.start(); return this.startup ?? Promise.resolve() }
  status() { return Object.freeze({ state: this.state, failure: this.failure, declared: this.entries.size, ...this.ledger.snapshot() }) }
  readiness(id: string) {
    const entry = this.phases.get(id)
    const resident = entry?.phase === 'VERIFIED_RESIDENT'
    return Object.freeze({ declared: !!entry, phase: entry?.phase, failure: entry?.failure,
      structurallyVerified: resident, integrityVerified: resident, verifiedCapability: resident ? this.slot?.capability : undefined,
      resourcesBorrowable: resident && this.state === 'AVAILABLE', pinned: this.pin?.slot.id === id,
      publicRunReady: false, judgeReady: false, submitReady: false, releaseReady: false })
  }
  private valid(context: PackagePrepareOwner): void {
    if (!['prepare', 'public'].includes(context.phase) || !Number.isSafeInteger(context.generation) || context.generation < 0 || !context.isCurrent()) {
      throw new PackageRegistryError('PACKAGE_CANCELLED')
    }
    context.check()
  }
  /** Non-async preserves exact promise identity for same-owner single-flight. */
  has(id: string): boolean { return this.state === 'AVAILABLE' && this.entries.has(id) }
  ids(): IterableIterator<string> { return this.entries.keys() }
  acquirePublic(id: string, context: PackagePrepareOwner): Promise<PublicPackageLease> { return this.acquireContent(id, context, 'public') }
  acquire(id: string, context: PackagePrepareOwner): Promise<PackageLease> {
    if (context.phase !== 'prepare') return Promise.reject(new PackageRegistryError('PACKAGE_NOT_AVAILABLE'))
    return this.acquireContent(id, context, 'official')
  }
  private acquireContent(id: string, context: PackagePrepareOwner, capability: Capability): Promise<PackageLease> {
    try {
      if (this.state !== 'AVAILABLE') throw new PackageRegistryError('PACKAGE_NOT_AVAILABLE')
      this.valid(context)
      if (!this.entries.has(id)) throw new PackageRegistryError('PACKAGE_NOT_DECLARED')
      if (this.flight) {
        if (this.flight.id === id && this.flight.capability === capability && sameOwner(this.flight.context, context) && !this.flight.invalid) return this.flight.task
        throw new PackageRegistryError('PACKAGE_BUSY')
      }
      if (this.pin) {
        if (this.pin.slot.id === id && this.pin.slot.capability === capability && sameOwner(this.pin.context, context) && !this.pin.invalid && !this.pin.releaseRequested) return Promise.resolve(this.pin.lease)
        throw new PackageRegistryError('PACKAGE_BUSY')
      }
      if (this.slot?.id === id && this.slot.capability === capability) return Promise.resolve(this.borrow(this.slot, context))
      this.evict()
      const scope = this.ledger.scope()
      const flight: Flight = { id, capability, context, invalid: false, task: undefined! }
      const control = new PackageWorkControl(() => {
        this.valid(context)
        if (flight.invalid || this.state !== 'AVAILABLE') throw new PackageRegistryError('PACKAGE_CANCELLED')
      })
      const task = Promise.resolve().then(async () => {
        this.valid(context)
        if (flight.invalid || this.state !== 'AVAILABLE') throw new PackageRegistryError('PACKAGE_CANCELLED')
        // The sole Step2 reader owns all filesystem and integrity work.
        const data = (capability === 'public' ? (await this.resources!.readPublicPackage(id, scope, control)).data : (await this.resources!.readPackage(id, scope, control)).data) as ValidatedExercisePackage
        scope.clearRaw() // raw results no longer retained after verified parsing
        this.valid(context)
        if (flight.invalid || this.state !== 'AVAILABLE') throw new PackageRegistryError('PACKAGE_CANCELLED')
        await control.checkpoint({}, true)
        await runPackageWork(freezePackageWork(data), control)
        await control.checkpoint({}, true)
        control.check()
        const slot: Slot = { id, capability, data, scope }
        this.slot = slot
        this.phases.set(id, { phase: 'VERIFIED_RESIDENT' })
        return this.borrow(slot, context)
      }).catch(error => {
        // Step2 has settled its original reads and file-handle close before here.
        scope.release()
        this.phases.set(id, { phase: 'UNAVAILABLE', failure: code(error) })
        if (code(error) === 'PACKAGE_ROOT_INVALID' && this.state === 'AVAILABLE') {
          this.state = 'UNAVAILABLE'; this.failure = code(error)
        }
        throw new PackageRegistryError(code(error) === 'PACKAGE_CANCELLED' ? 'PACKAGE_CANCELLED' : 'PACKAGE_LOAD_FAILED')
      }).finally(() => { if (this.flight === flight) this.flight = undefined })
      flight.task = task
      this.flight = flight
      this.phases.set(id, { phase: 'LOADING' })
      // Admission retention must succeed before the microtask can begin I/O.
      try { context.retain(task) }
      catch (error) { flight.invalid = true; void task.catch(() => {}); throw error }
      return task
    } catch (error) { return Promise.reject(error instanceof PackageRegistryError ? error : new PackageRegistryError('PACKAGE_CANCELLED')) }
  }
  private borrow(slot: Slot, context: PackagePrepareOwner): PackageLease {
    const assert = () => {
      if (pin.released || pin.invalid || pin.releaseRequested || this.state !== 'AVAILABLE' || !context.isCurrent()) throw new PackageRegistryError('PACKAGE_CANCELLED')
    }
    const pin: Pin = { context, slot, invalid: false, released: false, copies: 0, releaseRequested: false, lease: undefined! }
    const finish = () => {
      if (pin.releaseRequested && pin.copies === 0 && !pin.pending && this.pin === pin) {
        pin.released = true; this.pin = undefined; this.unpinned?.(); this.unpinned = undefined
      }
    }
    function* representationWork(registry: ExercisePackageRegistry, json: string, maximum: number, representations = 1, packet = false): PackageWork<{ readonly data: unknown; release(): void }> {
        assertCompletion()
        if (!Number.isSafeInteger(representations) || representations < 1 || maximum > P.publicDetailBytes || maximum < 0) throw new PackageValidationError('PACKAGE_RESIDENT_LIMIT')
        const scope = registry.ledger.scope(), length = Buffer.byteLength(json)
        if (length > maximum) throw new PackageValidationError('PACKAGE_ASSET_LIMIT')
        let data: unknown
        try {
          const raw = scope.raw(length)
          data = yield* parsePackageJsonWork(Buffer.from(json), maximum, {
            raw: bytes => scope.raw(bytes),
            parsed: stats => scope.parsed({ canonicalBytes: stats.canonicalBytes * representations, nodes: stats.nodes * representations }),
          })
          yield* freezePackageWork(data)
          yield WORK_BARRIER
          raw(); assertCompletion()
        } catch (error) { scope.release(); throw error }
        if (!packet) pin.copies++
        let released = false
        const release = () => {
          if (released) return
          released = true; data = undefined; scope.release()
          if (packet) {
            registry.packets.delete(release)
            if (!registry.packets.size) { registry.packetsDone?.(); registry.packetsDone = undefined }
          } else { pin.copies--; finish() }
        }
        if (packet) registry.packets.set(release, pin)
        const read = () => { if (released || pin.invalid || registry.state !== 'AVAILABLE' || !context.isCurrent()) throw new PackageRegistryError('PACKAGE_CANCELLED'); return data }
        return Object.freeze({
          get data() { return read() }, release,
        })
      }
    const assertCompletion = () => {
      // A release request may wait for already-started work; it cannot abandon it.
      if (pin.released || pin.invalid || this.state !== 'AVAILABLE') throw new PackageRegistryError('PACKAGE_CANCELLED')
      this.valid(context)
    }
    function* copyWork(registry: ExercisePackageRegistry): PackageWork<PackageBorrow> {
      assertCompletion()
      const scope = registry.ledger.scope()
      let data: ValidatedExercisePackage | undefined
      try {
        yield WORK_BARRIER
        scope.parsed(slot.scope.statistics())
        yield WORK_CHECK
        data = structuredClone(slot.data!)
        yield WORK_BARRIER
        yield* freezePackageWork(data)
        yield WORK_BARRIER
        assertCompletion()
      } catch (error) { data = undefined; scope.release(); throw error }
      pin.copies++
      let released = false
      return Object.freeze({
        get data() { if (released || pin.invalid || registry.state !== 'AVAILABLE' || !context.isCurrent()) throw new PackageRegistryError('PACKAGE_CANCELLED'); return data! },
        release: () => { if (!released) { released = true; data = undefined; scope.release(); pin.copies--; finish() } },
      })
    }
    const cooperative = <T>(work: PackageWork<T>): Promise<T> => {
      try {
        assert()
        if (pin.pending) throw new PackageRegistryError('PACKAGE_BUSY')
        const control = new PackageWorkControl(assertCompletion)
        const task = Promise.resolve().then(() => {
          control.check()
          return runPackageWork(work, control)
        }).catch(error => { throw error instanceof PackageWorkInterrupted ? error.reason : error }).finally(() => {
          pin.pending = undefined; finish()
        })
        pin.pending = task // before any work or first yield, holds parent pin
        try { context.retain(task) }
        catch (error) { pin.invalid = true; void task.catch(() => {}); throw error }
        return task
      } catch (error) { work.return(undefined as never); return Promise.reject(error) }
    }
    const assertSync = () => { assert(); if (pin.pending) throw new PackageRegistryError('PACKAGE_BUSY') }
    pin.lease = Object.freeze({
      get data() { assert(); return slot.data! },
      represent: (json: string, maximum: number, representations = 1) => { assertSync(); return runPackageWorkSync(representationWork(this, json, maximum, representations)) },
      representCooperative: (json: string, maximum: number, representations = 1) => cooperative(representationWork(this, json, maximum, representations)),
      // Detached serialized DTO, not a borrow of the source package. Its exact
      // reservation stays registered until reply handoff/request cleanup.
      packet: (json: string, maximum: number) => { assertSync(); return runPackageWorkSync(representationWork(this, json, maximum, 1, true)) },
      packetCooperative: (json: string, maximum: number) => cooperative(representationWork(this, json, maximum, 1, true)),
      release: () => {
        if (pin.released) return
        if (!context.canRelease()) throw new PackageRegistryError('PACKAGE_LEASE_ACTIVE')
        pin.releaseRequested = true; finish()
      },
      copy: () => { assertSync(); return runPackageWorkSync(copyWork(this)) },
      copyCooperative: () => cooperative(copyWork(this)),
    })
    this.pin = pin
    return pin.lease
  }
  invalidate(owner: object, generation: number): void {
    for (const pin of this.packets.values()) if (pin.context.owner === owner && pin.context.generation === generation) pin.invalid = true
    if (this.flight?.context.owner === owner && this.flight.context.generation === generation) this.flight.invalid = true
    if (this.pin?.context.owner === owner && this.pin.context.generation === generation) this.pin.invalid = true
  }
  private evict(): void {
    if (!this.slot) return
    if (this.pin) throw new PackageRegistryError('PACKAGE_BUSY')
    this.phases.set(this.slot.id, { phase: 'DECLARED' })
    this.slot.data = undefined; this.slot.scope.release(); this.slot = undefined
  }
  beginShutdown(): void {
    if (this.state === 'STOPPED' || this.state === 'STOPPING') return
    this.state = 'STOPPING'
    if (this.flight) this.flight.invalid = true
    if (this.pin) this.pin.invalid = true
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    this.beginShutdown()
    this.stopping = (async () => {
      await this.startup
      await this.flight?.task.catch(() => {}) // caller retains classified rejection
      if (this.pin) await new Promise<void>(resolve => { this.unpinned = resolve })
      if (this.packets.size) await new Promise<void>(resolve => { this.packetsDone = resolve })
      this.evict(); this.resources = undefined; this.entries.clear(); this.phases.clear()
      this.manifestScope.release(); this.state = 'STOPPED'
    })()
    return this.stopping
  }
}

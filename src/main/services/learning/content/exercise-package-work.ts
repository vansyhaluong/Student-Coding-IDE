import { performance } from 'node:perf_hooks'

/** Private work charges, not admission ceilings. Work is authorized before
 * execution; actual batch charges settle before any suspension or error escapes. */
export interface PackageWorkCharge { chars?: number; nodes?: number; steps?: number; entries?: number; barrier?: boolean; guard?: boolean; batch?: PackageWorkBatch }
export interface PackageWorkQuantum { chars: number; nodes: number; steps: number; entries: number }
export const CHARACTER_WORK = Object.freeze({ chars: 1, steps: 1 })
export const NODE_WORK = Object.freeze({ nodes: 1, steps: 1 })
export const STEP_WORK = Object.freeze({ steps: 1 })
export const ENTRY_WORK = Object.freeze({ entries: 1, steps: 1 })
export const WORK_BARRIER = Object.freeze({ barrier: true })
export const WORK_CHECK = Object.freeze({ guard: true })
export type PackageWork<T> = Generator<PackageWorkCharge, T, void>

/** One logical transition still has the same charge as before batching. Only
 * handoffs are combined; no lookahead reservation or unused work is charged. */
export class PackageWorkBatch {
  readonly consumed: PackageWorkQuantum = { chars: 0, nodes: 0, steps: 0, entries: 0 }
  done = false
  constructor(readonly charge: Readonly<PackageWorkCharge>, private readonly perform: () => boolean) {}
  advance(quantum: PackageWorkQuantum): void {
    const chars = this.charge.chars ?? 0, nodes = this.charge.nodes ?? 0
    const steps = this.charge.steps ?? 0, entries = this.charge.entries ?? 0
    let limit = Infinity
    if (chars) limit = Math.min(limit, Math.floor(quantum.chars / chars))
    if (nodes) limit = Math.min(limit, Math.floor(quantum.nodes / nodes))
    if (steps) limit = Math.min(limit, Math.floor(quantum.steps / steps))
    if (entries) limit = Math.min(limit, Math.floor(quantum.entries / entries))
    if (!Number.isFinite(limit) || limit < 1 || this.done) throw Error('Invalid internal package batch')
    let performed = 0
    try {
      while (performed < limit && !this.done) { performed++; this.done = this.perform() }
    } finally {
      this.consumed.chars = performed * chars; this.consumed.nodes = performed * nodes
      this.consumed.steps = performed * steps; this.consumed.entries = performed * entries
    }
  }
}

/** Distinguishes lifecycle failures from untrusted-data validation failures. */
export class PackageWorkInterrupted extends Error {
  constructor(readonly reason: unknown) { super('Package work interrupted') }
}
export interface PackageWorkScheduler {
  now(): number
  yield(): Promise<void>
}
const scheduler: PackageWorkScheduler = {
  now: () => performance.now(),
  yield: () => new Promise<void>(resolve => setImmediate(resolve)),
}

/** One instance crosses every stage of an owned task. Ready I/O promises do not
 * reset a slice. The scheduler port is private; callers cannot change ceilings. */
export class PackageWorkControl {
  private since: number
  private chars = 0
  private nodes = 0
  private steps = 0
  private entries = 0
  private checkedChars = 0
  private checkedSteps = 0
  constructor(private readonly guard: () => void = () => {}, private readonly scheduling: PackageWorkScheduler = scheduler) {
    this.since = scheduling.now()
  }
  check(): void {
    try { this.guard() }
    catch (error) { throw new PackageWorkInterrupted(error) }
  }
  /** Return undefined on the common path: no per-character Promise microtasks. */
  checkpoint(work: PackageWorkCharge = {}, forceYield = false): Promise<void> | undefined {
    const chars = work.chars ?? 0, nodes = work.nodes ?? 0, steps = work.steps ?? 0, entries = work.entries ?? 0
    const cadence = this.checkedChars + chars >= 256 || this.checkedSteps + steps >= 64
    if (cadence || forceYield || work.barrier || work.guard) this.check()
    const expired = (cadence || work.guard) && this.scheduling.now() - this.since >= 5
    if (forceYield || work.barrier || expired || this.chars + chars > 8192 || this.nodes + nodes > 512
      || this.steps + steps > 2048 || this.entries + entries > 32) {
      return this.resume(work)
    }
    this.chars += chars; this.nodes += nodes; this.steps += steps; this.entries += entries
    this.checkedChars += chars; this.checkedSteps += steps
    if (cadence) { this.checkedChars = 0; this.checkedSteps = 0 }
  }
  advance(batch: PackageWorkBatch): Promise<void> | undefined {
    // Prepay the first transition through the unmodified policy. The tail stops
    // BEFORE the next guard boundary, leaving that transition to checkpoint().
    const pending = this.checkpoint(batch.charge)
    if (pending) return pending.then(() => this.consumeBatch(batch))
    this.consumeBatch(batch)
  }
  private consumeBatch(batch: PackageWorkBatch): void {
    const first = batch.charge
    const quantum = {
      chars: (first.chars ?? 0) + Math.min(8192 - this.chars, 255 - this.checkedChars),
      nodes: (first.nodes ?? 0) + 512 - this.nodes,
      steps: (first.steps ?? 0) + Math.min(2048 - this.steps, 63 - this.checkedSteps),
      entries: (first.entries ?? 0) + 32 - this.entries,
    }
    try { batch.advance(quantum) }
    finally {
      // Actual completed charges only, including the failing transition. No
      // catch-up yield, cadence reset, or allocation is hidden inside a batch.
      const chars = batch.consumed.chars - (first.chars ?? 0), nodes = batch.consumed.nodes - (first.nodes ?? 0)
      const steps = batch.consumed.steps - (first.steps ?? 0), entries = batch.consumed.entries - (first.entries ?? 0)
      this.chars += chars; this.nodes += nodes; this.steps += steps; this.entries += entries
      this.checkedChars += chars; this.checkedSteps += steps
    }
  }
  private async resume(work: PackageWorkCharge): Promise<void> {
    this.check()
    await this.scheduling.yield()
    this.check()
    this.since = this.scheduling.now()
    this.chars = work.chars ?? 0; this.nodes = work.nodes ?? 0
    this.steps = work.steps ?? 0; this.entries = work.entries ?? 0
    this.checkedChars = this.chars; this.checkedSteps = this.steps
  }
}
export function runPackageWorkSync<T>(work: PackageWork<T>): T {
  try {
    let step = work.next()
    while (!step.done) {
      step.value.batch?.advance({ chars: 8192, nodes: 512, steps: 64, entries: 32 })
      step = work.next()
    }
    return step.value
  } catch (error) {
    // Batch callbacks execute outside next(); deliver errors back to suspended
    // allocation owners just as the cooperative driver's interruption path does.
    try { work.throw(error) } catch { /* preserve the original failure */ }
    throw error
  } finally { work.return(undefined as never) }
}
export async function runPackageWork<T>(work: PackageWork<T>, control: PackageWorkControl): Promise<T> {
  try {
    control.check()
    let step = work.next()
    while (!step.done) {
      const pending = step.value.batch ? control.advance(step.value.batch) : control.checkpoint(step.value)
      if (pending) await pending
      step = work.next()
    }
    return step.value
  } catch (error) {
    // Inject interruption at the suspension point so allocation owners unwind
    // their catch/finally blocks rather than abandoning a paused scope.
    try { work.throw(error) } catch { /* original failure retains its identity */ }
    throw error
  } finally { work.return(undefined as never) }
}

/** Only parser-owned plain JSON trees enter this bounded postorder walk. */
export function* freezePackageWork(value: unknown): PackageWork<void> {
  type Frame = { value: object; keys?: string[]; index: number; length: number }
  const frames: Frame[] = []
  let next = value
  const child = (frame: Frame): unknown => frame.keys
    ? (frame.value as Record<string, unknown>)[frame.keys[frame.index]] : (frame.value as unknown[])[frame.index]
  const batch = new PackageWorkBatch(NODE_WORK, () => {
    if (next && typeof next === 'object' && !Object.isFrozen(next)) {
      const keys = Array.isArray(next) ? undefined : Object.keys(next)
      const frame: Frame = { value: next, keys, index: 0, length: keys ? keys.length : (next as unknown[]).length }
      if (frame.length) { frames.push(frame); next = child(frame); return false }
      Object.freeze(next)
    }
    while (frames.length) {
      const frame = frames[frames.length - 1]
      if (++frame.index < frame.length) { next = child(frame); return false }
      Object.freeze(frame.value); frames.pop()
    }
    return true
  })
  while (!batch.done) yield { batch }
}

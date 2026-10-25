import { PACKAGE_POLICY as P, PackageValidationError } from './exercise-package-policy'

export interface ParsedAllocation { canonicalBytes: number; nodes: number }
export interface PackageAllocationObserver {
  parsed(allocation: ParsedAllocation): void
  raw(bytes: number): () => void
}
/** Logical JSON ownership, not V8 heap/RSS. Limits are never caller-configurable. */
export class PackageResidentBudget {
  private parsedBytes = 0
  private nodes = 0
  private rawBytes = 0
  snapshot() { return Object.freeze({ parsedBytes: this.parsedBytes, nodes: this.nodes, rawBytes: this.rawBytes }) }
  scope(): PackageAllocationScope { return new PackageAllocationScope(this) }
  change(bytes: number, nodes: number, raw: number): void {
    const next = [this.parsedBytes + bytes, this.nodes + nodes, this.rawBytes + raw]
    if (!next.every(n => Number.isSafeInteger(n) && n >= 0)
      || next[0] > P.residentLogicalBytes || next[1] > P.residentNodes || next[2] > P.rawBufferBytes) {
      throw new PackageValidationError('PACKAGE_RESIDENT_LIMIT')
    }
    ;[this.parsedBytes, this.nodes, this.rawBytes] = next
  }
}
export class PackageAllocationScope implements PackageAllocationObserver {
  private bytes = 0
  private nodes = 0
  private released = false
  private readonly buffers = new Set<() => void>()
  constructor(private readonly ledger: PackageResidentBudget) {}
  private valid(...values: number[]): void {
    if (this.released || !values.every(n => Number.isSafeInteger(n) && n >= 0)) throw new PackageValidationError('PACKAGE_RESIDENT_LIMIT')
  }
  parsed({ canonicalBytes, nodes }: ParsedAllocation): void {
    this.valid(canonicalBytes, nodes); this.ledger.change(canonicalBytes, nodes, 0)
    this.bytes += canonicalBytes; this.nodes += nodes
  }
  raw(bytes: number): () => void {
    this.valid(bytes); this.ledger.change(0, 0, bytes)
    let released = false
    const release = () => { if (!released) { released = true; this.ledger.change(0, 0, -bytes); this.buffers.delete(release) } }
    this.buffers.add(release); return release
  }
  statistics(): ParsedAllocation { return { canonicalBytes: this.bytes, nodes: this.nodes } }
  clearRaw(): void { for (const release of this.buffers) release() }
  release(): void {
    if (this.released) return
    this.clearRaw(); this.ledger.change(-this.bytes, -this.nodes, 0)
    this.bytes = 0; this.nodes = 0; this.released = true
  }
}

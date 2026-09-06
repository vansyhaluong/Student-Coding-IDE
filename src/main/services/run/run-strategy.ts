import type { RunTarget } from '../../../shared/contracts/run'

/** Main-only output from target authorization; never a renderer request DTO. */
export interface AuthorizedRunTarget extends RunTarget {
  readonly canonicalRoot: string
  readonly canonicalFile: string
}

/** Resolved by Main's later PATH detector, never supplied by Renderer. */
export interface RunRuntime { readonly executable: string }
export interface PreparedRun {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly environmentAdditions: Readonly<Record<string, string>>
  readonly shell: false
}

/** Internal strategy seam; no dynamic registration or user-defined runners. */
export interface RunStrategy {
  supports(target: RunTarget): boolean
  prepare(target: AuthorizedRunTarget, runtime: RunRuntime): PreparedRun
}

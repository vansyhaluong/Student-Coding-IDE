import type { ProcessTreeOwnership } from '../process/process-tree-terminator'
import type { PreparedRun } from './run-strategy'

export type PipedProcessEvent =
  | { type: 'stdout' | 'stderr'; data: string }
  | { type: 'stdout-eof' | 'stderr-eof' }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string }

export type RunStdinMode = 'closed' | 'line-input'
export type RunInputWriteStatus = 'delivered' | 'broken' | 'cancelled'
export interface PipedRunProcess {
  readonly ownership: ProcessTreeOwnership
  /** Resolves after root exit and both EOF callbacks have been delivered. */
  readonly settled: Promise<void>
  /** Main-only resource cleanup, not the user-facing Stop/re-run policy. */
  close(): Promise<void>
  isReleased(): boolean
  /** Present only for a line-input process. JavaScript and build stay closed. */
  readonly stdin?: RunStdinMode
  writeInput?(bytes: Uint8Array): Promise<RunInputWriteStatus>
  /** Idempotent EOF after any in-flight write. This is not Stop. */
  closeInput?(): Promise<void>
}
export interface PipedProcessAdapter {
  /** Trusted Main preparation only. Windows policy: shell:false, filtered inherited
   * environment with no additions, bounded argv (empty items allowed).
   * `closed` is the default and the only mode for JavaScript/build.
   * Executable/cwd authorization remains Main's responsibility before creation. */
  create(run: PreparedRun, observe: (event: PipedProcessEvent) => void, stdin?: RunStdinMode): PipedRunProcess
}

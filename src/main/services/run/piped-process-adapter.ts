import type { ProcessTreeOwnership } from '../process/process-tree-terminator'
import type { PreparedRun } from './run-strategy'

export type PipedProcessEvent =
  | { type: 'stdout' | 'stderr'; data: string }
  | { type: 'stdout-eof' | 'stderr-eof' }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; message: string }

export interface PipedRunProcess {
  readonly ownership: ProcessTreeOwnership
  /** Resolves after root exit and both EOF callbacks have been delivered. */
  readonly settled: Promise<void>
  /** Main-only resource cleanup, not the user-facing Stop/re-run policy. */
  close(): Promise<void>
  isReleased(): boolean
}
export interface PipedProcessAdapter {
  create(run: PreparedRun, observe: (event: PipedProcessEvent) => void): PipedRunProcess
}

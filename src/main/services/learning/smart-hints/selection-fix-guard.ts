import type { SmartCapture } from './capture'
import type { ExerciseLanguage } from '../../../../shared/contracts/practice'

/** Main-private operation scope. Deadline uses the supplied Main clock. */
export interface SelectionFixScope {
  signal: AbortSignal; deadline: number; clock(): number; check(): void
}
export interface SelectionFixGuardLease {
  assertReady(scope: SelectionFixScope): Promise<void>
  verify(candidate: string, scope: SelectionFixScope): Promise<void>
  dispose(): Promise<void>
}
export interface SelectionFixGuard {
  availability?(language: ExerciseLanguage, scope: SelectionFixScope): Promise<boolean>
  preflight(capture: SmartCapture, scope: SelectionFixScope): Promise<SelectionFixGuardLease>
}

import type { Exercise } from '../../../../shared/contracts/practice'
/** Legacy adapter default retained for API compatibility. Production callers must
 * inject the admitted Registry public plan; no embedded catalogue or fallback. */
export const exercises: readonly Exercise[] = Object.freeze([])

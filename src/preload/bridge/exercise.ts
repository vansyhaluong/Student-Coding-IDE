import { EXERCISE_CHANNELS, type ExerciseApi, type ExerciseSnapshot } from '../../shared/contracts/exercise'
import { validateExerciseRunRequest, validateExerciseSessionReference, validateExerciseSnapshot, validateExerciseStopRequest } from '../../shared/contracts/exercise-validation'
import type { AppResult } from '../../shared/contracts/app-error'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

interface UnloadPort {
  addEventListener(event: 'unload', listener: () => void): void
  removeEventListener(event: 'unload', listener: () => void): void
}
const invalid = (operation: string): AppResult<ExerciseSnapshot> => ({ ok: false,
  error: { code: 'INVALID_INPUT', message: 'Invalid Learning request.', operation, retryable: false } })

/** Narrow semantic capability. State below only filters transport ordering, never grants ownership. */
export function createExerciseBridge(ipc: IpcRendererLike,
  lifetime: UnloadPort | undefined = typeof window === 'undefined' ? undefined : window): ExerciseApi {
  const listeners = new Set<(snapshot: ExerciseSnapshot) => void>()
  let current: ExerciseSnapshot | undefined, buffered: ExerciseSnapshot | undefined
  let highestGeneration = 0, runsPending = 0, subscribed = false, disposed = false
  const response = (value: unknown, channel: string) => parseAppResult(value,
    (v): v is ExerciseSnapshot => validateExerciseSnapshot(v).ok, channel)
  const accept = (snapshot: ExerciseSnapshot): boolean => {
    if (snapshot.generation < highestGeneration) return false
    if (snapshot.generation === highestGeneration && (!current || current.sessionId !== snapshot.sessionId
      || snapshot.sequence < current.sequence)) return false
    highestGeneration = snapshot.generation; current = structuredClone(snapshot); return true
  }
  const wrapped = (_event: unknown, value: unknown) => {
    if (disposed || !subscribed) return
    const result = validateExerciseSnapshot(value)
    if (!result.ok) return
    const s = result.value
    // Events can beat the invoke reply. Buffer one DTO; bind it only after Main's reply proves identity.
    if (runsPending && (!current || s.generation > current.generation)) {
      if (!buffered || s.generation > buffered.generation || (s.generation === buffered.generation && s.sequence > buffered.sequence)) buffered = s
      return
    }
    if (!current) return
    if (s.sessionId !== current.sessionId || s.generation !== current.generation || s.sequence <= current.sequence) return
    current = structuredClone(s)
    for (const listener of [...listeners]) if (listeners.has(listener)) {
      try { listener(structuredClone(s)) } catch { /* One consumer cannot disrupt transport or other subscriptions. */ }
    }
  }
  const dispose = () => {
    disposed = true; current = undefined; buffered = undefined; listeners.clear()
    if (subscribed) ipc.removeListener(EXERCISE_CHANNELS.changed, wrapped)
    subscribed = false; lifetime?.removeEventListener('unload', dispose)
  }
  lifetime?.addEventListener('unload', dispose)
  return {
    async run(request) {
      const r = validateExerciseRunRequest(request)
      if (disposed || !r.ok) return invalid(EXERCISE_CHANNELS.run)
      runsPending++
      const result = response(await invokeSafely(ipc, EXERCISE_CHANNELS.run, r.value), EXERCISE_CHANNELS.run)
      runsPending--
      if (result.ok && (disposed || !accept(result.value))) return invalid(EXERCISE_CHANNELS.run)
      const pending = buffered
      if (!runsPending) buffered = undefined
      if (result.ok && pending?.sessionId === result.value.sessionId && pending.generation === result.value.generation) wrapped({}, pending)
      return result
    },
    async snapshot(request) {
      const r = validateExerciseSessionReference(request)
      if (disposed || !r.ok) return invalid(EXERCISE_CHANNELS.snapshot)
      const result = response(await invokeSafely(ipc, EXERCISE_CHANNELS.snapshot, r.value), EXERCISE_CHANNELS.snapshot)
      if (result.ok && (result.value.sessionId !== r.value.sessionId || result.value.generation !== r.value.generation
        || disposed || !accept(result.value))) return invalid(EXERCISE_CHANNELS.snapshot)
      return result
    },
    async stop(request) {
      const r = validateExerciseStopRequest(request)
      if (disposed || !r.ok) return invalid(EXERCISE_CHANNELS.stop)
      if (current?.sessionId === r.value.sessionId && current.generation === r.value.generation) current = undefined
      const result = response(await invokeSafely(ipc, EXERCISE_CHANNELS.stop, r.value), EXERCISE_CHANNELS.stop)
      if (result.ok && (disposed || highestGeneration > r.value.generation || result.value.sessionId !== r.value.sessionId || result.value.generation !== r.value.generation)) return invalid(EXERCISE_CHANNELS.stop)
      return result
    },
    onChanged(listener) {
      if (disposed) return () => {}
      const subscription = (snapshot: ExerciseSnapshot) => listener(snapshot)
      listeners.add(subscription)
      if (!subscribed) { subscribed = true; ipc.on(EXERCISE_CHANNELS.changed, wrapped) }
      let removed = false
      return () => {
        if (removed) return
        removed = true; listeners.delete(subscription)
        if (!listeners.size && subscribed) { subscribed = false; ipc.removeListener(EXERCISE_CHANNELS.changed, wrapped) }
      }
    },
  }
}

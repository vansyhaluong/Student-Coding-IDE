import { ANALYSIS_CHANNELS as C, type AnalysisApi, type AnalysisStatus } from '../../shared/contracts/analysis'
import { validateAnalysisPrepare, validateAnalysisStart, validateAnalysisReference, isAnalysisStatus } from '../../shared/contracts/analysis-validation'
import type { ValidationResult } from '../../shared/contracts/validation'
import type { AppResult } from '../../shared/contracts/app-error'
import type { IpcRendererLike } from './lifecycle'
import type { LearningOrder } from './learning-order'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

/** Pull-based status: requestId + sequence + shared Learning epoch reject late replies. */
export function createAnalysisBridge(ipc: IpcRendererLike, order: LearningOrder,
  lifetime: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = typeof window === 'undefined' ? undefined : window): AnalysisApi {
  let disposed = false, current: { requestId: string; sequence: number } | undefined
  const invalid = (operation: string): AppResult<AnalysisStatus> => ({ ok: false, error: {
    code: 'INVALID_INPUT', operation, message: 'Invalid or stale analysis request.', retryable: false } })
  const dispose = () => { disposed = true; current = undefined; lifetime?.removeEventListener('unload', dispose) }
  lifetime?.addEventListener('unload', dispose)
  async function call<Q extends { requestId: string }>(channel: string, checked: ValidationResult<Q>): Promise<AppResult<AnalysisStatus>> {
    if (!checked.ok || disposed) return invalid(channel)
    const epoch = order.epoch, id = checked.value.requestId
    if (channel === C.prepare) {
      if (current?.requestId !== id) current = { requestId: id, sequence: -1 }
    } else if (current && current.requestId !== id) return invalid(channel)
    try {
      const result = parseAppResult(await invokeSafely(ipc, channel, checked.value), isAnalysisStatus, channel)
      if (disposed || epoch !== order.epoch || current && current.requestId !== id) return invalid(channel)
      if (!result.ok) return { ok: false, error: { code: result.error.code, operation: channel,
        message: 'The analysis request could not be completed.', retryable: false } }
      if (result.value.requestId !== id || current && result.value.sequence < current.sequence) return invalid(channel)
      current = { requestId: id, sequence: result.value.sequence }
      return { ok: true, value: structuredClone(result.value) }
    } catch { return invalid(channel) }
  }
  return { prepare: q => call(C.prepare, validateAnalysisPrepare(q)), start: q => call(C.start, validateAnalysisStart(q)),
    status: q => call(C.status, validateAnalysisReference(q)), cancel: q => call(C.cancel, validateAnalysisReference(q)) }
}

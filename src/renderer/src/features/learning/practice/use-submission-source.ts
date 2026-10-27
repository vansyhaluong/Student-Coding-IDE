import { useEffect, useRef, useState } from 'react'
import { SUBMISSION_API_LIMITS as L, type SubmissionApi, type SubmissionStores } from '../../../../../shared/contracts/submission'
import { isSubmissionSource } from '../../../../../shared/contracts/submission-validation'
import type { HistoryRow } from './use-submission-history'

export interface SourceView { phase: 'loading' | 'ready' | 'error'; code?: string; error?: string; stores?: SubmissionStores; loadedBytes: number }
const unavailable = 'Không thể đọc source đã lưu. Hãy quay lại và tải lại lịch sử.'
const messages = { NOT_FOUND: 'Không tìm thấy source đã commit.', IDENTITY_MISMATCH: 'Danh tính source không còn khớp. Hãy tải lại lịch sử.',
  CONFLICT: 'Source có bản ghi xung đột.', UNAVAILABLE: 'Kho source không khả dụng hoặc dữ liệu không đọc được.' }
const pendingReadBackoff = [50, 150] as const

/** E5 verifies the hash bound into the opaque reference in Main on every chunk. No internal hash crosses this boundary. */
export function useSubmissionSource(row: HistoryRow, active: boolean,
  api: SubmissionApi | undefined = window.studentIde.learning.submission) {
  const [retry, setRetry] = useState(0)
  const current = useRef<object | undefined>(undefined)
  const [state, setState] = useState<{ row: HistoryRow; view: SourceView }>({ row, view: { phase: 'loading', loadedBytes: 0 } })
  useEffect(() => {
    if (!active || !api) return
    const token = {}; current.current = token
    const live = () => current.current === token
    const publish = (view: SourceView) => { if (live()) setState({ row, view }) }
    let timer: ReturnType<typeof setTimeout> | undefined, resume: (() => void) | undefined
    const wait = (ms: number) => new Promise<void>(resolve => {
      resume = resolve
      timer = setTimeout(() => { timer = undefined; resume = undefined; resolve() }, ms)
    })
    const retire = () => {
      if (live()) current.current = undefined
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      const finish = resume; resume = undefined; finish?.()
    }
    publish({ phase: 'loading', loadedBytes: 0 })
    void (async () => {
      let offset = 0, code = '', stores: SubmissionStores | undefined, pendingRetries = 0
      try {
        if (row.source.byteLength > L.sourceCodeUnits * 3) throw Error(unavailable)
        for (;;) {
          if (!live()) return
          const result = await api.source({ reference: row.source.reference, offset, limit: L.sourceChunkBytes })
          if (!live()) return
          if (!result.ok || !isSubmissionSource(result.value)) throw Error(unavailable)
          const chunk = result.value; stores = chunk.stores
          if (!chunk.ok) {
            // Retry only an explicitly pending target, never hide a real store failure.
            const pending = chunk.reason === 'UNAVAILABLE' && stores[row.key.storeKind].state === 'RECOVERY_PENDING'
              && Object.values(stores).every(store => store.readable || store.state === 'RECOVERY_PENDING')
            if (pending && pendingRetries < pendingReadBackoff.length) {
              publish({ phase: 'loading', stores, loadedBytes: offset })
              await wait(pendingReadBackoff[pendingRetries++])
              continue // Same reference/offset; no chunk has been appended.
            }
            const message = Object.hasOwn(messages, chunk.reason) ? messages[chunk.reason as keyof typeof messages] : unavailable
            publish({ phase: 'error', error: message, stores, loadedBytes: offset }); return
          }
          if (chunk.reference !== row.source.reference || chunk.key.storeKind !== row.key.storeKind || chunk.key.recordId !== row.key.recordId
            || chunk.submissionId !== row.submissionId || chunk.sourceRevision !== row.source.revision
            || chunk.totalBytes !== row.source.byteLength || chunk.offset !== offset || chunk.nextOffset - offset > L.sourceChunkBytes
            || !chunk.stores[row.key.storeKind].readable) throw Error(unavailable)
          code += chunk.code; offset = chunk.nextOffset
          if (code.length > L.sourceCodeUnits) throw Error(unavailable)
          if (chunk.eof) {
            if (new TextEncoder().encode(code).byteLength !== row.source.byteLength) throw Error(unavailable)
            publish({ phase: 'ready', code, stores, loadedBytes: offset }); return
          }
          publish({ phase: 'loading', stores, loadedBytes: offset })
        }
      } catch { publish({ phase: 'error', error: unavailable, stores, loadedBytes: offset }) }
    })()
    const leave = () => {
      publish({ phase: 'error', error: unavailable, loadedBytes: 0 })
      retire()
    }
    window.addEventListener('pagehide', leave)
    return () => { window.removeEventListener('pagehide', leave); retire() }
  }, [api, row, active, retry])
  return { view: !api ? { phase: 'error' as const, loadedBytes: 0, error: unavailable }
    : state.row === row && active ? state.view : { phase: 'loading' as const, loadedBytes: 0 },
    retry: () => setRetry(v => v + 1) }
}

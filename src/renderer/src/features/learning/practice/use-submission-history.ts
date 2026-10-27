import { useEffect, useRef, useState } from 'react'
import type { CommittedSubmissionSummary, SubmissionApi, SubmissionHistory, SubmissionStatus } from '../../../../../shared/contracts/submission'
import { isSubmissionHistory } from '../../../../../shared/contracts/submission-validation'

export type HistoryRow = Pick<CommittedSubmissionSummary, 'key' | 'submissionId' | 'submittedAt' | 'language' | 'verdict' | 'exerciseId' | 'source'>
type Page = Extract<SubmissionHistory, { ok: true }>
export interface HistoryView {
  rows: HistoryRow[]; loading: boolean; loadingMore: boolean; page?: Omit<Page, 'rows'>
  error?: string; notice?: string; stores?: SubmissionHistory['stores']; moreBlocked?: boolean
}
interface Context {
  exerciseId: string; live: boolean; busy: boolean; refreshPending: boolean; version: number
  rows: HistoryRow[]; cursor: string | null; cursors: Set<string>; savedKey?: string
}
const initial = (): HistoryView => ({ rows: [], loading: true, loadingMore: false })
const readError = 'Không thể đọc lịch sử nộp bài. Hãy tải lại.'

/** Read-only pagination over E5 committed summaries; never creates a Submit or progress index. */
export function useSubmissionHistory(exerciseId: string, active: boolean, status?: SubmissionStatus,
  api: SubmissionApi | undefined = window.studentIde.learning.submission, contextKey = exerciseId) {
  const savedKey = status?.exerciseId === exerciseId && status.storage.state === 'saved'
    ? `${status.storage.recordKey.storeKind}/${status.storage.recordKey.recordId}` : undefined
  const context = useRef<Context | undefined>(undefined)
  const [state, setState] = useState<{ exerciseId: string; contextKey: string; view: HistoryView }>({ exerciseId, contextKey, view: initial() })
  const current = (ctx: Context) => ctx.live && context.current === ctx
  const update = (ctx: Context, change: Partial<HistoryView>) => {
    if (current(ctx)) setState(s => ({ exerciseId: ctx.exerciseId, contextKey, view: { ...s.view, ...change } }))
  }
  const refresh = (ctx: Context, notice?: string) => {
    if (!current(ctx)) return
    ctx.version++; ctx.rows = []; ctx.cursor = null; ctx.cursors.clear()
    setState({ exerciseId: ctx.exerciseId, contextKey, view: { ...initial(), notice } })
    if (ctx.busy) ctx.refreshPending = true
    else void load(ctx, false)
  }
  const load = async (ctx: Context, append: boolean) => {
    if (!api || !current(ctx) || ctx.busy || append && !ctx.cursor) return
    const version = ctx.version, cursor = append ? ctx.cursor! : undefined
    ctx.busy = true
    update(ctx, { loading: !append, loadingMore: append, error: undefined })
    try {
      const result = await api.history({ scope: 'ALL', exerciseId: ctx.exerciseId, limit: 32, ...(cursor ? { cursor } : {}) })
      if (!current(ctx) || version !== ctx.version) return
      if (!result.ok || !isSubmissionHistory(result.value)) throw Error(readError)
      const history = result.value
      if (!history.ok) {
        if (history.reason === 'STALE_CURSOR' && append) {
          refresh(ctx, 'Lịch sử đã thay đổi. Đang tải lại từ đầu.'); return
        }
        update(ctx, { stores: history.stores })
        throw Error(history.reason === 'CONFLICT' ? 'Lịch sử có bản ghi xung đột; không thể xác nhận danh sách.' : readError)
      }
      const existing = new Set(ctx.rows.map(row => row.key.recordId)), submissions = new Set(ctx.rows.map(row => row.submissionId))
      if (history.rows.length > 32 || history.rows.some(row => row.exerciseId !== ctx.exerciseId
        || existing.has(row.key.recordId) || submissions.has(row.submissionId))
        || history.nextCursor && (history.nextCursor === cursor || ctx.cursors.has(history.nextCursor) || !history.rows.length)
        || ctx.rows.length + history.rows.length > history.knownCount) {
        throw Error('Lịch sử đã thay đổi hoặc có bản ghi xung đột. Hãy tải lại từ đầu.')
      }
      const rows = history.rows.map(({ key, submissionId, submittedAt, language, verdict, exerciseId, source }) => ({ key, submissionId, submittedAt, language, verdict, exerciseId, source }))
      ctx.rows = append ? [...ctx.rows, ...rows] : rows
      ctx.cursor = history.nextCursor
      if (cursor) ctx.cursors.add(cursor)
      const page: Omit<Page, 'rows'> = { ok: true, stores: history.stores, coverage: history.coverage,
        countScope: history.countScope, knownCount: history.knownCount, total: history.total, nextCursor: history.nextCursor }
      update(ctx, { rows: ctx.rows, page, stores: history.stores, error: undefined, moreBlocked: false })
    } catch (error) {
      if (current(ctx) && version === ctx.version) update(ctx, { error: error instanceof Error
        && [readError, 'Lịch sử có bản ghi xung đột; không thể xác nhận danh sách.', 'Lịch sử đã thay đổi hoặc có bản ghi xung đột. Hãy tải lại từ đầu.'].includes(error.message)
        ? error.message : readError, moreBlocked: true })
    } finally {
      ctx.busy = false
      if (current(ctx)) {
        if (ctx.refreshPending) { ctx.refreshPending = false; void load(ctx, false) }
        else if (version === ctx.version) update(ctx, { loading: false, loadingMore: false })
      }
    }
  }
  useEffect(() => {
    if (!active || !api) return
    const ctx: Context = { exerciseId, live: true, busy: false, refreshPending: false, version: 0,
      rows: [], cursor: null, cursors: new Set(), savedKey }
    context.current = ctx; refresh(ctx)
    return () => { ctx.live = false; if (context.current === ctx) context.current = undefined }
    // Saved records refresh below; ordinary status sequences/edits do not reset pages.
  }, [api, exerciseId, active, contextKey])
  useEffect(() => {
    const ctx = context.current
    if (ctx && current(ctx) && savedKey && ctx.savedKey !== savedKey) { ctx.savedKey = savedKey; refresh(ctx) }
  }, [savedKey])
  const view = state.exerciseId === exerciseId && state.contextKey === contextKey ? state.view : initial()
  return { view: !api ? { ...initial(), loading: false, error: 'Lịch sử nộp bài chưa khả dụng.' } : view,
    refresh: () => { const ctx = context.current; if (ctx) refresh(ctx) },
    loadMore: () => { const ctx = context.current; if (ctx && !view.moreBlocked) void load(ctx, true) },
  }
}

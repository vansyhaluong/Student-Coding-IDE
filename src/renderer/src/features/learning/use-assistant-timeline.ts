import { useEffect, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { useLearningAssistant } from './use-learning-assistant'
import type { useSmartHints, SmartHintsView } from './practice/use-smart-hints'

export type AssistantLease = { kind: 'CHAT' | 'SMART' | 'HINT_APPLY'; id: symbol }
export type AssistantSlot = MutableRefObject<AssistantLease | undefined>
type Complete = NonNullable<SmartHintsView['result']>
export type AssistantRow = { id: string; kind: 'CHAT'; operationId?: string; phase: string; error?: string }
  | { id: string; kind: 'SMART'; operationId?: string; phase: SmartHintsView['phase']; action?: SmartHintsView['action'];
    result?: Complete; source?: string; message?: string; sourceRevision?: number }

/** Display ordering only. No rows are supplied to either provider or edit APIs. */
export function useAssistantTimeline(chat: ReturnType<typeof useLearningAssistant>, hints?: ReturnType<typeof useSmartHints>) {
  const [state, setState] = useState<{ sessionId?: string; rows: AssistantRow[] }>({ rows: [] })
  const view = hints?.view
  useEffect(() => {
    setState(before => {
      const sessionId = chat.session?.sessionId ?? before.sessionId
      const rows = sessionId && before.sessionId && sessionId !== before.sessionId ? [] : [...before.rows]
      const upsert = (next: AssistantRow) => {
        const at = rows.findIndex(r => r.id === next.id)
        if (at < 0) rows.push(next)
        else {
          const old = rows[at]
          rows[at] = old.kind === 'SMART' && next.kind === 'SMART' && next.phase === 'cancelled' && old.result
            ? { ...next, result: old.result, source: old.source, sourceRevision: old.sourceRevision } : next
        }
      }
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.kind === 'SMART' && row.id !== `smart:${view?.requestId}` && ['preparing', 'consent', 'starting', 'running', 'recovering'].includes(row.phase))
          rows[i] = { ...row, phase: 'cancelled', message: 'Snapshot không còn hiệu lực.' }
        if (row.kind === 'CHAT' && !chat.requestId && ['Loading', 'Consent'].includes(row.phase))
          rows[i] = { ...row, phase: 'Cancelled' }
      }
      if (chat.requestId) upsert({ id: `chat:${chat.requestId}`, kind: 'CHAT', operationId: chat.status?.operationId,
        phase: chat.phase, error: chat.error || (chat.status?.state === 'FAILED' ? chat.status.code : undefined) })
      // Opening/getting a backend session can supply already committed pairs.
      let historical = 0
      for (const message of chat.session?.messages ?? []) {
        if (!rows.some(r => r.kind === 'CHAT' && r.operationId === message.operationId))
          rows.splice(historical++, 0, { id: `chat-operation:${message.operationId}`, kind: 'CHAT', operationId: message.operationId, phase: 'Complete' })
      }
      if (view?.requestId) upsert({ id: `smart:${view.requestId}`, kind: 'SMART', operationId: view.operationId,
        phase: view.phase, action: view.action, result: view.result, source: hints?.capturedSource,
        sourceRevision: view.result?.binding.sourceRevision ?? view.prepared?.binding.sourceRevision, message: view.message })
      return { sessionId, rows: rows.slice(-64) }
    })
  }, [chat.requestId, chat.status, chat.phase, chat.error, chat.session, view, hints?.capturedSource])
  return state.rows
}

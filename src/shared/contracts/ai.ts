import { validateAppError, type AppError, type AppResult } from './app-error'
import { validateExactObject, type ValidationResult } from './validation'

export interface AiMessage { role: 'user' | 'assistant'; content: string }
export interface AiChatRequest { messages: AiMessage[] }
export type AiStatus = 'ready' | 'ollama-unavailable' | 'model-unavailable'
export interface AiChatSession { requestId: string }
export type AiChatEvent =
  | { requestId: string; type: 'chunk'; content: string }
  | { requestId: string; type: 'complete' | 'stopped' }
  | { requestId: string; type: 'error'; error: AppError }
export interface AiApi {
  getStatus(): Promise<AppResult<AiStatus>>
  startChat(request: AiChatRequest): Promise<AppResult<AiChatSession>>
  stopChat(requestId: string): Promise<AppResult<null>>
  onChatEvent(listener: (event: AiChatEvent) => void): () => void
}
export const AI_CHANNELS = { getStatus: 'ai:get-status', startChat: 'ai:start-chat', stopChat: 'ai:stop-chat', event: 'ai:chat-event' } as const

export function validateAiChatRequest(value: unknown): ValidationResult<AiChatRequest> {
  const object = validateExactObject(value, ['messages'])
  if (!object.ok) return object
  const messages: AiMessage[] = []
  if (!Array.isArray(object.value.messages) || object.value.messages.length === 0) {
    return { ok: false, issues: [{ path: '$.messages', message: 'Expected chat messages' }] }
  }
  for (const candidate of object.value.messages) {
    const message = validateExactObject(candidate, ['role', 'content'])
    if (!message.ok) return message
    const { role, content } = message.value
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
      return { ok: false, issues: [{ path: '$.messages', message: 'Invalid chat message' }] }
    }
    messages.push({ role, content })
  }
  return { ok: true, value: { messages } }
}

export function isAiStatus(value: unknown): value is AiStatus {
  return value === 'ready' || value === 'ollama-unavailable' || value === 'model-unavailable'
}
export function validateAiSession(value: unknown): ValidationResult<AiChatSession> {
  const object = validateExactObject(value, ['requestId'])
  if (!object.ok) return object
  const { requestId } = object.value
  return typeof requestId === 'string' && /^[a-f0-9-]{36}$/.test(requestId)
    ? { ok: true, value: { requestId } }
    : { ok: false, issues: [{ path: '$.requestId', message: 'Invalid request identity' }] }
}

export function validateAiEvent(value: unknown): ValidationResult<AiChatEvent> {
  const object = validateExactObject(value, ['requestId', 'type', 'content', 'error'])
  if (!object.ok) return object
  const { requestId, type, content, error } = object.value
  const session = validateAiSession({ requestId })
  if (!session.ok) return session
  const id = session.value.requestId
  if (type === 'chunk' && typeof content === 'string' && content.length > 0 && !('error' in object.value))
    return { ok: true, value: { requestId: id, type, content } }
  if ((type === 'complete' || type === 'stopped') && !('content' in object.value) && !('error' in object.value))
    return { ok: true, value: { requestId: id, type } }
  if (type === 'error' && !('content' in object.value)) {
    const valid = validateAppError(error)
    if (valid.ok) return { ok: true, value: { requestId: id, type, error: valid.value } }
  }
  return { ok: false, issues: [{ path: '$', message: 'Invalid AI event' }] }
}

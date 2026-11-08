import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { IpcHandlerRegistry, type IpcMainLike, type IpcInvokeEventLike } from '../../../src/main/ipc/ipc-handler-registry'
import { LearningChatIpcService } from '../../../src/main/ipc/learning-chat-ipc-service'
import { SmartHintsConfiguration } from '../../../src/main/services/learning/smart-hints/configuration'
import { createLearningChatBridge } from '../../../src/preload/bridge/learning-chat'
import { GEMINI_MODEL } from '../../../src/main/services/learning/smart-hints/gemini-transport'
import { CHAT_CHANNELS as C, type ChatContextInput, type ChatPrepare, type ChatPrepared, type ChatScope } from '../../../src/shared/contracts/learning-chat'
import type { AppResult } from '../../../src/shared/contracts/app-error'
import { defaultSource, selection } from './chat'
import { output } from './smart-hints'
import type { SelectionFixGuard } from '../../../src/main/services/learning/smart-hints/selection-fix-guard'

export const ipcKey = 'AQ.SYNTHETIC_CHAT_IPC_KEY'
export const chatReply = { kind: 'CHAT_REPLY', text: 'Advisory 🐟\r\nIllustrative code only.' }
export const chatEnvelope = (value: unknown = chatReply) => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] })
class Owner extends EventEmitter { dead = false; constructor(readonly id: number) { super() } isDestroyed() { return this.dead } }
export async function chatIpcFixture(selectionFixGuard?: SelectionFixGuard,
  hintContextParser?: Pick<import('../../../src/main/services/learning/smart-hints/selection-fix-parser-runtime').MainSelectionFixGuard, 'classifyHint' | 'validateHintFunction'>) {
  const root = await mkdtemp(join(tmpdir(), 'chat-ipc-'))
  let now = Date.now(), catalogue = true
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
  const send = vi.fn(async (r: Request): Promise<Response> => {
    if (r.method === 'GET') return Response.json({ name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 })
    const body = await r.clone().json(), input = JSON.parse(body.contents.at(-1).parts[0].text)
    return Response.json(chatEnvelope(input.action ? output : chatReply))
  })
  const config = new SmartHintsConfiguration({ file: join(root, 'settings.json'), clock: () => now, selectionFixGuard, hintContextParser,
    encryption: { available: async () => true, encrypt: async text => Buffer.from(`encrypted:${text}`), decrypt: async data => data.toString().slice(10) },
    transport: { send }, promptKey: async () => ipcKey, confirm: async () => true })
  await config.start(); await config.configureKey(() => {}); await config.enable(true, () => {})
  const owner = new Owner(1), other = new Owner(2)
  const frame = { processId: 10, frameToken: 'main', detached: false, isDestroyed: () => false }
  let allowed = frame
  const event = { sender: { id: 1 }, senderFrame: frame }
  const ipc = new LearningChatIpcService(registry, config.chat, c => {
    if (![1, 2].includes(c.senderId) || c.senderFrame?.frameToken !== allowed.frameToken || c.senderFrame.processId !== allowed.processId) throw Error('UNTRUSTED_PRIVATE_ERROR')
  }, c => {
    if (!catalogue || (c.kind === 'PRACTICE' ? c.exerciseId !== 'synthetic' : c.courseId !== 'synthetic' || c.chapter !== 2)) throw Error('PRIVATE_CATALOGUE')
  })
  ipc.observe(owner); ipc.observe(other); ipc.start()
  const invoke = (channel: string, value: unknown, from: IpcInvokeEventLike = event) => handlers.get(channel)!(from, value)
  const transport = { invoke: vi.fn((c: string, q: unknown) => invoke(c, q)), on: vi.fn(), removeListener: vi.fn() }
  const api = createLearningChatBridge(transport)
  const context: ChatContextInput = { kind: 'PRACTICE', exerciseId: 'synthetic', language: 'javascript', modelId: randomUUID(), modelVersion: 1,
    sourceRevision: 1, eol: 'CRLF', source: defaultSource }
  const open = async () => {
    const result = await api.openSession({ context }); if (!result.ok) throw Error('FIXTURE_OPEN_FAILED'); return result.value
  }
  const prepare = async (sessionId: string, scope: ChatScope = 'QUESTION_ONLY', question = 'Explain this.'): Promise<ChatPrepared> => {
    const s = await api.getSession({ sessionId }); if (!s.ok) throw Error('FIXTURE_SESSION_FAILED')
    const q: ChatPrepare = scope === 'QUESTION_ONLY' ? { sessionId, requestId: randomUUID(), revision: s.value.revision, scope, question, attachment: null }
      : scope === 'QUESTION_WITH_SOURCE' ? { sessionId, requestId: randomUUID(), revision: s.value.revision, scope, question, attachment: { source: defaultSource } }
      : { sessionId, requestId: randomUUID(), revision: s.value.revision, scope, question, attachment: { source: defaultSource, selection: selection(defaultSource) } }
    const result = await api.prepare(q); if (!result.ok) throw Error('FIXTURE_PREPARE_FAILED'); return result.value
  }
  return { config, ipc, registry, owner, other, frame, event, context, api, transport, invoke, send, open, prepare, root,
    rawOpen: () => invoke(C.openSession, { context }),
    advance: (ms: number) => { now += ms }, unavailable: () => { catalogue = false },
    replaceFrame: () => { allowed = { ...frame, frameToken: randomUUID() }; return { sender: { id: 1 }, senderFrame: allowed } },
    close: async () => { await ipc.stop(); await config.stop(); registry.dispose(); await rm(root, { recursive: true, force: true }) } }
}
export const requireValue = <T>(result: AppResult<T>): T => { if (!result.ok) throw Error('TEST_EXPECTED_SUCCESS'); return result.value }

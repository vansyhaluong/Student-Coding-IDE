import { EventEmitter } from 'node:events'
import { vi } from 'vitest'
import { SmartHintsService } from '../../../src/main/services/learning/smart-hints/service'
import type { SmartProvider } from '../../../src/main/services/learning/smart-hints/adapter'
import { SharedExecutionCoordinator } from '../../../src/main/services/learning/smart-hints/execution-coordinator'
import { ExerciseIpcService } from '../../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../../src/main/ipc/ipc-handler-registry'
import type { ExerciseService } from '../../../src/main/services/learning/exercise-service'
import { createSmartHintsBridge } from '../../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../../src/preload/bridge/learning-order'
import type { SmartPrepare, SmartStatus, SmartOutput } from '../../../src/shared/contracts/smart-hints'
import { capture } from './smart-hints'

class Owner extends EventEmitter { readonly id = 1; isDestroyed() { return false } }
export function consentFixture() {
  let now = Date.now(), runEvidence = false, release: (() => void) | undefined, held: Promise<void> | undefined
  const reservations = vi.fn(async () => {})
  let inference = 0
  const run = vi.fn<SmartProvider['run']>(async (c, _history, signal, execution): Promise<SmartOutput> => {
    inference++
    await execution?.reserveInference?.(signal)
    if (held) await held
    switch (c.action.kind) {
      case 'HINT': return { kind: 'HINT', thinking: `F6 hint ${inference}`, steps: ['Compare inputs'], code: { language: c.binding.language, text: 'return x + 1;' }, evidence: [] }
      case 'EXPLAIN': return { kind: 'EXPLANATION', syntax: 'F6 explain', variables: 'x', controlFlow: 'return', algorithm: 'compare', illustrativeExamples: [] } satisfies SmartOutput
      case 'DETECT_ISSUES': return { kind: 'DETECTION', issues: [] }
      case 'SUGGEST_FIX': return { kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'F6 no fix' }
      default: return { kind: 'ANALYSIS', hypotheses: ['F6 analysis'], suggestions: [], evidence: [] } satisfies SmartOutput
    }
  })
  const provider: SmartProvider = { mode: 'GEMINI_FREE', run }
  const guard = { availability: vi.fn(async () => true), preflight: vi.fn(async () => ({
    assertReady: vi.fn(async () => {}), verify: vi.fn(async () => {}), dispose: vi.fn(async () => {}),
  })) }
  const service = new SmartHintsService(provider, () => now, undefined, { timeoutMs: 10000 }, guard,
    new SharedExecutionCoordinator(() => now, reservations), { classifyHint: async () => 'UNCERTAIN', validateHintFunction: async () => true })
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const registry = new IpcHandlerRegistry({ handle: (name, handler) => { handlers.set(name, handler) }, removeHandler: name => { handlers.delete(name) } })
  const owner = new Owner(), frame = { processId: 10, frameToken: 'main', detached: false, isDestroyed: () => false }
  const event = { sender: { id: 1 }, senderFrame: frame }
  const ipc = new ExerciseIpcService(registry, { retirePublicRunReceipt() {} } as unknown as ExerciseService,
    context => { if (context.senderId !== 1 || context.senderFrame !== frame) throw Error('denied') }, () => {}, undefined, undefined,
    { service, capture: async (q, generation, check) => {
      check(); const c = capture(q, generation)
      if (runEvidence) c.runContext = { kind: 'RUN_PUBLIC', parameterTypes: ['int32'], returnType: 'int32', observations: [], failure: null, locations: [] }
      return c
    } })
  ipc.observe(owner); ipc.start()
  const invoke = vi.fn(async (channel: string, value: unknown) => handlers.get(channel)!(event, value))
  const api = createSmartHintsBridge({ invoke, on: vi.fn(), removeListener: vi.fn() }, createLearningOrder())
  async function prepare(q: SmartPrepare) {
    const r = await api.prepare(q)
    if (!r.ok || r.value.state !== 'PREPARED' || !r.value.consent) throw Error('Expected F6 prepared capture')
    return r.value as Extract<SmartStatus, { state: 'PREPARED' }> & { consent: NonNullable<Extract<SmartStatus, { state: 'PREPARED' }>['consent']> }
  }
  return { service, provider, run, reservations, guard, api, prepare, invoke, handlers, event, owner,
    evidence: (enabled: boolean) => { runEvidence = enabled }, advance: (ms: number) => { now += ms },
    hold: () => { held = new Promise<void>(r => { release = r }) },
    async close() { release?.(); await ipc.stop(); registry.dispose() } }
}

/** @vitest-environment jsdom */
import { useEffect, useRef, useState } from 'react'
import { EventEmitter } from 'node:events'
import { webcrypto, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { PracticeWorkspace } from '../../src/renderer/src/features/learning/practice/PracticeWorkspace'
import { capturePracticeSelection, capturePracticeHintApply, type PracticeHintEditor } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { applySmartFix } from '../../src/renderer/src/features/learning/practice/smart-hint-edits'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { MainSelectionFixGuard } from '../../src/main/services/learning/smart-hints/selection-fix-parser-runtime'
import { SelectionFixError } from '../../src/main/services/learning/smart-hints/selection-fix-diagnostics'
import { SelectionFixCsharpSdkResolver } from '../../src/main/services/learning/smart-hints/selection-fix-sdk-resolver'
import { SharedExecutionCoordinator } from '../../src/main/services/learning/smart-hints/execution-coordinator'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { ExerciseIpcService } from '../../src/main/ipc/exercise-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import type { ExerciseService } from '../../src/main/services/learning/exercise-service'
import { createSmartHintsBridge } from '../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { SMART_HINT_CHANNELS as C } from '../../src/shared/contracts/smart-hints'
import type { StudentIdeApi } from '../../src/shared/contracts'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'
import type { useSubmission } from '../../src/renderer/src/features/learning/practice/use-submission'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { registry } from '../fixtures/learning/smart-hints'

type Monaco = typeof import('monaco-editor/editor/editor.api')
const host = vi.hoisted(() => ({ monaco: undefined as unknown as Monaco, model: undefined as editor.ITextModel | undefined,
  ready: undefined as (() => void) | undefined, select: undefined as ((a: number, b: number) => void) | undefined,
  edits: vi.fn(), diff: vi.fn() }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: {
  Uri: { parse: (s: string) => host.monaco.Uri.parse(s) },
  editor: { createModel: (...a: Parameters<Monaco['editor']['createModel']>) => host.monaco.editor.createModel(...a),
    createDiffEditor: (_node: unknown, options: unknown) => {
      host.diff(options)
      return { onDidUpdateDiff: (cb: () => void) => { host.ready = cb; return { dispose() {} } }, getLineChanges: () => [],
        setModel() {}, dispose() {}, updateOptions() {}, layout() {} }
    }, colorize: async () => '', tokenize: (s: string) => s.split('\n').map(() => [{ offset: 0, type: '' }]) },
} }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({ PracticeEditor: (props: {
  code: string; language: ExerciseLanguage; exercise: { id: string }; sourceRevision: number; applyBlocked: boolean;
  onChange(s: string): void; onHintEditor(v: PracticeHintEditor | undefined): void
}) => {
  const latest = useRef(props); latest.current = props
  useEffect(() => {
    const m = host.monaco, id = randomUUID(), model = m.editor.createModel(props.code, props.language, m.Uri.parse(`practice:///${props.exercise.id}/solution.${props.language === 'csharp' ? 'cs' : 'js'}`))
    host.model = model
    let range = new m.Selection(1, 1, 1, 1)
    host.select = (a, b) => { range = m.Selection.fromPositions(model.getPositionAt(a), model.getPositionAt(b)) }
    const ed = { getModel: () => model, getSelection: () => range, getSelections: () => [range], getScrollTop: () => 0, getScrollLeft: () => 0,
      setScrollPosition() {}, focus() {}, pushUndoStop: () => model.pushStackElement(),
      executeEdits: (_id: string, edits: editor.IIdentifiedSingleEditOperation[]) => { host.edits(); model.pushEditOperations([range], edits, () => [range]); return true },
    } as unknown as editor.IStandaloneCodeEditor
    const context = () => ({ exerciseId: latest.current.exercise.id, language: latest.current.language, source: latest.current.code,
      sourceRevision: latest.current.sourceRevision, modelId: id })
    props.onHintEditor({ capture: () => capturePracticeSelection(ed, context().exerciseId, context().language, id),
      captureHintApply: () => capturePracticeHintApply(ed, context()), focus() {},
      applyFix: fix => applySmartFix(ed, fix, { ...context(), blocked: latest.current.applyBlocked }, (a, b, c, d) => new m.Selection(a, b, c, d)) })
    const sub = model.onDidChangeContent(() => latest.current.onChange(model.getValue()))
    return () => { sub.dispose(); props.onHintEditor(undefined); model.dispose() }
  }, [])
  return <pre aria-label="F2 real model">{props.code}</pre>
} }))
let parser: MainSelectionFixGuard
const closers: (() => Promise<void>)[] = []
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
  host.monaco = await import('monaco-editor/editor/editor.api')
  host.monaco.languages.register({ id: 'csharp' }); host.monaco.languages.register({ id: 'javascript' })
  const sdk = await new SelectionFixCsharpSdkResolver().resolve({ signal: new AbortController().signal, deadline: performance.now() + 15000 })
  if (sdk.state !== 'AVAILABLE') throw Error('Real pinned SDK required')
  parser = new MainSelectionFixGuard({ assetDirectory: resolve(process.env.SH_FIX_PARSER_ASSETS ?? 'out/hint-apply-f2/main/smart-hints-parser'), sdkResolver: { resolve: async () => sdk } })
}, 30000)
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  host.edits.mockClear(); host.diff.mockClear()
})
afterEach(async () => { cleanup(); for (const close of closers.splice(0)) await close(); host.monaco.editor.getModels().forEach(m => m.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const wrap = (l: ExerciseLanguage, body: string) => l === 'csharp' ? `public class Solution { public int solve(int x) {${body}} }` : `function solve(x) {${body}}`
function gate() { let release!: () => void; const promise = new Promise<void>(r => { release = r }); return { promise, release } }
async function fixture(language: ExerciseLanguage, partial = false, code?: string, body?: string) {
  // Observe fixed private errors without replacing parser decisions or budgets.
  const guardFailures: unknown[] = [], observed = parser as unknown as { bounded(...args: unknown[]): Promise<unknown> }
  const bounded = observed.bounded.bind(parser)
  vi.spyOn(observed, 'bounded').mockImplementation(async (...args) => {
    try { return await bounded(...args) }
    catch (error) { if (error instanceof SelectionFixError) guardFailures.push(error.selectionFix); throw error }
  })
  let now = Date.now(), held: { channel: string; gate: ReturnType<typeof gate> } | undefined, invalid = false, malformedFailure = false, forgedResolved = false
  const pkg = registry(); pkg.data.starters[language] = wrap(language, '')
  const source = wrap(language, body ?? (partial ? 'return x;' : ''))
  const reservations = vi.fn(async () => {}), run = vi.fn(async (_c, _h, signal: AbortSignal, execution) => {
    await execution.reserveInference(signal)
    return { kind: 'HINT', thinking: 'F2 thinking', steps: ['F2 steps'], code: { language, text: code ?? (partial ? 'return x + 1;' : wrap(language, 'return x + 1;')) }, evidence: [] }
  })
  let lastExecution: { state: string; code?: string; schemaValidation: string } | undefined
  const service = new SmartHintsService({ mode: 'FAKE', run }, () => now, undefined,
    { timeoutMs: 10000, onExecution: e => { lastExecution = { state: e.state, code: e.code, schemaValidation: e.schemaValidation } } },
    parser, new SharedExecutionCoordinator(() => now, reservations), parser)
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>(), ipcRegistry = new IpcHandlerRegistry({ handle: (c, h) => { handlers.set(c, h) }, removeHandler: c => { handlers.delete(c) } })
  class Owner extends EventEmitter { id = 1; isDestroyed() { return false } }
  const owner = new Owner(), frame = { processId: 10, frameToken: 'main', detached: false, isDestroyed: () => false }
  const ipc = new ExerciseIpcService(ipcRegistry, { retirePublicRunReceipt() {} } as unknown as ExerciseService, () => {}, () => {}, undefined, undefined,
    { service, capture: (q, g, check) => captureSmartHints(pkg.packages, q, g, check) })
  ipc.observe(owner); ipc.start(); closers.push(async () => { await ipc.stop(); ipcRegistry.dispose() })
  const invoke = vi.fn(async (c: string, value: unknown) => {
    const result = await handlers.get(c)!({ sender: { id: 1 }, senderFrame: frame }, value)
    if (held?.channel === c) await held.gate.promise
    if (malformedFailure && c === C.prepareHintApply && result && typeof result === 'object' && 'error' in result) return { ok: false, error: { ...result.error as object, details: { requestId: 'forged', noGrant: true }, retryable: true } }
    if (invalid && c === C.prepareHintApply && result && typeof result === 'object' && 'value' in result) return { ok: true, value: { ...result.value as object, proposalId: 'forged' } }
    if (forgedResolved && c === C.prepareHintApply && result && typeof result === 'object' && 'value' in result) {
      const value = result.value as { target: object }
      return { ok: true, value: { ...value, target: { ...value.target, kind: 'PARSER_RESOLVED' } } }
    }
    return result
  })
  const api = createSmartHintsBridge({ invoke, on() {}, removeListener() {} }, createLearningOrder(), undefined)
  window.studentIde = { learning: { smartHints: api } } as StudentIdeApi
  function Harness({ active = true }: { active?: boolean }) {
    const [current, setCurrent] = useState(source), [revision, setRevision] = useState(1)
    return <PracticeWorkspace exercise={{ ...exercises[0], id: 'synthetic' }} exercises={[]} drafts={[]} chapter={2} language={language}
      ready locked={false} active={active} code={current} sourceRevision={revision} execution={{ status: 'idle', busy: false, message: '' }}
      submission={{ view: { busy: false } } as ReturnType<typeof useSubmission>}
      onOpen={() => {}} onLanguage={() => {}} onRun={() => {}} onRestore={() => false} onReplace={() => {}}
      onEdit={value => { setCurrent(value); setRevision(r => r + 1) }} />
  }
  const ui = render(<Harness />)
  await screen.findByLabelText('F2 real model'); fireEvent.click(screen.getByRole('button', { name: 'Learning Assistant' }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Hint' }) as HTMLButtonElement).disabled).toBe(false), { timeout: 10000 })
  fireEvent.click(screen.getByRole('button', { name: 'Hint' })); await screen.findByText('Đồng ý gửi snapshot', {}, { timeout: 10000 })
  fireEvent.click(screen.getByText('Đồng ý gửi snapshot'))
  try { await screen.findByText('F2 thinking', {}, { timeout: 10000 }) }
  catch { throw Error(`Hint fixture did not complete: ${JSON.stringify({ execution: lastExecution, guardFailures })}`) }
  const region = () => screen.getByRole('region', { name: 'Hint' })
  return { ...ui, Harness, api, invoke, pkg, source, run, reservations, region, expire: () => { now += 300001 },
    hold: (channel: string) => { const g = gate(); held = { channel, gate: g }; return g }, invalid: () => { invalid = true }, malformedFailure: () => { malformedFailure = true }, forgeResolved: () => { forgedResolved = true } }
}
async function apply() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })) }) }
async function diff() { await screen.findByRole('dialog', {}, { timeout: 10000 }); act(() => host.ready?.()) }
async function confirm() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply Fix' })) }) }

describe.each(['csharp', 'javascript'] as const)('%s F2 toolbar → real IPC/parser → Diff → native edit', language => {
  it('F4 infers a unique nested insertion through real Preload/IPC and preserves native Undo/Redo', async () => {
    const decl = language === 'csharp' ? 'int' : 'let'
    const f = await fixture(language, true, 'sum += i;', `${decl} sum = 0;\nfor (${decl} i = 1; i <= x; i++) {\n// missing\n}\nreturn sum;`)
    host.select!(0, 0)
    await apply(); await diff(); expect(host.edits).not.toHaveBeenCalled()
    await confirm(); await screen.findByText('Applied')
    const next = host.model!.getValue()
    expect(next).toContain('sum += i;'); expect(next.replace('sum += i;', '')).toBe(f.source)
    expect(host.edits).toHaveBeenCalledOnce()
    await act(async () => { await host.model!.undo() }); expect(host.model!.getValue()).toBe(f.source)
    await act(async () => { await host.model!.redo() }); expect(host.model!.getValue()).toBe(next)
    expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
  }, 15000)
  it('F4 return-boundary caret replaces one statement through correlated parser-resolved proposal', async () => {
    const f = await fixture(language, true), at = f.source.indexOf('return')
    host.select!(at, at); await apply(); await diff(); await confirm(); await screen.findByText('Applied')
    expect(host.model!.getValue()).toBe(wrap(language, 'return x + 1;'))
    expect(host.model!.getValue().match(/return/g)).toHaveLength(1)
  }, 15000)
  it('F4 Preload rejects forged parser-resolved correlation for a nonempty selection', async () => {
    const f = await fixture(language, true), at = f.source.indexOf('return')
    host.select!(at, at + 9); f.forgeResolved(); await apply()
    await within(f.region()).findByText('Failed', {}, { timeout: 10000 })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(host.edits).not.toHaveBeenCalled()
    expect(host.model!.getValue()).toBe(f.source)
  }, 15000)
  it('F4 a resolved caret grant cannot survive source change followed by Undo before ACK', async () => {
    const f = await fixture(language, true), at = f.source.indexOf('return')
    host.select!(at, at); await apply(); await diff()
    const held = f.hold(C.consumeHintApply); await confirm()
    await act(async () => {
      host.model!.pushEditOperations([], [{ range: new host.monaco.Range(1, 1, 1, 1), text: ' ' }], () => [])
      await host.model!.undo()
    })
    held.release(); await within(f.region()).findByText('Stale')
    expect(host.edits).not.toHaveBeenCalled(); expect(host.model!.getValue()).toBe(f.source)
    expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
  }, 15000)
  it('copies independently, template body Diff is readonly and one manual batch supports Undo/Redo', async () => {
    const f = await fixture(language), writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const header = f.region().querySelector('.assistant-code-header')!
    expect(header.firstElementChild?.textContent).toBe(language === 'csharp' ? 'C#' : 'JavaScript')
    fireEvent.click(within(f.region()).getByRole('button', { name: 'Copy code' })); await screen.findByText('Đã sao chép code.')
    expect(writeText).toHaveBeenCalledExactlyOnceWith(wrap(language, 'return x + 1;'))
    await apply(); await diff(); expect(host.edits).not.toHaveBeenCalled(); expect(host.model!.getValue()).toBe(f.source)
    expect(host.diff).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true, originalEditable: false }))
    await confirm(); await screen.findByText('Applied'); expect(host.edits).toHaveBeenCalledOnce()
    expect(host.model!.getValue()).toBe(wrap(language, 'return x + 1;'))
    await act(async () => { await host.model!.undo() }); expect(host.model!.getValue()).toBe(f.source)
    await act(async () => { await host.model!.redo() }); expect(host.model!.getValue()).toBe(wrap(language, 'return x + 1;'))
    expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
  }, 15000)
  it.each(['selection', 'caret'] as const)('partial code with explicit %s uses only the frozen target', async kind => {
    const f = await fixture(language, true, kind === 'caret' ? 'x = x + 1;' : undefined), at = f.source.indexOf('return')
    host.select!(at, kind === 'caret' ? at : at + 9)
    await apply(); host.select!(0, 0); await diff(); await confirm(); await screen.findByText('Applied')
    expect(host.model!.getValue()).toBe(wrap(language, kind === 'caret' ? 'x = x + 1;return x;' : 'return x + 1;'))
  }, 15000)
  it.each(['ambiguous', 'empty invalid caret', 'invalid candidate'] as const)('%s fails closed with stage/reason and bounded manual retry', async kind => {
    const f = await fixture(language, true, kind === 'invalid candidate' ? 'return (x + ;' : undefined), at = f.source.indexOf('return')
    host.select!(kind === 'ambiguous' ? 0 : at + (kind === 'empty invalid caret' ? 2 : 0), kind === 'ambiguous' ? f.source.length - 1 : at + (kind === 'empty invalid caret' ? 2 : 9))
    await apply(); await within(f.region()).findByText('Failed', {}, { timeout: 10000 }); expect(screen.queryByRole('dialog')).toBeNull()
    expect(host.edits).not.toHaveBeenCalled(); expect(host.model!.getValue()).toBe(f.source)
    expect(screen.getByText(kind === 'invalid candidate' ? /CANDIDATE_INVALID \(CANDIDATE\)/ : /TARGET_INVALID \(TARGET\)/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(false)
    expect(f.invoke.mock.calls.filter(([c]) => c === C.prepareHintApply)).toHaveLength(1)
    if (kind !== 'invalid candidate') {
      host.select!(at, at + 9)
      await apply(); await diff(); await confirm(); await screen.findByText('Applied')
      expect(host.model!.getValue()).toBe(wrap(language, 'return x + 1;'))
      await act(async () => { await host.model!.undo() }); expect(host.model!.getValue()).toBe(f.source)
      expect(f.invoke.mock.calls.filter(([c]) => c === C.prepareHintApply)).toHaveLength(2)
      expect(f.run).toHaveBeenCalledOnce(); expect(f.reservations).toHaveBeenCalledOnce()
    }
  }, 15000)
  it('malformed no-grant failure never unlocks Apply or arms an edit', async () => {
    const f = await fixture(language, true), at = f.source.indexOf('return')
    f.malformedFailure(); host.select!(at + 2, at + 2)
    await apply(); await within(f.region()).findByText('Failed', {}, { timeout: 10000 })
    expect(screen.getByText(/UNSUPPORTED:/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
    expect(host.edits).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull()
  }, 15000)
  it('duplicate clicks and double confirmation create one preparation and one edit', async () => {
    const f = await fixture(language), hold = f.hold(C.prepareHintApply)
    await apply(); await apply(); expect(screen.getByText('Preparing')).toBeTruthy()
    expect((within(f.region()).getByRole('button', { name: 'Copy code' }) as HTMLButtonElement).disabled).toBe(false)
    hold.release(); await diff(); const consume = f.hold(C.consumeHintApply)
    await confirm(); await confirm(); consume.release(); await screen.findByText('Applied')
    expect(host.edits).toHaveBeenCalledOnce(); expect(f.invoke.mock.calls.filter(([c]) => c === C.prepareHintApply)).toHaveLength(1)
    expect(f.invoke.mock.calls.filter(([c]) => c === C.consumeHintApply)).toHaveLength(1)
  }, 15000)
  it('Discard while consume acknowledgement is held prevents a late transaction', async () => {
    const f = await fixture(language)
    await apply(); await diff(); const hold = f.hold(C.consumeHintApply)
    await confirm(); fireEvent.click(screen.getByText('Discard')); hold.release()
    await within(f.region()).findByText('Discarded')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(host.edits).not.toHaveBeenCalled(); expect(host.model!.getValue()).toBe(f.source)
  }, 15000)
  it('source edit followed by Undo cannot revive a held preparation', async () => {
    const f = await fixture(language), hold = f.hold(C.prepareHintApply)
    await apply()
    await act(async () => {
      host.model!.pushEditOperations([], [{ range: new host.monaco.Range(1, 1, 1, 1), text: ' ' }], () => [])
      await host.model!.undo()
    })
    hold.release(); await within(f.region()).findByText('Stale')
    expect(host.model!.getValue()).toBe(f.source); expect(host.edits).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull()
  }, 15000)
  it.each(['discard', 'late prepare cancel', 'source stale', 'expired', 'package changed', 'invalid proposal'] as const)('%s cannot edit the model', async kind => {
    const f = await fixture(language)
    const pending = kind === 'late prepare cancel' ? f.hold(C.prepareHintApply) : undefined
    if (kind === 'invalid proposal') f.invalid()
    await apply()
    if (kind === 'late prepare cancel') {
      fireEvent.click(await screen.findByText('Hủy Hint Apply')); pending!.release(); await screen.findByText('Discarded')
    } else if (kind === 'invalid proposal') await within(f.region()).findByText('Failed', {}, { timeout: 10000 })
    else {
      await diff()
      if (kind === 'discard') fireEvent.click(screen.getByText('Discard'))
      else if (kind === 'source stale') {
        const held = f.hold(C.consumeHintApply); await confirm()
        act(() => host.model!.pushEditOperations([], [{ range: new host.monaco.Range(1, 1, 1, 1), text: ' ' }], () => [])); held.release()
      } else {
        if (kind === 'expired') f.expire()
        if (kind === 'package changed') f.pkg.data.metadata.packageVersion++
        await confirm(); await screen.findByText('Stale')
      }
    }
    await waitFor(() => expect(host.edits).not.toHaveBeenCalled())
    expect(host.model!.getValue()).toBe(kind === 'source stale' ? ' ' + f.source : f.source)
  }, 15000)
})

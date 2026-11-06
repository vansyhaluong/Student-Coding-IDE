/** @vitest-environment jsdom */
import { useEffect, useRef, useState } from 'react'
import { randomUUID, webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PracticeWorkspace } from '../../src/renderer/src/features/learning/practice/PracticeWorkspace'
import type { useSubmission } from '../../src/renderer/src/features/learning/practice/use-submission'
import { selectedRange, type PracticeHintEditor, type SmartSourceSnapshot, type PracticeFixReadiness } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { SmartHintsService } from '../../src/main/services/learning/smart-hints/service'
import { FakeDeepSeekAdapter } from '../../src/main/services/learning/smart-hints/adapter'
import { captureSmartHints } from '../../src/main/services/learning/smart-hints/capture'
import { createSmartHintsBridge } from '../../src/preload/bridge/smart-hints'
import { createLearningOrder } from '../../src/preload/bridge/learning-order'
import { SMART_HINT_CHANNELS as C, type SmartPrepare, type SmartReference, type SmartStart, type SmartRetire } from '../../src/shared/contracts/smart-hints'
import type { StudentIdeApi } from '../../src/shared/contracts'
import { registry, response, envelope } from '../fixtures/learning/smart-hints'
import { exercises } from '../fixtures/learning/legacy-exercises'

const host = vi.hoisted(() => ({ mounts: 0, disposed: 0, restore: undefined as undefined | (() => boolean), selectionChanged: undefined as undefined | ((ready: boolean) => void) }))
vi.mock('../../src/renderer/src/features/learning/practice/PracticeDescription', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/renderer/src/features/learning/practice/PracticeDescription')>()
  return { PracticeDescription: (props: Parameters<typeof actual.PracticeDescription>[0]) => {
    host.restore = () => props.onRestore({} as never) // Simulate an admitted Restore callback; legacy suites cover History/Source admission.
    return <actual.PracticeDescription {...props} />
  } }
})
vi.mock('../../src/renderer/src/features/learning/practice/PracticeEditor', () => ({
  PracticeEditor: (props: { exercise: { id: string }; language: 'csharp' | 'javascript'; code: string; sourceRevision: number; onChange(code: string): void;
    onFixSelectionReadiness?(value: PracticeFixReadiness): void;
    onHintEditor?(value: PracticeHintEditor | undefined): void; onExplain?(value: SmartSourceSnapshot): void }) => {
    const latest = useRef(props); latest.current = props
    const node = useRef<HTMLTextAreaElement>(null), identity = useRef(randomUUID()), version = useRef(1)
    useEffect(() => {
      host.mounts++
      host.selectionChanged = ready => {
        const p = latest.current, base = { exerciseId: p.exercise.id, language: p.language, sourceRevision: p.sourceRevision }
        p.onFixSelectionReadiness?.(ready ? { ...base, state: 'READY', selectedBytes: 1,
          range: { startOffset: 0, endOffset: 1, startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } }
          : { ...base, state: 'UNAVAILABLE', reason: 'NO_SELECTION' })
      }
      props.onHintEditor?.({ capture: () => {
        const p = latest.current, v = version.current
        return { exerciseId: p.exercise.id, source: p.code, language: p.language,
          origin: { kind: 'PRACTICE', modelId: identity.current, modelVersion: v, eol: 'LF' },
          selection: selectedRange(p.code, node.current?.selectionStart ?? 0, node.current?.selectionEnd ?? 0),
          isCurrent: () => !!node.current?.isConnected && latest.current.code === p.code && version.current === v }
      }, focus: () => node.current?.focus() })
      return () => { host.disposed++; host.selectionChanged = undefined; latest.current.onHintEditor?.(undefined) }
    }, [])
    return <textarea ref={node} aria-label="Practice test editor" value={props.code} onChange={e => { version.current++; props.onChange(e.target.value) }} />
  },
}))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: { editor: { colorize: async () => '', tokenize: () => [] } } }))
const services: SmartHintsService[] = []
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); host.mounts = 0; host.disposed = 0
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(async () => { cleanup(); for (const s of services.splice(0)) await s.stop(); vi.unstubAllGlobals() })
function fixture() {
  const exercise = exercises.find(e => e.id === 'ch2-01')!, r = registry()
  r.data.metadata.exerciseId = exercise.id; r.data.samples.exerciseId = exercise.id
  r.data.metadata.signature.functionName = exercise.functionName; r.data.metadata.signature.parameters = exercise.parameters
  r.data.samples.samples = exercise.samples.map((s, i) => ({ id: `public-${i}`, args: s.args, expected: s.expected }))
  let pending: { resolve(r: Response): void; promise: Promise<Response> } | undefined
  const send = vi.fn(async (request: Request) => {
    expect(r.pinned).toBe(false)
    const body = await request.json(), input = JSON.parse(body.messages[1].content)
    expect(JSON.stringify(input)).not.toMatch(/HIDDEN_CANARY|official|comparator|testSetId/)
    if (pending) return pending.promise
    return response(envelope(JSON.stringify(input.action.kind === 'HINT'
      ? { kind: 'HINT', level: input.action.level, paragraphs: [`Gợi ý đã xác minh ${input.action.level}`], nextQuestion: 'Bạn sẽ kiểm tra gì?', evidence: [] }
      : input.action.kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'Giải thích Solution từ fake provider.', variables: 'Biến.', controlFlow: 'Điều kiện.', algorithm: 'Ý tưởng.', illustrativeExamples: [] }
        : { kind: 'ANALYSIS', hypotheses: ['Nhận định từ fake provider.'], suggestions: ['Kiểm tra public input.'], evidence: [] })))
  })
  const service = new SmartHintsService(new FakeDeepSeekAdapter({ send }, { authorization: () => 'Bearer synthetic-sh2-secret', clear() {} })); services.push(service)
  const invoke = vi.fn(async (channel: string, value: unknown) => {
    try {
      switch (channel) {
        case C.capabilities: return { ok: true, value: service.capabilities() }
        case C.prepare: { const q = value as SmartPrepare; return { ok: true, value: await service.prepare(1, 'document', q, () => {}, (g, check) => captureSmartHints(r.packages, q, g, check)) } }
        case C.start: return { ok: true, value: service.start(1, 'document', value as SmartStart) }
        case C.status: return { ok: true, value: service.status(1, 'document', value as SmartReference) }
        case C.cancel: return { ok: true, value: service.cancel(1, 'document', value as SmartReference) }
        case C.retireContext: service.retireContext(1, 'document', value as SmartRetire); return { ok: true, value: null }
      }
    } catch { return { ok: false, error: { code: 'INVALID_INPUT', message: 'Safe test denial.', retryable: false } } }
    throw Error('Unexpected execution path')
  })
  const api = createSmartHintsBridge({ invoke, on: vi.fn(), removeListener: vi.fn() }, createLearningOrder())
  const history = vi.fn(), d2 = { prepare: vi.fn(), start: vi.fn() }, run = vi.fn(), submit = vi.fn(), restore = vi.fn()
  window.studentIde = { learning: { smartHints: api, analysis: d2, submission: { history } } } as unknown as StudentIdeApi
  const submission = { view: { busy: false, completion: 'NOT_COMPLETED' }, staleSource: false, submit, checkStatus: vi.fn(), refreshCompletion: vi.fn() } as unknown as ReturnType<typeof useSubmission>
  function Harness({ active = true }: { active?: boolean }) {
    const [code, setCode] = useState(exercise.languages.csharp.starter), [revision, setRevision] = useState(1)
    const [language, setLanguage] = useState<'csharp' | 'javascript'>('csharp')
    return <PracticeWorkspace exercises={[]} chapter={2} drafts={[]} exercise={exercise} language={language} code={code} ready locked={false}
      execution={{ status: 'idle', busy: false, message: 'No run' }} submission={submission} active={active} sourceRevision={revision} onRestore={restore}
      onRun={run} onOpen={() => {}} onLanguage={setLanguage} onEdit={value => { setCode(value); setRevision(r => r + 1) }}
      onReplace={value => { setCode(value); setRevision(r => r + 1) }} />
  }
  const ui = render(<Harness />)
  return { ...ui, service, send, invoke, run, submit, history, d2, restore, Harness,
    defer() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r }); pending = { promise, resolve }; return pending } }
}
async function click(name: string | RegExp) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function open() { await screen.findByRole('textbox', { name: 'Practice test editor' }); await click('Smart Hints'); await screen.findByText('Chế độ kiểm thử · provider giả') }
describe('SH-2 workspace → accepted typed bridge → SH-1 Main → fake transport', () => {
  it('D6-1 readiness changes do not send requests, retire Hint history, or disturb Hint consent/progression', async () => {
    const f = fixture(); await open(); await click('Get Hint · Level 1'); await screen.findByRole('dialog')
    await click('Đồng ý gửi snapshot'); await screen.findByText('Gợi ý đã xác minh 1')
    const invoked = f.invoke.mock.calls.length
    act(() => { host.selectionChanged?.(true) })
    expect(screen.getByLabelText('Chuẩn bị vùng chọn Suggest Fix').textContent).toContain('Vùng chọn: dòng 1:1 → 1:2')
    expect(screen.getByLabelText('Chuẩn bị vùng chọn Suggest Fix').textContent).toContain('chưa bật')
    act(() => { host.selectionChanged?.(false) })
    expect(screen.getByLabelText('Chuẩn bị vùng chọn Suggest Fix').textContent).toContain('Bôi đen đoạn code')
    expect(f.invoke).toHaveBeenCalledTimes(invoked); expect(f.send).toHaveBeenCalledOnce()
    await click('Get Hint · Level 2'); await screen.findByRole('dialog')
    const prepared = f.invoke.mock.calls.length
    act(() => { host.selectionChanged?.(true) })
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(f.invoke).toHaveBeenCalledTimes(prepared)
    await click('Đồng ý gửi snapshot'); await screen.findByText('Gợi ý đã xác minh 2')
    expect(screen.getByRole('button', { name: 'Get Hint · Level 3' })).toBeTruthy()
    expect(f.invoke.mock.calls.some(([channel]) => channel === C.cancel || channel === C.retireContext)).toBe(false)
    expect(f.run).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled()
  }, 10000) // Two explicit fake requests with real status polling; no application timeout change.
  it('no auto request; drawer preserves editor mount/source; explicit consent produces exactly one transport call', async () => {
    const f = fixture(), editor = await screen.findByRole('textbox', { name: 'Practice test editor' }), code = (editor as HTMLTextAreaElement).value
    expect(f.invoke).not.toHaveBeenCalled(); await open(); expect(f.send).not.toHaveBeenCalled(); expect(host.mounts).toBe(1)
    await click('Get Hint · Level 1'); await screen.findByRole('dialog'); expect(f.send).not.toHaveBeenCalled()
    await click('Đồng ý gửi snapshot'); await screen.findByText('Gợi ý đã xác minh 1')
    expect(f.send).toHaveBeenCalledOnce(); expect(host.mounts).toBe(1); expect(host.disposed).toBe(0)
    expect((editor as HTMLTextAreaElement).value).toBe(code)
    expect(f.run).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled(); expect(f.restore).not.toHaveBeenCalled(); expect(f.history).not.toHaveBeenCalled(); expect(f.d2.prepare).not.toHaveBeenCalled()
    await click('Đóng Smart Hints'); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Smart Hints' })); expect(host.mounts).toBe(1)
    await click('Run'); await click('Submit'); expect(f.run).toHaveBeenCalledOnce(); expect(f.submit).toHaveBeenCalledOnce()
  })
  it.each(['edit', 'reset', 'restore', 'language', 'leave', 'close'] as const)('%s retires pending operation and never renders late output', async change => {
    const f = fixture(), gate = f.defer(); await open(); await click('Analyze Code & Run'); await screen.findByRole('dialog'); await click('Đồng ý gửi snapshot')
    await waitFor(() => expect(f.send).toHaveBeenCalledOnce())
    if (change === 'edit') fireEvent.change(screen.getByRole('textbox', { name: 'Practice test editor' }), { target: { value: '// revised' } })
    if (change === 'reset') { await click('Reset Code'); await click('Xác nhận Reset') }
    if (change === 'restore') { f.restore.mockReturnValueOnce(true); act(() => { expect(host.restore?.()).toBe(true) }) }
    if (change === 'language') fireEvent.change(screen.getByRole('combobox', { name: 'Ngôn ngữ bài tập' }), { target: { value: 'javascript' } })
    if (change === 'leave') f.rerender(<f.Harness active={false} />)
    if (change === 'close') await click('Đóng Smart Hints')
    await waitFor(() => expect(f.send.mock.calls[0][0].signal.aborted).toBe(true))
    await act(async () => { gate.resolve(response(envelope(JSON.stringify({ kind: 'ANALYSIS', hypotheses: ['LATE PRIVATE'], suggestions: [], evidence: [] })))) })
    expect(screen.queryByText('LATE PRIVATE')).toBeNull(); expect(f.run).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled()
  })
  it('Solution JavaScript selection uses its own language/source, read-only through the same Main API', async () => {
    const f = fixture(); await screen.findByRole('textbox', { name: 'Practice test editor' })
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Solution' })) })
    fireEvent.click(screen.getByRole('tab', { name: 'JavaScript' }))
    const pre = screen.getByLabelText('Code hoàn chỉnh'), code = pre.querySelector('code')!
    await waitFor(() => expect(code.dataset.highlighted).toBe('true'))
    const range = document.createRange(); range.selectNodeContents(code)
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
    await act(async () => { fireEvent.click(within(pre.parentElement!).getByRole('button', { name: 'Explain with AI' })) })
    await screen.findByRole('dialog'); expect(f.send).not.toHaveBeenCalled()
    const prepared = f.invoke.mock.calls.find(x => x[0] === C.prepare)![1] as SmartPrepare
    expect(prepared.language).toBe('javascript'); expect(prepared.origin.kind).toBe('SOLUTION'); expect(prepared.source).toBe(code.textContent); expect(prepared.run).toBeNull()
    await click('Đồng ý gửi snapshot'); await screen.findByText('Giải thích Solution từ fake provider.')
    expect(f.send).toHaveBeenCalledOnce(); expect(f.d2.prepare).not.toHaveBeenCalled(); expect(f.run).not.toHaveBeenCalled(); expect(f.submit).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Apply|Diff/ })).toBeNull(); expect(host.mounts).toBe(1)
  })
})

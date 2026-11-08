/** @vitest-environment jsdom */
import { StrictMode } from 'react'
import { webcrypto, randomUUID } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SmartHintsApi, SmartStatus, SmartPrepare, SmartOutput, SmartRunContext } from '../../src/shared/contracts/smart-hints'
import { isSmartStatus, validateSmartPrepare } from '../../src/shared/contracts/smart-hints-validation'
import type { ExerciseLanguage } from '../../src/shared/contracts/practice'
import { useSmartHints } from '../../src/renderer/src/features/learning/practice/use-smart-hints'
import { SmartHintsPanel } from '../../src/renderer/src/features/learning/practice/SmartHintsPanel'
import { Advisory } from '../../src/renderer/src/features/learning/practice/SmartHintsPanel'
import { AssistantCodeBlock } from '../../src/renderer/src/features/learning/AssistantCodeBlock'
import { selectedRange, type SmartSourceSnapshot } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { capture, request, fixAction } from '../fixtures/learning/smart-hints'

const ok = <T,>(value: T) => ({ ok: true as const, value })
describe('Hint code toolbar', () => {
  it.each(['csharp', 'javascript'] as const)('%s copies exact code including Unicode, CRLF and whitespace', async language => {
    const text = '  // 🐟 tiếng Việt\r\nreturn "<b>";\r\n'
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const view = render(<AssistantCodeBlock text={text} language={language} hintActions />)
    const header = view.container.querySelector('.assistant-code-header')!
    expect(header.firstElementChild?.textContent).toBe(language === 'csharp' ? 'C#' : 'JavaScript')
    expect(header.lastElementChild?.getAttribute('role')).toBe('group')
    const copy = within(header as HTMLElement).getByRole('button', { name: 'Copy code' })
    expect(copy.textContent).toBe(''); expect(copy.querySelector('svg')).toBeTruthy()
    const apply = within(header as HTMLElement).getByRole('button', { name: 'Apply' })
    expect(apply.querySelector('svg')).toBeTruthy(); expect(apply.hasAttribute('disabled')).toBe(true)
    expect(document.getElementById(apply.getAttribute('aria-describedby')!)?.textContent).toContain('binding vùng sửa')
    fireEvent.click(copy)
    await screen.findByText('Đã sao chép code.')
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
  })
  it('reports denied clipboard access and permits retry', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(Error('denied')).mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AssistantCodeBlock text="return 1;" hintActions />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await screen.findByText(/Không thể sao chép/)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await screen.findByText('Đã sao chép code.')
  })
  it('ignores a late copy completion after source changes', async () => {
    const pending = gate<void>()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => pending.promise } })
    const view = render(<AssistantCodeBlock text="old" hintActions />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    view.rerender(<AssistantCodeBlock text="new" hintActions />)
    await act(async () => { pending.resolve() })
    expect(screen.queryByText('Đã sao chép code.')).toBeNull()
  })
  it.each(['function solve(x) { }', 'function solve(x) { return x;', 'unknown', 'invalid }', 'stale source'])('unbound Hint cannot edit baseline %s and keeps code last', source => {
    const before = source
    const view = render(<Advisory source={source} output={{ kind: 'HINT', thinking: 'Think', steps: ['Step'], code: { language: 'javascript', text: 'return x + 1;' }, evidence: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(source).toBe(before); expect(screen.queryByRole('dialog')).toBeNull()
    expect(view.container.firstElementChild?.lastElementChild?.textContent).toContain('return x + 1;')
    expect(screen.getByRole('button', { name: 'Apply' }).hasAttribute('disabled')).toBe(true)
  })
  it('leaves Chat markdown code blocks without Hint actions', () => {
    render(<AssistantCodeBlock text="return 1;" language="javascript" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
const broken = { ok: false as const, error: { code: 'INVALID_INPUT' as const, message: 'PRIVATE_RAW key /private/path', retryable: false } }
const codeOnly: SmartRunContext = { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' }
const analysis: SmartOutput = { kind: 'ANALYSIS', hypotheses: ['Có thể cần kiểm tra biên.'], suggestions: ['Đối chiếu điều kiện.'], evidence: [] }
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function fixture(options: { language?: ExerciseLanguage; source?: string; context?: SmartRunContext; disabled?: boolean; strict?: boolean; openrouter?: boolean; gemini?: boolean } = {}) {
  let current: SmartStatus, q: SmartPrepare
  let hintCount = 0
  const data = { source: options.source ?? 'function solve(x) { return x; }', language: options.language ?? 'javascript' as ExerciseLanguage,
    revision: 1, modelVersion: 1, modelId: randomUUID(), active: true, exerciseId: 'synthetic' }
  const context = options.context ?? codeOnly
  const api = {
    prepareHintApply: vi.fn<SmartHintsApi['prepareHintApply']>(async () => { throw Error('F1 is not connected to UI') }),
    consumeHintApply: vi.fn<SmartHintsApi['consumeHintApply']>(async () => { throw Error('No Hint Apply in drawer fixture') }),
    discardHintApply: vi.fn<SmartHintsApi['discardHintApply']>(async () => ok(null)),
    capabilities: vi.fn<SmartHintsApi['capabilities']>(async () => ok({ enabled: !options.disabled, providerMode: options.disabled ? 'DISABLED' : options.gemini ? 'GEMINI_FREE' : options.openrouter ? 'OPENROUTER_FREE' : 'FAKE', applyEnabled: false, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })),
    prepare: vi.fn<SmartHintsApi['prepare']>(async value => {
      q = value; current = { schemaVersion: 1, requestId: q.requestId, operationId: randomUUID(), sequence: 0, binding: capture(q).binding,
        state: 'PREPARED', captureToken: randomUUID(), expiresAt: Date.now() + 60000, consentVersion: 1, statementBytes: 24, runContextKind: context.kind }
      return ok(current)
    }),
    start: vi.fn<SmartHintsApi['start']>(async () => {
      if (q.action.kind === 'SUGGEST_FIX') throw Error('Disabled Fix must not start in the fixture')
      const output: SmartOutput = q.action.kind === 'HINT' ? { kind: 'HINT', thinking: `Gợi ý ${++hintCount}`, steps: ['Compare the public inputs.'], code: { language: q.language, text: 'return x + 1;' }, evidence: [] }
        : q.action.kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'Cú pháp đã chọn.', variables: 'Vai trò biến.', controlFlow: 'Luồng chạy.', algorithm: 'Ý nghĩa thuật toán.', illustrativeExamples: ['Ví dụ minh họa: 🐟'] }
          : analysis
      current = { schemaVersion: 1, requestId: current.requestId, operationId: current.operationId, binding: current.binding,
        state: 'COMPLETE', sequence: current.sequence + 1, output, runContext: context, expiresAt: Date.now() + 300000,
        proposalId: output.kind === 'EDIT_PROPOSAL' ? randomUUID() : null }
      return ok(current)
    }),
    status: vi.fn<SmartHintsApi['status']>(async () => ok(current)),
    cancel: vi.fn<SmartHintsApi['cancel']>(async () => { current = { schemaVersion: 1, requestId: current.requestId, operationId: current.operationId, sequence: current.sequence + 1, binding: current.binding, state: 'CANCELLED' }; return ok(current) }),
    retireContext: vi.fn<SmartHintsApi['retireContext']>(async () => ok(null)),
  }
  const snapshot = (): SmartSourceSnapshot => {
    const { source, language, modelVersion, exerciseId } = data
    return { exerciseId, source, language, origin: { kind: 'PRACTICE', modelId: data.modelId, modelVersion, eol: source.includes('\r\n') ? 'CRLF' : 'LF' },
      selection: selectedRange(source, 0, source.length), isCurrent: () => data.active && data.source === source && data.modelVersion === modelVersion && data.exerciseId === exerciseId && data.language === language }
  }
  let controller: ReturnType<typeof useSmartHints>
  function Harness() {
    const hints = useSmartHints({ active: data.active, locked: false, exerciseId: data.exerciseId, language: data.language, source: data.source, sourceRevision: data.revision }, api)
    controller = hints
    hints.setRun(context.kind === 'RUN_PUBLIC' ? { sessionId: 'exercise_12345678-1234-4234-8234-123456789abc', generation: 1, sequence: 9 } : null)
    const begin = (kind: 'HINT' | 'ANALYZE' | 'SUGGEST_FIX') => {
      if (kind === 'SUGGEST_FIX') return // This harness follows the disabled normal-app entry point.
      void hints.begin({ kind }, snapshot())
    }
    return <><button onClick={hints.show}>Smart Hints</button>{hints.open && data.active && <SmartHintsPanel hints={hints} onClose={hints.close}
      onAction={begin} onExplain={() => { const s = snapshot(); if (s.selection) void hints.begin({ kind: 'EXPLAIN', selection: s.selection }, s) }} />}</>
  }
  const element = () => options.strict ? <StrictMode><Harness /></StrictMode> : <Harness />
  const ui = render(element())
  return { ...ui, api, data, snapshot, get controller() { return controller }, get q() { return q }, get status() { return current },
    setStatus(value: SmartStatus) { current = value },
    rerenderData(patch: Partial<typeof data>) { Object.assign(data, patch); ui.rerender(element()) },
    async open() { fireEvent.click(screen.getByRole('button', { name: 'Smart Hints', exact: true } as never)); await waitFor(() => expect(api.capabilities).toHaveBeenCalled()); await screen.findByText(options.openrouter ? 'Development/test · OpenRouter · openrouter/free' : 'Chế độ kiểm thử · provider giả').catch(() => {}) },
  }
}
// Presentation-only canonical fixture. No enabled mode, prepare/start or grant is invented.
function renderAdvisory(output: SmartOutput, source = 'function solve(x) { return x; }') {
  const f = fixture({ source }); f.unmount()
  const at = source.indexOf('return x;')
  const begin = output.kind === 'EDIT_PROPOSAL' ? Math.min(...output.edits.map(e => e.startOffset)) : at
  const end = output.kind === 'EDIT_PROPOSAL' ? Math.max(...output.edits.map(e => e.endOffset)) : at + 9
  const q = request({ source, action: fixAction(source, begin, end) })
  expect(validateSmartPrepare(q).ok).toBe(true)
  const result: Extract<SmartStatus, { state: 'COMPLETE' }> = { schemaVersion: 1, requestId: q.requestId, operationId: randomUUID(),
    sequence: 1, binding: capture(q).binding, state: 'COMPLETE', output, runContext: codeOnly, expiresAt: Date.now() + 300000,
    proposalId: output.kind === 'EDIT_PROPOSAL' ? randomUUID() : null }
  expect(isSmartStatus(result)).toBe(true)
  render(<SmartHintsPanel hints={{ ...f.controller, capturedSource: source, view: { phase: 'result', hints: [], result } }}
    onClose={() => {}} onAction={() => {}} onExplain={() => {}} />)
  return f
}
async function click(name: string | RegExp) { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function prepare(name: string | RegExp) { await click(name); return screen.findByRole('dialog', { name: 'Cho phép gửi snapshot này?' }) }
async function consent() { await click('Đồng ý gửi snapshot') }

describe('SH-2 drawer, per-action consent, progressive hints and advisory results', () => {
  it('Gemini Fix stays disabled without consent/start while other actions remain available', async () => {
    const f = fixture({ gemini: true }); await click('Smart Hints')
    await waitFor(() => expect(f.controller.capabilities?.enabled).toBe(true))
    expect((screen.getByRole('button', { name: 'Suggest Fix' }) as HTMLButtonElement).disabled).toBe(true)
    await click('Suggest Fix')
    expect(screen.queryByRole('dialog')).toBeNull(); expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Analyze Code & Run' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('legacy kind-only Fix cannot bypass the hook or fall back to a whole-source request', async () => {
    const f = fixture({ gemini: true }); await click('Smart Hints')
    await act(async () => { await f.controller.begin({ kind: 'SUGGEST_FIX' } as never, f.snapshot()) })
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
    expect(f.controller.previewFix()).toBeUndefined(); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('Settings configuration change refreshes the open Drawer from Main without sending source', async () => {
    const f = fixture({ disabled: true }); await click('Smart Hints')
    await waitFor(() => expect(f.api.capabilities).toHaveBeenCalledOnce())
    f.api.capabilities.mockResolvedValueOnce(ok({ enabled: true, providerMode: 'GEMINI_FREE', applyEnabled: true, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] }))
    await act(async () => window.dispatchEvent(new Event('smart-hints-configuration-changed')))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Analyze Code & Run' }) as HTMLButtonElement).disabled).toBe(false))
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('a source revision change must not discard Main capabilities while the drawer is opening', async () => {
    const f = fixture({ gemini: true }), pending = gate<Awaited<ReturnType<SmartHintsApi['capabilities']>>>()
    f.api.capabilities.mockReturnValueOnce(pending.promise)
    await click('Smart Hints')
    f.rerenderData({ source: '// changed while probing', revision: 2, modelVersion: 2 })
    await act(async () => pending.resolve(ok({ enabled: true, providerMode: 'GEMINI_FREE', applyEnabled: true, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Analyze Code & Run' }) as HTMLButtonElement).disabled).toBe(false))
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('a disabled Main capability remains locked but can be explicitly checked again without sending source', async () => {
    const f = fixture({ disabled: true })
    await click('Smart Hints')
    await waitFor(() => expect(f.api.capabilities).toHaveBeenCalledTimes(1))
    expect((screen.getByRole('button', { name: 'Analyze Code & Run' }) as HTMLButtonElement).disabled).toBe(true)
    f.api.capabilities.mockResolvedValueOnce(ok({ enabled: true, providerMode: 'GEMINI_FREE', applyEnabled: true, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] }))
    await click('Kiểm tra khả dụng')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Analyze Code & Run' }) as HTMLButtonElement).disabled).toBe(false))
    expect(f.api.capabilities).toHaveBeenCalledTimes(2)
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('an older enabled probe cannot overwrite a newer disabled Main response', async () => {
    const f = fixture(), pending = gate<Awaited<ReturnType<SmartHintsApi['capabilities']>>>()
    f.api.capabilities.mockReturnValueOnce(pending.promise)
    f.api.capabilities.mockResolvedValueOnce(ok({ enabled: false, providerMode: 'DISABLED', applyEnabled: false, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] }))
    await click('Smart Hints'); await click('Smart Hints')
    await act(async () => pending.resolve(ok({ enabled: true, providerMode: 'FAKE', applyEnabled: true, consentVersion: 1, suggestFixMode: 'DISABLED', suggestFixLanguages: [] })))
    expect((screen.getByRole('button', { name: 'Analyze Code & Run' }) as HTMLButtonElement).disabled).toBe(true)
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('Gemini consent names provider/model and does not promise Free Tier', async () => {
    const f = fixture({ gemini: true }); await f.open()
    const dialog = await prepare('Analyze Code & Run')
    expect(within(dialog).getByText(/sẽ được gửi tới Google Gemini API/)).toBeTruthy()
    expect(within(dialog).getByText(/Google Gemini · gemini-3.1-flash-lite/)).toBeTruthy()
    expect(within(dialog).getByText(/không xác minh Free Tier hoặc billing/)).toBeTruthy()
    expect(within(dialog).getByText(/nội dung có thể được Google xử lý\/lưu/)).toBeTruthy()
    expect(within(dialog).queryByText(/OpenRouter/)).toBeNull()
    expect(f.api.start).not.toHaveBeenCalled()
    await consent(); await screen.findByText('Có thể cần kiểm tra biên.')
    expect(f.api.start).toHaveBeenCalledOnce()
  })
  it('SH-4 identifies OpenRouter as recipient and waits for explicit per-snapshot consent', async () => {
    const f = fixture({ openrouter: true }); await f.open()
    const dialog = await prepare('Analyze Code & Run')
    expect(within(dialog).getByText(/OpenRouter và nhà cung cấp mô hình miễn phí được chọn/)).toBeTruthy()
    expect(within(dialog).getByText(/Không gửi lại Hint trước/)).toBeTruthy()
    expect(within(dialog).getByText(/Chính sách lưu và sử dụng dữ liệu/)).toBeTruthy()
    expect(f.api.start).not.toHaveBeenCalled()
    await consent(); await screen.findByText('Có thể cần kiểm tra biên.')
    expect(f.api.start).toHaveBeenCalledOnce()
  })
  it('disabled selection Fix does not reset an existing Hint context or issue a proposal grant', async () => {
    const f = fixture(); await f.open(); await prepare('Hint'); await consent(); await screen.findByText('Gợi ý 1')
    const context = f.q.clientContextId, at = f.data.source.indexOf('return x;')
    await act(async () => { await f.controller.begin(fixAction(f.data.source, at, at + 9), f.snapshot()) })
    expect(f.api.prepare).toHaveBeenCalledOnce(); expect(f.api.start).toHaveBeenCalledOnce()
    expect(f.api.retireContext).not.toHaveBeenCalled(); expect(f.controller.previewFix()).toBeUndefined()
    await prepare('Hint'); expect(f.q.clientContextId).toBe(context)
    await consent(); await screen.findByText('Gợi ý 2')
  })
  it.each(['revision', 'source', 'model', 'exercise', 'language', 'leave', 'expiry'])(
    'disabled Fix cannot manufacture a grant after %s changes', async kind => {
      const f = fixture(); await f.open()
      const clock = kind === 'expiry' ? vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001) : undefined
      try {
        f.rerenderData(kind === 'revision' ? { revision: 2 } : kind === 'source' ? { source: f.data.source + ' ' }
          : kind === 'model' ? { modelVersion: 2 } : kind === 'exercise' ? { exerciseId: 'other' }
            : kind === 'language' ? { language: 'csharp' } : kind === 'leave' ? { active: false } : {})
        const at = f.data.source.indexOf('return x;')
        await act(async () => { await f.controller.begin(fixAction(f.data.source, at, at + 9), f.snapshot()) })
        expect(f.controller.previewFix()).toBeUndefined(); expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
      } finally { clock?.mockRestore() }
    })
  it.each(['csharp', 'javascript'] as const)('%s unified Hint always has three ordered sections and requires one consent', async language => {
    const f = fixture({ language, strict: true }); expect(f.api.capabilities).not.toHaveBeenCalled(); expect(f.api.prepare).not.toHaveBeenCalled()
    await f.open(); expect(f.api.prepare).not.toHaveBeenCalled()
    for (const level of [1, 2, 3]) {
      const d = await prepare(`Hint`)
      expect(f.api.start).toHaveBeenCalledTimes(level - 1); expect(within(d).getByText(/^Hint ·/)).toBeTruthy()
      await consent(); await screen.findByText(`Gợi ý ${level}`)
      expect(f.q.language).toBe(language)
      const card = screen.getByRole('region', { name: 'Hint' })
      expect(within(card).getAllByRole('heading').map(h => h.textContent)).toEqual(['Gợi ý tư duy', 'Hướng dẫn thực hiện', 'Gợi ý code'])
      expect(card.lastElementChild?.querySelector(`code.language-${language}`)?.textContent).toBe('return x + 1;')
    }
    expect(f.api.prepare).toHaveBeenCalledTimes(3); expect(f.api.start).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('button', { name: 'Hint' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText(/Level [123]/)).toBeNull()
    expect(f.api.prepare.mock.calls.map(x => x[0].clientContextId)).toEqual([f.q.clientContextId, f.q.clientContextId, f.q.clientContextId])
  })
  it.each(['', 'function unfinished('])('analyzes empty/incomplete code %j without Run prerequisite', async source => {
    const f = fixture({ source }); await f.open(); await prepare('Analyze Code & Run'); await consent()
    await screen.findByText('Có thể cần kiểm tra biên.'); expect(f.q.source).toBe(source); expect(f.q.run).toBeNull()
    expect(screen.getByText(/Chưa có Run public phù hợp/)).toBeTruthy()
  })
  it.each([2, 1])('public Run actual %i is distinct from AI hypotheses', async actual => {
    const f = fixture({ context: { kind: 'RUN_PUBLIC', parameterTypes: ['int32'], returnType: 'int32', failure: null, locations: [],
      observations: [{ evidenceId: 'R1', sampleOrdinal: 1, input: [1], expected: 2, actual }] } })
    await f.open(); await prepare('Analyze Code & Run'); await consent()
    await screen.findByRole('region', { name: 'Bằng chứng Run public' })
    expect(screen.getByText(`Public sample 1 · ${actual === 2 ? 'Khớp' : 'Không khớp'}`)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Nhận định của AI' })).toBeTruthy(); expect(f.q.run?.sequence).toBe(9)
  })
  it.each(['COMPILE_ERROR', 'SYNTAX_ERROR', 'RUNTIME_ERROR'] as const)('public %s is an observed category', async failure => {
    const f = fixture({ context: { kind: 'RUN_PUBLIC', parameterTypes: [], returnType: 'int32', failure, locations: [{ line: 2, column: 3 }], observations: [] } })
    await f.open(); await prepare('Analyze Code & Run'); await consent()
    await screen.findByText(/Run xác nhận:/); expect(screen.getByText(/dòng 2, cột 3/)).toBeTruthy()
    expect(screen.queryByText(/PRIVATE_RAW/)).toBeNull()
  })
  it('no provider configuration leaves all AI actions disabled and sends no snapshot', async () => {
    const f = fixture({ disabled: true }); fireEvent.click(screen.getByRole('button', { name: 'Smart Hints', exact: true } as never))
    await screen.findByText(/AI chưa được cấu hình hoặc chưa sẵn sàng/)
    expect(screen.getByRole('button', { name: /^Hint$/ }).hasAttribute('disabled')).toBe(true)
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('Explain captures the exact multiline Unicode selection with no code mutation', async () => {
    const source = '// 🐟\r\nreturn 1;', f = fixture({ source }); await f.open(); await prepare('Explain Selected Code (Practice)')
    expect(f.q.action.kind).toBe('EXPLAIN'); if (f.q.action.kind !== 'EXPLAIN') throw Error()
    expect(f.q.action.selection.text).toBe(source); expect(f.q.action.selection.endLine).toBe(2)
    await consent(); await screen.findByText('Cú pháp đã chọn.'); expect(f.data.source).toBe(source)
    expect(screen.queryByRole('button', { name: /Apply|Diff|Undo/ })).toBeNull()
  })
  it('canonical NO_FIX advisory still reports unknown location without a live Fix pipeline', () => {
    const f = renderAdvisory({ kind: 'NO_FIX', reason: 'LOCATION_UNKNOWN', advice: 'Hãy kiểm tra dữ liệu vào.' })
    expect(screen.getByText('AI chưa xác định được vị trí lỗi.')).toBeTruthy(); expect(screen.queryByText('Code cũ')).toBeNull()
    expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('canonical structured advisory stays read-only and escaped without granting Apply', () => {
    const source = 'function solve(x) { return x; }', at = source.indexOf('return x;')
    const f = renderAdvisory({ kind: 'EDIT_PROPOSAL', edits: [{ startOffset: at, endOffset: at + 9, expectedOldText: 'return x;', replacementText: 'return "<img src=x onerror=alert(1)>";', rationale: 'Đây là nhận định.' }], rationale: 'Đề xuất tập trung.', evidence: [] }, source)
    expect(screen.getByRole('region', { name: 'Đề xuất sửa code' })).toBeTruthy()
    expect(screen.getByText('Code cũ')).toBeTruthy(); expect(document.querySelector('img')).toBeNull(); expect(f.data.source).not.toContain('<img')
    expect(screen.queryByRole('button', { name: /Apply|Diff|Undo/ })).toBeNull(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('legacy canonical multiple-edit advisory still renders both regions independently of disabled generation', () => {
    const source = 'function solve(x) { return x; }', at = source.indexOf('return x;')
    const f = renderAdvisory({ kind: 'EDIT_PROPOSAL', edits: [
      { startOffset: 0, endOffset: 0, expectedOldText: '', replacementText: '// 🐟 minh họa\n', rationale: 'Ghi chú.' },
      { startOffset: at, endOffset: at + 9, expectedOldText: 'return x;', replacementText: 'return x + 1;', rationale: 'Kiểm tra phép tính.' },
    ], rationale: 'Hai vùng nghi ngờ.', evidence: [] }, source)
    expect(screen.getByText('Hai vùng nghi ngờ.')).toBeTruthy(); expect(screen.getAllByText('Code cũ')).toHaveLength(2)
    expect(f.data.source).not.toContain('minh họa'); expect(f.api.prepare).not.toHaveBeenCalled()
  })
  it('double clicks have one prepare and one consented start', async () => {
    const f = fixture(); await f.open()
    const b = screen.getByRole('button', { name: /^Hint$/ }); fireEvent.click(b); fireEvent.click(b)
    await screen.findByRole('dialog'); expect(f.api.prepare).toHaveBeenCalledOnce()
    const confirm = screen.getByRole('button', { name: 'Đồng ý gửi snapshot' }); fireEvent.click(confirm); fireEvent.click(confirm)
    await screen.findByText('Gợi ý 1'); expect(f.api.start).toHaveBeenCalledOnce()
  })
  it('Cancel before consent cancels only the operation and preserves the Hint session', async () => {
    const f = fixture(); await f.open(); await prepare(/^Hint$/); await click('Hủy')
    expect(f.api.start).not.toHaveBeenCalled(); expect(f.api.retireContext).not.toHaveBeenCalled(); expect(f.api.cancel).toHaveBeenCalledOnce(); expect(screen.queryByRole('dialog')).toBeNull()
    await prepare('Hint'); expect(f.api.prepare.mock.calls[1][0].clientContextId).toBe(f.api.prepare.mock.calls[0][0].clientContextId)
  })
  it('unknown start ACK recovers status without replaying start', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    const original = f.api.start.getMockImplementation()!
    f.api.start.mockImplementationOnce(async q => { await original(q); return broken })
    await consent(); await screen.findByRole('button', { name: 'Kiểm tra trạng thái AI' }); await click('Kiểm tra trạng thái AI')
    await screen.findByText('Có thể cần kiểm tra biên.'); expect(f.api.start).toHaveBeenCalledOnce(); expect(f.api.prepare).toHaveBeenCalledOnce()
  })
  it('manual status recovery replaces the scheduled poll instead of forking polling loops', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    const p = f.status
    f.api.start.mockResolvedValueOnce(broken)
    f.api.status.mockResolvedValue(ok({ schemaVersion: 1, requestId: p.requestId, operationId: p.operationId,
      binding: p.binding, sequence: 1, state: 'RUNNING' }))
    vi.useFakeTimers()
    try {
      await consent()
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      await click('Kiểm tra trạng thái AI'); expect(f.api.status).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(400) })
      expect(f.api.status).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      expect(f.api.status).toHaveBeenCalledTimes(2)
      expect(f.api.start).toHaveBeenCalledOnce()
      f.unmount()
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(f.api.status).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })
  it('unknown prepare ACK recovers the same requestId and never auto-starts', async () => {
    const f = fixture(); await f.open(); const original = f.api.prepare.getMockImplementation()!
    f.api.prepare.mockImplementationOnce(async q => { await original(q); return broken })
    await click('Analyze Code & Run'); await screen.findByRole('button', { name: 'Kiểm tra trạng thái AI' }); await click('Kiểm tra trạng thái AI')
    await screen.findByRole('dialog'); expect(f.api.prepare.mock.calls[0][0]).toEqual(f.api.prepare.mock.calls[1][0]); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('unchanged PREPARED after a start ACK offers recovery without replaying consent', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    f.api.start.mockResolvedValueOnce(ok(f.status))
    await consent(); await screen.findByRole('button', { name: 'Kiểm tra trạng thái AI' })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(f.api.start).toHaveBeenCalledOnce()
    await click('Kiểm tra trạng thái AI'); expect(f.api.start).toHaveBeenCalledOnce()
    expect(f.api.prepare).toHaveBeenCalledOnce()
  })
  it('pagehide retires the pending context and drops a late start reply', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    const g = gate<Awaited<ReturnType<SmartHintsApi['start']>>>(), original = f.api.start.getMockImplementation()!
    f.api.start.mockImplementationOnce(async q => { const value = await original(q); await g.promise; return value })
    await consent()
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    await act(async () => { g.resolve(ok(f.status)) })
    expect(f.api.retireContext).toHaveBeenCalledWith({ clientContextId: f.q.clientContextId, reason: 'LEARNING_LEFT' })
    expect(screen.queryByRole('complementary', { name: 'Smart Hints' })).toBeNull()
    await f.open(); expect(screen.queryByText('Có thể cần kiểm tra biên.')).toBeNull()
  })
  it('duplicate/regressing polling replies do not reopen consent or replay start', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    const p = f.status, base = { schemaVersion: 1 as const, requestId: p.requestId, operationId: p.operationId, binding: p.binding }
    const running: SmartStatus = { ...base, state: 'RUNNING', sequence: 1 }
    const complete: SmartStatus = { ...base, state: 'COMPLETE', sequence: 2, output: analysis, runContext: codeOnly, expiresAt: Date.now() + 300000, proposalId: null }
    f.api.start.mockResolvedValueOnce(ok(running))
    f.api.status.mockResolvedValueOnce(ok(running)).mockResolvedValueOnce(ok(p)).mockResolvedValue(ok(complete))
    await consent(); await screen.findByText('Có thể cần kiểm tra biên.', {}, { timeout: 4000 })
    expect(f.api.start).toHaveBeenCalledOnce(); expect(f.api.prepare).toHaveBeenCalledOnce(); expect(f.api.status).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getAllByText('Có thể cần kiểm tra biên.')).toHaveLength(1)
  })
  it('native dialog cancel never sends consent, and Escape closes the non-modal drawer', async () => {
    const f = fixture(); await f.open(); const dialog = await prepare(/^Hint$/)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Hủy' }))
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
    expect(f.api.start).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(screen.getByRole('complementary', { name: 'Smart Hints' }), { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: 'Smart Hints' })).toBeNull()
  })
  it('terminal provider error offers manual retry with a fresh request and consent', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    f.api.start.mockImplementationOnce(async () => { const s = f.status; f.setStatus({ schemaVersion: 1, requestId: s.requestId, operationId: s.operationId, sequence: s.sequence + 1, binding: s.binding, state: 'FAILED', code: 'TIMEOUT' }); return ok(f.status) })
    await consent(); await screen.findByRole('alert'); await click('Thử lại yêu cầu AI'); await screen.findByRole('dialog')
    expect(f.api.start).toHaveBeenCalledOnce(); expect(f.api.prepare.mock.calls[1][0].requestId).not.toBe(f.api.prepare.mock.calls[0][0].requestId)
    await consent(); await screen.findByText('Có thể cần kiểm tra biên.')
  })
  it.each(['source', 'same-revision', 'language', 'exercise', 'inactive'] as const)('%s change during pending request drops late output', async change => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run')
    const g = gate<Awaited<ReturnType<SmartHintsApi['start']>>>(), old = f.api.start.getMockImplementation()!
    f.api.start.mockImplementationOnce(q => { void old(q); return g.promise })
    await consent()
    const response = ok(f.status)
    f.rerenderData(change === 'source' ? { source: '// edited', revision: 2, modelVersion: 2 }
      : change === 'same-revision' ? { source: '// content differs', modelVersion: 2 }
        : change === 'language' ? { language: 'csharp' } : change === 'exercise' ? { exerciseId: 'next' } : { active: false })
    await act(async () => { g.resolve(response) })
    expect(screen.queryByText('Có thể cần kiểm tra biên.')).toBeNull(); expect(f.api.retireContext).toHaveBeenCalled()
  })
  it('source edit while consent is open removes the dialog and never sends start', async () => {
    const f = fixture(); await f.open(); await prepare(/^Hint$/)
    f.rerenderData({ source: '// new', revision: 2, modelVersion: 2 })
    expect(screen.queryByRole('dialog')).toBeNull(); expect(f.api.start).not.toHaveBeenCalled()
  })
  it('Solution retirement during hashing revokes admission before an operation exists', async () => {
    const f = fixture(); await f.open()
    const snapshot = f.snapshot(), blockId = randomUUID(), digest = gate<ArrayBuffer>()
    snapshot.origin = { kind: 'SOLUTION', blockId }
    const hash = vi.spyOn(webcrypto.subtle, 'digest').mockImplementationOnce(() => digest.promise)
    try {
      await act(async () => { void f.controller.begin({ kind: 'EXPLAIN', selection: snapshot.selection! }, snapshot) })
      expect(hash).toHaveBeenCalled()
      act(() => { f.controller.retireSolution(blockId) })
      await act(async () => { digest.resolve(new ArrayBuffer(32)) })
      expect(f.api.prepare).not.toHaveBeenCalled(); expect(f.api.start).not.toHaveBeenCalled()
      expect(f.controller.view.phase).toBe('idle')
    } finally { hash.mockRestore() }
  })
  it('pending prepare arriving after retirement is revoked again', async () => {
    const f = fixture(); await f.open(); const g = gate<Awaited<ReturnType<SmartHintsApi['prepare']>>>(), original = f.api.prepare.getMockImplementation()!
    f.api.prepare.mockImplementationOnce(async q => { const value = await original(q); void g.promise; return g.promise.then(() => value) })
    await click('Analyze Code & Run'); await waitFor(() => expect(f.api.prepare).toHaveBeenCalledOnce())
    f.rerenderData({ source: '// updated', revision: 2, modelVersion: 2 })
    await act(async () => { g.resolve(ok(f.status)) })
    expect(f.api.retireContext.mock.calls.length).toBeGreaterThanOrEqual(2); expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('foreign fingerprint output fails closed without private error text', async () => {
    const f = fixture(); await f.open(); await prepare('Analyze Code & Run'); const original = f.api.start.getMockImplementation()!
    f.api.start.mockImplementationOnce(async q => { const r = await original(q); if (!r.ok) return r; return ok({ ...r.value, binding: { ...r.value.binding, fingerprint: 'f'.repeat(64) } }) })
    await consent(); await screen.findByRole('alert'); expect(screen.queryByText('Có thể cần kiểm tra biên.')).toBeNull(); expect(document.body.textContent).not.toContain('PRIVATE_RAW')
  })
  it('expired results disappear before a delayed timer callback and restart with a fresh context', async () => {
    const f = fixture(); await f.open(); await prepare(/^Hint$/); await consent(); await screen.findByText('Gợi ý 1')
    const old = f.q.clientContextId, clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001)
    try {
      f.rerenderData({})
      expect(screen.queryByText('Gợi ý 1')).toBeNull()
      await prepare('Hint'); expect(f.q.clientContextId).not.toBe(old); expect(f.api.retireContext).toHaveBeenCalled()
    } finally { clock.mockRestore() }
  })
})

/** @vitest-environment jsdom */
import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import type { editor } from 'monaco-editor'
import { applySmartFix, createHintSmartFix, type SmartFix } from '../../src/renderer/src/features/learning/practice/smart-hint-edits'
import type { HintApplyProposal } from '../../src/shared/contracts/smart-hints'
import { smartCandidate } from '../../src/shared/contracts/smart-hints-validation'
import { DraftQueue } from '../../src/renderer/src/features/learning/practice/draft-queue'
import { capturePracticeSelection } from '../../src/renderer/src/features/learning/practice/smart-hints-selection'
import { bindSmartAction } from '../../src/main/services/learning/smart-hints/capture'
import { fixAction } from '../fixtures/learning/smart-hints'

let monaco: typeof import('monaco-editor/editor/editor.api')
const models: editor.ITextModel[] = []
beforeAll(async () => {
  Object.defineProperty(document, 'queryCommandSupported', { configurable: true, value: () => false })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  monaco = await import('monaco-editor/editor/editor.api')
}, 30000)
afterEach(() => { models.splice(0).forEach(m => m.dispose()); vi.useRealTimers() })

function fixture(language: 'csharp' | 'javascript' = 'csharp', eol = '\n', count = 1) {
  const source = ['// 🐟 é', 'return x + 0;', '// end'].join(eol)
  const model = monaco.editor.createModel(source, 'plaintext', monaco.Uri.parse(`practice:///synthetic/solution.${language === 'csharp' ? 'cs' : 'js'}`)); models.push(model)
  const edits = [{ startOffset: source.indexOf('0'), endOffset: source.indexOf('0') + 1, expectedOldText: '0', replacementText: '1', rationale: 'Boundary.' },
    { startOffset: source.indexOf('end'), endOffset: source.indexOf('end') + 3, expectedOldText: 'end', replacementText: 'done 🐟', rationale: 'Comment.' }].slice(0, count)
  const current = { exerciseId: 'synthetic', language, sourceRevision: 7, source, modelId: randomUUID(), blocked: false }
  let live = true, used = false
  const fix: SmartFix = { source, candidate: smartCandidate(source, edits, eol === '\r\n' ? 'CRLF' : 'LF')!,
    result: { schemaVersion: 1, requestId: randomUUID(), operationId: randomUUID(), sequence: 1, state: 'COMPLETE',
      binding: { clientContextId: randomUUID(), contextGeneration: 1, packageVersion: 1, exerciseId: current.exerciseId, language, sourceRevision: 7,
        sourceBytes: new TextEncoder().encode(source).length, fingerprint: createHash('sha256').update(source).digest('hex'),
        origin: { kind: 'PRACTICE', modelId: current.modelId, modelVersion: model.getVersionId(), eol: eol === '\r\n' ? 'CRLF' : 'LF' },
        action: bindSmartAction(fixAction(source, edits[0].startOffset, edits.at(-1)!.endOffset)) },
      output: { kind: 'EDIT_PROPOSAL', edits, rationale: 'Focused.', evidence: [] }, expiresAt: Date.now() + 300000, proposalId: randomUUID(),
      runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' } },
    isCurrent: () => live && !used, consume: () => { if (!live || used) return false; used = true; return true } }
  let selections = [new monaco.Selection(3, 7, 1, 4)], activeModel = model
  // Real text model adapter; standalone editor is verified separately in Electron.
  const ed = { getModel: () => activeModel, getSelections: () => selections, getScrollTop: () => 35, getScrollLeft: () => 12,
    setScrollPosition: vi.fn(), focus: vi.fn(), pushUndoStop: () => model.pushStackElement(),
    executeEdits: vi.fn((_id, ops, end) => { model.pushEditOperations(selections, ops, () => selections = end([])); return true }),
  } as unknown as editor.IStandaloneCodeEditor
  const apply = () => applySmartFix(ed, fix, current, (a, b, c, d) => new monaco.Selection(a, b, c, d))
  return { source, model, edits, fix, current, ed, apply, retire: () => { live = false },
    replaceModel: () => { activeModel = monaco.editor.createModel(source, 'plaintext', monaco.Uri.parse('practice:///other/solution.cs')); models.push(activeModel) } }
}

for (const language of ['csharp', 'javascript'] as const) for (const eol of ['\n', '\r\n']) for (const count of [1, 2]) {
  it(`real model: ${language} ${JSON.stringify(eol)} ${count} edits exact batch/native Undo/Redo, draft path`, async () => {
    const f = fixture(language, eol, count), changes: string[] = []
    if (count === 2) {
      expect(f.apply()).toBe('STALE'); expect(f.ed.executeEdits).not.toHaveBeenCalled(); expect(f.model.getValue()).toBe(f.source); return
    }
    const save = vi.fn(async () => ({ ok: true as const, value: null })), report = vi.fn()
    const queue = new DraftQueue({ save }, report)
    const sub = f.model.onDidChangeContent(() => { changes.push(f.model.getValue()); queue.enqueue({ exerciseId: 'synthetic', language, code: f.model.getValue() }) })
    expect(f.apply()).toBe('APPLIED'); expect(changes).toEqual([f.fix.candidate]); expect(f.model.getEOL()).toBe(eol)
    expect(f.ed.executeEdits).toHaveBeenCalledTimes(1)
    expect(f.ed.setScrollPosition).toHaveBeenCalledWith({ scrollTop: 35, scrollLeft: 12 }); expect(f.ed.focus).toHaveBeenCalledOnce()
    expect(f.apply()).toBe('STALE'); await queue.flush()
    await f.model.undo(); expect(f.model.getValue()).toBe(f.source); await queue.flush()
    await f.model.redo(); expect(f.model.getValue()).toBe(f.fix.candidate); await queue.flush()
    expect(save.mock.calls.map((call: unknown[]) => (call[0] as { code: string }).code)).toEqual([f.fix.candidate, f.source, f.fix.candidate])
    expect(changes).not.toContain(''); sub.dispose(); queue.cancelTimer()
  })
}
it.each(['blocked', 'revision', 'exercise', 'language', 'source', 'identity', 'version', 'model', 'expired', 'retired', 'candidate', 'oldText', 'selection'])(
  '%s mismatch refuses whole proposal without invoking executeEdits', kind => {
    const f = fixture()
    if (kind === 'blocked') f.current.blocked = true
    if (kind === 'revision') f.current.sourceRevision++
    if (kind === 'exercise') f.current.exerciseId = 'other'
    if (kind === 'language') f.current.language = 'javascript'
    if (kind === 'source') f.current.source += ' '
    if (kind === 'identity') f.current.modelId = randomUUID()
    if (kind === 'version') { f.model.pushEditOperations([], [{ range: new monaco.Range(1, 1, 1, 1), text: ' ' }], () => []); void f.model.undo() }
    if (kind === 'model') f.replaceModel()
    if (kind === 'expired') f.fix.result.expiresAt = Date.now() - 1
    if (kind === 'retired') f.retire()
    if (kind === 'candidate') Object.assign(f.fix, { candidate: 'wrong' })
    if (kind === 'oldText') f.edits[0].expectedOldText = '9'
    if (kind === 'selection' && f.fix.result.binding.action.kind === 'SUGGEST_FIX') f.fix.result.binding.action.selection.startOffset--
    expect(f.apply()).toBe('STALE'); expect(f.ed.executeEdits).not.toHaveBeenCalled(); expect(f.model.getValue()).toBe(f.source)
  })
it.each(['csharp', 'javascript'] as const)('Hint %s output cannot mint an Apply grant or mutate a real Monaco model', language => {
  const f = fixture(language)
  f.fix.result.binding.action = { kind: 'HINT' }
  f.fix.result.output = { kind: 'HINT', thinking: 'Think', steps: ['Step'], code: { language, text: f.fix.candidate }, evidence: [] }
  f.fix.result.proposalId = null
  expect(f.apply()).toBe('STALE')
  expect(f.ed.executeEdits).not.toHaveBeenCalled()
  expect(f.model.getValue()).toBe(f.source)
})
it('a copied Hint proposal/history object cannot inherit the consumed object identity', async () => {
  const f = fixture(), r = f.fix.result
  if (r.output.kind !== 'EDIT_PROPOSAL') throw Error('fixture')
  const p: HintApplyProposal = { schemaVersion: 1, requestId: randomUUID(), proposalId: randomUUID(),
    hint: { requestId: r.requestId, operationId: r.operationId }, binding: { ...r.binding, action: { kind: 'HINT' } }, expiresAt: r.expiresAt,
    target: { kind: 'SELECTION', startOffset: f.edits[0].startOffset, endOffset: f.edits[0].endOffset }, output: r.output }
  const fix = createHintSmartFix(p, f.source, () => true, async () => ({ ok: true, value: p }))!
  const apply = (value: typeof fix) => applySmartFix(f.ed, value, f.current, (a, b, c, d) => new monaco.Selection(a, b, c, d))
  expect(apply(fix)).toBe('STALE'); expect(f.ed.executeEdits).not.toHaveBeenCalled()
  expect(await fix.authorize()).toBe(true)
  expect(apply({ ...fix })).toBe('STALE'); expect(f.ed.executeEdits).not.toHaveBeenCalled()
  expect(apply(fix)).toBe('APPLIED'); expect(apply(fix)).toBe('STALE')
  expect(f.ed.executeEdits).toHaveBeenCalledOnce()
})
it('save failure retains latest code after Apply/Undo/Redo and blocks flush until retry', async () => {
  const f = fixture(), save = vi.fn().mockResolvedValue({ ok: false }), report = vi.fn(), queue = new DraftQueue({ save }, report)
  const sub = f.model.onDidChangeContent(() => queue.enqueue({ exerciseId: 'synthetic', language: 'csharp', code: f.model.getValue() }))
  expect(f.apply()).toBe('APPLIED'); expect(await queue.flush()).toBe(false); expect(queue.hasPending()).toBe(true)
  await f.model.undo(); await f.model.redo(); expect(f.model.getValue()).toBe(f.fix.candidate)
  save.mockResolvedValue({ ok: true, value: null }); expect(await queue.flush()).toBe(true)
  expect(save.mock.lastCall?.[0].code).toBe(f.fix.candidate); expect(queue.hasPending()).toBe(false)
  expect(report).toHaveBeenCalledWith(expect.stringContaining('Code Draft')); sub.dispose(); queue.cancelTimer()
})
it('same URI/version/text replacement still rejects the original real model identity', () => {
  const f = fixture(), snapshot = capturePracticeSelection({ getModel: () => f.model, getSelection: () => null } as unknown as editor.IStandaloneCodeEditor,
    'synthetic', 'csharp', f.current.modelId)!
  const uri = f.model.uri; f.model.dispose()
  const replacement = monaco.editor.createModel(f.source, 'plaintext', uri); models.push(replacement)
  expect(replacement.getVersionId()).toBe(1); expect(snapshot.isCurrent()).toBe(false)
})
for (const language of ['csharp', 'javascript'] as const) for (const eol of ['\n', '\r\n']) {
  it(`multiline ${language} ${JSON.stringify(eol)} edit maps untouched markers and native Undo/Redo`, async () => {
    const f = fixture(language, eol, 1), old = 'return x + 0;', start = f.source.indexOf(old)
    Object.assign(f.edits[0], { startOffset: start, endOffset: start + old.length, expectedOldText: old, replacementText: ['return x + 1;', '// boundary 🐟'].join(eol) })
    f.fix.result.binding.action = bindSmartAction(fixAction(f.source, start, start + old.length))
    Object.assign(f.fix, { candidate: smartCandidate(f.source, f.edits, eol === '\r\n' ? 'CRLF' : 'LF')! })
    const [id] = f.model.deltaDecorations([], [{ range: new monaco.Range(3, 1, 3, 7), options: {} }])
    expect(f.apply()).toBe('APPLIED'); expect(f.model.getDecorationRange(id)?.startLineNumber).toBe(4)
    await f.model.undo(); expect(f.model.getValue()).toBe(f.source); expect(f.model.getDecorationRange(id)?.startLineNumber).toBe(3)
    await f.model.redo(); expect(f.model.getValue()).toBe(f.fix.candidate); expect(f.model.getEOL()).toBe(eol)
  })
}
it('false executeEdits result consumes the proposal and reports transaction failure without fallback', () => {
  const f = fixture(); vi.mocked(f.ed.executeEdits).mockReturnValue(false)
  expect(f.apply()).toBe('TRANSACTION_FAILED'); expect(f.model.getValue()).toBe(f.source); expect(f.apply()).toBe('STALE')
})
it('inflight autosave drains the later Undo snapshot; Project sentinel and native redo survive', async () => {
  const f = fixture(), project = monaco.editor.createModel('project sentinel', 'plaintext', monaco.Uri.parse('file:///project/sentinel.cs')); models.push(project)
  let release!: () => void
  const saved: string[] = [], pending = new Promise<void>(resolve => { release = resolve })
  const queue = new DraftQueue({ save: async draft => { saved.push(draft.code); if (saved.length === 1) await pending; return { ok: true, value: null } } }, () => {})
  const sub = f.model.onDidChangeContent(() => queue.enqueue({ exerciseId: 'synthetic', language: 'csharp', code: f.model.getValue() }))
  expect(f.apply()).toBe('APPLIED'); const saving = queue.flush()
  await f.model.undo(); expect(queue.hasPending()).toBe(true); release(); expect(await saving).toBe(true)
  expect(saved).toEqual([f.fix.candidate, f.source]); expect(project.getValue()).toBe('project sentinel')
  await f.model.redo(); expect(f.model.getValue()).toBe(f.fix.candidate); await queue.flush()
  sub.dispose(); queue.cancelTimer()
})
it.each(['surrogate', 'crlf', 'overlap', 'ambiguous', 'bounds', 'rewrite', 'eol', 'count', 'bytes', 'lines'])(
  'renderer candidate rejects %s with no partial result', kind => {
    const f = fixture('csharp', '\r\n'), edits = f.edits
    if (kind === 'surrogate') Object.assign(edits[0], { startOffset: 4, endOffset: 5, expectedOldText: f.source.slice(4, 5) })
    if (kind === 'crlf') { const n = f.source.indexOf('\r'); Object.assign(edits[0], { startOffset: n + 1, endOffset: n + 1, expectedOldText: '' }) }
    if (kind === 'overlap') edits.push({ ...edits[0] })
    if (kind === 'ambiguous') edits.push({ ...edits[0], startOffset: edits[0].endOffset, expectedOldText: '' })
    if (kind === 'bounds') edits[0].endOffset = 90000
    if (kind === 'rewrite') edits.splice(0, 2, { ...edits[0], startOffset: 0, endOffset: f.source.length, expectedOldText: f.source })
    if (kind === 'eol') edits[0].replacementText = '\n'
    if (kind === 'count') edits.push(...Array.from({ length: 5 }, () => ({ ...edits[0] })))
    if (kind === 'bytes') edits[0].replacementText = '魚'.repeat(6000)
    if (kind === 'lines') edits[0].replacementText = '\r\n'.repeat(201)
    expect(smartCandidate(f.source, edits, 'CRLF')).toBeUndefined()
  })

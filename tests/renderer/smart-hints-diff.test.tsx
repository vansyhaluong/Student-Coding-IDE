/** @vitest-environment jsdom */
import { render, cleanup, act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SmartFix } from '../../src/renderer/src/features/learning/practice/smart-hint-edits'
import { SmartHintDiffPreview } from '../../src/renderer/src/features/learning/practice/SmartHintDiffPreview'
import { bindSmartAction } from '../../src/main/services/learning/smart-hints/capture'
import { fixAction } from '../fixtures/learning/smart-hints'

const h = vi.hoisted(() => ({ width: 800, callback: undefined as (() => void) | undefined,
  didUpdate: undefined as (() => void) | undefined,
  frames: [] as FrameRequestCallback[], order: [] as string[], update: vi.fn(), layout: vi.fn(), cancel: vi.fn(), disconnect: vi.fn() }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({ monaco: {
  Uri: { parse: (value: string) => value }, editor: {
    createModel: (_text: string, _language: string, uri: string) => ({ dispose: () => h.order.push(`model:${uri.split('/').at(-1)}`) }),
    createDiffEditor: () => ({ updateOptions: h.update, layout: h.layout, getLineChanges: () => [],
      onDidUpdateDiff: (callback: () => void) => { h.didUpdate = callback; return { dispose: () => h.order.push('listener') } },
      setModel: (model: unknown) => { if (model === null) h.order.push('detach') },
      dispose: () => h.order.push('editor'),
    }),
  },
} }))
const fix: SmartFix = { source: 'return x + 0;', candidate: 'return x + 1;', isCurrent: () => true, consume: () => true,
  result: { schemaVersion: 1, state: 'COMPLETE', requestId: '11111111-1111-4111-8111-111111111111', operationId: '22222222-2222-4222-8222-222222222222', sequence: 1,
    binding: { clientContextId: '33333333-3333-4333-8333-333333333333', contextGeneration: 1, exerciseId: 'synthetic', language: 'javascript', packageVersion: 1,
      sourceRevision: 1, fingerprint: 'a'.repeat(64), sourceBytes: 13, origin: { kind: 'PRACTICE', modelId: '44444444-4444-4444-8444-444444444444', modelVersion: 1, eol: 'LF' }, action: bindSmartAction(fixAction('return x + 0;', 11, 12)) },
    expiresAt: 9999999999999, proposalId: '55555555-5555-4555-8555-555555555555', runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' },
    output: { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: 11, endOffset: 12, expectedOldText: '0', replacementText: '1', rationale: 'Boundary.' }], rationale: 'Boundary.', evidence: [] },
  } }
beforeEach(() => {
  h.width = 800; h.frames = []; h.order = []; h.update.mockClear(); h.layout.mockClear(); h.cancel.mockClear(); h.disconnect.mockClear()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => h.width)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { h.callback = callback } observe() {} disconnect = h.disconnect })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { h.frames.push(callback); return h.frames.length })
  vi.stubGlobal('cancelAnimationFrame', h.cancel)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const mount = () => render(<SmartHintDiffPreview fix={fix} blocked={false} onApply={() => 'APPLIED'} onDiscard={vi.fn()} onReturnFocus={vi.fn()} />)
it('coalesces observer events and updates layout outside observer delivery only when crossing width threshold', () => {
  mount(); h.width = 1100; h.callback!(); h.callback!()
  expect(h.update).not.toHaveBeenCalled(); expect(h.layout).not.toHaveBeenCalled(); expect(h.frames).toHaveLength(1)
  h.frames[0](0); expect(h.update).toHaveBeenCalledExactlyOnceWith({ renderSideBySide: true })
  expect(h.layout).toHaveBeenCalledWith({ width: 1100, height: 0 })
  h.callback!(); h.frames[1](0); expect(h.update).toHaveBeenCalledTimes(1)
  h.width = 800; h.callback!(); h.frames[2](0); expect(h.update).toHaveBeenLastCalledWith({ renderSideBySide: false })
})
it('cancels pending resize and guards a late callback after disposal', () => {
  const ui = mount(); h.width = 1100; h.callback!(); const pending = h.frames[0]
  ui.unmount(); expect(h.cancel).toHaveBeenCalledWith(1); expect(h.disconnect).toHaveBeenCalledOnce()
  pending(0); h.callback!(); expect(h.update).not.toHaveBeenCalled(); expect(h.layout).not.toHaveBeenCalled(); expect(h.frames).toHaveLength(1)
})
it('detaches diff and removes listener before disposing owned editor and models', () => {
  const ui = mount(); ui.unmount()
  expect(h.order).toEqual(['listener', 'detach', 'editor', 'model:original', 'model:modified'])
})
it('successful Apply has its own completion callback and is never reported as Discard', () => {
  const applied = vi.fn(), discarded = vi.fn(), apply = vi.fn(() => 'APPLIED' as const)
  render(<SmartHintDiffPreview fix={fix} blocked={false} onApply={apply} onApplied={applied} onDiscard={discarded} onReturnFocus={() => {}} />)
  act(() => h.didUpdate?.())
  fireEvent.click(screen.getByRole('button', { name: 'Apply Fix' }))
  expect(apply).toHaveBeenCalledOnce(); expect(applied).toHaveBeenCalledOnce(); expect(discarded).not.toHaveBeenCalled()
})

/** @vitest-environment jsdom */
import { useEffect } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { PracticeEditor } from '../../src/renderer/src/features/learning/practice/PracticeEditor'

const host = vi.hoisted(() => ({ props: undefined as unknown, ed: undefined as unknown }))
vi.mock('../../src/renderer/src/features/editor/monaco', () => ({}))
vi.mock('@monaco-editor/react', () => ({ default: (props: { onMount(editor: unknown): void }) => {
  host.props = props
  useEffect(() => { props.onMount(host.ed) }, [])
  return null
} }))
const exercise = exercises.find(e => e.id === 'ch3-01')!
let text: string
let edit: ReturnType<typeof vi.fn>
let view: { lineNumber: number; column: number }
const props = () => host.props as { value?: string; defaultValue: string; onChange(text: string): void }
beforeEach(() => {
  text = 'initial'; view = { lineNumber: 6, column: 12 }
  edit = vi.fn((_source: string, edits: { text: string }[]) => { text = edits[0].text; props().onChange(text); return true })
  host.ed = { getModel: () => ({ isDisposed: () => false, getValue: () => text,
    getFullModelRange: () => ({}), uri: { scheme: 'practice', path: '/ch3-01/solution.cs' } }),
  saveViewState: () => view, restoreViewState: vi.fn(), getSelections: () => [view],
  pushUndoStop: vi.fn(), executeEdits: edit }
})
afterEach(cleanup)

it('never feeds a stale draft echo back to the live model or changes selection', () => {
  const onChange = vi.fn()
  const base = { exercise, language: 'csharp' as const, code: text, readOnly: false, onChange }
  const ui = render(<PracticeEditor {...base} />)
  act(() => { text = 'rapid Ω 😀 edit'; props().onChange(text) })
  ui.rerender(<PracticeEditor {...base} code="older React draft" />)
  expect(text).toBe('rapid Ω 😀 edit')
  expect(edit).not.toHaveBeenCalled()
  expect(props().value).toBeUndefined()
  expect(view).toEqual({ lineNumber: 6, column: 12 })
  expect(onChange).toHaveBeenLastCalledWith('rapid Ω 😀 edit')
})

it('applies explicit replacement once, with undo boundaries and view restoration', () => {
  const base = { exercise, language: 'csharp' as const, code: text, readOnly: false, onChange: vi.fn() }
  const ui = render(<PracticeEditor {...base} />)
  const sourceReplacement = { exerciseId: exercise.id, language: 'csharp' as const, code: 'reset' }
  ui.rerender(<PracticeEditor {...base} code="reset" sourceReplacement={sourceReplacement} />)
  expect(text).toBe('reset')
  expect(edit).toHaveBeenCalledTimes(1)
  expect((host.ed as { pushUndoStop: unknown }).pushUndoStop).toHaveBeenCalledTimes(2)
  expect((host.ed as { restoreViewState: unknown }).restoreViewState).toHaveBeenCalledWith(view)
  act(() => { text = 'typed after reset'; props().onChange(text) })
  ui.rerender(<PracticeEditor {...base} code="reset" sourceReplacement={sourceReplacement} />)
  expect(text).toBe('typed after reset')
  expect(edit).toHaveBeenCalledTimes(1)
})

it('rejects replacement for a different exercise/language and uses the latest callback', () => {
  const old = vi.fn(), next = vi.fn()
  const base = { exercise, language: 'csharp' as const, code: text, readOnly: false, onChange: old }
  const ui = render(<PracticeEditor {...base} />)
  ui.rerender(<PracticeEditor {...base} onChange={next} sourceReplacement={{ exerciseId: exercise.id, language: 'javascript', code: 'wrong context' }} />)
  act(() => props().onChange('new local edit'))
  expect(edit).not.toHaveBeenCalled()
  expect(old).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledWith('new local edit')
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoSave } from '../../src/renderer/src/features/editor/auto-save'
import { EditorModelManager, type EditorTextModel } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import type { ProjectId } from '../../src/shared/contracts'

class Model implements EditorTextModel {
  private version = 1
  private listeners = new Set<() => void>()
  constructor(private value: string) {}
  getValue() { return this.value }
  getVersionId() { return this.version }
  setValue(value: string) { this.value = value; this.version++; this.listeners.forEach(fn => fn()) }
  onDidChangeContent(fn: () => void) { this.listeners.add(fn); return { dispose: () => { this.listeners.delete(fn) } } }
  dispose() { this.listeners.clear() }
}
const id = 'project_1234567890abcdef12345678' as ProjectId
let manager: EditorModelManager
let scheduler: AutoSave
beforeEach(() => { vi.useFakeTimers(); manager = new EditorModelManager({ createModel: value => new Model(value) }) })
afterEach(() => { scheduler?.dispose(); manager.dispose(); vi.useRealTimers() })
describe('Auto Save', () => {
  it('debounces each document independently and preserves edits made during a save', async () => {
    let finish!: () => void
    const save = vi.fn(async (key: string) => {
      const snapshot = manager.createSaveSnapshot(key)!
      await new Promise<void>(resolve => { finish = resolve })
      return manager.acceptSave(snapshot)
    })
    scheduler = new AutoSave(manager, save, () => true, vi.fn())
    const doc = manager.openDocument(id, 'a.ts', 'disk')
    doc.model.setValue('first')
    await vi.advanceTimersByTimeAsync(900)
    doc.model.setValue('second')
    await vi.advanceTimersByTimeAsync(999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledOnce()
    doc.model.setValue('third')
    finish()
    await Promise.resolve()
    expect(doc.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
    finish()
    await Promise.resolve()
    expect(doc.dirty).toBe(false)
  })

  it('does not retry a rejected save without another edit', async () => {
    const report = vi.fn()
    const save = vi.fn().mockRejectedValue(new Error('write failure'))
    scheduler = new AutoSave(manager, save, () => true, report)
    const doc = manager.openDocument(id, 'a.ts', 'disk')
    doc.model.setValue('mine')
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledOnce()
    expect(doc.dirty).toBe(true)
    doc.model.setValue('new edit')
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('cancels disabled, closed and disposed work and follows renamed dirty models', async () => {
    let enabled = true
    const save = vi.fn(async () => false)
    scheduler = new AutoSave(manager, save, () => enabled, vi.fn())
    const doc = manager.openDocument(id, 'old.ts', 'disk')
    doc.model.setValue('mine')
    manager.renamePath(id, 'old.ts', 'new.ts', false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenLastCalledWith(manager.findDocument(id, 'new.ts')!.key)
    const next = manager.findDocument(id, 'new.ts')!
    next.model.setValue('next')
    enabled = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledOnce()
    enabled = true
    next.model.setValue('last')
    scheduler.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledOnce()
  })

  it('schedules already dirty files when enabled and cancels closed models', async () => {
    const a = manager.openDocument(id, 'a.ts', 'disk')
    const b = manager.openDocument(id, 'b.ts', 'disk')
    a.model.setValue('a')
    b.model.setValue('b')
    const save = vi.fn(async () => true)
    scheduler = new AutoSave(manager, save, () => true, vi.fn())
    manager.close(a.key)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledExactlyOnceWith(b.key)
  })
})

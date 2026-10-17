import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getBundledCourse } from '../../src/main/services/learning/content/course'
import { isLearningCourse, LEARNING_CHANNELS } from '../../src/shared/contracts/learning'
import { LearningIpcService } from '../../src/main/ipc/learning-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { createLearningBridge } from '../../src/preload/bridge/learning'
import { DomainError } from '../../src/main/errors/app-error'

describe('Learning content and narrow IPC', () => {
  it('preserves the supplied manifest and every chapter byte-for-byte', () => {
    const course = getBundledCourse()
    expect(isLearningCourse(course)).toBe(true)
    expect(course.manifest).toEqual(JSON.parse(readFileSync(resolve('docs/learning/manifest.json'), 'utf8')))
    let count = 0
    for (const [i, chapter] of course.manifest.chapters.entries()) {
      const markdown = readFileSync(resolve('docs/learning', chapter.contentPath), 'utf8')
      expect(course.materials[i].markdown).toBe(markdown)
      expect(course.materials[i].chapterId).toBe(chapter.id)
      const headings = [...markdown.matchAll(/^## (.+)$/gm)].map(match => match[1])
      expect(headings.slice(0, -1)).toEqual(chapter.sections)
      expect(headings.at(-1)).toBe('Tài liệu tham khảo chính thống')
      for (const reference of chapter.references) expect(markdown).toContain(reference.url)
      count += chapter.sections.length
    }
    expect(count).toBe(47)
  })
  it('rejects missing chapters, unexpected schema, unsafe paths and altered language metadata', () => {
    for (const mutate of [
      (v: ReturnType<typeof getBundledCourse>) => { v.materials.pop() },
      (v: ReturnType<typeof getBundledCourse>) => { v.manifest.chapters[0].contentPath = '../outside.md' },
      (v: ReturnType<typeof getBundledCourse>) => { v.manifest.chapters[0].references[0].url = 'javascript:alert(1)' },
    ]) { const value = getBundledCourse(); mutate(value); expect(isLearningCourse(value)).toBe(false) }
    expect(isLearningCourse({ manifest: { schemaVersion: 2 }, materials: [] })).toBe(false)
  })
  it('validates before dispatch, authorizes the frame, validates bridge responses and unregisters', async () => {
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const registry = new IpcHandlerRegistry({ handle: (channel, handler) => { handlers.set(channel, handler) },
      removeHandler: channel => { handlers.delete(channel) } })
    const load = vi.fn(getBundledCourse), authorize = vi.fn()
    const service = new LearningIpcService(registry, load, authorize)
    service.start()
    const invoke = vi.fn(async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id: 1 } }, payload))
    const bridge = createLearningBridge({ invoke, on: vi.fn(), removeListener: vi.fn() })
    expect((await bridge.getCourse()).ok).toBe(true)
    expect(load).toHaveBeenCalledOnce()
    for (const payload of [null, { path: 'C:/private.md' }, { chapterId: '../outside' }, []]) {
      expect(await invoke(LEARNING_CHANNELS.getCourse, payload)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    expect(load).toHaveBeenCalledOnce()
    authorize.mockImplementationOnce(() => { throw new DomainError({ code: 'PERMISSION_DENIED', message: 'Not authorized.', retryable: false }) })
    expect(await bridge.getCourse()).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(load).toHaveBeenCalledOnce()
    invoke.mockResolvedValueOnce({ ok: true, value: { manifest: {}, materials: [] } })
    expect((await bridge.getCourse()).ok).toBe(false)
    service.stop()
    expect(handlers.size).toBe(0)
  })
})

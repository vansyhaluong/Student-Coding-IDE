import type { EditorModelManager, EditorDocument } from './models/editor-model-manager'
/** Scheduling only. Existing editor save owns validation, disk writes and dirty state. */
export class AutoSave {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private remove: () => void
  private disposed = false
  constructor(private readonly manager: Pick<EditorModelManager, 'getOpenDocuments' | 'subscribeDocumentLifecycle'>,
    private readonly save: (key: string) => Promise<boolean>, private readonly enabled: () => boolean,
    private readonly report: () => void) {
    this.remove = manager.subscribeDocumentLifecycle(event => {
      if (event.type === 'closed' || event.type === 'renamed') {
        for (const [key, timer] of this.timers) if (!manager.getOpenDocuments().some(d => d.key === key)) { clearTimeout(timer); this.timers.delete(key) }
      }
      if (event.type === 'content-changed' || event.type === 'opened' || event.type === 'renamed') {
        const doc = manager.getOpenDocuments().find(d => d.projectId === event.projectId && d.relativePath === event.relativePath)
        if (doc) this.schedule(doc)
      }
    })
    for (const doc of manager.getOpenDocuments()) if (doc.dirty) this.schedule(doc)
  }
  private schedule(doc: EditorDocument) {
    clearTimeout(this.timers.get(doc.key)); this.timers.delete(doc.key)
    if (!doc.dirty || !this.enabled()) return
    this.timers.set(doc.key, setTimeout(() => {
      this.timers.delete(doc.key)
      if (this.disposed || !this.enabled() || !this.manager.getOpenDocuments().some(d => d.key === doc.key && d.model === doc.model && d.dirty)) return
      void this.save(doc.key).catch(this.report)
    }, 1000))
  }
  dispose() { this.disposed = true; this.remove(); for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear() }
}

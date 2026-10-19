import type { ExerciseDraft, PracticeApi } from '../../../../../shared/contracts/practice'

/** Component-owned write scheduling, never a global store or editor model owner. */
export class DraftQueue {
  private pending = new Map<string, ExerciseDraft>()
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<boolean>
  constructor(private readonly api: Pick<PracticeApi, 'save'>, private readonly report: (error: string | null) => void) {}
  enqueue(draft: ExerciseDraft): void {
    const key = `${draft.exerciseId}/${draft.language}`
    // Move latest selection to the end so persisted last-language matches navigation.
    this.pending.delete(key); this.pending.set(key, draft)
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, 500)
  }
  hasPending(): boolean { return this.pending.size > 0 }
  flush(): Promise<boolean> {
    clearTimeout(this.timer)
    if (this.running) return this.running
    this.running = this.drain().finally(() => { this.running = undefined })
    return this.running
  }
  cancelTimer(): void { clearTimeout(this.timer) }
  private async drain(): Promise<boolean> {
    while (this.pending.size) {
      const [key, draft] = this.pending.entries().next().value!
      try {
        const result = await this.api.save(draft)
        if (!result.ok) throw new Error('save failed')
      } catch {
        this.report('Không thể lưu Code Draft. Code vẫn được giữ trong phiên này; hãy thử lưu lại trước khi thoát.')
        return false
      }
      if (this.pending.get(key) === draft) this.pending.delete(key)
    }
    this.report(null)
    return true
  }
}

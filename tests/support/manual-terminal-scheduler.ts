import type {
  TerminalScheduledTask,
  TerminalScheduler,
} from '../../src/main/services/terminal/terminal-scheduler'

interface ScheduledEntry {
  callback: () => void
  delayMilliseconds: number
  cancelled: boolean
}

export class ManualTerminalScheduler implements TerminalScheduler {
  private readonly entries: ScheduledEntry[] = []

  schedule(callback: () => void, delayMilliseconds: number): TerminalScheduledTask {
    const entry: ScheduledEntry = {
      callback,
      delayMilliseconds,
      cancelled: false,
    }
    this.entries.push(entry)
    return {
      cancel(): void {
        entry.cancelled = true
      },
    }
  }

  runDelay(delayMilliseconds: number): void {
    const runnable = this.entries.filter(
      (entry) => !entry.cancelled && entry.delayMilliseconds === delayMilliseconds,
    )
    for (const entry of runnable) {
      entry.cancelled = true
      entry.callback()
    }
  }

  get pendingCount(): number {
    return this.entries.filter((entry) => !entry.cancelled).length
  }
}

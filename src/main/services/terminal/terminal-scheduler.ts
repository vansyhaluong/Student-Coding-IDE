export interface TerminalScheduledTask {
  cancel(): void
}

export interface TerminalScheduler {
  schedule(callback: () => void, delayMilliseconds: number): TerminalScheduledTask
}

export const systemTerminalScheduler: TerminalScheduler = {
  schedule(callback, delayMilliseconds): TerminalScheduledTask {
    const handle = setTimeout(callback, delayMilliseconds)
    handle.unref?.()
    return {
      cancel(): void {
        clearTimeout(handle)
      },
    }
  },
}

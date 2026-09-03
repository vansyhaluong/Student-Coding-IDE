import type {
  PtyExit,
  PtyPort,
  PtyProcessPort,
  PtySpawnOptions,
  PtySubscription,
} from '../../src/main/services/terminal/pty-port'
import type { WindowsJobController } from '../../src/main/services/process/process-tree-terminator'

export class FakePtyPort implements PtyPort {
  readonly spawnCalls: PtySpawnOptions[] = []
  readonly processes: FakePtyProcess[] = []
  private nextPid = 1_000
  private nextSpawnFailure: unknown | null = null
  private exitOnClose: PtyExit | null = null
  private nextImmediateExit: PtyExit | null = null

  failNextSpawn(error: unknown): void {
    this.nextSpawnFailure = error
  }

  setExitOnClose(event: PtyExit | null): void {
    this.exitOnClose = event
  }

  exitImmediatelyOnNextSpawn(event: PtyExit): void {
    this.nextImmediateExit = event
  }

  spawn(options: PtySpawnOptions): FakePtyProcess {
    this.spawnCalls.push(copySpawnOptions(options))
    if (this.nextSpawnFailure !== null) {
      const failure = this.nextSpawnFailure
      this.nextSpawnFailure = null
      throw failure
    }

    const process = new FakePtyProcess(
      this.nextPid,
      this.exitOnClose,
      this.nextImmediateExit,
    )
    this.nextImmediateExit = null
    this.nextPid += 1
    this.processes.push(process)
    return process
  }
}

export class FakePtyProcess implements PtyProcessPort {
  readonly writes: string[] = []
  readonly resizes: Array<{ cols: number; rows: number }> = []
  closeCallCount = 0
  disposeCallCount = 0
  exitAttemptCount = 0
  closed = false
  disposed = false
  exited = false
  readonly processTreeOwnership

  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: PtyExit) => void>()
  private readonly historicalDataListeners = new Set<(data: string) => void>()
  private readonly historicalExitListeners = new Set<(event: PtyExit) => void>()
  private nextWriteFailure: unknown | null = null
  private nextResizeFailure: unknown | null = null
  private nextCloseFailure: unknown | null = null

  constructor(
    readonly pid: number,
    private readonly exitOnClose: PtyExit | null = null,
    private readonly immediateExit: PtyExit | null = null,
  ) {
    const job = new FakeWindowsJobController(`fake-job-${pid}`)
    this.processTreeOwnership = {
      mode: 'JOB_OWNED' as const,
      rootPid: pid,
      job,
    }
  }

  failNextWrite(error: unknown): void {
    this.nextWriteFailure = error
  }

  failNextResize(error: unknown): void {
    this.nextResizeFailure = error
  }

  failNextClose(error: unknown): void {
    this.nextCloseFailure = error
  }

  write(data: string): void {
    this.assertUsable('write')
    if (this.nextWriteFailure !== null) {
      const failure = this.nextWriteFailure
      this.nextWriteFailure = null
      throw failure
    }
    this.writes.push(data)
  }

  resize(cols: number, rows: number): void {
    this.assertUsable('resize')
    if (this.nextResizeFailure !== null) {
      const failure = this.nextResizeFailure
      this.nextResizeFailure = null
      throw failure
    }
    this.resizes.push({ cols, rows })
  }

  close(): void {
    if (this.closed) return
    if (this.nextCloseFailure !== null) {
      const failure = this.nextCloseFailure
      this.nextCloseFailure = null
      throw failure
    }
    this.closed = true
    this.closeCallCount += 1
    if (this.exitOnClose) this.emitExit(this.exitOnClose)
  }

  onData(listener: (data: string) => void): PtySubscription {
    this.assertNotDisposed('subscribe to data')
    this.dataListeners.add(listener)
    this.historicalDataListeners.add(listener)
    return subscription(() => this.dataListeners.delete(listener))
  }

  onExit(listener: (event: PtyExit) => void): PtySubscription {
    this.assertNotDisposed('subscribe to exit')
    this.exitListeners.add(listener)
    this.historicalExitListeners.add(listener)
    if (this.immediateExit && !this.exited) this.emitExit(this.immediateExit)
    return subscription(() => this.exitListeners.delete(listener))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.disposeCallCount += 1
    this.dataListeners.clear()
    this.exitListeners.clear()
  }

  emitData(data: string): void {
    this.assertNotDisposed('emit data')
    for (const listener of [...this.dataListeners]) listener(data)
  }

  emitLateData(data: string): void {
    for (const listener of [...this.historicalDataListeners]) listener(data)
  }

  emitExit(event: PtyExit): boolean {
    this.assertNotDisposed('emit exit')
    this.exitAttemptCount += 1
    if (this.exited) return false
    this.exited = true
    for (const listener of [...this.exitListeners]) listener(event)
    return true
  }

  emitLateExit(event: PtyExit): void {
    for (const listener of [...this.historicalExitListeners]) listener(event)
  }

  private assertUsable(operation: string): void {
    this.assertNotDisposed(operation)
    if (this.closed || this.exited) {
      throw new Error(`Cannot ${operation} on a closed fake PTY`)
    }
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} on a disposed fake PTY`)
    }
  }
}

class FakeWindowsJobController implements WindowsJobController {
  private released = false

  constructor(readonly token: string) {}

  activeProcessCount(): number { return this.released ? 0 : 1 }
  terminate(): void {}
  release(): void { this.released = true }
  isReleased(): boolean { return this.released }
}

function copySpawnOptions(options: PtySpawnOptions): PtySpawnOptions {
  return {
    ...options,
    args: [...options.args],
    env: { ...options.env },
  }
}

function subscription(disposeListener: () => boolean): PtySubscription {
  let disposed = false
  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      disposeListener()
    },
  }
}

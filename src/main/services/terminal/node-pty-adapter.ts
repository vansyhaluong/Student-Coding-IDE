import * as nodePty from 'node-pty'

import type {
  ProcessTreeOwnership,
  WindowsJobController,
} from '../process/process-tree-terminator'
import type {
  PtyExit,
  PtyPort,
  PtyProcessPort,
  PtySpawnOptions,
  PtySubscription,
} from './pty-port'

const MAXIMUM_EARLY_OUTPUT_BYTES = 64 * 1024
const WINDOWS_JOB_CAPABILITY = 'student-coding-ide-windows-job-v1'

interface JobPatchedNodePtyModule {
  supportsWindowsJobOwnership(): string
}

interface JobPatchedPty extends nodePty.IPty {
  readonly windowsJobToken: string
  windowsJobActiveProcessCount(): number
  terminateWindowsJob(): void
  releaseWindowsJob(): void
}

export class NodePtyPort implements PtyPort {
  spawn(options: PtySpawnOptions): PtyProcessPort {
    if (process.platform === 'win32') {
      const capability = (nodePty as unknown as Partial<JobPatchedNodePtyModule>)
        .supportsWindowsJobOwnership?.()
      if (capability !== WINDOWS_JOB_CAPABILITY) {
        throw new Error('The patched Windows terminal ownership capability is unavailable.')
      }
    }
    const nativeProcess = nodePty.spawn(
      options.executable,
      [...options.args],
      {
        cwd: options.cwd,
        env: { ...options.env },
        cols: options.cols,
        rows: options.rows,
        name: options.name,
      },
    )
    return new NodePtyProcessAdapter(nativeProcess)
  }
}

class NodePtyProcessAdapter implements PtyProcessPort {
  readonly pid: number
  readonly processTreeOwnership: ProcessTreeOwnership
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: PtyExit) => void>()
  private readonly pendingData: string[] = []
  private pendingDataBytes = 0
  private pendingExit: PtyExit | undefined
  private earlyOutputFailure: Error | undefined
  private closeRequested = false
  private disposed = false
  private exited = false
  private readonly nativeDataSubscription: nodePty.IDisposable
  private readonly nativeExitSubscription: nodePty.IDisposable

  constructor(private readonly nativeProcess: nodePty.IPty) {
    this.pid = nativeProcess.pid
    if (process.platform === 'win32') {
      const patchedProcess = nativeProcess as JobPatchedPty
      const job = createWindowsJobController(patchedProcess)
      this.processTreeOwnership = {
        mode: 'JOB_OWNED' as const,
        rootPid: this.pid,
        job,
      }
    } else {
      this.processTreeOwnership = {
        mode: 'LEGACY_ROOT_OWNED' as const,
        rootPid: this.pid,
      }
    }
    this.nativeDataSubscription = nativeProcess.onData((data) => {
      if (this.disposed || this.exited) return
      if (this.dataListeners.size === 0) {
        const bytes = Buffer.byteLength(data, 'utf8')
        if (this.pendingDataBytes + bytes > MAXIMUM_EARLY_OUTPUT_BYTES) {
          this.earlyOutputFailure = new Error(
            'PTY emitted too much output before its data listener was attached.',
          )
          return
        }
        this.pendingData.push(data)
        this.pendingDataBytes += bytes
        return
      }
      for (const listener of [...this.dataListeners]) listener(data)
    })
    this.nativeExitSubscription = nativeProcess.onExit((event) => {
      if (this.disposed || this.exited) return
      this.exited = true
      const normalized: PtyExit = {
        exitCode: Number.isSafeInteger(event.exitCode) ? event.exitCode : null,
        signal: Number.isSafeInteger(event.signal) ? event.signal ?? null : null,
      }
      if (this.exitListeners.size === 0) {
        this.pendingExit = normalized
        return
      }
      for (const listener of [...this.exitListeners]) listener(normalized)
    })
  }

  write(data: string): void {
    this.assertUsable()
    this.nativeProcess.write(data)
  }

  resize(cols: number, rows: number): void {
    this.assertUsable()
    this.nativeProcess.resize(cols, rows)
  }

  close(): void {
    if (this.closeRequested || this.disposed) return
    if (this.processTreeOwnership.mode === 'JOB_OWNED') {
      if (!this.processTreeOwnership.job.isReleased()) {
        throw new Error('The Windows terminal Job must be finalized before PTY disposal.')
      }
      // The patched Job path removes node-pty's console-list/PID termination.
      // After Job release, kill() closes only the remaining ConPTY transport.
      this.nativeProcess.kill()
      this.closeRequested = true
      return
    }
    if (this.exited) return
    this.nativeProcess.kill()
    this.closeRequested = true
  }

  onData(listener: (data: string) => void): PtySubscription {
    this.assertNotDisposed()
    if (this.earlyOutputFailure) throw this.earlyOutputFailure
    this.dataListeners.add(listener)
    for (const data of this.pendingData.splice(0)) listener(data)
    this.pendingDataBytes = 0
    return subscription(() => this.dataListeners.delete(listener))
  }

  onExit(listener: (event: PtyExit) => void): PtySubscription {
    this.assertNotDisposed()
    this.exitListeners.add(listener)
    if (this.pendingExit) {
      const event = this.pendingExit
      this.pendingExit = undefined
      listener(event)
    }
    return subscription(() => this.exitListeners.delete(listener))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.nativeDataSubscription.dispose()
    this.nativeExitSubscription.dispose()
    this.dataListeners.clear()
    this.exitListeners.clear()
    this.pendingData.length = 0
    this.pendingDataBytes = 0
    this.pendingExit = undefined
  }

  private assertUsable(): void {
    this.assertNotDisposed()
    if (this.closeRequested || this.exited) {
      throw new Error('The PTY is no longer running.')
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('The PTY adapter is disposed.')
  }
}

function createWindowsJobController(nativeProcess: JobPatchedPty): WindowsJobController {
  const token = nativeProcess.windowsJobToken
  if (!token) throw new Error('The Windows terminal Job token is unavailable.')
  let released = false
  let terminationRequested = false
  return {
    token,
    activeProcessCount(): number {
      if (released) return 0
      return nativeProcess.windowsJobActiveProcessCount()
    },
    terminate(): void {
      if (released || terminationRequested) return
      nativeProcess.terminateWindowsJob()
      terminationRequested = true
    },
    release(): void {
      if (released) return
      nativeProcess.releaseWindowsJob()
      released = true
    },
    isReleased: () => released,
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

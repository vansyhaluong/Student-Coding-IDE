import { beforeEach, describe, expect, it, vi } from 'vitest'

const nodePtyMock = vi.hoisted(() => ({
  capability: 'student-coding-ide-windows-job-v1' as string | undefined,
  spawn: vi.fn(),
}))

vi.mock('node-pty', () => ({
  supportsWindowsJobOwnership: () => nodePtyMock.capability,
  spawn: nodePtyMock.spawn,
}))

import { NodePtyPort } from '../../src/main/services/terminal/node-pty-adapter'
import type { PtySpawnOptions } from '../../src/main/services/terminal/pty-port'

const SPAWN_OPTIONS: PtySpawnOptions = {
  executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  args: [],
  cwd: 'D:\\coding-ide',
  env: { SystemRoot: 'C:\\Windows' },
  cols: 80,
  rows: 24,
  name: 'xterm-256color',
}

describe('Phase 2E-J patched node-pty adapter', () => {
  beforeEach(() => {
    nodePtyMock.capability = 'student-coding-ide-windows-job-v1'
    nodePtyMock.spawn.mockReset()
  })

  it('fails before spawn when the patched native capability is unavailable', () => {
    nodePtyMock.capability = undefined

    expect(() => new NodePtyPort().spawn(SPAWN_OPTIONS))
      .toThrow('patched Windows terminal ownership capability is unavailable')
    expect(nodePtyMock.spawn).not.toHaveBeenCalled()
  })

  it('returns one Main-only Job controller and makes terminate/release idempotent', () => {
    const native = fakeNativePty()
    nodePtyMock.spawn.mockReturnValue(native)
    const process = new NodePtyPort().spawn(SPAWN_OPTIONS)

    expect(process.processTreeOwnership.mode).toBe('JOB_OWNED')
    if (process.processTreeOwnership.mode !== 'JOB_OWNED') throw new Error('Expected Job')
    const job = process.processTreeOwnership.job
    expect(job.token).toBe('native-job-token')
    expect(job.activeProcessCount()).toBe(2)
    job.terminate()
    job.terminate()
    job.release()
    job.release()

    expect(native.terminateWindowsJob).toHaveBeenCalledOnce()
    expect(native.releaseWindowsJob).toHaveBeenCalledOnce()
    expect(job.isReleased()).toBe(true)
    expect(job.activeProcessCount()).toBe(0)
  })

  it('forbids PTY disposal before Job release and closes transport only afterward', () => {
    const native = fakeNativePty()
    nodePtyMock.spawn.mockReturnValue(native)
    const process = new NodePtyPort().spawn(SPAWN_OPTIONS)
    if (process.processTreeOwnership.mode !== 'JOB_OWNED') throw new Error('Expected Job')

    expect(() => process.close()).toThrow('must be finalized before PTY disposal')
    process.processTreeOwnership.job.terminate()
    process.processTreeOwnership.job.release()
    process.close()

    expect(native.kill).toHaveBeenCalledOnce()
  })
})

function fakeNativePty() {
  return {
    pid: 4567,
    windowsJobToken: 'native-job-token',
    windowsJobActiveProcessCount: vi.fn(() => 2),
    terminateWindowsJob: vi.fn(),
    releaseWindowsJob: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
  }
}

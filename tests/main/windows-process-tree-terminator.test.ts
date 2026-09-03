import { describe, expect, it, vi } from 'vitest'

import type {
  ProcessTreeIdentity,
  WindowsJobController,
} from '../../src/main/services/process/process-tree-terminator'
import {
  WindowsProcessTreeTerminationError,
  WindowsProcessTreeTerminator,
  type ProcessCommandRunner,
  type WindowsProcessIdentity,
} from '../../src/main/services/process/windows-process-tree-terminator'

const ROOT_PID = 4312
const IDENTITY: WindowsProcessIdentity = {
  pid: ROOT_PID,
  startTimeTicks: '638922528000000000',
  executablePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  processName: 'powershell',
}

class FakeCommandRunner implements ProcessCommandRunner {
  readonly calls: Array<{
    executable: string
    args: readonly string[]
    options: { timeoutMilliseconds: number; maximumOutputBytes: number }
  }> = []
  failure: Error | undefined

  async run(
    executable: string,
    args: readonly string[],
    options: { timeoutMilliseconds: number; maximumOutputBytes: number },
  ): Promise<{ stdout: string; stderr: string }> {
    this.calls.push({ executable, args, options })
    if (this.failure) throw this.failure
    return { stdout: '', stderr: '' }
  }
}

describe('Phase 2E-H WindowsProcessTreeTerminator', () => {
  it('captures identity and invokes only targeted taskkill arguments for an owned root', async () => {
    const runner = new FakeCommandRunner()
    const reader = vi.fn(async () => IDENTITY)
    const terminator = createTerminator(runner, reader)
    const captured = await terminator.capture(legacyOwnership(ROOT_PID))

    await expect(terminator.terminate(captured, (identity) => identity.rootPid === ROOT_PID))
      .resolves.toBe('terminated')
    expect(runner.calls).toEqual([{
      executable: 'C:\\Windows\\System32\\taskkill.exe',
      args: ['/PID', '4312', '/T', '/F'],
      options: { timeoutMilliseconds: 2750, maximumOutputBytes: 16 * 1024 },
    }])
    expect(runner.calls[0]?.args).not.toContain('/IM')
    expect(runner.calls[0]?.args.join(' ')).not.toContain('*')
  })

  it.each([0, -1, 1.5, Number.NaN, 0x1_0000_0000])(
    'rejects invalid root PID %s without reading identity or invoking taskkill',
    async (pid) => {
      const runner = new FakeCommandRunner()
      const reader = vi.fn(async () => IDENTITY)
      const terminator = createTerminator(runner, reader)

      await expect(terminator.capture(legacyOwnership(pid))).rejects.toMatchObject({ reason: 'INVALID_PID' })
      expect(reader).not.toHaveBeenCalled()
      expect(runner.calls).toHaveLength(0)
    },
  )

  it('refuses an unowned root before identity verification or taskkill', async () => {
    const runner = new FakeCommandRunner()
    const reader = vi.fn(async () => IDENTITY)
    const terminator = createTerminator(runner, reader)
    const captured = await terminator.capture(legacyOwnership(ROOT_PID))
    reader.mockClear()

    await expect(terminator.terminate(captured, () => false))
      .rejects.toMatchObject({ reason: 'OWNERSHIP_LOST' })
    expect(reader).not.toHaveBeenCalled()
    expect(runner.calls).toHaveLength(0)
  })

  it('refuses a stale or replaced PID identity without invoking taskkill', async () => {
    const runner = new FakeCommandRunner()
    const reader = vi.fn()
      .mockResolvedValueOnce(IDENTITY)
      .mockResolvedValueOnce({ ...IDENTITY, startTimeTicks: '638922529000000000' })
    const terminator = createTerminator(runner, reader)
    const captured = await terminator.capture(legacyOwnership(ROOT_PID))

    await expect(terminator.terminate(captured, () => true))
      .rejects.toMatchObject({ reason: 'IDENTITY_CHANGED' })
    expect(runner.calls).toHaveLength(0)
  })

  it('fails closed when identity capture or verification is unavailable', async () => {
    const runner = new FakeCommandRunner()
    const reader = vi.fn().mockRejectedValue(new Error('access denied'))
    const terminator = createTerminator(runner, reader)

    await expect(terminator.capture(legacyOwnership(ROOT_PID))).rejects.toMatchObject({
      reason: 'IDENTITY_UNAVAILABLE',
    })
    expect(runner.calls).toHaveLength(0)
  })

  it('treats an already-exited root as success without invoking taskkill', async () => {
    const runner = new FakeCommandRunner()
    const terminator = createTerminator(runner, vi.fn(async () => null))
    const captured: ProcessTreeIdentity = {
      mode: 'LEGACY_ROOT_OWNED',
      rootPid: ROOT_PID,
      fingerprint: fingerprint(IDENTITY),
    }

    await expect(terminator.terminate(captured, () => true))
      .resolves.toBe('already-exited')
    expect(runner.calls).toHaveLength(0)
  })

  it('accepts an exit between identity verification and the final ownership check', async () => {
    const runner = new FakeCommandRunner()
    const reader = vi.fn()
      .mockResolvedValueOnce(IDENTITY)
      .mockResolvedValueOnce(null)
    const terminator = createTerminator(runner, reader)
    let ownershipChecks = 0

    await expect(terminator.terminate({
      mode: 'LEGACY_ROOT_OWNED',
      rootPid: ROOT_PID,
      fingerprint: fingerprint(IDENTITY),
    }, () => ++ownershipChecks === 1)).resolves.toBe('already-exited')
    expect(runner.calls).toHaveLength(0)
  })

  it('normalizes taskkill failure while retaining verified ownership evidence', async () => {
    const runner = new FakeCommandRunner()
    runner.failure = new Error('localized taskkill details')
    const terminator = createTerminator(runner, vi.fn(async () => IDENTITY))

    await expect(terminator.terminate({
      mode: 'LEGACY_ROOT_OWNED',
      rootPid: ROOT_PID,
      fingerprint: fingerprint(IDENTITY),
    }, () => true)).rejects.toEqual(
      new WindowsProcessTreeTerminationError('TASKKILL_FAILED'),
    )
  })

  it('bounds taskkill execution timeout and output without a shell', async () => {
    const runner = new FakeCommandRunner()
    const terminator = createTerminator(runner, vi.fn(async () => IDENTITY))

    await terminator.terminate({
      mode: 'LEGACY_ROOT_OWNED',
      rootPid: ROOT_PID,
      fingerprint: fingerprint(IDENTITY),
    }, () => true)

    expect(runner.calls[0]).toMatchObject({
      options: { timeoutMilliseconds: 2750, maximumOutputBytes: 16 * 1024 },
    })
  })

  it('targets only the requested owned session root and cannot affect another PID', async () => {
    const runner = new FakeCommandRunner()
    const terminator = createTerminator(runner, vi.fn(async () => IDENTITY))

    await terminator.terminate({
      mode: 'LEGACY_ROOT_OWNED',
      rootPid: ROOT_PID,
      fingerprint: fingerprint(IDENTITY),
    }, (identity) => identity.rootPid === ROOT_PID)

    expect(runner.calls[0]?.args).toEqual(['/PID', String(ROOT_PID), '/T', '/F'])
    expect(runner.calls[0]?.args).not.toContain('9924')
  })
})

describe('Phase 2E-J Windows Job ownership', () => {
  it('terminates, confirms empty, releases, and never invokes taskkill', async () => {
    const runner = new FakeCommandRunner()
    const job = new FakeWindowsJobController([3, 0])
    const terminator = createJobTerminator(runner)
    const identity = await terminator.capture(jobOwnership(job))

    await expect(terminator.terminate(identity, () => true)).resolves.toBe('terminated')
    expect(job.terminateCallCount).toBe(1)
    expect(job.releaseCallCount).toBe(1)
    expect(job.released).toBe(true)
    expect(runner.calls).toHaveLength(0)
  })

  it('releases an already-empty Job without terminating it', async () => {
    const job = new FakeWindowsJobController([0])
    const terminator = createJobTerminator(new FakeCommandRunner())
    const identity = await terminator.capture(jobOwnership(job))

    await expect(terminator.terminate(identity, () => true))
      .resolves.toBe('already-exited')
    expect(job.terminateCallCount).toBe(0)
    expect(job.releaseCallCount).toBe(1)
  })

  it('retains Job ownership after termination failure and forbids taskkill', async () => {
    const runner = new FakeCommandRunner()
    const job = new FakeWindowsJobController([2])
    job.terminateFailure = new Error('native detail')
    const terminator = createJobTerminator(runner)
    const identity = await terminator.capture(jobOwnership(job))

    await expect(terminator.terminate(identity, () => true)).rejects.toMatchObject({
      reason: 'JOB_TERMINATION_FAILED',
    })
    expect(job.released).toBe(false)
    expect(job.releaseCallCount).toBe(0)
    expect(runner.calls).toHaveLength(0)
  })

  it('retains Job ownership when empty confirmation times out', async () => {
    const job = new FakeWindowsJobController([1, 1, 1])
    let now = 0
    const terminator = createJobTerminator(new FakeCommandRunner(), {
      now: () => now,
      delay: async () => { now += 5 },
      jobEmptyTimeoutMilliseconds: 10,
      jobPollIntervalMilliseconds: 5,
    })
    const identity = await terminator.capture(jobOwnership(job))

    await expect(terminator.terminate(identity, () => true)).rejects.toMatchObject({
      reason: 'JOB_EMPTY_TIMEOUT',
    })
    expect(job.released).toBe(false)
  })

  it('retains ownership when release fails and treats completed duplicate termination as safe', async () => {
    const failingJob = new FakeWindowsJobController([0])
    failingJob.releaseFailure = new Error('release failed')
    const terminator = createJobTerminator(new FakeCommandRunner())
    const failingIdentity = await terminator.capture(jobOwnership(failingJob))
    await expect(terminator.terminate(failingIdentity, () => true)).rejects.toMatchObject({
      reason: 'JOB_RELEASE_FAILED',
    })
    expect(failingJob.released).toBe(false)

    const releasedJob = new FakeWindowsJobController([0])
    const releasedIdentity = await terminator.capture(jobOwnership(releasedJob))
    await terminator.terminate(releasedIdentity, () => true)
    await expect(terminator.terminate(releasedIdentity, () => true))
      .resolves.toBe('already-exited')
    expect(releasedJob.releaseCallCount).toBe(1)
  })

  it('rejects an unknown/stale Job controller before native termination', async () => {
    const job = new FakeWindowsJobController([1])
    job.released = true
    const terminator = createJobTerminator(new FakeCommandRunner())

    await expect(terminator.capture(jobOwnership(job))).rejects.toMatchObject({
      reason: 'JOB_OWNERSHIP_LOST',
    })
    expect(job.terminateCallCount).toBe(0)
  })
})

function createTerminator(
  commandRunner: ProcessCommandRunner,
  identityReader: (pid: number) => Promise<WindowsProcessIdentity | null>,
): WindowsProcessTreeTerminator {
  return new WindowsProcessTreeTerminator({
    environment: { SystemRoot: 'C:\\Windows' },
    commandRunner,
    identityReader,
    timeoutMilliseconds: 2750,
  })
}

function createJobTerminator(
  commandRunner: ProcessCommandRunner,
  options: Partial<ConstructorParameters<typeof WindowsProcessTreeTerminator>[0]> = {},
): WindowsProcessTreeTerminator {
  return new WindowsProcessTreeTerminator({
    environment: { SystemRoot: 'C:\\Windows' },
    commandRunner,
    identityReader: async () => IDENTITY,
    delay: async () => undefined,
    ...options,
  })
}

class FakeWindowsJobController implements WindowsJobController {
  readonly token = 'native-job-test-token'
  terminateCallCount = 0
  releaseCallCount = 0
  released = false
  terminateFailure: Error | undefined
  releaseFailure: Error | undefined

  constructor(private readonly counts: number[]) {}

  activeProcessCount(): number {
    return this.counts.length > 1 ? this.counts.shift()! : this.counts[0]!
  }

  terminate(): void {
    this.terminateCallCount += 1
    if (this.terminateFailure) throw this.terminateFailure
  }

  release(): void {
    this.releaseCallCount += 1
    if (this.releaseFailure) throw this.releaseFailure
    if ((this.counts[0] ?? 0) !== 0) throw new Error('release before empty')
    this.released = true
  }

  isReleased(): boolean {
    return this.released
  }
}

function jobOwnership(job: WindowsJobController) {
  return { mode: 'JOB_OWNED' as const, rootPid: ROOT_PID, job }
}

function legacyOwnership(rootPid: number) {
  return { mode: 'LEGACY_ROOT_OWNED' as const, rootPid }
}

function fingerprint(identity: WindowsProcessIdentity): string {
  return [
    identity.pid,
    identity.startTimeTicks,
    identity.executablePath.toLocaleLowerCase('en-US'),
    identity.processName.toLocaleLowerCase('en-US'),
  ].join('\u0000')
}

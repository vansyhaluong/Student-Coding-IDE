import { execFile } from 'node:child_process'
import { win32 } from 'node:path'

import type {
  ProcessTreeIdentity,
  ProcessTreeOwnership,
  ProcessTreeTerminationResult,
  ProcessTreeTerminator,
} from './process-tree-terminator'

const MAXIMUM_WINDOWS_PID = 0xffff_ffff
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000
const MAXIMUM_OUTPUT_BYTES = 16 * 1024
const ABSENT_IDENTITY = 'PROCESS_ABSENT'
const IDENTITY_SCRIPT = [
  '& { param([int]$TargetPid)',
  "$ErrorActionPreference = 'Stop'",
  '$ownedProcess = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue',
  `if ($null -eq $ownedProcess) { [Console]::Out.Write('${ABSENT_IDENTITY}'); exit 0 }`,
  '$started = $ownedProcess.StartTime.ToUniversalTime().Ticks',
  '$path = $ownedProcess.Path',
  '$name = $ownedProcess.ProcessName',
  '[Console]::Out.Write((@($ownedProcess.Id, $started, $path, $name) -join [Environment]::NewLine))',
  '}',
].join('; ')

export interface WindowsProcessIdentity {
  pid: number
  startTimeTicks: string
  executablePath: string
  processName: string
}

export interface ProcessCommandResult {
  stdout: string
  stderr: string
}

export interface ProcessCommandRunner {
  run(
    executable: string,
    args: readonly string[],
    options: { timeoutMilliseconds: number; maximumOutputBytes: number },
  ): Promise<ProcessCommandResult>
}

export interface WindowsProcessTreeTerminatorOptions {
  environment?: NodeJS.ProcessEnv
  identityReader?: (pid: number) => Promise<WindowsProcessIdentity | null>
  commandRunner?: ProcessCommandRunner
  timeoutMilliseconds?: number
  jobEmptyTimeoutMilliseconds?: number
  jobPollIntervalMilliseconds?: number
  now?: () => number
  delay?: (milliseconds: number) => Promise<void>
}

export type WindowsProcessTreeTerminationFailure =
  | 'INVALID_PID'
  | 'IDENTITY_UNAVAILABLE'
  | 'OWNERSHIP_LOST'
  | 'IDENTITY_CHANGED'
  | 'TASKKILL_FAILED'
  | 'JOB_OWNERSHIP_LOST'
  | 'JOB_TERMINATION_FAILED'
  | 'JOB_EMPTY_TIMEOUT'
  | 'JOB_RELEASE_FAILED'

export class WindowsProcessTreeTerminationError extends Error {
  constructor(readonly reason: WindowsProcessTreeTerminationFailure) {
    super(messageFor(reason))
    this.name = 'WindowsProcessTreeTerminationError'
  }
}

export class WindowsProcessTreeTerminator implements ProcessTreeTerminator {
  private readonly environment: NodeJS.ProcessEnv
  private readonly commandRunner: ProcessCommandRunner
  private readonly identityReader: (pid: number) => Promise<WindowsProcessIdentity | null>
  private readonly timeoutMilliseconds: number
  private readonly jobEmptyTimeoutMilliseconds: number
  private readonly jobPollIntervalMilliseconds: number
  private readonly now: () => number
  private readonly delay: (milliseconds: number) => Promise<void>

  constructor(options: WindowsProcessTreeTerminatorOptions = {}) {
    this.environment = options.environment ?? process.env
    this.commandRunner = options.commandRunner ?? nodeProcessCommandRunner
    this.timeoutMilliseconds = positiveInteger(
      options.timeoutMilliseconds,
      DEFAULT_TIMEOUT_MILLISECONDS,
    )
    this.identityReader = options.identityReader
      ?? ((pid) => this.readIdentity(pid))
    this.jobEmptyTimeoutMilliseconds = positiveInteger(
      options.jobEmptyTimeoutMilliseconds,
      DEFAULT_TIMEOUT_MILLISECONDS,
    )
    this.jobPollIntervalMilliseconds = positiveInteger(
      options.jobPollIntervalMilliseconds,
      10,
    )
    this.now = options.now ?? Date.now
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => {
      setTimeout(resolve, milliseconds)
    }))
  }

  async capture(ownership: ProcessTreeOwnership): Promise<ProcessTreeIdentity> {
    assertRootPid(ownership.rootPid)
    if (ownership.mode === 'JOB_OWNED') {
      if (!ownership.job.token || ownership.job.isReleased()) {
        throw new WindowsProcessTreeTerminationError('JOB_OWNERSHIP_LOST')
      }
      return {
        mode: 'JOB_OWNED',
        rootPid: ownership.rootPid,
        token: ownership.job.token,
        job: ownership.job,
      }
    }
    const identity = await this.readIdentityFailClosed(ownership.rootPid)
    if (!identity) {
      throw new WindowsProcessTreeTerminationError('IDENTITY_UNAVAILABLE')
    }
    return {
      mode: 'LEGACY_ROOT_OWNED',
      rootPid: ownership.rootPid,
      fingerprint: fingerprint(identity),
    }
  }

  async terminate(
    identity: ProcessTreeIdentity,
    stillOwnsIdentity: (identity: ProcessTreeIdentity) => boolean,
  ): Promise<ProcessTreeTerminationResult> {
    assertRootPid(identity.rootPid)
    if (!stillOwnsIdentity(identity)) {
      throw new WindowsProcessTreeTerminationError('OWNERSHIP_LOST')
    }

    if (identity.mode === 'JOB_OWNED') {
      return this.terminateJob(identity, stillOwnsIdentity)
    }

    const current = await this.readIdentityFailClosed(identity.rootPid)
    if (!current) return 'already-exited'
    if (fingerprint(current) !== identity.fingerprint) {
      throw new WindowsProcessTreeTerminationError('IDENTITY_CHANGED')
    }
    if (!stillOwnsIdentity(identity)) {
      const afterOwnershipLoss = await this.readIdentityFailClosed(identity.rootPid)
      if (!afterOwnershipLoss) return 'already-exited'
      if (fingerprint(afterOwnershipLoss) !== identity.fingerprint) {
        throw new WindowsProcessTreeTerminationError('IDENTITY_CHANGED')
      }
      throw new WindowsProcessTreeTerminationError('OWNERSHIP_LOST')
    }

    try {
      await this.commandRunner.run(
        this.systemExecutable('taskkill.exe'),
        ['/PID', String(identity.rootPid), '/T', '/F'],
        {
          timeoutMilliseconds: this.timeoutMilliseconds,
          maximumOutputBytes: MAXIMUM_OUTPUT_BYTES,
        },
      )
      return 'terminated'
    } catch {
      const afterFailure = await this.readIdentityFailClosed(identity.rootPid)
      if (!afterFailure) return 'already-exited'
      if (fingerprint(afterFailure) !== identity.fingerprint) {
        throw new WindowsProcessTreeTerminationError('IDENTITY_CHANGED')
      }
      throw new WindowsProcessTreeTerminationError('TASKKILL_FAILED')
    }
  }

  private async terminateJob(
    identity: Extract<ProcessTreeIdentity, { mode: 'JOB_OWNED' }>,
    stillOwnsIdentity: (identity: ProcessTreeIdentity) => boolean,
  ): Promise<ProcessTreeTerminationResult> {
    if (identity.job.isReleased()) return 'already-exited'
    if (identity.job.token !== identity.token || !stillOwnsIdentity(identity)) {
      throw new WindowsProcessTreeTerminationError('JOB_OWNERSHIP_LOST')
    }

    let activeProcesses: number
    let wasAlreadyEmpty: boolean
    try {
      activeProcesses = validActiveProcessCount(identity.job.activeProcessCount())
      wasAlreadyEmpty = activeProcesses === 0
      if (activeProcesses > 0) identity.job.terminate()
    } catch {
      throw new WindowsProcessTreeTerminationError('JOB_TERMINATION_FAILED')
    }

    const deadline = this.now() + this.jobEmptyTimeoutMilliseconds
    while (activeProcesses > 0) {
      if (!stillOwnsIdentity(identity) || identity.job.token !== identity.token) {
        throw new WindowsProcessTreeTerminationError('JOB_OWNERSHIP_LOST')
      }
      if (this.now() >= deadline) {
        throw new WindowsProcessTreeTerminationError('JOB_EMPTY_TIMEOUT')
      }
      await this.delay(this.jobPollIntervalMilliseconds)
      try {
        activeProcesses = validActiveProcessCount(identity.job.activeProcessCount())
      } catch {
        throw new WindowsProcessTreeTerminationError('JOB_TERMINATION_FAILED')
      }
    }

    if (!stillOwnsIdentity(identity)) {
      throw new WindowsProcessTreeTerminationError('JOB_OWNERSHIP_LOST')
    }
    try {
      // KILL_ON_JOB_CLOSE is intentionally disabled. Close is release only,
      // after explicit termination and an observed empty Job.
      identity.job.release()
    } catch {
      throw new WindowsProcessTreeTerminationError('JOB_RELEASE_FAILED')
    }
    return wasAlreadyEmpty ? 'already-exited' : 'terminated'
  }

  private async readIdentityFailClosed(
    pid: number,
  ): Promise<WindowsProcessIdentity | null> {
    try {
      const identity = await this.identityReader(pid)
      if (identity === null) return null
      if (
        identity.pid !== pid
        || !identity.startTimeTicks
        || !identity.executablePath
        || !identity.processName
      ) {
        throw new Error('Incomplete Windows process identity.')
      }
      return identity
    } catch (error) {
      if (error instanceof WindowsProcessTreeTerminationError) throw error
      throw new WindowsProcessTreeTerminationError('IDENTITY_UNAVAILABLE')
    }
  }

  private async readIdentity(pid: number): Promise<WindowsProcessIdentity | null> {
    const result = await this.commandRunner.run(
      this.systemExecutable('WindowsPowerShell\\v1.0\\powershell.exe'),
      [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', IDENTITY_SCRIPT,
        '-TargetPid', String(pid),
      ],
      {
        timeoutMilliseconds: this.timeoutMilliseconds,
        maximumOutputBytes: MAXIMUM_OUTPUT_BYTES,
      },
    )
    const output = result.stdout.trim()
    if (output === ABSENT_IDENTITY) return null
    const [rawPid, startTimeTicks, executablePath, processName, ...unexpected] = output.split(/\r?\n/)
    const parsedPid = Number(rawPid)
    if (
      unexpected.length > 0
      || !Number.isSafeInteger(parsedPid)
      || parsedPid !== pid
      || !startTimeTicks
      || !executablePath
      || !processName
    ) {
      throw new Error('Windows returned an invalid process identity.')
    }
    return { pid: parsedPid, startTimeTicks, executablePath, processName }
  }

  private systemExecutable(relativePath: string): string {
    const systemRoot = environmentValue(this.environment, 'SystemRoot')
      ?? environmentValue(this.environment, 'windir')
    if (!systemRoot || !win32.isAbsolute(systemRoot)) {
      throw new WindowsProcessTreeTerminationError('IDENTITY_UNAVAILABLE')
    }
    return win32.join(systemRoot, 'System32', relativePath)
  }
}

const nodeProcessCommandRunner: ProcessCommandRunner = {
  run(executable, args, options): Promise<ProcessCommandResult> {
    return new Promise((resolve, reject) => {
      execFile(executable, [...args], {
        windowsHide: true,
        shell: false,
        timeout: options.timeoutMilliseconds,
        maxBuffer: options.maximumOutputBytes,
        encoding: 'utf8',
      }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      })
    })
  },
}

function assertRootPid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > MAXIMUM_WINDOWS_PID) {
    throw new WindowsProcessTreeTerminationError('INVALID_PID')
  }
}

function fingerprint(identity: WindowsProcessIdentity): string {
  return [
    identity.pid,
    identity.startTimeTicks,
    identity.executablePath.toLocaleLowerCase('en-US'),
    identity.processName.toLocaleLowerCase('en-US'),
  ].join('\u0000')
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return Object.entries(environment).find(
    ([key]) => key.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
  )?.[1]
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback
}

function validActiveProcessCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Windows returned an invalid Job active-process count.')
  }
  return value
}

function messageFor(reason: WindowsProcessTreeTerminationFailure): string {
  switch (reason) {
    case 'INVALID_PID': return 'The owned terminal root PID is invalid.'
    case 'IDENTITY_UNAVAILABLE': return 'The owned terminal root identity could not be verified.'
    case 'OWNERSHIP_LOST': return 'The terminal no longer owns the process tree.'
    case 'IDENTITY_CHANGED': return 'The terminal root PID now identifies a different process.'
    case 'TASKKILL_FAILED': return 'Windows could not terminate the owned terminal process tree.'
    case 'JOB_OWNERSHIP_LOST': return 'The terminal no longer owns its Windows Job Object.'
    case 'JOB_TERMINATION_FAILED': return 'Windows could not terminate the owned terminal Job.'
    case 'JOB_EMPTY_TIMEOUT': return 'The owned terminal Job did not become empty in time.'
    case 'JOB_RELEASE_FAILED': return 'The empty terminal Job could not be released safely.'
  }
}

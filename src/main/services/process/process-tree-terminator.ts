export interface WindowsJobController {
  readonly token: string
  activeProcessCount(): number
  terminate(): void
  release(): void
  isReleased(): boolean
}

export type ProcessTreeOwnership =
  | {
      readonly mode: 'JOB_OWNED'
      readonly rootPid: number
      readonly job: WindowsJobController
    }
  | {
      readonly mode: 'LEGACY_ROOT_OWNED'
      readonly rootPid: number
    }

export type ProcessTreeIdentity =
  | {
      readonly mode: 'JOB_OWNED'
      readonly rootPid: number
      readonly token: string
      readonly job: WindowsJobController
    }
  | {
      readonly mode: 'LEGACY_ROOT_OWNED'
      readonly rootPid: number
      readonly fingerprint: string
    }

export type ProcessTreeTerminationResult = 'terminated' | 'already-exited'

export interface ProcessTreeTerminator {
  capture(ownership: ProcessTreeOwnership): Promise<ProcessTreeIdentity>
  terminate(
    identity: ProcessTreeIdentity,
    stillOwnsIdentity: (identity: ProcessTreeIdentity) => boolean,
  ): Promise<ProcessTreeTerminationResult>
}

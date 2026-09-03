import type { ProcessTreeOwnership } from '../process/process-tree-terminator'

/**
 * Main-only PTY boundary. Production adapters may wrap node-pty later, but
 * native provider types must not escape this module boundary.
 */
export interface PtySpawnOptions {
  executable: string
  args: readonly string[]
  cwd: string
  env: Readonly<Record<string, string>>
  cols: number
  rows: number
  name: string
}

export interface PtyExit {
  exitCode: number | null
  signal: number | null
}

export interface PtySubscription {
  dispose(): void
}

export interface PtyProcessPort {
  readonly pid: number
  readonly processTreeOwnership: ProcessTreeOwnership
  write(data: string): void
  resize(cols: number, rows: number): void
  close(): void
  onData(listener: (data: string) => void): PtySubscription
  onExit(listener: (event: PtyExit) => void): PtySubscription
  dispose(): void
}

export interface PtyPort {
  spawn(options: PtySpawnOptions): PtyProcessPort
}

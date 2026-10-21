import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { join, relative, resolve, isAbsolute } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DomainError } from '../../../errors/app-error'
import type { CsharpPreparationContext } from './csharp-execution-contracts'
import { assertExerciseDirectory, sameWorkspace, workspaceIdentity, type ExerciseWorkspace } from './exercise-workspace'
import { exerciseCoreError } from './exercise-limits'

export function checkCsharpWork(context: CsharpPreparationContext): void {
  if (context.signal.aborted) throw new DomainError({ code: 'PROCESS_CANCELLED', operation: 'exercise:compile',
    message: 'Learning compilation was cancelled.', retryable: false, details: { reason: 'CANCELLED' } })
  if (!Number.isFinite(context.deadline) || performance.now() >= context.deadline) throw exerciseCoreError('PHASE_DEADLINE')
}
const same = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
  && a.size === b.size && a.mtimeNs === b.mtimeNs
/** Fixed, exclusive compilation directory under a prepared, lease-owned session. No adoption/rewrite. */
export class CsharpCompileWorkspace {
  readonly directory: string
  readonly solution: string
  readonly harness: string
  readonly response: string
  readonly assembly: string
  readonly runtimeConfig: string
  private readonly files = new Map<string, BigIntStats>()
  private directoryIdentity?: Awaited<ReturnType<typeof workspaceIdentity>>
  constructor(private readonly workspace: ExerciseWorkspace, private readonly context: CsharpPreparationContext) {
    this.directory = join(workspace.path, 'csharp')
    this.solution = join(this.directory, 'Solution.cs'); this.harness = join(this.directory, 'Harness.cs')
    this.response = join(this.directory, 'compile.rsp'); this.assembly = join(this.directory, 'Learning.dll')
    this.runtimeConfig = join(this.directory, 'Learning.runtimeconfig.json')
  }
  async validate(): Promise<void> {
    checkCsharpWork(this.context)
    const suffix = relative(this.workspace.root, this.directory)
    if (!this.workspace.ownsLease || !this.workspace.identity || isAbsolute(suffix) || suffix === '..' || suffix.startsWith('..\\') || suffix.startsWith('../')) throw exerciseCoreError('WORKSPACE_CONTAINMENT')
    await assertExerciseDirectory(this.workspace.path)
    if (!sameWorkspace(await workspaceIdentity(this.workspace.path), this.workspace.identity)
      || resolve(await realpath(this.workspace.path)).toLowerCase() !== resolve(this.workspace.path).toLowerCase()) throw exerciseCoreError('WORKSPACE_REPLACED')
    if (this.directoryIdentity) {
      await assertExerciseDirectory(this.directory)
      if (!sameWorkspace(await workspaceIdentity(this.directory), this.directoryIdentity)) throw exerciseCoreError('WORKSPACE_REPLACED')
    }
    checkCsharpWork(this.context)
  }
  async create(): Promise<void> {
    await this.validate(); await mkdir(this.directory)
    this.directoryIdentity = await workspaceIdentity(this.directory)
    await this.validate()
  }
  async write(file: string, content: string): Promise<void> {
    if (![this.solution, this.harness, this.response, this.runtimeConfig].includes(file)) throw exerciseCoreError('WORKSPACE_PATH')
    await this.validate()
    const handle = await open(file, 'wx')
    try {
      const before = await handle.stat({ bigint: true })
      if (!before.isFile() || before.nlink !== 1n) throw exerciseCoreError('WORKSPACE_FILE')
      await handle.writeFile(content, 'utf8'); await handle.sync()
      const after = await handle.stat({ bigint: true })
      if (before.dev !== after.dev || before.ino !== after.ino || before.birthtimeNs !== after.birthtimeNs) throw exerciseCoreError('WORKSPACE_REPLACED')
      this.files.set(file, after)
    } finally { await handle.close() }
    await this.verifyFiles()
  }
  async verifyFiles(): Promise<void> {
    await this.validate()
    for (const [file, expected] of this.files) {
      const stat = await lstat(file, { bigint: true })
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || !same(stat, expected)) throw exerciseCoreError('WORKSPACE_REPLACED')
    }
    await this.validate()
  }
  async validateAssembly(): Promise<void> {
    await this.verifyFiles()
    const before = await lstat(this.assembly, { bigint: true })
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 256n || before.size > 64n * 1024n ** 2n) throw exerciseCoreError('COMPILER_ARTIFACT')
    const handle = await open(this.assembly, 'r')
    try {
      if (!same(before, await handle.stat({ bigint: true }))) throw exerciseCoreError('WORKSPACE_REPLACED')
      const read = async (offset: number): Promise<Buffer> => {
        const buffer = Buffer.alloc(256)
        let filled = 0
        while (filled < buffer.length) {
          checkCsharpWork(this.context)
          const result = await handle.read(buffer, filled, buffer.length - filled, offset + filled)
          if (!result.bytesRead) throw exerciseCoreError('COMPILER_ARTIFACT')
          filled += result.bytesRead
        }
        return buffer
      }
      const data = await read(0)
      const pe = data.readUInt32LE(0x3c)
      if (data.readUInt16LE(0) !== 0x5a4d || BigInt(pe + 256) > before.size) throw exerciseCoreError('COMPILER_ARTIFACT')
      const header = await read(pe)
      const magic = header.readUInt16LE(24), directory = magic === 0x20b ? 136 : magic === 0x10b ? 120 : -1
      if (header.readUInt32LE(0) !== 0x4550 || directory < 0 || header.readUInt32LE(directory + 14 * 8) === 0) throw exerciseCoreError('COMPILER_ARTIFACT')
      if (!same(before, await handle.stat({ bigint: true })) || !same(before, await lstat(this.assembly, { bigint: true }))) throw exerciseCoreError('WORKSPACE_REPLACED')
    } finally { await handle.close() }
    await this.verifyFiles()
  }
}

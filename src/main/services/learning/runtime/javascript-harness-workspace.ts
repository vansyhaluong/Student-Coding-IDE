import { createHash } from 'node:crypto'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { join, resolve } from 'node:path'
import type { JavascriptHarnessFiles, JavascriptPreparationContext } from './javascript-execution-contracts'
import { checkJavascriptWork } from './javascript-node-files'
import { assertExerciseDirectory, sameWorkspace, workspaceIdentity, type ExerciseWorkspace } from './exercise-workspace'
import { exerciseCoreError } from './exercise-limits'

const same = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
  && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
/** Exclusive fixed files; never adopt/rewrite source or follow reparse/hard links. */
export class JavascriptHarnessWorkspace {
  readonly directory: string
  readonly files: JavascriptHarnessFiles
  private identity?: Awaited<ReturnType<typeof workspaceIdentity>>
  private readonly retained = new Map<string, { stat: BigIntStats; hash: string }>()
  constructor(private readonly workspace: ExerciseWorkspace) {
    this.directory = join(workspace.path, 'javascript')
    this.files = Object.freeze({ sourcePath: join(this.directory, 'Source.json'), harnessPath: join(this.directory, 'Harness.mjs') })
  }
  private async validate(context: JavascriptPreparationContext): Promise<void> {
    checkJavascriptWork(context)
    if (!this.workspace.identity || !this.workspace.ownsLease) throw exerciseCoreError('OWNERSHIP')
    await assertExerciseDirectory(this.workspace.path)
    if (!sameWorkspace(this.workspace.identity, await workspaceIdentity(this.workspace.path))
      || resolve(await realpath(this.workspace.path)).toLowerCase() !== this.workspace.path.toLowerCase()) throw exerciseCoreError('WORKSPACE_REPLACED')
    if (this.identity) {
      await assertExerciseDirectory(this.directory)
      if (!sameWorkspace(this.identity, await workspaceIdentity(this.directory))) throw exerciseCoreError('WORKSPACE_REPLACED')
    }
    checkJavascriptWork(context)
  }
  async create(context: JavascriptPreparationContext): Promise<void> {
    await this.validate(context); await mkdir(this.directory)
    this.identity = await workspaceIdentity(this.directory)
    await this.validate(context)
  }
  async write(file: string, content: string, context: JavascriptPreparationContext): Promise<void> {
    if (![this.files.sourcePath, this.files.harnessPath].includes(file) || this.retained.has(file) || !this.identity) throw exerciseCoreError('WORKSPACE_FILE')
    await this.validate(context)
    const handle = await open(file, 'wx')
    try {
      const before = await handle.stat({ bigint: true })
      if (!before.isFile() || before.nlink !== 1n) throw exerciseCoreError('WORKSPACE_FILE')
      checkJavascriptWork(context); await handle.writeFile(content, 'utf8'); await handle.sync()
      const after = await handle.stat({ bigint: true })
      if (before.dev !== after.dev || before.ino !== after.ino || before.birthtimeNs !== after.birthtimeNs) throw exerciseCoreError('WORKSPACE_REPLACED')
      this.retained.set(file, { stat: after, hash: createHash('sha256').update(content, 'utf8').digest('hex') })
    } finally { await handle.close() }
    await this.verify(context, false)
  }
  async verify(context: JavascriptPreparationContext, complete = true): Promise<void> {
    await this.validate(context)
    if (!this.identity || complete && this.retained.size !== 2) throw exerciseCoreError('WORKSPACE_FILE')
    for (const [file, expected] of this.retained) {
      checkJavascriptWork(context)
      const stat = await lstat(file, { bigint: true })
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || !same(stat, expected.stat)) throw exerciseCoreError('WORKSPACE_REPLACED')
      const handle = await open(file, 'r')
      try {
        if (!same(stat, await handle.stat({ bigint: true }))) throw exerciseCoreError('WORKSPACE_REPLACED')
        const contents = Buffer.alloc(Number(stat.size) + 1)
        let used = 0
        while (used < contents.length) {
          checkJavascriptWork(context)
          const read = await handle.read(contents, used, contents.length - used, used)
          if (!read.bytesRead) break
          used += read.bytesRead
        }
        checkJavascriptWork(context)
        if (BigInt(used) !== stat.size || createHash('sha256').update(contents.subarray(0, used)).digest('hex') !== expected.hash
          || !same(stat, await handle.stat({ bigint: true })) || !same(stat, await lstat(file, { bigint: true }))) throw exerciseCoreError('WORKSPACE_REPLACED')
      } finally { await handle.close() }
    }
    await this.validate(context)
  }
}

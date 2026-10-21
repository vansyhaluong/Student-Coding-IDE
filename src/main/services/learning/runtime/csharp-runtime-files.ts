import { lstat, readdir, realpath } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { CsharpPreparationContext, CsharpSdkSelection } from './csharp-execution-contracts'
import { checkCsharpWork } from './csharp-compile-workspace'
import { exerciseCoreError } from './exercise-limits'

type Entry = { file: string; stat: BigIntStats; children?: string[] }
const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
  && a.isDirectory() === b.isDirectory() && (a.isDirectory() || a.size === b.size && a.mtimeNs === b.mtimeNs)
/** Freeze runtime dependency identities after approved discovery. No second discovery in a 2s execute phase. */
export class CsharpRuntimeFiles {
  private readonly entries = new Map<string, Entry>()
  async capture(sdk: CsharpSdkSelection, context: CsharpPreparationContext): Promise<void> {
    if (this.entries.size) throw exerciseCoreError('INTERNAL_ERROR')
    const root = dirname(sdk.dotnetPath), suffix = relative(root, sdk.runtimeDirectory)
    if (!isAbsolute(root) || isAbsolute(suffix) || suffix.startsWith('..')
      || sdk.runtimeDirectory !== join(root, 'shared', 'Microsoft.NETCore.App', sdk.runtimeVersion)) throw exerciseCoreError('INTERNAL_ERROR')
    const queue = [sdk.dotnetPath, sdk.runtimeDirectory, join(root, 'host')]
    const expand = new Set([sdk.runtimeDirectory, join(root, 'host')])
    for (const start of [...queue]) for (let parent = dirname(start); ; parent = dirname(parent)) {
      if (!queue.includes(parent)) queue.push(parent)
      if (dirname(parent) === parent) break
    }
    const seen = new Set<string>()
    while (queue.length) {
      checkCsharpWork(context)
      if (seen.size + queue.length > 4096) throw exerciseCoreError('INTERNAL_ERROR')
      const batch = queue.splice(0, 16).filter(file => { if (seen.has(file)) return false; seen.add(file); return true })
      const settled = await Promise.allSettled(batch.map(async file => {
        const entry = await this.read(file, expand.has(file), context)
        this.entries.set(file, entry)
        if (entry.children) for (const name of entry.children) { const child = join(file, name); expand.add(child); queue.push(child) }
      }))
      const failed = settled.find(r => r.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason
    }
    await this.validate(context)
  }
  private async read(file: string, list: boolean, context: CsharpPreparationContext): Promise<Entry> {
    checkCsharpWork(context)
    const stat = await lstat(file, { bigint: true })
    if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()
      || resolve(await realpath(file)).toLowerCase() !== resolve(file).toLowerCase()) throw exerciseCoreError('INTERNAL_ERROR')
    const children = list && stat.isDirectory() ? (await readdir(file)).sort() : undefined
    checkCsharpWork(context)
    return { file, stat, children }
  }
  async validate(context: CsharpPreparationContext): Promise<void> {
    const entries = [...this.entries.values()]
    if (!entries.length) throw exerciseCoreError('INTERNAL_ERROR')
    for (let offset = 0; offset < entries.length; offset += 16) {
      const settled = await Promise.allSettled(entries.slice(offset, offset + 16).map(async expected => {
        const actual = await this.read(expected.file, expected.children !== undefined, context)
        if (!same(expected.stat, actual.stat) || JSON.stringify(expected.children) !== JSON.stringify(actual.children)) throw exerciseCoreError('INTERNAL_ERROR')
      }))
      const failed = settled.find(r => r.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason
    }
    checkCsharpWork(context)
  }
}

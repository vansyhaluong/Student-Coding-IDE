import { lstat, open, readlink, realpath } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { win32 } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { JavascriptNodeResolution, JavascriptNodeSelection, JavascriptPreparationContext } from './javascript-execution-contracts'
import { exerciseCoreError } from './exercise-limits'

type InvalidReason = Extract<JavascriptNodeResolution, { state: 'INVALID_CONFIGURATION' }>['reason']
export class NodeCandidateError extends Error {
  constructor(readonly reason: InvalidReason) { super('Installed Learning Node candidate is invalid.') }
}
export class NodeCandidateMissing extends Error {}
export function checkJavascriptWork(context: JavascriptPreparationContext): void {
  if (context.signal.aborted) throw exerciseCoreError('PROCESS_INTERRUPTED')
  if (!Number.isFinite(context.deadline) || performance.now() >= context.deadline) throw exerciseCoreError('PHASE_DEADLINE')
}
export function safeNodePath(path: string): boolean {
  return (/^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\/? ]+[\\/][^\\/]+/.test(path))
    && !/^\\\\[?.][\\/]/.test(path) && !/[<>"|?*]/.test(path)
    && !Array.from(path).some(c => c.charCodeAt(0) < 32)
    && !path.slice(/^[a-z]:/i.test(path) ? 2 : 0).includes(':')
}
const key = (path: string): string => win32.normalize(path).toLowerCase()
const same = (a: BigIntStats, b: BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
  && a.mode === b.mode && (a.isDirectory() || a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs)
interface Entry { path: string; canonical: string; stat: BigIntStats; link: string | null }
export interface JavascriptNodeFiles {
  readonly executablePath: string
  readonly canonicalPath: string
  readonly identity: JavascriptNodeSelection['identity']
  readonly entries: readonly Entry[]
}
async function entry(path: string, context: JavascriptPreparationContext): Promise<Entry> {
  checkJavascriptWork(context)
  const stat = await lstat(path, { bigint: true })
  checkJavascriptWork(context)
  const link = stat.isSymbolicLink() ? await readlink(path) : null
  const canonical = await realpath(path)
  checkJavascriptWork(context)
  if (!safeNodePath(canonical) || !stat.isFile() && !stat.isDirectory() && !stat.isSymbolicLink()) throw new NodeCandidateError('UNSAFE_IDENTITY')
  return { path, canonical, stat, link }
}
function ancestors(path: string): string[] {
  const paths = [path]
  while (win32.dirname(paths[0]) !== paths[0]) paths.unshift(win32.dirname(paths[0]))
  if (paths.length > 128) throw new NodeCandidateError('UNSAFE_IDENTITY')
  return paths
}
/** Capture alias AND canonical ancestry: directory junctions/nvm are allowed only
 * when the whole observed chain is stable. No executable search or process launch. */
export async function captureJavascriptNode(path: string, context: JavascriptPreparationContext): Promise<JavascriptNodeFiles> {
  checkJavascriptWork(context)
  if (!safeNodePath(path) || win32.basename(path).toLowerCase() !== 'node.exe') throw new NodeCandidateError('UNSAFE_IDENTITY')
  const entries: Entry[] = []
  for (const part of ancestors(win32.normalize(path))) {
    try { entries.push(await entry(part, context)) }
    catch (error) {
      checkJavascriptWork(context)
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        // A missing normal PATH directory is absent; a broken link is invalid.
        try {
          if ((await lstat(part)).isSymbolicLink()) throw new NodeCandidateError('UNSAFE_IDENTITY')
        } catch (e) { if (e instanceof NodeCandidateError) throw e }
        if (entries.some(e => e.link !== null)) throw new NodeCandidateError('UNSAFE_IDENTITY')
        throw new NodeCandidateMissing()
      }
      if (error instanceof Error && 'code' in error && error.code === 'ELOOP') throw new NodeCandidateError('UNSAFE_IDENTITY')
      throw error
    }
  }
  const canonical = entries.at(-1)!.canonical
  for (const part of ancestors(canonical)) if (!entries.some(e => key(e.path) === key(part))) entries.push(await entry(part, context))
  checkJavascriptWork(context)
  const handle = await open(canonical, 'r')
  let file: BigIntStats
  try {
    file = await handle.stat({ bigint: true })
    checkJavascriptWork(context)
    if (!file.isFile() || file.size < 70n || file.size > 256n * 1024n ** 2n || file.ino === 0n) throw new NodeCandidateError('UNSAFE_IDENTITY')
    const header = Buffer.alloc(64)
    if ((await handle.read(header, 0, 64, 0)).bytesRead !== 64 || header.toString('ascii', 0, 2) !== 'MZ') throw new NodeCandidateError('NODE_INCOMPATIBLE')
    const offset = header.readUInt32LE(60), pe = Buffer.alloc(6)
    if (offset < 64 || offset > 1024 * 1024 || BigInt(offset + 6) > file.size
      || (await handle.read(pe, 0, 6, offset)).bytesRead !== 6 || pe.readUInt32LE(0) !== 0x4550) throw new NodeCandidateError('NODE_INCOMPATIBLE')
    if (process.arch !== 'x64' || pe.readUInt16LE(4) !== 0x8664) throw new NodeCandidateError('ARCHITECTURE_MISMATCH')
    if (!same(file, await handle.stat({ bigint: true }))) throw new NodeCandidateError('UNSAFE_IDENTITY')
  } finally { await handle.close() }
  checkJavascriptWork(context)
  for (const expected of entries) {
    const actual = await entry(expected.path, context)
    if (key(actual.canonical) !== key(expected.canonical) || actual.link !== expected.link || !same(actual.stat, expected.stat)) throw new NodeCandidateError('UNSAFE_IDENTITY')
  }
  const actualFile = await lstat(canonical, { bigint: true })
  checkJavascriptWork(context)
  if (!same(file!, actualFile)) throw new NodeCandidateError('UNSAFE_IDENTITY')
  return { executablePath: win32.normalize(path), canonicalPath: canonical,
    identity: Object.freeze({ volume: String(file!.dev), fileId: String(file!.ino) }), entries }
}
export async function revalidateJavascriptNode(files: JavascriptNodeFiles, context: JavascriptPreparationContext): Promise<void> {
  let actual: JavascriptNodeFiles
  try { actual = await captureJavascriptNode(files.executablePath, context) }
  catch { checkJavascriptWork(context); throw new NodeCandidateError('UNSAFE_IDENTITY') }
  if (key(files.canonicalPath) !== key(actual.canonicalPath) || files.entries.length !== actual.entries.length
    || files.identity.volume !== actual.identity.volume || files.identity.fileId !== actual.identity.fileId
    || files.entries.some((e, i) => key(e.path) !== key(actual.entries[i].path) || e.link !== actual.entries[i].link
      || key(e.canonical) !== key(actual.entries[i].canonical) || !same(e.stat, actual.entries[i].stat))) throw new NodeCandidateError('UNSAFE_IDENTITY')
}

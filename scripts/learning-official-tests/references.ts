import * as fs from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { boundedChild } from './process'
import { check, demand, encode, id, IDS, LIMITS, parse, same, type Args, type Id } from './model'
import { domain } from './domains'

export interface References {
  run(language: 'javascript' | 'csharp', exercise: string, args: Args[]): Promise<unknown>
  close(): Promise<void>
  versions: { node: string; sdk: string }
  sourceHashes: Record<string, string>
  verifySources(): Promise<void>
}
export async function evidenceRoot(repo: string): Promise<string> {
  const root = resolve(repo, 'out', 'official-tests')
  for (const path of [resolve(repo, 'out'), root]) {
    await fs.mkdir(path, { recursive: true })
    demand(!(await fs.lstat(path)).isSymbolicLink(), 'OUTPUT_PATH')
    const fold = (s: string) => process.platform === 'win32' ? s.toLowerCase() : s
    demand(fold(await fs.realpath(path)) === fold(path), 'OUTPUT_PATH')
  }
  return root
}
export interface ReferenceProfile {
  project: string; assembly: string; child: string; files: readonly string[]
  validate(exercise: string, args: Args): void
}
export async function createReferences(repo: string, signal?: AbortSignal, due = performance.now() + LIMITS.campaignMs, profile?: ReferenceProfile): Promise<References> {
  const base = await evidenceRoot(repo), workspace = await fs.mkdtemp(join(base, 'refs-'))
  const tools = resolve(repo, 'scripts', 'learning-official-tests'), obj = join(workspace, 'obj') + sep
  async function sources() {
    const paths = profile?.files ?? ['model.ts', 'author.ts', 'domains.ts', 'oracles.ts', 'mutants.ts', 'verify.ts', 'process.ts', 'references.ts', 'run.mjs',
      'reference-child.mjs', 'references/Pilot.csproj', 'references/Program.cs', 'references/NuGet.Config',
      ...IDS.flatMap(id => [`references/${id}/Solution.cs`, `references/${id}/solution.js`])]
    const result: Record<string, string> = {}
    for (const path of paths) {
      const file = join(tools, path), stat = await fs.lstat(file)
      demand(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 * 1024, 'SOURCE_LIMIT')
      const bytes = await fs.readFile(file); demand(bytes.length <= 64 * 1024, 'SOURCE_LIMIT')
      result[path] = createHash('sha256').update(bytes).digest('hex')
    }
    return result
  }
  let closed = false, poisoned = false
  const controller = new AbortController(), ownedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  let active: Promise<Buffer> | undefined, closing: Promise<void> | undefined
  async function close() {
    if (closing) return closing
    closed = true; controller.abort()
    closing = (async () => {
      try { await active } catch { /* Run error remains rejected to its caller; await pipe settlement. */ }
      demand(!poisoned, 'CLEANUP_UNVERIFIED')
      demand(dirname(resolve(workspace)) === base && basename(workspace).startsWith('refs-')
        && !(await fs.lstat(workspace)).isSymbolicLink(), 'CLEANUP_PATH')
      demand((await fs.realpath(workspace)).toLowerCase() === workspace.toLowerCase(), 'CLEANUP_PATH')
      await fs.rm(workspace, { recursive: true, force: true })
    })()
    return closing
  }
  const run = (cmd: string, args: string[], input?: Buffer, maximum: number = LIMITS.childMs, trustedLeaf = false) => {
    check(ownedSignal, due); demand(!active && !closed, 'REFERENCE_BUSY_OR_CLOSED')
    active = boundedChild(cmd, args, { cwd: workspace, input, signal: ownedSignal, trustedLeaf, timeoutMs: Math.max(1, Math.min(maximum, due - performance.now())) })
      .catch(error => { if (error instanceof Error && error.message === 'CLEANUP_UNVERIFIED') poisoned = true; throw error })
    return active.finally(() => { active = undefined })
  }
  async function scratchBudget() {
    let bytes = 0, entries = 0
    async function walk(path: string, depth: number): Promise<void> {
      check(ownedSignal, due); demand(depth <= 8, 'SCRATCH_LIMIT')
      for (const name of await fs.readdir(path)) {
        demand(++entries <= 256, 'SCRATCH_LIMIT')
        const next = join(path, name), stat = await fs.lstat(next)
        demand(!stat.isSymbolicLink(), 'SCRATCH_PATH')
        if (stat.isDirectory()) await walk(next, depth + 1)
        else { bytes += stat.size; demand(bytes <= 32 * 1024 * 1024, 'SCRATCH_LIMIT') }
      }
    }
    await walk(workspace, 0)
  }
  try {
    const sourceHashes = await sources()
    const sdk = (await run('dotnet', ['--version'])).toString('utf8').trim()
    demand(/^10\.\d+\.\d+$/.test(sdk), 'SDK_NOT_AVAILABLE')
    const project = join(tools, 'references', profile?.project ?? 'Pilot.csproj')
    const properties = ['-p:BaseIntermediateOutputPath=' + obj, '-p:MSBuildProjectExtensionsPath=' + obj,
      '-p:UseSharedCompilation=false', '-nodeReuse:false', '-maxcpucount:1']
    await run('dotnet', ['restore', project, '--configfile', join(tools, 'references', 'NuGet.Config'), '--disable-parallel', ...properties], undefined, LIMITS.buildMs)
    await scratchBudget()
    await run('dotnet', ['build', project, '--no-restore', '-c', 'Release', '-o', join(workspace, 'bin'), ...properties], undefined, LIMITS.buildMs)
    await scratchBudget()
    const verifySources = async () => demand(same(sourceHashes, await sources()), 'SOURCE_CHANGED')
    await verifySources()
    return { versions: { node: process.version, sdk }, sourceHashes, verifySources, close, async run(language, exercise, rows) {
      demand(!closed && rows.length <= LIMITS.rows, 'REFERENCE_CLOSED_OR_COUNT')
      if (!profile) id(exercise)
      rows.forEach(args => profile ? profile.validate(exercise, args) : domain(exercise as Id, args))
      const input = encode(rows)
      return parse(await (language === 'javascript'
        ? run(process.execPath, ['--max-old-space-size=' + LIMITS.heapMiB, join(tools, profile?.child ?? 'reference-child.mjs'), exercise], input, LIMITS.childMs, true)
        : run('dotnet', [join(workspace, 'bin', profile?.assembly ?? 'Pilot.dll'), exercise], input, LIMITS.childMs, true)))
    } }
  } catch (error) { await close(); throw error }
}

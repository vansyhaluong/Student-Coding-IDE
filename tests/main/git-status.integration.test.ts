import { access, appendFile, cp, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GitExecutableDetector } from '../../src/main/services/dependencies/git-executable'
import { GitCommandRunner } from '../../src/main/services/git/git-command-runner'
import { GitService } from '../../src/main/services/git/git-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import type { ProjectId, GitStatusEntry } from '../../src/shared/contracts'

const dependency = process.platform === 'win32' ? await new GitExecutableDetector().detect() : { state: 'MISSING' as const }
const realGit = dependency.state === 'AVAILABLE' ? describe : describe.skip
if (dependency.state !== 'AVAILABLE') console.warn('Phase 5B real Git SKIPPED: Windows PATH Git unavailable; no local acceptance evidence.')

let baselineDirectory: string | undefined

function assertSafeFixture(directory: string): void {
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe fixture cleanup')
}

async function fixture(run: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>, withHead = true) {
  const directory = await mkdtemp(join(tmpdir(), 'student-ide-phase5b-test-'))
  assertSafeFixture(directory)
  const f = await createFixture(directory, withHead)
  try { await run(f) } finally {
    await f.projects.stop()
    // mkdtemp is outside the worktree and owned only by this test.
    await rm(directory, { recursive: true, force: true })
  }
}

async function createFixture(directory: string, withHead: boolean) {
  if (dependency.state !== 'AVAILABLE') throw new Error('Git missing')
  const executable = dependency.git.executable
  const calls: string[][] = []
  const runner = new GitCommandRunner()
  const git = async (...args: string[]) => {
    const result = await runner.execute(executable, args, directory)
    expect(result.exitCode, `fixture Git failed: ${args[0]}`).toBe(0)
    return result.stdout
  }
  const put = (path: string, content: string) => writeFile(join(directory, path), content, 'utf8')
  if (withHead && baselineDirectory && directory !== baselineDirectory) {
    await cp(join(baselineDirectory, '.git'), join(directory, '.git'), { recursive: true })
    await Promise.all([
      cp(join(baselineDirectory, 'tracked.txt'), join(directory, 'tracked.txt')),
      cp(join(baselineDirectory, 'other.txt'), join(directory, 'other.txt')),
    ])
  } else {
    await git('init', '--quiet', '--initial-branch=main')
    await appendFile(join(directory, '.git', 'config'), [
      '',
      '[user]',
      '\tname = Phase 5B Test',
      '\temail = phase5b@example.invalid',
      '[commit]',
      '\tgpgsign = false',
      '[core]',
      '\tautocrlf = false',
      '',
    ].join('\n'), 'utf8')
  }
  if (withHead && directory === baselineDirectory) {
    await put('tracked.txt', 'base')
    await put('other.txt', 'other base')
    await git('add', '--', 'tracked.txt', 'other.txt')
    await git('commit', '--quiet', '-m', 'fixture base')
  }
  const projects = new ProjectService()
  const project = await projects.openRoot(directory)
  const service = new GitService(projects,
    { getStatus: (projectId: ProjectId) => ({ projectId, state: 'AVAILABLE' }) },
    new GitExecutableDetector(), {
      execute: async (exe, args, cwd, options) => { calls.push([...args]); return runner.execute(exe, args, cwd, options) },
      stream: (exe, args, cwd, consume, options) => runner.stream(exe, args, cwd, consume, options),
    }, { realpath })
  const status = () => service.getStatus(project.id)
  const stage = (path: string) => service.stage(project.id, path)
  const unstage = (path: string) => service.unstage(project.id, path)
  const read = (path: string) => readFile(join(directory, path), 'utf8')
  return { directory, git, put, read, status, stage, unstage, service, project, projects, calls, runner, executable }
}

realGit('Phase 5B real Git status/stage/unstage', () => {
  beforeAll(async () => {
    baselineDirectory = await mkdtemp(join(tmpdir(), 'student-ide-phase5b-baseline-'))
    assertSafeFixture(baselineDirectory)
    const baseline = await createFixture(baselineDirectory, true)
    await baseline.projects.stop()
  })

  afterAll(async () => {
    if (baselineDirectory) await rm(baselineDirectory, { recursive: true, force: true })
    baselineDirectory = undefined
  })

  it('handles clean, modified, stage and staged+modified status', async () => {
    await fixture(async (f) => {
      expect(await f.git('--version')).toMatch(/^git version /)
      expect(await f.status()).toEqual({ entries: [], didHitLimit: false })
      await f.put('tracked.txt', 'index version')
      expect((await f.status()).entries).toEqual([entry('tracked.txt', null, 'MODIFIED')])
      expect((await f.stage('tracked.txt')).applied).toBe(true)
      await f.put('tracked.txt', 'worktree version')
      expect((await f.status()).entries).toEqual([entry('tracked.txt', 'MODIFIED', 'MODIFIED')])
    })
  })

  it('unstages MM with HEAD and preserves unrelated index changes', async () => {
    await fixture(async (f) => {
      await f.put('tracked.txt', 'index version')
      await f.put('other.txt', 'staged other')
      await f.git('add', '--', 'tracked.txt', 'other.txt')
      await f.put('tracked.txt', 'worktree version')
      const outcome = await f.unstage('tracked.txt')
      expect(outcome.refreshRequired).toBe(false)
      expect(outcome.status?.entries).toContainEqual(entry('tracked.txt', null, 'MODIFIED'))
      expect(outcome.status?.entries).toContainEqual(entry('other.txt', 'MODIFIED', null))
      expect(await f.read('tracked.txt')).toBe('worktree version')
      expect(f.calls).toContainEqual(['--literal-pathspecs', 'restore', '--staged', '--', 'tracked.txt'])
    })
  })

  it('stages the working version and accepts an already staged entry', async () => {
    await fixture(async (f) => {
      await f.put('tracked.txt', 'index version')
      await f.git('add', '--', 'tracked.txt')
      await f.put('tracked.txt', 'worktree version')
      await f.stage('tracked.txt')
      expect((await f.status()).entries).toContainEqual(entry('tracked.txt', 'MODIFIED', null))
      expect((await f.stage('tracked.txt')).applied).toBe(true)
    })
  })

  it.each(['new file.txt', '資料 đẹp.txt', '-dash.txt', '[abc].txt'])('stages and unstages literal new file %s', async (path) => {
    await fixture(async (f) => {
      await f.put(path, 'working data')
      await f.put('a.txt', 'not selected')
      expect((await f.status()).entries).toContainEqual(entry(path, null, null, true))
      const staged = await f.stage(path)
      expect(staged.status?.entries).toContainEqual(entry(path, 'ADDED', null))
      expect(staged.status?.entries).toContainEqual(entry('a.txt', null, null, true))
      await f.unstage(path)
      expect(await f.read(path)).toBe('working data')
      expect((await f.status()).entries).toContainEqual(entry(path, null, null, true))
      expect(f.calls).toContainEqual(['--literal-pathspecs', 'add', '--', path])
    })
  })

  it('handles deletion and preserves deleted working-tree state', async () => {
    await fixture(async (f) => {
      await rm(join(f.directory, 'tracked.txt'))
      expect((await f.status()).entries).toContainEqual(entry('tracked.txt', null, 'DELETED'))
      expect((await f.stage('tracked.txt')).status?.entries).toContainEqual(entry('tracked.txt', 'DELETED', null))
      expect((await f.unstage('tracked.txt')).status?.entries).toContainEqual(entry('tracked.txt', null, 'DELETED'))
      await expect(access(join(f.directory, 'tracked.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  it.each(['stage', 'unstage'] as const)('reports an index lock during %s without changing disk or index', async (action) => {
    await fixture(async (f) => {
      await f.put('tracked.txt', 'index version')
      await f.git('add', '--', 'tracked.txt')
      await f.put('tracked.txt', 'working version')
      const indexPath = join(f.directory, '.git', 'index')
      const before = await readFile(indexPath)
      const lockPath = join(f.directory, '.git', 'index.lock')
      await writeFile(lockPath, 'external lock', { flag: 'wx' })
      try {
        await expect(f[action]('tracked.txt')).rejects.toMatchObject({
          code: 'PROCESS_FAILED', operation: `git:${action}`,
        })
        expect(await readFile(indexPath)).toEqual(before)
        expect(await f.read('tracked.txt')).toBe('working version')
        expect(await readFile(lockPath, 'utf8')).toBe('external lock')
      } finally { await rm(lockPath) }
    })
  })

  it('preserves semantic rename and unstages both validated paths without touching content', async () => {
    await fixture(async (f) => {
      await rename(join(f.directory, 'tracked.txt'), join(f.directory, 'renamed file.txt'))
      await f.git('add', '--', 'tracked.txt', 'renamed file.txt')
      expect((await f.status()).entries).toContainEqual({
        path: 'renamed file.txt', staged: { kind: 'RENAMED', previousPath: 'tracked.txt' }, unstaged: null, untracked: false,
      })
      expect((await f.stage('renamed file.txt')).applied).toBe(true)
      await f.put('renamed file.txt', 'edited after rename')
      await f.stage('renamed file.txt')
      // Restore identical content so Git still reports the rename pair.
      await f.put('renamed file.txt', 'base')
      await f.stage('renamed file.txt')
      const outcome = await f.unstage('renamed file.txt')
      expect(f.calls).toContainEqual(['--literal-pathspecs', 'restore', '--staged', '--', 'renamed file.txt', 'tracked.txt'])
      expect(outcome.status?.entries).toContainEqual(entry('tracked.txt', null, 'DELETED'))
      expect(outcome.status?.entries).toContainEqual(entry('renamed file.txt', null, null, true))
      expect(await f.read('renamed file.txt')).toBe('base')
    })
  })

  it('detects copies and never unstages the source change', async () => {
    await fixture(async (f) => {
      const base = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
      await f.put('tracked.txt', base)
      await f.git('add', '--', 'tracked.txt')
      await f.git('commit', '--quiet', '-m', 'copy baseline')
      await f.put('copy.txt', base)
      await f.put('tracked.txt', base + '\nextra')
      await f.git('add', '--', 'tracked.txt', 'copy.txt')
      expect((await f.status()).entries).toContainEqual({ path: 'copy.txt', staged: { kind: 'COPIED', previousPath: 'tracked.txt' }, unstaged: null, untracked: false })
      await f.unstage('copy.txt')
      expect((await f.status()).entries).toContainEqual(entry('tracked.txt', 'MODIFIED', null))
      expect(await f.read('copy.txt')).toBe(base)
    })
  })

  it.each([false, true])('supports unborn stage/unstage, modified-after-stage=%s', async (modify) => {
    await fixture(async (f) => {
      expect(await f.status()).toEqual({ entries: [], didHitLimit: false })
      await f.put('資料 first.txt', 'index data')
      await f.put('other.txt', 'unrelated index data')
      await f.stage('資料 first.txt')
      await f.stage('other.txt')
      if (modify) await f.put('資料 first.txt', 'worktree data')
      const result = await f.unstage('資料 first.txt')
      expect(result.status?.entries).toContainEqual(entry('other.txt', 'ADDED', null))
      expect(result.status?.entries).toContainEqual(entry('資料 first.txt', null, null, true))
      expect(await f.read('資料 first.txt')).toBe(modify ? 'worktree data' : 'index data')
      expect(f.calls).toContainEqual(['--literal-pathspecs', 'reset', '-q', '--', '資料 first.txt'])
    }, false)
  })

  it('represents a real conflict read-only and rejects both mutations', async () => {
    await fixture(async (f) => {
      await f.git('checkout', '--quiet', '-b', 'fixture-side')
      await f.put('tracked.txt', 'side')
      await f.git('commit', '--quiet', '-am', 'side')
      await f.git('checkout', '--quiet', 'main')
      await f.put('tracked.txt', 'main')
      await f.git('commit', '--quiet', '-am', 'main')
      const merge = await f.runner.execute(f.executable, ['merge', '--no-edit', 'fixture-side'], f.directory)
      expect(merge.exitCode).toBe(1)
      expect((await f.status()).entries).toContainEqual(entry('tracked.txt', 'CONFLICTED', 'CONFLICTED'))
      const before = await f.read('tracked.txt')
      await expect(f.stage('tracked.txt')).rejects.toMatchObject({ details: { reason: 'conflicted-read-only' } })
      await expect(f.unstage('tracked.txt')).rejects.toMatchObject({ details: { reason: 'conflicted-read-only' } })
      expect(await f.read('tracked.txt')).toBe(before)
      expect(f.calls.some((args) => args[0] === '--literal-pathspecs')).toBe(false)
    })
  })

  it('rejects a stale pattern path and verifies literal CLI semantics against a matching file', async () => {
    await fixture(async (f) => {
      await f.put('a.txt', 'do not stage')
      await expect(f.stage('[abc].txt')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      const result = await f.runner.execute(f.executable, ['--literal-pathspecs', 'add', '--', '[abc].txt'], f.directory)
      expect(result.exitCode).not.toBe(0)
      expect((await f.status()).entries).toEqual([entry('a.txt', null, null, true)])
    })
  })

  it('enforces the 1000 limit through production streaming on a 1001-file repository', async () => {
    await fixture(async (f) => {
      // Bounded filesystem concurrency; Git itself streams the actual records.
      for (let start = 0; start < 1001; start += 50) {
        await Promise.all(Array.from({ length: Math.min(50, 1001 - start) }, (_, i) => f.put(`${start + i}.txt`, 'x')))
      }
      const status = await f.status()
      expect(status.entries).toHaveLength(1000)
      expect(status.didHitLimit).toBe(true)
    }, false)
  })

  it('keeps a project nested inside a parent repository unauthorized for all 5B operations', async () => {
    await fixture(async (f) => {
      const child = join(f.directory, 'nested')
      await mkdir(child)
      const nested = await f.projects.openRoot(child)
      for (const operation of [() => f.service.getStatus(nested.id), () => f.service.stage(nested.id, 'file.txt'), () => f.service.unstage(nested.id, 'file.txt')]) {
        await expect(operation()).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
      }
    })
  })
})

function entry(path: string, staged: string | null, unstaged: string | null, untracked = false): GitStatusEntry {
  // Expectations keep kind strings compact without weakening runtime validation.
  return { path, staged: staged ? { kind: staged } : null, unstaged: unstaged ? { kind: unstaged } : null, untracked } as GitStatusEntry
}

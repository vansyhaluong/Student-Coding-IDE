import { execFile } from 'node:child_process'
import { appendFile, chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GitExecutableDetector } from '../../src/main/services/dependencies/git-executable'
import { GitCommandRunner } from '../../src/main/services/git/git-command-runner'
import { GitService } from '../../src/main/services/git/git-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import type { ProjectId } from '../../src/shared/contracts'

const dependency = process.platform === 'win32'
  ? await new GitExecutableDetector().detect()
  : { state: 'MISSING' as const }

// Portable CI cannot establish Windows Git acceptance; Windows must run it.
if (process.platform !== 'win32') {
  console.warn('Phase 5C native Git tests SKIPPED: Windows PATH Git is required; no native acceptance evidence.')
}

let baselineDirectory: string | undefined

function assertSafeFixture(directory: string): void {
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe fixture cleanup')
}

async function fixture(run: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>, head = true) {
  const directory = await mkdtemp(join(tmpdir(), 'student-ide-phase5c-'))
  assertSafeFixture(directory)
  let f: Awaited<ReturnType<typeof setup>> | undefined
  try { f = await setup(directory, head); await run(f) } finally {
    await f?.projects.stop()
    await rm(directory, { recursive: true, force: true })
  }
}

async function setup(directory: string, head: boolean) {
  if (dependency.state !== 'AVAILABLE') throw new Error('Phase 5C acceptance requires installed Windows Git; no evidence available.')
  const executable = dependency.git.executable
  const runner = new GitCommandRunner()
  const git = async (...args: string[]) => {
    const result = await runner.execute(executable, args, directory)
    expect(result.exitCode, `fixture command ${args[0]}`).toBe(0)
    return result.stdout
  }
  const hooksPath = join(directory, '.git', 'hooks').replaceAll('\\', '/')
  const put = (path: string, content: string) => writeFile(join(directory, path), content, 'utf8')
  if (head && baselineDirectory && directory !== baselineDirectory) {
    await cp(join(baselineDirectory, '.git'), join(directory, '.git'), { recursive: true })
    await Promise.all([
      cp(join(baselineDirectory, 'tracked.txt'), join(directory, 'tracked.txt')),
      cp(join(baselineDirectory, 'other.txt'), join(directory, 'other.txt')),
    ])
    await appendFile(join(directory, '.git', 'config'), `\n[core]\n\thooksPath = ${hooksPath}\n`, 'utf8')
  } else {
    await git('init', '--quiet', '--initial-branch=main')
    await appendFile(join(directory, '.git', 'config'), [
      '',
      '[user]',
      '\tname = Phase 5C Author',
      '\temail = phase5c@example.invalid',
      '[commit]',
      '\tgpgsign = false',
      '[core]',
      '\tautocrlf = false',
      `\thooksPath = ${hooksPath}`,
      '',
    ].join('\n'), 'utf8')
  }
  if (head && directory === baselineDirectory) {
    await put('tracked.txt', 'base')
    await put('other.txt', 'other base')
    await git('add', '--', 'tracked.txt', 'other.txt')
    await git('commit', '--quiet', '-m', 'baseline')
  }
  const calls: string[][] = []
  const control: { afterMutation?: () => Promise<void>; afterCommand?: (args: readonly string[]) => Promise<void> } = {}
  const projects = new ProjectService()
  const project = await projects.openRoot(directory)
  const service = new GitService(projects,
    { getStatus: (projectId: ProjectId) => ({ projectId, state: 'AVAILABLE' }) },
    { detect: async () => dependency }, {
      execute: async (exe, args, cwd, options) => {
        calls.push([...args])
        const result = await runner.execute(exe, args, cwd, options)
        if (args[0] === 'commit' || args[0] === 'switch') await control.afterMutation?.()
        await control.afterCommand?.(args)
        return result
      },
      stream: (exe, args, cwd, consume, options) => runner.stream(exe, args, cwd, consume, options),
    }, { realpath })
  const read = (path: string) => readFile(join(directory, path), 'utf8')
  const index = () => git('ls-files', '--stage', '-z')
  const hook = async (name: string) => {
    const path = join(directory, '.git', 'hooks', name)
    await writeFile(path, '#!/bin/sh\nprintf ran > hook-ran\nexit 1\n', 'utf8')
    await chmod(path, 0o755)
  }
  return { directory, executable, runner, git, put, read, index, hook, service, project, projects, calls, control }
}

describe.skipIf(process.platform !== 'win32')('Phase 5C production service with real local Git', () => {
  beforeAll(async () => {
    baselineDirectory = await mkdtemp(join(tmpdir(), 'student-ide-phase5c-baseline-'))
    assertSafeFixture(baselineDirectory)
    const baseline = await setup(baselineDirectory, true)
    await baseline.projects.stop()
  })

  afterAll(async () => {
    if (baselineDirectory) await rm(baselineDirectory, { recursive: true, force: true })
    baselineDirectory = undefined
  })

  async function atTarget(f: Awaited<ReturnType<typeof setup>>, ignored = false) {
    await f.git('switch', '-c', 'target-fixture')
    await f.put(ignored ? 'ignored.txt' : 'tracked.txt', 'at branch content')
    await f.git('add', '--', ignored ? 'ignored.txt' : 'tracked.txt')
    await f.git('commit', '--quiet', '-m', 'at target')
    await f.git('branch', '@')
    const target = await f.git('rev-parse', 'refs/heads/@')
    await f.git('switch', 'main')
    return target
  }

  it('snapshots @ and switches exact @ with a detached native hook, preserving harmless local data', async () => {
    await fixture(async (f) => {
      const target = await atTarget(f)
      const main = await f.git('rev-parse', 'HEAD')
      expect(target).not.toBe(main)
      expect(await f.service.getBranches(f.project.id)).toEqual({ state: 'ATTACHED', currentBranch: 'main', branches: ['@', 'main', 'target-fixture'] })
      await f.put('other.txt', 'staged version')
      await f.git('add', '--', 'other.txt')
      await f.put('other.txt', 'working version')
      await f.put('.gitignore', 'ignored.txt\n')
      await f.put('ignored.txt', 'ignored data')
      await f.put('untracked.txt', 'untracked data')
      const hookPath = join(f.directory, '.git', 'hooks', 'post-checkout')
      await writeFile(hookPath, '#!/bin/sh\ngit symbolic-ref -q HEAD > hook-context || printf DETACHED > hook-context\nprintf x >> hook-count\n', 'utf8')
      await chmod(hookPath, 0o755)
      expect((await f.service.switchBranch(f.project.id, '@')).applied).toBe(true)
      expect(await f.read('hook-context')).toBe('DETACHED')
      expect(await f.read('hook-count')).toBe('x')
      expect(await f.git('symbolic-ref', 'HEAD')).toBe('refs/heads/@\n')
      expect(await f.git('rev-parse', 'HEAD')).toBe(target)
      expect(await f.read('tracked.txt')).toBe('at branch content')
      expect(await f.service.getBranches(f.project.id)).toEqual({ state: 'ATTACHED', currentBranch: '@', branches: ['@', 'main', 'target-fixture'] })
      expect(await f.git('show', ':other.txt')).toBe('staged version')
      expect(await f.read('other.txt')).toBe('working version')
      expect(await f.read('ignored.txt')).toBe('ignored data')
      expect(await f.read('untracked.txt')).toBe('untracked data')
      expect(f.calls.filter((args) => args[0] === 'switch')).toEqual([
        ['switch', '--detach', '--no-guess', '--no-overwrite-ignore', '--', 'refs/heads/@'],
      ])
    })
  })

  it('switches an unrelated normal branch when @ exists and rejects invalid or absent identities', async () => {
    await fixture(async (f) => {
      await f.git('branch', '@')
      await f.git('branch', 'side')
      expect((await f.service.switchBranch(f.project.id, 'side')).applied).toBe(true)
      expect(await f.git('symbolic-ref', 'HEAD')).toBe('refs/heads/side\n')
      expect(f.calls.filter((args) => args[0] === 'switch')).toEqual([
        ['switch', '--no-guess', '--no-overwrite-ignore', '--', 'side'],
      ])
      for (const branch of ['@{0}', '--force', 'HEAD', '../main', 'refs/heads/@', 'missing']) {
        await expect(f.service.switchBranch(f.project.id, branch)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      }
      expect(f.calls.filter((args) => args[0] === 'switch')).toHaveLength(1)
    })
  })

  it.each(['tracked', 'ignored'] as const)('preserves index and %s data when @ checkout is blocked', async (kind) => {
    await fixture(async (f) => {
      await atTarget(f, kind === 'ignored')
      await f.put('other.txt', 'staged unrelated')
      await f.git('add', '--', 'other.txt')
      await f.put('.gitignore', 'ignored.txt\n')
      const path = kind === 'ignored' ? 'ignored.txt' : 'tracked.txt'
      await f.put(path, 'local data')
      const index = await f.index()
      await expect(f.service.switchBranch(f.project.id, '@')).rejects.toMatchObject({
        details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false,
      })
      expect(await f.git('symbolic-ref', 'HEAD')).toBe('refs/heads/main\n')
      expect(await f.index()).toBe(index)
      expect(await f.read(path)).toBe('local data')
      expect(f.calls.some((args) => args[0] === 'symbolic-ref' && args[1] === 'HEAD')).toBe(false)
    })
  })

  it.each(['hook', 'attach-lock', 'target-moved', 'project-changed', 'final-state'] as const)(
    'reports unknown without rollback/retry on @ fallback %s failure', async (failure) => {
      await fixture(async (f) => {
        const target = await atTarget(f)
        const main = await f.git('rev-parse', 'HEAD')
        await f.put('other.txt', 'staged local')
        await f.git('add', '--', 'other.txt')
        await f.put('other.txt', 'working local')
        await f.put('.gitignore', 'ignored.txt\n')
        await f.put('ignored.txt', 'ignored local')
        if (failure === 'hook') await f.hook('post-checkout')
        if (failure === 'attach-lock') f.control.afterMutation = () => f.put('.git/HEAD.lock', 'owned elsewhere')
        if (failure === 'target-moved') f.control.afterMutation = async () => { await f.git('update-ref', 'refs/heads/@', main.trim()) }
        if (failure === 'project-changed') {
          await mkdir(join(f.directory, 'other-project'))
          f.control.afterMutation = async () => { await f.projects.openRoot(join(f.directory, 'other-project')) }
        }
        if (failure === 'final-state') f.control.afterCommand = async (args) => {
          if (args[0] === 'symbolic-ref' && args[1] === 'HEAD') await f.git('symbolic-ref', 'HEAD', 'refs/heads/main')
        }
        await expect(f.service.switchBranch(f.project.id, '@')).rejects.toMatchObject({
          code: 'PROCESS_FAILED', details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false,
        })
        expect(await f.git('rev-parse', 'HEAD')).toBe(failure === 'final-state' ? main : target)
        const symbolic = await f.runner.execute(f.executable, ['symbolic-ref', '--quiet', 'HEAD'], f.directory)
        expect(symbolic.exitCode).toBe(failure === 'final-state' ? 0 : 1)
        expect(await f.git('show', ':other.txt')).toBe('staged local')
        expect(await f.read('other.txt')).toBe('working local')
        expect(await f.read('ignored.txt')).toBe('ignored local')
        expect(await f.read('tracked.txt')).toBe('at branch content')
        expect(f.calls.filter((args) => args[0] === 'switch')).toHaveLength(1)
        expect(f.calls.filter((args) => args[0] === 'symbolic-ref' && args[1] === 'HEAD'))
          .toHaveLength(['attach-lock', 'final-state'].includes(failure) ? 1 : 0)
        if (failure === 'attach-lock') expect(await f.read('.git/HEAD.lock')).toBe('owned elsewhere')
        if (failure === 'hook') expect(await f.read('hook-ran')).toBe('ran')
      })
    },
  )

  it.each(['commit', 'switch'] as const)('retains applied=true after %s when the active project changes before refresh', async (action) => {
    await fixture(async (f) => {
      await f.git('branch', 'side')
      await f.put('tracked.txt', 'staged content')
      await f.git('add', '--', 'tracked.txt')
      const before = await f.git('rev-parse', 'HEAD')
      const otherRoot = join(f.directory, 'other-project')
      await mkdir(otherRoot)
      f.control.afterMutation = async () => { await f.projects.openRoot(otherRoot) }
      const result = action === 'commit' ? await f.service.commit(f.project.id, 'applied')
        : await f.service.switchBranch(f.project.id, 'side')
      expect(result).toEqual({ applied: true, status: null, refreshRequired: true })
      if (action === 'commit') {
        expect(await f.git('rev-parse', 'HEAD')).not.toBe(before)
        expect(await f.git('show', 'HEAD:tracked.txt')).toBe('staged content')
      } else expect(await f.git('symbolic-ref', '--short', 'HEAD')).toBe('side\n')
    })
  })

  it('commits only staged content, preserving MM worktree content and untracked files', async () => {
    await fixture(async (f) => {
      await f.put('tracked.txt', 'index version')
      await f.git('add', '--', 'tracked.txt')
      await f.put('tracked.txt', 'working version')
      await f.put('untracked.txt', 'keep')
      const result = await f.service.commit(f.project.id, 'Unicode tiếng Việt 資料\n\nBody line 1\nBody line 2')
      expect(result).toMatchObject({ applied: true, refreshRequired: false })
      expect(await f.git('show', 'HEAD:tracked.txt')).toBe('index version')
      expect(await f.read('tracked.txt')).toBe('working version')
      expect(await f.read('untracked.txt')).toBe('keep')
      expect(await f.git('diff', '--cached', '--name-only')).toBe('')
      const history = await f.service.getHistory(f.project.id)
      expect(history[0]).toEqual({ id: (await f.git('rev-parse', 'HEAD')).trim(),
        subject: 'Unicode tiếng Việt 資料', authorName: 'Phase 5C Author', authoredAt: expect.any(String) })
      expect(history).toHaveLength(2)
      expect(f.calls.some((args) => args[0] === 'add')).toBe(false)
    })
  })

  it('represents unborn, returns empty history and supports the first commit', async () => {
    await fixture(async (f) => {
      expect(await f.service.getBranches(f.project.id)).toEqual({ state: 'UNBORN', currentBranch: 'main', branches: [] })
      expect(await f.service.getHistory(f.project.id)).toEqual([])
      await expect(f.service.switchBranch(f.project.id, 'main')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await f.put('first.txt', 'first')
      await f.git('add', '--', 'first.txt')
      expect((await f.service.commit(f.project.id, 'first')).applied).toBe(true)
      expect(await f.git('show', 'HEAD:first.txt')).toBe('first')
      expect(await f.service.getBranches(f.project.id)).toEqual({ state: 'ATTACHED', currentBranch: 'main', branches: ['main'] })
    }, false)
  })

  it('rejects nothing staged and whitespace messages without changing HEAD/index/worktree', async () => {
    await fixture(async (f) => {
      await f.put('tracked.txt', 'unstaged')
      const head = await f.git('rev-parse', 'HEAD')
      const index = await f.index()
      await expect(f.service.commit(f.project.id, 'nothing staged')).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
      f.calls.length = 0
      await expect(f.service.commit(f.project.id, ' \n\t')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect(f.calls).toHaveLength(0)
      expect(await f.git('rev-parse', 'HEAD')).toBe(head)
      expect(await f.index()).toBe(index)
      expect(await f.read('tracked.txt')).toBe('unstaged')
    })
  })

  it.each(['identity', 'pre-commit'] as const)('normalizes %s failure and preserves staged changes', async (kind) => {
    await fixture(async (f) => {
      await f.put('tracked.txt', 'staged')
      await f.git('add', '--', 'tracked.txt')
      if (kind === 'identity') await f.git('config', 'user.name', '')
      else await f.hook('pre-commit')
      const head = await f.git('rev-parse', 'HEAD')
      const index = await f.index()
      await expect(f.service.commit(f.project.id, 'commit')).rejects.toMatchObject({
        code: 'PROCESS_FAILED', details: { reason: 'command-failed' }, retryable: false,
      })
      expect(await f.git('rev-parse', 'HEAD')).toBe(head)
      expect(await f.index()).toBe(index)
      expect(await f.read('tracked.txt')).toBe('staged')
      if (kind === 'pre-commit') expect(await f.read('hook-ran')).toBe('ran')
    })
  })

  it.each(['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer'])('rejects existing %s before invoking commit', async (marker) => {
    await fixture(async (f) => {
      const path = join(f.directory, '.git', marker)
      if (marker.endsWith('HEAD')) await writeFile(path, await f.git('rev-parse', 'HEAD'))
      else await mkdir(path)
      const index = await f.index()
      const head = await f.git('rev-parse', 'HEAD')
      await expect(f.service.commit(f.project.id, 'blocked')).rejects.toMatchObject({ details: { reason: 'operation-in-progress' } })
      expect(f.calls.some((args) => args[0] === 'commit')).toBe(false)
      expect(await f.index()).toBe(index)
      expect(await f.git('rev-parse', 'HEAD')).toBe(head)
    })
  })

  it('lists local slash/Unicode branches and switches while preserving harmless staged and unstaged changes', async () => {
    await fixture(async (f) => {
      await f.git('branch', 'feature/tiếng-Việt')
      await f.put('tracked.txt', 'index version')
      await f.git('add', '--', 'tracked.txt')
      await f.put('tracked.txt', 'working version')
      await f.put('untracked.txt', 'untracked')
      const index = await f.index()
      expect(await f.service.getBranches(f.project.id)).toEqual({ state: 'ATTACHED', currentBranch: 'main', branches: ['feature/tiếng-Việt', 'main'] })
      expect((await f.service.switchBranch(f.project.id, 'feature/tiếng-Việt')).applied).toBe(true)
      expect(await f.git('symbolic-ref', '--short', 'HEAD')).toBe('feature/tiếng-Việt\n')
      expect(await f.index()).toBe(index)
      expect(await f.read('tracked.txt')).toBe('working version')
      expect(await f.read('untracked.txt')).toBe('untracked')
    })
  })

  it('preserves worktree/index when conflicting local changes block switch; returns unknown, never unapplied', async () => {
    await fixture(async (f) => {
      await f.git('switch', '-c', 'side')
      await f.put('tracked.txt', 'side')
      await f.git('add', '--', 'tracked.txt')
      await f.git('commit', '--quiet', '-m', 'side')
      await f.git('switch', 'main')
      await f.put('other.txt', 'staged unrelated')
      await f.git('add', '--', 'other.txt')
      await f.put('tracked.txt', 'local work')
      const index = await f.index()
      await expect(f.service.switchBranch(f.project.id, 'side')).rejects.toMatchObject({
        code: 'PROCESS_FAILED', details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false,
      })
      expect(await f.git('symbolic-ref', '--short', 'HEAD')).toBe('main\n')
      expect(await f.index()).toBe(index)
      expect(await f.read('tracked.txt')).toBe('local work')
      expect(await f.read('other.txt')).toBe('staged unrelated')
    })
  })

  it('does not overwrite an ignored local file when switching', async () => {
    await fixture(async (f) => {
      await f.git('switch', '-c', 'side')
      await f.put('ignored.txt', 'branch content')
      await f.git('add', '--', 'ignored.txt')
      await f.git('commit', '--quiet', '-m', 'side file')
      await f.git('switch', 'main')
      await f.put('.gitignore', 'ignored.txt\n')
      await f.put('ignored.txt', 'local ignored data')
      const index = await f.index()
      await expect(f.service.switchBranch(f.project.id, 'side')).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
      expect(await f.read('ignored.txt')).toBe('local ignored data')
      expect(await f.index()).toBe(index)
    })
  })

  it('returns unknown after a failing post-checkout hook even though Git really switched', async () => {
    await fixture(async (f) => {
      await f.git('branch', 'side')
      await f.hook('post-checkout')
      await expect(f.service.switchBranch(f.project.id, 'side')).rejects.toMatchObject({
        details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false,
      })
      expect(await f.read('hook-ran')).toBe('ran')
      expect(await f.git('symbolic-ref', '--short', 'HEAD')).toBe('side\n')
      expect(await f.read('tracked.txt')).toBe('base')
      expect(await f.git('diff', '--cached', '--name-only')).toBe('')
    })
  })

  it('handles detached HEAD without inventing a branch and excludes unrelated branch history', async () => {
    await fixture(async (f) => {
      const base = (await f.git('rev-parse', 'HEAD')).trim()
      await f.git('switch', '-c', 'side')
      await f.put('tracked.txt', 'side')
      await f.git('add', '--', 'tracked.txt')
      await f.git('commit', '--quiet', '-m', 'unreachable side')
      await f.git('switch', '--detach', base)
      expect(await f.service.getBranches(f.project.id)).toEqual({ state: 'DETACHED', currentBranch: null, branches: ['main', 'side'] })
      expect((await f.service.getHistory(f.project.id)).map((item) => item.id)).toEqual([base])
      await expect(f.service.switchBranch(f.project.id, base)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      await expect(f.service.switchBranch(f.project.id, 'missing')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect((await f.service.switchBranch(f.project.id, 'main')).applied).toBe(true)
    })
  })

  it('switches a clean worktree to an existing branch with different tracked content', async () => {
    await fixture(async (f) => {
      await f.git('switch', '-c', 'side')
      await f.put('tracked.txt', 'side contents')
      await f.git('add', '--', 'tracked.txt')
      await f.git('commit', '--quiet', '-m', 'side')
      const sideHead = await f.git('rev-parse', 'HEAD')
      await f.git('switch', 'main')
      expect((await f.service.switchBranch(f.project.id, 'side')).applied).toBe(true)
      expect(await f.git('rev-parse', 'HEAD')).toBe(sideHead)
      expect(await f.read('tracked.txt')).toBe('side contents')
      expect(await f.git('diff', '--cached', '--name-only')).toBe('')
    })
  })

  it('refuses to finish a real pending merge and preserves its index and merge metadata', async () => {
    await fixture(async (f) => {
      await f.git('switch', '-c', 'side')
      await f.put('tracked.txt', 'merge content')
      await f.git('add', '--', 'tracked.txt')
      await f.git('commit', '--quiet', '-m', 'side')
      await f.git('switch', 'main')
      await f.git('merge', '--no-ff', '--no-commit', 'side')
      const mergeHead = await f.read('.git/MERGE_HEAD')
      const index = await f.index()
      const head = await f.git('rev-parse', 'HEAD')
      await expect(f.service.commit(f.project.id, 'do not complete merge')).rejects.toMatchObject({ details: { reason: 'operation-in-progress' } })
      expect(await f.read('.git/MERGE_HEAD')).toBe(mergeHead)
      expect(await f.index()).toBe(index)
      expect(await f.git('rev-parse', 'HEAD')).toBe(head)
      expect(await f.read('tracked.txt')).toBe('merge content')
      expect(f.calls.some((args) => args[0] === 'commit')).toBe(false)
    })
  })

  it('returns default 50 and maximum 100 from 101 real commits without including bodies', async () => {
    await fixture(async (f) => {
      // One fixture-only import builds real commit objects without 101 subprocesses.
      let input = ''
      for (let i = 1; i <= 101; i++) {
        const message = `Lịch sử ${i}\n\nbody\nwith lines\n`
        input += `commit refs/heads/main\nmark :${i}\nauthor Test <test@example.invalid> ${1700000000 + i} +0700\ncommitter Test <test@example.invalid> ${1700000000 + i} +0700\ndata ${Buffer.byteLength(message)}\n${message}${i > 1 ? `from :${i - 1}\n` : ''}\n`
      }
      await new Promise<void>((resolveImport, reject) => {
        const child = execFile(f.executable, ['fast-import', '--quiet'], { cwd: f.directory, shell: false, windowsHide: true }, (error) => error ? reject(error) : resolveImport())
        child.stdin!.end(input, 'utf8')
      })
      expect((await f.service.getHistory(f.project.id))).toHaveLength(50)
      const history = await f.service.getHistory(f.project.id, 100)
      expect(history).toHaveLength(100)
      expect(history[0].subject).toBe('Lịch sử 101')
      expect(history[99].subject).toBe('Lịch sử 2')
      expect(history[0].authoredAt).toMatch(/\+07:00$/)
      expect(await f.service.getHistory(f.project.id, 1)).toEqual([history[0]])
      f.calls.length = 0
      await expect(f.service.getHistory(f.project.id, 101)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect(f.calls).toHaveLength(0)
    }, false)
  })

  it('fails safely at the existing runner byte bound even for one oversized history item', async () => {
    await fixture(async (f) => {
      const subject = 'x'.repeat(1024 * 1024 + 1)
      const input = `commit refs/heads/main\nauthor Test <test@example.invalid> 1700000000 +0000\ncommitter Test <test@example.invalid> 1700000000 +0000\ndata ${subject.length}\n${subject}\n\n`
      await new Promise<void>((resolveImport, reject) => {
        const child = execFile(f.executable, ['fast-import', '--quiet'], { cwd: f.directory, shell: false, windowsHide: true }, (error) => error ? reject(error) : resolveImport())
        child.stdin!.end(input, 'utf8')
      })
      await expect(f.service.getHistory(f.project.id, 1)).rejects.toMatchObject({
        code: 'PROCESS_FAILED', details: { reason: 'output-limit' },
      })
    }, false)
  })

  it('rejects all 5C operations for nested parent-repo authority and stale project IDs', async () => {
    await fixture(async (f) => {
      await mkdir(join(f.directory, 'nested'))
      const nested = await f.projects.openRoot(join(f.directory, 'nested'))
      for (const id of [f.project.id, nested.id]) {
        for (const operation of [() => f.service.commit(id, 'no'), () => f.service.getBranches(id),
          () => f.service.switchBranch(id, 'main'), () => f.service.getHistory(id)]) {
          await expect(operation()).rejects.toBeDefined()
        }
      }
      expect(f.calls.some((args) => args[0] === 'commit' || args[0] === 'switch')).toBe(false)
    })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { GitOperationLifecycle } from '../../src/main/services/git/git-operation-lifecycle'
import { ProjectService } from '../../src/main/services/project/project-service'
import { GitService } from '../../src/main/services/git/git-service'
import type { GitCommandOptions } from '../../src/main/services/git/git-command-runner'
import type { ProjectFileSystemStatus, ProjectId } from '../../src/shared/contracts'
import { DomainError } from '../../src/main/errors/app-error'
import { GitCleanupFailure } from '../../src/main/services/git/git-owned-command-runner'
import { DesktopApplication } from '../../src/main/app/desktop-application'

function barrier<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function fixture() {
  const projects = new ProjectService({ realpath: async (path) => path,
    stat: async () => ({ isDirectory: () => true }), mkdir: async () => {}, rmdir: async () => {} }, 'win32')
  const project = await projects.openRoot('C:\\a')
  let state: 'AVAILABLE' | 'UNAVAILABLE' = 'AVAILABLE'
  const listeners = new Set<(status: ProjectFileSystemStatus) => void>()
  const files = { getStatus: (projectId: ProjectId) => ({ projectId, state }),
    subscribeStatus: (fn: (status: ProjectFileSystemStatus) => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } }
  const oid = 'a'.repeat(40)
  const runner = {
    execute: vi.fn(async (_exe: string, args: readonly string[], cwd: string, options?: GitCommandOptions) => {
      expect(cwd).toBe('C:\\a'); expect(options?.signal?.aborted).not.toBe(true)
      return {
      exitCode: 0, stderr: '', stdout: args.includes('--show-toplevel') ? 'C:\\a\n'
        : args.includes('--absolute-git-dir') ? 'C:\\a\\.git\n'
          : args[0] === 'symbolic-ref' ? 'refs/heads/main\n'
            : args[0] === 'for-each-ref' ? `refs/heads/main\0${oid}\0commit\0\n`
              : `${oid}\n`,
    } }),
    stream: vi.fn(async (_exe: string, _args: readonly string[], _cwd: string,
      consume: (chunk: Uint8Array) => boolean, options?: GitCommandOptions) => {
      expect(options?.signal?.aborted).not.toBe(true)
      consume(Buffer.from(`# branch.oid ${oid}\0# branch.head main\0`))
      return { exitCode: 0, stoppedEarly: false }
    }),
    stop: vi.fn(async () => {}),
  }
  const lifecycle = new GitOperationLifecycle(projects, files, runner)
  const transitionStarted = barrier()
  const registerGuard = projects.registerTransitionGuard.bind(projects)
  vi.spyOn(projects, 'registerTransitionGuard').mockImplementation((guard) => registerGuard((transition) => {
    const result = guard(transition)
    transitionStarted.resolve()
    return result
  }))
  lifecycle.start()
  let sequence = 0
  const identity = () => ({ requestId: `request_${++sequence}`, projectId: project.id,
    generation: lifecycle.getContext(project.id, 1) })
  const git = new GitService(projects, files, { detect: async () => ({ state: 'AVAILABLE', git: { executable: 'C:\\Git\\git.exe' } }) },
    lifecycle.commands, { realpath: async (path) => path }, 'win32',
    { realpath: async (path) => path, lstat: async () => ({ isDirectory: () => false }) },
    { lstat: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) } })
  return { projects, project, runner, lifecycle, identity, git, transitionStarted,
    unavailable: () => { state = 'UNAVAILABLE'; for (const fn of listeners) fn({ projectId: project.id, state }) } }
}

describe('Phase 5D operation ownership and deterministic races', () => {
  it('application shutdown waits for mutation completion and retries failed Git cleanup before stopping dependencies', async () => {
    const f = await fixture(), entered = barrier(), release = barrier()
    const dependencyStop = vi.fn(async () => {})
    // fixture already starts the lifecycle; only its managed stop is composed here.
    const application = new DesktopApplication([
      { name: 'dependency', stop: dependencyStop },
      { name: f.lifecycle.name, stop: () => f.lifecycle.stop() },
    ])
    application.subscribe((status) => { if (status.state === 'STOPPING') f.lifecycle.beginShutdown() })
    await application.start()
    const original = f.runner.execute.getMockImplementation()!
    f.runner.execute.mockImplementation(async (exe, args, cwd, options) => {
      if (args[0] === 'commit') { entered.resolve(); await release.promise }
      return original(exe, args, cwd, options)
    })
    const mutation = f.lifecycle.run(f.identity(), 1, 'commit', true, () => f.git.commit(f.project.id, 'message'))
    await entered.promise
    f.runner.stop.mockRejectedValueOnce(new GitCleanupFailure())
    const shutdown = application.shutdown().catch((error: unknown) => error)
    expect(application.getStatus().state).toBe('STOPPING')
    expect(dependencyStop).not.toHaveBeenCalled()
    expect(() => f.identity()).toThrow()
    release.resolve()
    expect(await mutation).toEqual({ applied: true, status: null, refreshRequired: true })
    expect(await shutdown).toBeInstanceOf(AggregateError)
    expect(dependencyStop).not.toHaveBeenCalled()
    await application.shutdown()
    expect(application.getStatus().state).toBe('STOPPED')
    expect(dependencyStop).toHaveBeenCalledOnce()
  })

  it.each(['getState', 'getStatus', 'getBranches', 'getHistory'])('latest %s wins even if the old runner ignores abort', async (api) => {
    const f = await fixture(), entered = barrier(), release = barrier()
    let signal: AbortSignal | undefined
    f.runner.execute.mockImplementationOnce(async (_e, _a, _c, options) => {
      signal = options?.signal; entered.resolve(); await release.promise
      return { exitCode: 0, stdout: 'old', stderr: '' }
    })
    const work = () => f.lifecycle.commands.execute('C:\\Git\\git.exe', ['read'], 'C:\\a')
    const old = f.lifecycle.run(f.identity(), 1, api, false, work).catch((error: unknown) => error)
    await entered.promise
    const fresh = await f.lifecycle.run(f.identity(), 1, api, false, work)
    expect(fresh.stdout).not.toBe('old')
    expect(signal?.aborted).toBe(true)
    release.resolve()
    expect(await old).toMatchObject({ details: { reason: 'stale-request' }, retryable: false })
    await f.lifecycle.stop()
  })

  it.each(['close', 'switch'] as const)('%s invalidates reads and waits for command cleanup', async (action) => {
    const f = await fixture(), entered = barrier(), release = barrier(), aborted = barrier()
    f.runner.execute.mockImplementationOnce(async (_e, _a, _c, options) => {
      options?.signal?.addEventListener('abort', () => aborted.resolve(), { once: true })
      entered.resolve(); await release.promise
      return { exitCode: 0, stdout: 'old', stderr: '' }
    })
    const identity = f.identity()
    const read = f.lifecycle.run(identity, 1, 'status', false,
      () => f.lifecycle.commands.execute('C:\\Git\\git.exe', ['read'], 'C:\\a')).catch((error: unknown) => error)
    await entered.promise
    const transition = action === 'close' ? f.projects.closeProject() : f.projects.openRoot('C:\\b')
    await aborted.promise
    expect(f.projects.getActiveProject()?.id).toBe(f.project.id)
    release.resolve(); await transition
    expect(await read).toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(f.projects.getActiveProject()?.id).not.toBe(f.project.id)
    await expect(f.lifecycle.run(identity, 1, 'status', false, async () => 'old')).rejects.toBeInstanceOf(DomainError)
    await f.lifecycle.stop()
  })

  it.each(['stage', 'unstage', 'commit', 'switchBranch'] as const)('drains dispatched %s during both project transitions and permits internal refresh', async (api) => {
    for (const transition of ['close', 'switch'] as const) {
      const f = await fixture(), dispatched = barrier(), release = barrier()
      const original = f.runner.execute.getMockImplementation()!
      const isMutation = (args: readonly string[]) => ['commit', 'switch', 'add', 'restore'].some((arg) => args.includes(arg))
      if (api === 'stage' || api === 'unstage') f.runner.stream.mockImplementationOnce(async (_e, _a, _c, consume) => {
        const oid = 'a'.repeat(40)
        consume(Buffer.from(`# branch.oid ${oid}\0# branch.head main\0` +
          `1 MM N... 100644 100644 100644 ${oid} ${oid} main\0`))
        return { exitCode: 0, stoppedEarly: false }
      })
      f.runner.execute.mockImplementation(async (exe, args, cwd, options) => {
        if (isMutation(args)) {
          expect(options?.signal).toBeUndefined()
          dispatched.resolve(); await release.promise
        }
        return original(exe, args, cwd, options)
      })
      const mutation = f.lifecycle.run(f.identity(), 1, api, true,
        () => f.git[api](f.project.id, 'main'))
      await dispatched.promise
      const duplicate = { requestId: 'duplicate', projectId: f.project.id, generation: f.identity().generation }
      await expect(f.lifecycle.run(duplicate, 1, 'stage', true, async () => null)).rejects.toMatchObject({ details: { reason: 'busy' } })
      await expect(f.lifecycle.run(duplicate, 1, 'getStatus', false, async () => null)).rejects.toMatchObject({ details: { reason: 'busy' } })
      const changing = transition === 'close' ? f.projects.closeProject() : f.projects.openRoot('C:\\b')
      await f.transitionStarted.promise
      expect(f.projects.getActiveProject()?.id).toBe(f.project.id)
      release.resolve()
      expect(await mutation).toEqual({ applied: true, status: null, refreshRequired: true })
      await changing
      expect(f.runner.stream).toHaveBeenCalledTimes(api === 'stage' || api === 'unstage' ? 2 : 1)
      expect(f.runner.execute.mock.calls.filter(([, args]) => isMutation(args))).toHaveLength(1)
      await f.lifecycle.stop()
    }
  })

  it('invalidates an old read at mutation start and allows its own status refresh', async () => {
    const f = await fixture(), entered = barrier(), release = barrier()
    f.runner.execute.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return { exitCode: 0, stdout: 'old', stderr: '' } })
    const old = f.lifecycle.run(f.identity(), 1, 'status', false,
      () => f.lifecycle.commands.execute('C:\\Git\\git.exe', ['read'], 'C:\\a')).catch((error: unknown) => error)
    await entered.promise
    const outcome = await f.lifecycle.run(f.identity(), 1, 'commit', true, () => f.git.commit(f.project.id, 'message'))
    expect(outcome).toEqual({ applied: true, status: { entries: [], didHitLimit: false }, refreshRequired: false })
    release.resolve()
    expect(await old).toMatchObject({ code: 'PROCESS_CANCELLED' })
    await f.lifecycle.stop()
  })

  it('rejects a stale generation when the same project is reopened', async () => {
    const f = await fixture(), identity = f.identity()
    await f.projects.openRoot('C:\\a')
    expect(f.projects.getActiveProject()?.id).toBe(identity.projectId)
    await expect(f.lifecycle.run(identity, 1, 'status', false, async () => null)).rejects.toMatchObject({ details: { reason: 'stale-generation' } })
    await f.lifecycle.stop()
  })

  it('cleanup failure prevents project transition and retains authority', async () => {
    const f = await fixture()
    f.runner.stop.mockRejectedValue(new Error('cleanup not proven'))
    await expect(f.projects.closeProject()).rejects.toThrow('cleanup not proven')
    expect(f.projects.getActiveProject()?.id).toBe(f.project.id)
    f.runner.stop.mockResolvedValue()
    await f.lifecycle.stop()
  })

  it('renderer reload rejects the previous owner token without preventing a new context', async () => {
    const f = await fixture(), old = f.identity()
    f.lifecycle.loseOwner(1)
    f.lifecycle.restoreOwner(1)
    const fresh = f.identity()
    expect(fresh.generation).not.toBe(old.generation)
    await expect(f.lifecycle.run(old, 1, 'status', false, async () => null)).rejects.toMatchObject({ details: { reason: 'stale-generation' } })
    expect(await f.lifecycle.run(fresh, 1, 'status', false, async () => 'fresh')).toBe('fresh')
    await f.lifecycle.stop()
  })

  it('confirmed applied survives failed cleanup, which blocks transition until cleanup can be proven', async () => {
    const f = await fixture()
    const original = f.runner.execute.getMockImplementation()!
    f.runner.execute.mockImplementation(async (exe, args, cwd, options) => {
      if (args[0] === 'commit') throw new GitCleanupFailure({ exitCode: 0, stdout: '', stderr: '' })
      return original(exe, args, cwd, options)
    })
    expect(await f.lifecycle.run(f.identity(), 1, 'commit', true, () => f.git.commit(f.project.id, 'message')))
      .toEqual({ applied: true, status: null, refreshRequired: true })
    expect(() => f.identity()).toThrow()
    f.runner.stop.mockRejectedValue(new GitCleanupFailure())
    await expect(f.projects.closeProject()).rejects.toBeInstanceOf(GitCleanupFailure)
    expect(f.projects.getActiveProject()?.id).toBe(f.project.id)
    f.runner.stop.mockResolvedValue()
    await f.lifecycle.stop()
  })

  it('owner loss cancels mutation preparation before dispatch without inventing an unknown mutation', async () => {
    const f = await fixture(), entered = barrier(), release = barrier()
    const original = f.runner.execute.getMockImplementation()!
    f.runner.execute.mockImplementationOnce(async (exe, args, cwd, options) => {
      entered.resolve(); await release.promise
      return original(exe, args, cwd, options)
    })
    const pending = f.lifecycle.run(f.identity(), 1, 'commit', true,
      () => f.git.commit(f.project.id, 'message')).catch((error: unknown) => error)
    await entered.promise
    f.lifecycle.loseOwner(1); release.resolve()
    expect(await pending).toMatchObject({ code: 'PROCESS_CANCELLED', details: { reason: 'stale-request' } })
    expect(f.runner.execute.mock.calls.some(([, args]) => args[0] === 'commit')).toBe(false)
    await f.lifecycle.stop()
  })

  it.each(['owner', 'root', 'shutdown'] as const)('%s loss drains mutation and preserves unknown outcome without retry', async (loss) => {
    const f = await fixture(), entered = barrier(), release = barrier()
    const original = f.runner.execute.getMockImplementation()!
    f.runner.execute.mockImplementation(async (exe, args, cwd, options) => {
      if (args[0] === 'commit') {
        entered.resolve(); await release.promise
        throw new DomainError({ code: 'PROCESS_CANCELLED', message: 'timeout', retryable: false })
      }
      return original(exe, args, cwd, options)
    })
    const pending = f.lifecycle.run(f.identity(), 1, 'commit', true,
      () => f.git.commit(f.project.id, 'message')).catch((error: unknown) => error)
    await entered.promise
    if (loss === 'owner') f.lifecycle.loseOwner(1)
    else if (loss === 'root') f.unavailable()
    else f.lifecycle.beginShutdown()
    release.resolve()
    expect(await pending).toMatchObject({ details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false })
    expect(f.runner.execute.mock.calls.filter(([, args]) => args[0] === 'commit')).toHaveLength(1)
    await f.lifecycle.stop()
  })
})

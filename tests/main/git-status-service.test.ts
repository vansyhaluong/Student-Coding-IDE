import { describe, expect, it, vi } from 'vitest'
import { GitService } from '../../src/main/services/git/git-service'
import { authorizeGitPath } from '../../src/main/services/git/git-path-authority'
import { normalizePathIdentity } from '../../src/main/services/project/project-identity'
import { DomainError } from '../../src/main/errors/app-error'
import { createGitBridge } from '../../src/preload/bridge/git'
import { GitIpcService } from '../../src/main/ipc/git-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { GIT_CHANNELS, type ProjectId } from '../../src/shared/contracts'

const id = 'project_1234567890abcdef12345678' as ProjectId
const root = 'C:\\project'
const executable = 'C:\\Git\\git.exe'
const oid = '1'.repeat(40)
const header = `# branch.oid ${oid}\0# branch.head main\0`
const modified = `1 MM N... 100644 100644 100644 ${oid} ${oid} file.txt\0`
const conflict = `u UU N... 100644 100644 100644 100644 ${oid} ${oid} ${oid} file.txt\0`
const denied = () => new DomainError({ code: 'PERMISSION_DENIED', message: 'Project changed.', retryable: false })
function setup(body = modified) {
  let active = true
  const project = { id, name: 'project', canonicalRoot: root, pathIdentity: normalizePathIdentity(root, 'win32') }
  const projects = { getAuthorizedProject: vi.fn(() => { if (!active) throw denied(); return project }) }
  const roots = { realpath: vi.fn(async (path: string) => path) }
  const detector = { detect: vi.fn(async () => ({ state: 'AVAILABLE' as const, git: { executable } })) }
  const commands = {
    execute: vi.fn(async (_exe: string, args: readonly string[], cwd: string) => {
      expect(cwd).toBe(root)
      return {
      exitCode: 0, stdout: args.includes('rev-parse') ? root + '\n' : '', stderr: '',
      }
    }),
    stream: vi.fn(async (_exe: string, _args: readonly string[], _cwd: string, consume: (bytes: Uint8Array) => boolean) => {
      consume(Buffer.from(header + body))
      return { exitCode: 0, stoppedEarly: false }
    }),
  }
  const files = { realpath: roots.realpath, lstat: vi.fn(async () => ({ isDirectory: (): boolean => false })) }
  const service = new GitService(projects, { getStatus: () => ({ projectId: id, state: 'AVAILABLE' }) },
    detector, commands, roots, 'win32', files)
  return { service, commands, roots, project, files, changeProject: () => { active = false } }
}

describe('Phase 5B status and mutation service', () => {
  it('uses fixed status args and returns independent slots', async () => {
    const { service, commands } = setup()
    expect((await service.getStatus(id)).entries[0]).toMatchObject({ staged: { kind: 'MODIFIED' }, unstaged: { kind: 'MODIFIED' } })
    expect(commands.stream).toHaveBeenCalledWith(executable,
      ['-c', 'status.renames=copies', 'status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'],
      root, expect.any(Function), {})
  })

  it.each(['stage', 'unstage'] as const)('%s returns fresh status on success', async (action) => {
    const { service, commands } = setup()
    commands.stream.mockImplementationOnce(async (_e, _a, _c, consume) => {
      consume(Buffer.from(header + modified)); return { exitCode: 0, stoppedEarly: false }
    }).mockImplementationOnce(async (_e, _a, _c, consume) => {
      consume(Buffer.from(header)); return { exitCode: 0, stoppedEarly: false }
    })
    expect(await service[action](id, 'file.txt')).toEqual({ applied: true, status: { entries: [], didHitLimit: false }, refreshRequired: false })
    expect(commands.execute).toHaveBeenCalledWith(executable,
      ['--literal-pathspecs', ...(action === 'stage' ? ['add'] : ['restore', '--staged']), '--', 'file.txt'], root)
  })

  it.each(['stage', 'unstage'] as const)('%s retains applied=true if refresh fails', async (action) => {
    const { service, commands } = setup()
    commands.stream.mockImplementationOnce(async (_e, _a, _c, consume) => {
      consume(Buffer.from(header + modified)); return { exitCode: 0, stoppedEarly: false }
    }).mockRejectedValueOnce(new Error('private stderr'))
    expect(await service[action](id, 'file.txt')).toEqual({ applied: true, status: null, refreshRequired: true })
  })

  it('preserves mutation outcome when project changes after mutation', async () => {
    const state = setup()
    state.commands.execute.mockImplementation(async (_e, args) => {
      if (args.includes('add')) state.changeProject()
      return { exitCode: 0, stdout: root + '\n', stderr: '' }
    })
    expect(await state.service.stage(id, 'file.txt')).toEqual({ applied: true, status: null, refreshRequired: true })
  })

  it('does not claim applied for non-zero command exit', async () => {
    const { service, commands } = setup()
    commands.execute.mockImplementation(async (_e, args) => ({ exitCode: args.includes('add') ? 1 : 0, stdout: root + '\n', stderr: 'private' }))
    await expect(service.stage(id, 'file.txt')).rejects.toMatchObject({ code: 'PROCESS_FAILED', operation: 'git:stage' })
  })

  it('reprobes after timeout and explicitly preserves unknown outcome', async () => {
    const { service, commands } = setup()
    commands.execute.mockImplementation(async (_e, args) => {
      if (args.includes('add')) throw new DomainError({ code: 'PROCESS_CANCELLED', message: 'Timed out', retryable: true })
      return { exitCode: 0, stdout: root + '\n', stderr: '' }
    })
    await expect(service.stage(id, 'file.txt')).rejects.toMatchObject({
      code: 'PROCESS_FAILED', details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false,
    })
    expect(commands.stream).toHaveBeenCalledTimes(2)
  })

  it.each(['stage', 'unstage'] as const)('rejects conflict %s before mutation', async (action) => {
    const { service, commands } = setup(conflict)
    await expect(service[action](id, 'file.txt')).rejects.toMatchObject({ details: { reason: 'conflicted-read-only' } })
    expect(commands.execute.mock.calls.every(([, args]) => args.includes('rev-parse'))).toBe(true)
  })

  it.each(['../x', 'C:foo', '.', '/file.txt'])('rejects malicious path %s before Git dispatch', async (path) => {
    const { service, commands } = setup()
    await expect(service.stage(id, path)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(commands.execute).not.toHaveBeenCalled()
  })

  it('does not resolve or mutate a stale pattern path', async () => {
    const { service, commands, files } = setup('? a.txt\0')
    await expect(service.stage(id, '[abc].txt')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(files.lstat).not.toHaveBeenCalled()
    expect(commands.execute.mock.calls.every(([, args]) => args.includes('rev-parse'))).toBe(true)
  })

  it('requires fresh repository equality and unchanged project root after reading', async () => {
    const { service, commands } = setup()
    commands.execute.mockResolvedValue({ exitCode: 0, stdout: 'C:\\parent\n', stderr: '' })
    await expect(service.getStatus(id)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    expect(commands.stream).not.toHaveBeenCalled()
  })

  it('rejects canonical escapes and directory pathspec expansion, permits missing deleted paths', async () => {
    const { project, files } = setup()
    files.realpath.mockResolvedValue('C:\\outside')
    await expect(authorizeGitPath(project, 'link/file.txt', 'win32', files)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    files.realpath.mockImplementation(async (path) => path)
    files.lstat.mockResolvedValue({ isDirectory: () => true })
    await expect(authorizeGitPath(project, 'directory', 'win32', files)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    files.lstat.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    await expect(authorizeGitPath(project, 'deleted.txt', 'win32', files)).resolves.toBeUndefined()
  })

  it('rejects a directory link even when its target remains inside the project', async () => {
    const { project, files } = setup()
    files.realpath.mockResolvedValue('C:\\project\\directory')
    files.lstat.mockResolvedValueOnce({ isDirectory: () => false })
      .mockResolvedValueOnce({ isDirectory: () => true })
    await expect(authorizeGitPath(project, 'link', 'win32', files))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('Phase 5B IPC and Preload', () => {
  it('exact-validates all new capabilities and response envelopes', async () => {
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const ipc: IpcMainLike = { handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: (channel) => { handlers.delete(channel) } }
    const status = { entries: [], didHitLimit: false }
    const outcome = { applied: true as const, status, refreshRequired: false as const }
    const git = { getState: vi.fn(), getStatus: vi.fn(async () => status), stage: vi.fn(async () => outcome), unstage: vi.fn(async () => outcome),
      commit: vi.fn(), getBranches: vi.fn(), switchBranch: vi.fn(), getHistory: vi.fn() }
    const service = new GitIpcService(new IpcHandlerRegistry(ipc), git)
    service.start()
    const invoke = vi.fn(async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id: 1 } }, payload))
    const bridge = createGitBridge({ invoke, on: vi.fn(), removeListener: vi.fn() })
    expect(await bridge.getStatus(id)).toEqual({ ok: true, value: status })
    for (const action of ['stage', 'unstage'] as const) {
      expect(await bridge[action](id, '-file.txt')).toEqual({ ok: true, value: outcome })
      for (const key of ['cwd', 'args', 'shell', 'command', 'executable', 'previousPath', 'xy']) {
        expect(await invoke(GIT_CHANNELS[action], { projectId: id, path: 'file.txt', [key]: 'injected' }))
          .toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      }
      expect(git[action]).toHaveBeenCalledTimes(1)
    }
    invoke.mockResolvedValueOnce({ ok: true, value: { ...outcome, applied: false } })
    expect(await bridge.stage(id, 'file.txt')).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    invoke.mockResolvedValueOnce({ ok: true, value: { ...status, branch: 'private' } })
    expect(await bridge.getStatus(id)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    service.stop()
    expect(handlers.size).toBe(0)
  })
})

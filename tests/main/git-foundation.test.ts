import { ChildProcess, type ExecFileException } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { GitIpcService } from '../../src/main/ipc/git-ipc-service'
import {
  IpcHandlerRegistry,
  type IpcMainLike,
} from '../../src/main/ipc/ipc-handler-registry'
import {
  GitExecutableDetector,
  type GitExecutableAccess,
} from '../../src/main/services/dependencies/git-executable'
import {
  GitCommandRunner,
  type GitExecFile,
} from '../../src/main/services/git/git-command-runner'
import { GitService } from '../../src/main/services/git/git-service'
import { normalizePathIdentity } from '../../src/main/services/project/project-identity'
import { DomainError } from '../../src/main/errors/app-error'
import { createGitBridge } from '../../src/preload/bridge/git'
import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import {
  GIT_CHANNELS,
  GIT_DEPENDENCY_STATES,
  GIT_REPOSITORY_STATES,
  validateGetGitStateRequest,
  validateGitState,
  type GitState,
  type ProjectId,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const canonicalRoot = 'C:\\Student Repo'
const availableGit = {
  state: 'AVAILABLE' as const,
  git: { executable: 'C:\\Program Files\\Git\\cmd\\git.exe' },
}

describe('Phase 5A Git contracts', () => {
  it('retains all dependency states and the two repository states', () => {
    expect(GIT_DEPENDENCY_STATES).toEqual([
      'NOT_CONFIGURED',
      'MISSING',
      'AVAILABLE',
      'INVALID_CONFIGURATION',
    ])
    expect(GIT_REPOSITORY_STATES).toEqual(['REPOSITORY', 'NOT_REPOSITORY'])
  })

  it('exact-validates the project-only request', () => {
    expect(validateGetGitStateRequest({ projectId }).ok).toBe(true)
    for (const value of [
      null,
      {},
      { projectId: 'wrong' },
      { projectId, cwd: canonicalRoot },
      { projectId, executable: 'git.exe' },
      { projectId, args: ['status'] },
      { projectId, command: 'git status' },
      { projectId, shell: true },
    ]) {
      expect(validateGetGitStateRequest(value).ok).toBe(false)
    }
  })

  it('validates only coherent exact state responses', () => {
    for (const repository of GIT_REPOSITORY_STATES) {
      expect(validateGitState({ dependency: 'AVAILABLE', repository }).ok).toBe(true)
    }
    for (const dependency of ['NOT_CONFIGURED', 'MISSING', 'INVALID_CONFIGURATION']) {
      expect(validateGitState({ dependency, repository: null }).ok).toBe(true)
    }
    for (const value of [
      { dependency: 'AVAILABLE', repository: null },
      { dependency: 'MISSING', repository: 'NOT_REPOSITORY' },
      { dependency: 'AVAILABLE', repository: 'UNKNOWN' },
      { dependency: 'AVAILABLE', repository: 'REPOSITORY', cwd: canonicalRoot },
    ]) {
      expect(validateGitState(value).ok).toBe(false)
    }
  })
})

describe('Phase 5A Main-owned Git PATH detection', () => {
  it('finds validated git.exe in order through quoted, spaced, and Unicode paths', async () => {
    const resolveFile = vi.fn(async (path: string) => (
      path.includes('Công cụ Git') ? path : null
    ))
    const detector = new GitExecutableDetector({
      Path: 'C:\\missing;"C:\\Program Files\\Công cụ Git";C:\\later',
    }, { resolveFile })

    await expect(detector.detect()).resolves.toEqual({
      state: 'AVAILABLE',
      git: { executable: 'C:\\Program Files\\Công cụ Git\\git.exe' },
    })
    expect(resolveFile.mock.calls.map(([path]) => path)).toEqual([
      'C:\\missing\\git.exe',
      'C:\\Program Files\\Công cụ Git\\git.exe',
    ])
  })

  it('ignores empty, relative, current-drive, and PATHEXT entries without cwd search', async () => {
    const resolveFile = vi.fn(async () => null)
    const detector = new GitExecutableDetector({
      PATH: ';.;relative;C:relative;\\tools;/tools',
      PATHEXT: '.CMD;.BAT;.EXE',
    }, { resolveFile })

    await expect(detector.detect()).resolves.toEqual({ state: 'MISSING' })
    expect(resolveFile).not.toHaveBeenCalled()
  })

  it('does not grant authority to invalid resolved candidates', async () => {
    const candidates = ['relative.exe', '\\tools\\git.exe', 'C:\\tools\\cmd.exe', 'C:\\tools\\git.exe\0']
    for (const candidate of candidates) {
      const detector = new GitExecutableDetector(
        { PATH: 'C:\\tools' },
        { resolveFile: async () => candidate },
      )
      await expect(detector.detect()).resolves.toEqual({ state: 'MISSING' })
    }
  })

  it('continues after an unusable candidate and accepts a later valid executable', async () => {
    const files: GitExecutableAccess = {
      resolveFile: vi.fn(async (path) => (
        path.startsWith('C:\\unsafe') ? 'C:\\Windows\\cmd.exe' : path
      )),
    }
    const detector = new GitExecutableDetector(
      { PATH: 'C:\\unsafe;C:\\valid' },
      files,
    )
    await expect(detector.detect()).resolves.toEqual({
      state: 'AVAILABLE',
      git: { executable: 'C:\\valid\\git.exe' },
    })
  })

  it('supports a fully qualified UNC directory', async () => {
    const detector = new GitExecutableDetector(
      { PATH: '\\\\server\\tools' },
      { resolveFile: async (path) => path },
    )
    await expect(detector.detect()).resolves.toEqual({
      state: 'AVAILABLE',
      git: { executable: '\\\\server\\tools\\git.exe' },
    })
  })

  it('does not convert operational filesystem failures into dependency states', async () => {
    const failure = Object.assign(new Error('private denied path'), { code: 'EACCES' })
    const detector = new GitExecutableDetector(
      { PATH: 'C:\\tools' },
      { resolveFile: async () => { throw failure } },
    )
    await expect(detector.detect()).rejects.toBe(failure)
  })
})

describe('Phase 5A finite GitCommandRunner', () => {
  it.each(['close-first', 'callback-first'])(
    'settles once after close across duplicate callbacks: %s',
    async (order) => {
      const child = new ChildProcess()
      let callback!: Parameters<GitExecFile>[3]
      const runner = new GitCommandRunner((_executable, _args, _options, done) => {
        callback = done
        return child
      })
      const settled = vi.fn()
      const operation = runner.execute(availableGit.git.executable, ['--version'], canonicalRoot)
        .then(settled)
      if (order === 'close-first') child.emit('close', 0, null)
      callback(null, 'expected', '')
      callback(execError({ code: 1 }), 'duplicate', 'unexpected')
      if (order === 'callback-first') {
        await Promise.resolve()
        expect(settled).not.toHaveBeenCalled()
        child.emit('close', 0, null)
      }
      await operation
      expect(settled).toHaveBeenCalledExactlyOnceWith({ exitCode: 0, stdout: 'expected', stderr: '' })
      expect(child.listenerCount('close')).toBe(0)
    },
  )

  it('keeps executable and args separate, disables shell, and bounds execution', async () => {
    const executeFile = vi.fn<GitExecFile>((_executable, _args, _options, callback) => {
      callback(null, 'C:/Student Repo\n', '')
    })
    const runner = new GitCommandRunner(executeFile, 4096)
    await expect(runner.execute(
      availableGit.git.executable,
      ['rev-parse', '--show-toplevel'],
      canonicalRoot,
      { timeoutMs: 2500 },
    )).resolves.toEqual({ exitCode: 0, stdout: 'C:/Student Repo\n', stderr: '' })

    expect(executeFile).toHaveBeenCalledWith(
      availableGit.git.executable,
      ['rev-parse', '--show-toplevel'],
      expect.objectContaining({
        cwd: canonicalRoot,
        env: expect.objectContaining({ LANG: 'C', LC_ALL: 'C' }),
        maxBuffer: 4096,
        shell: false,
        timeout: 2500,
        windowsHide: true,
      }),
      expect.any(Function),
    )
  })

  it('preserves non-zero exit output for semantic interpretation', async () => {
    const executeFile: GitExecFile = (_executable, _args, _options, callback) => {
      callback(execError({ code: 128 }), '', 'fatal: expected failure')
    }
    await expect(new GitCommandRunner(executeFile).execute(
      availableGit.git.executable,
      ['rev-parse'],
      canonicalRoot,
    )).resolves.toEqual({ exitCode: 128, stdout: '', stderr: 'fatal: expected failure' })
  })

  it('maps timeout, cancellation, output overflow, and spawn failure safely', async () => {
    const cases: Array<[ExecFileException, string, string]> = [
      [execError({ killed: true }), 'PROCESS_CANCELLED', 'timeout'],
      [execError({ name: 'AbortError', code: 'ABORT_ERR' }), 'PROCESS_CANCELLED', 'cancelled'],
      [execError({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }), 'PROCESS_FAILED', 'output-limit'],
      [execError({ code: 'ENOENT' }), 'PROCESS_FAILED', 'Git could not complete'],
    ]
    for (const [error, code, detail] of cases) {
      const executeFile: GitExecFile = (_executable, _args, _options, callback) => {
        callback(error, 'private stdout', 'private stderr')
      }
      await expect(new GitCommandRunner(executeFile).execute(
        availableGit.git.executable,
        ['rev-parse'],
        canonicalRoot,
      )).rejects.toSatisfy((failure: unknown) => (
        typeof failure === 'object' && failure !== null
          && 'code' in failure && failure.code === code
          && (JSON.stringify(failure).includes(detail)
            || failure instanceof Error && failure.message.includes(detail))
      ))
    }
  })

  it('supports cancellation before process creation', async () => {
    const executeFile = vi.fn<GitExecFile>()
    const controller = new AbortController()
    controller.abort()
    await expect(new GitCommandRunner(executeFile).execute(
      availableGit.git.executable,
      ['rev-parse'],
      canonicalRoot,
      { signal: controller.signal },
    )).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(executeFile).not.toHaveBeenCalled()
  })

  it('rejects invalid executable, cwd, arguments, and timeout before spawning', () => {
    const runner = new GitCommandRunner(vi.fn<GitExecFile>())
    for (const call of [
      () => runner.execute('git.exe', ['rev-parse'], canonicalRoot),
      () => runner.execute('C:\\tools\\cmd.exe', ['rev-parse'], canonicalRoot),
      () => runner.execute(availableGit.git.executable, ['rev-parse'], 'relative'),
      () => runner.execute(availableGit.git.executable, ['bad\0arg'], canonicalRoot),
      () => runner.execute(availableGit.git.executable, ['rev-parse'], canonicalRoot, { timeoutMs: 0 }),
    ]) {
      expect(call).toThrowError(/Git/)
    }
  })
})

describe('Phase 5A GitService repository authority', () => {
  function setup(options: {
    dependency?: typeof availableGit | { state: 'MISSING' }
    command?: { exitCode: number; stdout: string; stderr: string }
    status?: 'AVAILABLE' | 'UNAVAILABLE'
    canonicalGitRoot?: string
    projectRoot?: string
    platform?: NodeJS.Platform
  } = {}) {
    const projectRoot = options.projectRoot ?? canonicalRoot
    const platform = options.platform ?? 'win32'
    const project = {
      id: projectId,
      name: 'Student Repo',
      canonicalRoot: projectRoot,
      pathIdentity: normalizePathIdentity(projectRoot, platform),
    }
    const projects = { getAuthorizedProject: vi.fn(() => project) }
    const availability = { getStatus: vi.fn(() => ({
      projectId,
      state: options.status ?? 'AVAILABLE',
    })) }
    const detector = { detect: vi.fn(async () => options.dependency ?? availableGit) }
    const commands = { execute: vi.fn(async () => options.command ?? ({
      exitCode: 0,
      stdout: `${projectRoot.replaceAll('\\', '/')}\r\n`,
      stderr: '',
    })) }
    const roots = { realpath: vi.fn(async () => options.canonicalGitRoot ?? canonicalRoot) }
    return {
      availability,
      commands,
      detector,
      projects,
      roots,
      service: new GitService(projects, availability, detector, commands, roots, platform),
    }
  }

  it('accepts only an exact canonical top-level match', async () => {
    const exact = setup()
    await expect(exact.service.getState(projectId)).resolves.toEqual({
      dependency: 'AVAILABLE',
      repository: 'REPOSITORY',
    })
    expect(exact.commands.execute).toHaveBeenCalledWith(
      availableGit.git.executable,
      ['-c', 'core.quotePath=false', 'rev-parse', '--show-toplevel'],
      canonicalRoot,
    )
    expect(exact.roots.realpath).toHaveBeenCalledWith('C:/Student Repo')

    const differentCase = setup({ canonicalGitRoot: 'c:\\STUDENT REPO' })
    await expect(differentCase.service.getState(projectId)).resolves.toMatchObject({
      repository: 'REPOSITORY',
    })
  })

  it('rejects a containing parent repository as NOT_REPOSITORY', async () => {
    const { service } = setup({ canonicalGitRoot: 'C:\\Parent Repo' })
    await expect(service.getState(projectId)).resolves.toEqual({
      dependency: 'AVAILABLE',
      repository: 'NOT_REPOSITORY',
    })
  })

  it.each([
    '',
    '.',
    '..',
    'repo',
    'foo/bar',
    'C:relative',
    '\\repo',
    '/repo',
    'C::\\repo',
    'C:\\repo:extra',
    'C:\\\\repo',
    'C:\\repo" unexpected',
    'C:\\repo\\..',
    'C:\\repo\\NUL',
    'C:\\repo ',
    'C:\\repo\ttext',
    '\\\\?\\C:\\repo',
    '\\\\.\\share\\repo',
    '\\\\server\\share:bad\\repo',
    '\\\\server\\..\\repo',
    '\\\\server',
    '\\\\server\\\\repo',
    '\\\\\\server\\share\\repo',
    'C:\\repo\0escape',
    'C:\\one\nC:\\two\n',
    'C:\\repo\runexpected',
  ])('rejects malformed or non-fully-qualified top-level output before realpath: %j', async (stdout) => {
    const { service, roots } = setup({ command: {
      exitCode: 0,
      stdout,
      stderr: '',
    } })

    await expect(service.getState(projectId)).rejects.toMatchObject({
      code: 'PROCESS_FAILED',
      operation: 'git:get-state',
    })
    expect(roots.realpath).not.toHaveBeenCalled()
  })

  it.each(['.', 'C:relative'])('rejects %s when process.cwd() equals the active project root', async (stdout) => {
    const { service, roots } = setup({
      command: { exitCode: 0, stdout: `${stdout}\n`, stderr: '' },
      projectRoot: process.cwd(),
      canonicalGitRoot: process.cwd(),
    })

    await expect(service.getState(projectId)).rejects.toMatchObject({
      code: 'PROCESS_FAILED',
    })
    expect(roots.realpath).not.toHaveBeenCalled()
  })

  it.each([
    'C:\\Student Repo',
    'C:\\Tài liệu\\Dự án Git',
    '\\\\server\\share\\Student Repo',
    '//server/share/Student Repo',
  ])('accepts a valid fully-qualified Windows top-level: %s', async (projectRoot) => {
    const { service, roots } = setup({
      projectRoot,
      canonicalGitRoot: projectRoot,
      command: { exitCode: 0, stdout: `${projectRoot}\r\n`, stderr: '' },
    })

    await expect(service.getState(projectId)).resolves.toEqual({
      dependency: 'AVAILABLE',
      repository: 'REPOSITORY',
    })
    expect(roots.realpath).toHaveBeenCalledWith(projectRoot)
  })

  it('returns a normal NOT_REPOSITORY state for Git non-repository output', async () => {
    const { service, roots } = setup({ command: {
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
    } })
    await expect(service.getState(projectId)).resolves.toEqual({
      dependency: 'AVAILABLE',
      repository: 'NOT_REPOSITORY',
    })
    expect(roots.realpath).not.toHaveBeenCalled()
  })

  it('returns MISSING without attempting a repository command', async () => {
    const { service, commands } = setup({ dependency: { state: 'MISSING' } })
    await expect(service.getState(projectId)).resolves.toEqual({
      dependency: 'MISSING',
      repository: null,
    })
    expect(commands.execute).not.toHaveBeenCalled()
  })

  it('blocks unavailable and stale projects before returning state', async () => {
    const unavailable = setup({ status: 'UNAVAILABLE' })
    await expect(unavailable.service.getState(projectId)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(unavailable.detector.detect).not.toHaveBeenCalled()

    const stale = setup()
    stale.projects.getAuthorizedProject
      .mockReturnValueOnce(stale.projects.getAuthorizedProject())
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('stale project'), { code: 'PERMISSION_DENIED' })
      })
    await expect(stale.service.getState(projectId)).rejects.toThrow('stale project')
  })

  it('rejects a syntactically valid but unauthorized project ID', async () => {
    const wrongProjectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
    const { service, projects, detector } = setup()
    projects.getAuthorizedProject.mockImplementationOnce(() => {
      throw new DomainError({
        code: 'PERMISSION_DENIED',
        message: 'The project is no longer authorized.',
        operation: 'project:authorize',
        retryable: false,
      })
    })
    await expect(service.getState(wrongProjectId)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    })
    expect(detector.detect).not.toHaveBeenCalled()
  })

  it('maps unexpected Git exits and malformed top-level output to safe domain failures', async () => {
    for (const command of [
      { exitCode: 128, stdout: '', stderr: 'fatal: detected dubious ownership' },
      { exitCode: 0, stdout: 'C:/one\nC:/two\n', stderr: '' },
    ]) {
      await expect(setup({ command }).service.getState(projectId))
        .rejects.toMatchObject({ code: 'PROCESS_FAILED', operation: 'git:get-state' })
    }
  })
})

describe('Phase 5A Git IPC and Preload boundary', () => {
  it('validates Main requests before dispatch and safely serializes errors', async () => {
    const ipcMain = new FakeIpcMain()
    const registry = new IpcHandlerRegistry(ipcMain)
    const git = {
      getStatus: vi.fn(), stage: vi.fn(), unstage: vi.fn(),
      getState: vi.fn(async (): Promise<GitState> => ({
        dependency: 'AVAILABLE',
        repository: 'REPOSITORY',
      })),
    }
    const service = new GitIpcService(registry, git)
    service.start()

    for (const field of ['executable', 'cwd', 'args', 'command', 'shell']) {
      await expect(ipcMain.invoke(GIT_CHANNELS.getState, {
        projectId,
        [field]: 'injected',
      })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    expect(git.getState).not.toHaveBeenCalled()
    await expect(ipcMain.invoke(GIT_CHANNELS.getState, { projectId }))
      .resolves.toEqual({
        ok: true,
        value: { dependency: 'AVAILABLE', repository: 'REPOSITORY' },
      })
    expect(git.getState).toHaveBeenCalledWith(projectId)

    git.getState.mockRejectedValueOnce(new Error('private command/path details'))
    const failure = await ipcMain.invoke(GIT_CHANNELS.getState, { projectId })
    expect(failure).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(JSON.stringify(failure)).not.toContain('private command/path details')

    service.stop()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('preserves getState with only the authorized semantic methods and exact validation', async () => {
    const transport: IpcRendererLike = {
      invoke: vi.fn(async () => ({
        ok: true,
        value: { dependency: 'AVAILABLE', repository: 'REPOSITORY' },
      })),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
    const api = createGitBridge(transport)
    expect(Object.keys(api)).toEqual(['getState', 'getStatus', 'stage', 'unstage'])
    expect(api).not.toHaveProperty('executeGit')
    expect(api).not.toHaveProperty('runGit')
    await expect(api.getState(projectId)).resolves.toEqual({
      ok: true,
      value: { dependency: 'AVAILABLE', repository: 'REPOSITORY' },
    })
    expect(transport.invoke).toHaveBeenCalledWith(GIT_CHANNELS.getState, { projectId })

    await expect(api.getState({ projectId, cwd: canonicalRoot } as never))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(transport.invoke).toHaveBeenCalledTimes(1)

    for (const response of [
      { ok: true, value: { dependency: 'AVAILABLE', repository: 'REPOSITORY' }, extra: true },
      { ok: true, value: { dependency: 'AVAILABLE', repository: 'REPOSITORY', cwd: canonicalRoot } },
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'safe', retryable: false, stack: 'private' } },
    ]) {
      vi.mocked(transport.invoke).mockResolvedValueOnce(response)
      await expect(api.getState(projectId)).resolves.toMatchObject({
        ok: false,
        error: { code: 'INTERNAL_ERROR', details: { boundaryFailure: 'response-validation' } },
      })
    }
  })
})

class FakeIpcMain implements IpcMainLike {
  readonly handlers = new Map<string, (
    event: { sender: { id: number } },
    payload: unknown,
  ) => Promise<unknown>>()

  handle(
    channel: string,
    listener: (
      event: { sender: { id: number } },
      payload: unknown,
    ) => Promise<unknown>,
  ): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  invoke(channel: string, payload: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing handler: ${channel}`)
    return handler({ sender: { id: 7 } }, payload)
  }
}

function execError(
  values: Partial<ExecFileException>,
): ExecFileException {
  return Object.assign(new Error('private process details'), {
    cmd: 'redacted git command',
    ...values,
  })
}

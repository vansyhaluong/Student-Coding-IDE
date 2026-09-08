import { describe, expect, it, vi } from 'vitest'
import {
  GIT_CHANNELS, validateGitBranchSnapshot, validateGitCommitRequest, validateGitHistory,
  validateGitHistoryRequest, validateGitSwitchRequest, type ProjectId,
} from '../../src/shared/contracts'
import { parseGitHistory, parseGitLocalBranches } from '../../src/main/services/git/git-local-parser'
import { createGitBridge } from '../../src/preload/bridge/git'
import { gitSemanticTransport } from '../helpers/git-semantic-transport'
import { GitIpcService } from '../../src/main/ipc/git-ipc-service'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { GitService } from '../../src/main/services/git/git-service'
import { normalizePathIdentity } from '../../src/main/services/project/project-identity'
import { DomainError } from '../../src/main/errors/app-error'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const item = { id: '1'.repeat(40), subject: 'Tiếng Việt 資料', authorName: 'Author', authoredAt: '2026-09-06T20:30:00+07:00' }
const status = { entries: [], didHitLimit: false }
const outcome = { applied: true as const, status, refreshRequired: false as const }
const snapshot = { state: 'ATTACHED' as const, currentBranch: 'main', branches: ['main'] }
const record = `${item.id}\0${item.subject}\0${item.authorName}\0${item.authoredAt}\0`

describe('Phase 5C contract and machine output validation', () => {
  it('accepts the literal local name @ in requests, records and attached snapshots', () => {
    expect(validateGitSwitchRequest({ projectId, branch: '@' }).ok).toBe(true)
    expect(parseGitLocalBranches(`refs/heads/@\0${item.id}\0commit\0\nrefs/heads/main\0${item.id}\0commit\0\n`))
      .toEqual(new Map([['@', item.id], ['main', item.id]]))
    expect(validateGitBranchSnapshot({ state: 'ATTACHED', currentBranch: '@', branches: ['@', 'main'] }).ok).toBe(true)
    for (const branch of ['HEAD', '@{0}', '@~1', '@^', '@:file', '-@', 'a\\b', 'a.lock', '.hidden']) {
      expect(validateGitSwitchRequest({ projectId, branch }).ok).toBe(false)
    }
  })

  it('defaults to 50 and rejects out-of-range/noninteger limits and unknown fields', () => {
    expect(validateGitHistoryRequest({ projectId })).toEqual({ ok: true, value: { projectId, limit: 50 } })
    expect(validateGitHistoryRequest({ projectId, limit: 100 }).ok).toBe(true)
    for (const limit of [0, -1, 101, 1.5, NaN, Infinity, '50', null]) {
      expect(validateGitHistoryRequest({ projectId, limit }).ok).toBe(false)
    }
    expect(validateGitHistoryRequest({ projectId, args: [] }).ok).toBe(false)
  })

  it('validates semantic messages and branch names without accepting options or revision syntax', () => {
    expect(validateGitCommitRequest({ projectId, message: '-m $(echo private)\n\nUnicode đẹp' }).ok).toBe(true)
    for (const message of ['', ' \t\n', 'a\0b', 12]) expect(validateGitCommitRequest({ projectId, message }).ok).toBe(false)
    for (const branch of ['main', 'feature/đẹp', 'refs/legitimate-local-name']) expect(validateGitSwitchRequest({ projectId, branch }).ok).toBe(true)
    for (const branch of ['--force', '@{-1}', 'HEAD~1', '../x', 'a..b', '/x', 'a//b', 'a.lock', 'a\0b']) {
      expect(validateGitSwitchRequest({ projectId, branch }).ok).toBe(false)
    }
  })

  it('rejects impossible branch snapshots and unexpected fields', () => {
    expect(validateGitBranchSnapshot(snapshot).ok).toBe(true)
    expect(validateGitBranchSnapshot({ state: 'DETACHED', currentBranch: null, branches: ['main'] }).ok).toBe(true)
    expect(validateGitBranchSnapshot({ state: 'UNBORN', currentBranch: 'main', branches: [] }).ok).toBe(true)
    for (const value of [{ ...snapshot, currentBranch: null }, { ...snapshot, branches: [] },
      { ...snapshot, branches: ['main', 'main'] }, { ...snapshot, state: 'DETACHED' },
      { ...snapshot, state: 'UNBORN' }, { ...snapshot, rawRef: 'refs/heads/main' }]) {
      expect(validateGitBranchSnapshot(value).ok).toBe(false)
    }
  })

  it('parses only complete fixed records, full IDs and valid typed fields', () => {
    expect(parseGitHistory(record, 50)).toEqual([item])
    expect(parseGitHistory('', 50)).toEqual([])
    expect(parseGitHistory(record.replace(item.id, '2'.repeat(64)), 50)[0].id).toHaveLength(64)
    for (const value of [record.slice(0, -1), record + '\0extra\0', record.replace(item.id, '123'),
      record.replace(item.authoredAt, 'yesterday'), record + record]) {
      expect(() => parseGitHistory(value, 50)).toThrow(DomainError)
    }
    expect(() => parseGitHistory(record, 0)).toThrow(DomainError)
    expect(validateGitHistory([{ ...item, body: 'private' }]).ok).toBe(false)
    expect(validateGitHistory([{ ...item, authoredAt: '2026-02-30T12:00:00+00:00' }]).ok).toBe(false)
    expect(validateGitHistory(Array.from({ length: 101 }, (_, i) => ({ ...item, id: i.toString(16).padStart(40, '0') }))).ok).toBe(false)
    expect(parseGitLocalBranches(`refs/heads/main\0${item.id}\0commit\0\n`)).toEqual(new Map([['main', item.id]]))
    for (const value of [`refs/remotes/main\0${item.id}\0commit\0\n`, `refs/heads/main\0${item.id}\0tag\0\n`, 'incomplete']) {
      expect(() => parseGitLocalBranches(value)).toThrow(DomainError)
    }
  })
})

describe('Phase 5C IPC and Preload production boundary', () => {
  it('dispatches only validated semantics and rejects malformed responses', async () => {
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const ipc: IpcMainLike = { handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: (channel) => { handlers.delete(channel) } }
    const git = { getState: vi.fn(), getStatus: vi.fn(), stage: vi.fn(), unstage: vi.fn(),
      commit: vi.fn(async () => outcome), switchBranch: vi.fn(async () => outcome),
      getBranches: vi.fn(async () => snapshot), getHistory: vi.fn(async () => [item]) }
    const service = new GitIpcService(new IpcHandlerRegistry(ipc), git)
    service.start()
    const invoke = vi.fn(async (channel: string, payload: unknown) => handlers.get(channel)!({ sender: { id: 1 } }, payload))
    const bridge = createGitBridge(gitSemanticTransport({ invoke, on: vi.fn(), removeListener: vi.fn() }))
    expect(await bridge.commit(projectId, 'message')).toEqual({ ok: true, value: outcome })
    expect(await bridge.switchBranch(projectId, 'main')).toEqual({ ok: true, value: outcome })
    expect(await bridge.getBranches(projectId)).toEqual({ ok: true, value: snapshot })
    expect(await bridge.getHistory(projectId)).toEqual({ ok: true, value: [item] })
    expect(git.getHistory).toHaveBeenCalledWith(projectId, 50)
    for (const [channel, fields] of [[GIT_CHANNELS.commit, { message: 'ok' }], [GIT_CHANNELS.switchBranch, { branch: 'main' }],
      [GIT_CHANNELS.getBranches, {}], [GIT_CHANNELS.getHistory, {}]] as const) {
      for (const key of ['cwd', 'args', 'shell', 'executable', 'previousPath', 'command', 'ref']) {
        expect(await invoke(channel, { projectId, ...fields, [key]: 'injected' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      }
    }
    expect(git.commit).toHaveBeenCalledTimes(1)
    expect(git.switchBranch).toHaveBeenCalledTimes(1)
    expect(git.getBranches).toHaveBeenCalledTimes(1)
    expect(git.getHistory).toHaveBeenCalledTimes(1)
    const calls = invoke.mock.calls.length
    expect(await bridge.getHistory(projectId, 101)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await bridge.commit(projectId, '\0')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await bridge.switchBranch(projectId, '--force')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(invoke).toHaveBeenCalledTimes(calls)
    invoke.mockResolvedValueOnce({ ok: true, value: { ...snapshot, state: 'DETACHED' } })
    expect(await bridge.getBranches(projectId)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    invoke.mockResolvedValueOnce({ ok: true, value: [{ ...item, raw: 'private' }] })
    expect(await bridge.getHistory(projectId)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    invoke.mockResolvedValueOnce({ ok: true, value: [item, { ...item, id: '2'.repeat(40) }] })
    expect(await bridge.getHistory(projectId, 1)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    invoke.mockResolvedValueOnce({ ok: true, value: { ...outcome, applied: false } })
    expect(await bridge.commit(projectId, 'ok')).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    service.stop()
    expect(handlers.size).toBe(0)
  })
})

function controlledService() {
  const root = 'C:\\project'
  let available = true
  const project = { id: projectId, name: 'project', canonicalRoot: root, pathIdentity: normalizePathIdentity(root, 'win32') }
  const controls = { interrupted: false, mutationExit: 0, refreshFailure: false, changedBeforeMutation: false }
  let mutated = false
  const commands = {
    execute: vi.fn(async (_exe: string, args: readonly string[]) => {
      if (args[0] === 'commit' || args[0] === 'switch') {
        mutated = true
        if (controls.interrupted) throw new Error('private executable stderr cwd')
        return { exitCode: controls.mutationExit, stdout: '', stderr: 'private' }
      }
      const stdout = args.includes('--show-toplevel') ? `${root}\n`
        : args.includes('--absolute-git-dir') ? `${root}\\.git\n`
          : args[0] === 'symbolic-ref' ? 'refs/heads/main\n'
            : args[0] === 'for-each-ref' ? `refs/heads/main\0${item.id}\0commit\0\n`
              : args[0] === 'log' ? record : `${item.id}\n`
      if (controls.changedBeforeMutation && args.includes('--absolute-git-dir')) available = false
      return { exitCode: 0, stdout, stderr: '' }
    }),
    stream: vi.fn(async (_exe: string, _args: readonly string[], _cwd: string, consume: (chunk: Uint8Array) => boolean) => {
      if (mutated && controls.refreshFailure) throw new Error('private refresh failure')
      consume(Buffer.from(`# branch.oid ${item.id}\0# branch.head main\0`))
      return { exitCode: 0, stoppedEarly: false }
    }),
  }
  const metadata = { lstat: vi.fn(async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) }) }
  const service = new GitService({ getAuthorizedProject: () => project },
    { getStatus: () => ({ projectId, state: available ? 'AVAILABLE' : 'UNAVAILABLE' }) },
    { detect: async () => ({ state: 'AVAILABLE', git: { executable: 'C:\\Git\\git.exe' } }) },
    commands, { realpath: async (path) => path }, 'win32', undefined, metadata)
  return { service, commands, controls }
}

describe('Phase 5C mutation outcomes and reauthorization', () => {
  it.each(['commit', 'switchBranch'] as const)('%s retains truth after refresh failure', async (action) => {
    const f = controlledService()
    f.controls.refreshFailure = true
    expect(await f.service[action](projectId, action === 'commit' ? 'message' : 'main'))
      .toEqual({ applied: true, status: null, refreshRequired: true })
  })

  it.each(['commit', 'switchBranch'] as const)('%s normalizes interruption to unknown and refreshes without retry', async (action) => {
    const f = controlledService()
    f.controls.interrupted = true
    await expect(f.service[action](projectId, action === 'commit' ? 'message' : 'main')).rejects.toMatchObject({
      code: 'PROCESS_FAILED', details: { reason: 'mutation-outcome-unknown', refreshRequired: true }, retryable: false,
    })
    expect(f.commands.stream).toHaveBeenCalledOnce()
    expect(f.commands.execute.mock.calls.filter(([, args]) => args[0] === 'commit' || args[0] === 'switch')).toHaveLength(1)
  })

  it('reauthorizes before committing after checking operation markers', async () => {
    const f = controlledService()
    f.controls.changedBeforeMutation = true
    await expect(f.service.commit(projectId, 'message')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(f.commands.execute.mock.calls.some(([, args]) => args[0] === 'commit')).toBe(false)
  })

  it('uses only Main-owned args even for option-like commit text', async () => {
    const f = controlledService()
    const message = '--amend $(echo private)\nUnicode đẹp'
    await f.service.commit(projectId, message)
    expect(f.commands.execute).toHaveBeenCalledWith('C:\\Git\\git.exe', ['commit', '-m', message], 'C:\\project')
  })
})

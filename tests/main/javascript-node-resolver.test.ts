import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { captureJavascriptNode, NodeCandidateError } from '../../src/main/services/learning/runtime/javascript-node-files'
import { fakeNode, fakeProbe, probeContext } from '../fixtures/learning/javascript-node-files'

let root: string
describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('Learning-only Node PATH/identity resolver', () => {
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'Learning-node-files-')) })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-node-files-')) throw Error('Unsafe fixture cleanup')
    await rm(root, { recursive: true, force: true })
  })
  it('chooses the first compatible PATH entry, ignores relative/CWD/cmd/npm and freezes selection', async () => {
    const first = join(root, 'Node Việt space'), second = join(root, 'second')
    await fakeNode(first); await fakeNode(second)
    const environment = { Path: `.;relative;C:relative;"${first}";${second}` }
    const resolver = new LearningNodeResolver(environment), probe = fakeProbe(), ctx = probeContext()
    environment.Path = second
    const result = await resolver.resolve(ctx, probe)
    expect(result.state).toBe('AVAILABLE')
    if (result.state !== 'AVAILABLE') throw Error('Unavailable')
    expect(result.selection.executablePath).toBe(join(first, 'node.exe'))
    expect(Object.isFrozen(result.selection)).toBe(true); expect(Object.isFrozen(result.selection.identity)).toBe(true)
    await resolver.revalidate(result.selection, ctx)
    await expect(resolver.resolve(ctx, probe)).rejects.toThrow()
    await expect(resolver.revalidate({ ...result.selection }, ctx)).rejects.toThrow()
    expect(probe.probe).toHaveBeenCalledOnce()
  })
  it.each(['v22.1.0', 'v25.0.0', 'v24.0.0-rc.1', 'v24.01.2'])('rejects unsupported reported version %s', async version => {
    await fakeNode(root)
    expect(await new LearningNodeResolver({ PATH: root }).resolve(probeContext(), fakeProbe(version))).toEqual({ state: 'INVALID_CONFIGURATION', reason: 'NODE_INCOMPATIBLE' })
  })
  it.each(['v24.0.0', 'v24.99.123'])('does not patch-lock stable %s', async version => {
    await fakeNode(root)
    expect(await new LearningNodeResolver({ PATH: root }).resolve(probeContext(), fakeProbe(version))).toMatchObject({ state: 'AVAILABLE', selection: { version } })
  })
  it('continues to a compatible candidate with the same Prepare context/deadline', async () => {
    const dirs = [join(root, 'old'), join(root, 'new')]; for (const dir of dirs) await fakeNode(dir)
    const probe = fakeProbe()
    vi.mocked(probe.probe).mockImplementationOnce(async () => ({ state: 'INVALID_CONFIGURATION', reason: 'NODE_INCOMPATIBLE' }))
    const ctx = probeContext(), due = ctx.deadline
    const result = await new LearningNodeResolver({ PATH: dirs.join(';') }).resolve(ctx, probe)
    expect(result).toMatchObject({ state: 'AVAILABLE', selection: { executablePath: join(dirs[1], 'node.exe') } })
    expect(vi.mocked(probe.probe).mock.calls.map(c => c[1])).toEqual([ctx, ctx]); expect(ctx.deadline).toBe(due)
  })
  it('reports missing without launching .cmd or looking in CWD', async () => {
    await writeFile(join(root, 'node.cmd'), 'must not run')
    const probe = fakeProbe()
    expect(await new LearningNodeResolver({ PATH: `${root};.;C:node` }).resolve(probeContext(), probe)).toEqual({ state: 'MISSING', reason: 'NODE_NOT_FOUND' })
    expect(probe.probe).not.toHaveBeenCalled()
  })
  it.each([0x14c, 0xaa64])('rejects incompatible PE architecture %s before probe', async machine => {
    await fakeNode(root, machine); const probe = fakeProbe()
    expect(await new LearningNodeResolver({ PATH: root }).resolve(probeContext(), probe)).toEqual({ state: 'INVALID_CONFIGURATION', reason: 'ARCHITECTURE_MISMATCH' })
    expect(probe.probe).not.toHaveBeenCalled()
  })
  it('rejects a malformed executable/header and unsafe path namespaces', async () => {
    await fakeNode(root); await writeFile(join(root, 'node.exe'), 'fake node')
    const result = await new LearningNodeResolver({ PATH: root }).resolve(probeContext(), fakeProbe())
    expect(result.state).toBe('INVALID_CONFIGURATION')
    const probe = fakeProbe()
    expect(await new LearningNodeResolver({ PATH: '\\\\?\\C:\\node;C:\\node:stream' }).resolve(probeContext(), probe)).toMatchObject({ state: 'MISSING' })
    expect(probe.probe).not.toHaveBeenCalled()
  })
  it('accepts verified nvm junctions and refuses a changed target', async () => {
    const v1 = join(root, 'v1'), v2 = join(root, 'v2'), alias = join(root, 'nvm current')
    await fakeNode(v1); await fakeNode(v2); await symlink(v1, alias, 'junction')
    const resolver = new LearningNodeResolver({ PATH: alias }), ctx = probeContext()
    const result = await resolver.resolve(ctx, fakeProbe())
    if (result.state !== 'AVAILABLE') throw Error('Expected verified junction')
    expect(result.selection.canonicalPath.toLowerCase()).toBe(join(v1, 'node.exe').toLowerCase())
    await rm(alias); await symlink(v2, alias, 'junction')
    await expect(resolver.revalidate(result.selection, ctx)).rejects.toMatchObject({ details: { reason: 'INVALID_RUNTIME' } })
  })
  it('rejects a broken junction and a cyclic junction without probe', async () => {
    const alias = join(root, 'broken'); await symlink(join(root, 'absent'), alias, 'junction')
    const probe = fakeProbe()
    expect(await new LearningNodeResolver({ PATH: alias }).resolve(probeContext(), probe)).toMatchObject({ state: 'INVALID_CONFIGURATION' })
    const a = join(root, 'cycle-a'), b = join(root, 'cycle-b')
    await symlink(b, a, 'junction'); await symlink(a, b, 'junction')
    expect(await new LearningNodeResolver({ PATH: a }).resolve(probeContext(), probe)).toMatchObject({ state: 'INVALID_CONFIGURATION' })
    expect(probe.probe).not.toHaveBeenCalled()
  })
  it.each(['replace', 'edit'] as const)('refuses executable %s after selection', async action => {
    const file = await fakeNode(root), resolver = new LearningNodeResolver({ PATH: root }), ctx = probeContext()
    const result = await resolver.resolve(ctx, fakeProbe()); if (result.state !== 'AVAILABLE') throw Error('Expected candidate')
    if (action === 'replace') { await rename(file, join(root, 'old.exe')); await fakeNode(root) }
    else { const bytes = await readFile(file); bytes[100] = 1; await writeFile(file, bytes) }
    await expect(resolver.revalidate(result.selection, ctx)).rejects.toMatchObject({ details: { reason: 'INVALID_RUNTIME' } })
  })
  it('detects replacement during probing and refuses a foreign selection', async () => {
    const file = await fakeNode(root), probe = fakeProbe()
    vi.mocked(probe.probe).mockImplementationOnce(async candidate => {
      await rename(file, join(root, 'old.exe')); await fakeNode(root)
      return { state: 'AVAILABLE', selection: { ...candidate, version: 'v24.1.0', architecture: 'x64' } }
    })
    expect(await new LearningNodeResolver({ PATH: root }).resolve(probeContext(), probe)).toMatchObject({ state: 'INVALID_CONFIGURATION', reason: 'UNSAFE_IDENTITY' })
    const foreign = fakeProbe(); vi.mocked(foreign.probe).mockImplementationOnce(async candidate => ({ state: 'AVAILABLE', selection: { ...candidate, canonicalPath: 'C:\\foreign\\node.exe', version: 'v24.1.0', architecture: 'x64' } }))
    expect(await new LearningNodeResolver({ PATH: root }).resolve(probeContext(), foreign)).toMatchObject({ state: 'INVALID_CONFIGURATION' })
  })
  it('does not probe after cancellation/deadline, including after asynchronous candidate discovery', async () => {
    await fakeNode(root); const probe = fakeProbe(), controller = new AbortController()
    controller.abort()
    await expect(new LearningNodeResolver({ PATH: root }).resolve({ ...probeContext(), signal: controller.signal }, probe)).rejects.toThrow()
    await expect(new LearningNodeResolver({ PATH: root }).resolve({ ...probeContext(), deadline: performance.now() - 1 }, probe)).rejects.toThrow()
    expect(probe.probe).not.toHaveBeenCalled()
    const ctx = probeContext(), pending = new AbortController()
    const work = new LearningNodeResolver({ PATH: root }).resolve({ ...ctx, signal: pending.signal }, probe)
    pending.abort() // First filesystem operation is pending; its continuation cannot probe.
    await expect(work).rejects.toThrow()
    expect(probe.probe).not.toHaveBeenCalled()
  })
  it('does not reset Prepare due or launch a second candidate after the first probe consumes it', async () => {
    const a = join(root, 'first'), b = join(root, 'second'); await fakeNode(a); await fakeNode(b)
    const ctx = probeContext(), probe = fakeProbe()
    vi.mocked(probe.probe).mockImplementationOnce(async () => {
      vi.spyOn(performance, 'now').mockReturnValue(ctx.deadline + 1)
      return { state: 'INVALID_CONFIGURATION', reason: 'NODE_INCOMPATIBLE' }
    })
    await expect(new LearningNodeResolver({ PATH: `${a};${b}` }).resolve(ctx, probe)).rejects.toMatchObject({ details: { reason: 'PHASE_DEADLINE' } })
    expect(probe.probe).toHaveBeenCalledOnce()
  })
  it('captures a stable identity with no process side effects', async () => {
    const path = await fakeNode(root), files = await captureJavascriptNode(path, probeContext())
    expect(files.identity.fileId).not.toBe('0'); expect(files.entries.length).toBeGreaterThan(1)
    expect(NodeCandidateError.prototype).toBeInstanceOf(Error)
  })
})

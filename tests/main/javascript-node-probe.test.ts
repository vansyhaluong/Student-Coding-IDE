import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowsLearningNodeProbe } from '../../src/main/services/learning/runtime/javascript-node-probe'
import { captureJavascriptNode } from '../../src/main/services/learning/runtime/javascript-node-files'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { classifyExerciseTermination } from '../../src/main/services/learning/runtime/exercise-session'
import { fakeNode, probeContext, probeNative, probeReport } from '../fixtures/learning/javascript-node-files'

let root: string
describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('Fixed Learning Prepare Node probe', () => {
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'Learning-node-probe-unit-')) })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-node-probe-unit-')) throw Error('Unsafe fixture cleanup')
    await rm(root, { recursive: true, force: true })
  })
  async function fixture(transform: (report: string) => Buffer = s => Buffer.from(s)) {
    const candidate = await captureJavascriptNode(await fakeNode(join(root, 'installed Node Việt')), probeContext())
    const workspace = new ExerciseWorkspace(join(root, 'learning'), 'exercise_12345678-1234-4234-8234-123456789abc',
      { acquire: async () => ({ release: async () => {} }) })
    await workspace.prepare()
    const mocked = probeNative(() => transform(probeReport(candidate)))
    const probe = new WindowsLearningNodeProbe(mocked.native, workspace)
    const cleanup = async () => {
      await probe.terminate('COMPLETED'); await probe.settleObservers()
      expect(classifyExerciseTermination(await probe.evidence())).toBe('VERIFIED')
      await probe.release(); await probe.closeHandles(); await workspace.remove(workspace.identity!); await workspace.releaseLease()
      expect([...mocked.states.values()].every(s => s.released && s.handlesClosed)).toBe(true)
    }
    return { ...mocked, candidate, workspace, probe, cleanup }
  }
  it('sets/read-backs 512MiB before resume, EOF, fixed arguments and accounts raw bytes without publishing paths', async () => {
    const f = await fixture(), ctx = probeContext()
    try {
      expect(await f.probe.probe(f.candidate, ctx)).toMatchObject({ state: 'AVAILABLE', selection: { version: 'v24.8.1', architecture: 'x64' } })
      expect(f.native.start).toHaveBeenCalledExactlyOnceWith(f.candidate.canonicalPath,
        ['--eval', expect.stringContaining("require('node:vm')")], f.workspace.path, 512 * 1024 ** 2, expect.any(Array))
      expect(f.native.submitInput).toHaveBeenCalledWith(expect.any(Object), Buffer.alloc(0))
      expect(vi.mocked(f.native.poll).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.native.control).mock.invocationCallOrder[0])
      expect(ctx.output).toHaveBeenCalledExactlyOnceWith('stdout', '', Buffer.byteLength(probeReport(f.candidate)))
      const environment = vi.mocked(f.native.start).mock.calls[0][4]
      expect(environment.every(s => /^(SystemRoot|WINDIR|TEMP|TMP)=/i.test(s))).toBe(true)
      expect(f.probe.diagnostics()[0]).toMatchObject({ quotaBytes: 512 * 1024 ** 2, released: false, handlesClosed: false })
    } finally { await f.cleanup() }
  })
  it.each([
    ['wrong-major', (s: string) => Buffer.from(s.replace('v24.8.1', 'v22.1.0')), 'NODE_INCOMPATIBLE'],
    ['preview', (s: string) => Buffer.from(s.replace('v24.8.1', 'v24.1.0-rc.1')), 'NODE_INCOMPATIBLE'],
    ['architecture', (s: string) => Buffer.from(s.replace('"x64"', '"arm64"')), 'ARCHITECTURE_MISMATCH'],
    ['capability', (s: string) => Buffer.from(s.replace('"script":true', '"script":false')), 'CAPABILITY_MISSING'],
    ['duplicate', (s: string) => Buffer.from(s.replace('"protocolVersion":1', '"protocolVersion":1,"protocolVersion":1')), 'NODE_INCOMPATIBLE'],
    ['extra-document', (s: string) => Buffer.from(s + s), 'NODE_INCOMPATIBLE'],
    ['trailing', (s: string) => Buffer.from(s + '\nlog'), 'NODE_INCOMPATIBLE'],
    ['malformed-utf8', () => Buffer.from([0xff]), 'NODE_INCOMPATIBLE'],
    ['BOM', (s: string) => Buffer.from('\ufeff' + s), 'NODE_INCOMPATIBLE'],
    ['empty', () => Buffer.alloc(0), 'NODE_INCOMPATIBLE'],
    ['foreign-path', (s: string) => Buffer.from(s.replace('node.exe', 'other.exe')), 'NODE_INCOMPATIBLE'],
  ] as const)('rejects %s with safe configuration errors', async (_name, transform, reason) => {
    const f = await fixture(transform)
    try { expect(await f.probe.probe(f.candidate, probeContext())).toEqual({ state: 'INVALID_CONFIGURATION', reason }) }
    finally { await f.cleanup() }
  })
  it.each(['quota', 'native-poll', 'observer', 'stdin'] as const)('retains %s failure for cleanup/retry', async fault => {
    const f = await fixture(), poll = vi.mocked(f.native.poll).getMockImplementation()!
    if (fault === 'quota') vi.mocked(f.native.poll).mockImplementationOnce(h => ({ ...poll(h), quotaBytes: 1 }))
    if (fault === 'native-poll') vi.mocked(f.native.poll).mockImplementationOnce(() => { throw { code: 'LEARNING_QUERY', message: 'secret' } })
    if (fault === 'observer') vi.mocked(f.native.poll).mockImplementationOnce(poll).mockImplementationOnce(() => { throw { code: 'LEARNING_PIPE' } })
    if (fault === 'stdin') vi.mocked(f.native.submitInput).mockImplementationOnce(() => { throw { code: 'LEARNING_PIPE' } })
    try {
      await expect(f.probe.probe(f.candidate, probeContext())).rejects.toThrow()
      expect(f.native.start).toHaveBeenCalledOnce()
      if (fault !== 'observer') expect(f.native.control).not.toHaveBeenCalled()
      expect(f.probe.diagnostics()[0].handlesClosed).toBe(false)
    } finally { await f.cleanup() }
  })
  it('retains release failure, retries without respawn or double release', async () => {
    const f = await fixture()
    await f.probe.probe(f.candidate, probeContext()); await f.probe.terminate('COMPLETED'); await f.probe.settleObservers()
    const control = vi.mocked(f.native.control).getMockImplementation()!
    vi.mocked(f.native.control).mockImplementationOnce(() => { throw { code: 'LEARNING_CLOSE' } }).mockImplementation(control)
    await expect(f.probe.release()).rejects.toThrow()
    expect(f.probe.diagnostics()[0].released).toBe(false)
    await f.cleanup(); expect(f.native.start).toHaveBeenCalledOnce()
  })
  it('blocks probe after invalidation and never launches after asynchronous preflight cancellation', async () => {
    const f = await fixture(), abort = new AbortController(), ctx = { ...probeContext(), signal: abort.signal }
    const task = f.probe.probe(f.candidate, ctx); abort.abort()
    await expect(task).rejects.toThrow(); expect(f.native.start).not.toHaveBeenCalled()
    await f.cleanup()
    await expect(f.probe.probe(f.candidate, probeContext())).rejects.toThrow()
  })
  it.each(['cancel', 'deadline'] as const)('never resumes a root after synchronous startup %s', async fault => {
    const f = await fixture(), abort = new AbortController(), ctx = { ...probeContext(), signal: abort.signal }
    const start = vi.mocked(f.native.start).getMockImplementation()!
    vi.mocked(f.native.start).mockImplementation((...args) => {
      const h = start(...args)
      if (fault === 'cancel') abort.abort()
      else vi.spyOn(performance, 'now').mockReturnValue(ctx.deadline + 1)
      return h
    })
    try {
      await expect(f.probe.probe(f.candidate, ctx)).rejects.toThrow()
      expect(f.native.control).not.toHaveBeenCalledWith(expect.anything(), 'resume')
    } finally { vi.restoreAllMocks(); await f.cleanup() }
  })
  it('rejects a caller reset of Prepare deadline across candidate probes', async () => {
    const f = await fixture(), ctx = probeContext()
    try {
      await f.probe.probe(f.candidate, ctx)
      await expect(f.probe.probe(f.candidate, { ...ctx, deadline: ctx.deadline + 1 })).rejects.toThrow()
      expect(f.native.start).toHaveBeenCalledOnce()
    } finally { await f.cleanup() }
  })
  it('retains Job memory evidence separately from nonzero process exits', async () => {
    const f = await fixture(), control = vi.mocked(f.native.control).getMockImplementation()!
    vi.mocked(f.native.control).mockImplementation((h, op) => { control(h, op); if (op === 'resume') f.jobs.get(h)!.events = [{ message: 10, pid: 1 }] })
    try {
      await expect(f.probe.probe(f.candidate, probeContext())).rejects.toMatchObject({ details: { reason: 'JOB_MEMORY_LIMIT' } })
      expect(f.probe.diagnostics()[0].memoryEvents).toHaveLength(1)
    } finally { await f.cleanup() }
  })
  it('accounts oversized output and still drains safely during cleanup', async () => {
    const f = await fixture(() => Buffer.alloc(1024 ** 2 + 1)), ctx = probeContext()
    try {
      await expect(f.probe.probe(f.candidate, ctx)).rejects.toMatchObject({ details: { reason: 'OUTPUT_LIMIT' } })
      expect(ctx.output).toHaveBeenCalledWith('stdout', '', 1024 ** 2 + 1)
    } finally { await f.cleanup() }
  })
})

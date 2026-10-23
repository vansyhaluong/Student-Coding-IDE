import { mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JavascriptSingleSampleRuntime } from '../../src/main/services/learning/runtime/javascript-single-sample'
import { LearningNodeResolver } from '../../src/main/services/learning/runtime/javascript-node-resolver'
import { captureJavascriptNode } from '../../src/main/services/learning/runtime/javascript-node-files'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import { ExerciseSession } from '../../src/main/services/learning/runtime/exercise-session'
import { fakeNode, probeContext, probeNative, probeReport } from '../fixtures/learning/javascript-node-files'

let root: string
const gate = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { resolve, promise }
}
describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('JavaScript single-sample admission and retained preflight', () => {
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'Learning-js-single-')) })
  afterEach(async () => {
    vi.restoreAllMocks()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-js-single-')) throw Error('Unsafe fixture cleanup')
    await rm(root, { recursive: true, force: true })
  })
  async function fixture() {
    const installed = join(root, 'node'), candidate = await captureJavascriptNode(await fakeNode(installed), probeContext())
    let mode = 'probe'
    const mocked = probeNative(() => Buffer.from(mode === 'probe' ? probeReport(candidate) : mode === 'syntax' ? '{"status":"SUCCEEDED"}'
      : '{"protocolVersion":1,"caseIndex":0,"outcome":"RETURNED","actual":8,"stdout":"","stderr":""}'))
    const start = vi.mocked(mocked.native.start).getMockImplementation()!
    vi.mocked(mocked.native.start).mockImplementation((...args) => {
      const last = args[1].at(-1); mode = last === 'syntax' || last === 'execute' ? last : 'probe'
      return start(...args)
    })
    const workspace = new ExerciseWorkspace(join(root, 'learning'), 'exercise_12345678-1234-4234-8234-123456789abc',
      { acquire: async () => ({ release: async () => {} }) })
    const request = { exerciseId: 'ch2-01', language: 'javascript' as const, code: 'function Sum(a,b){return a+b;}', sourceRevision: 1 }
    const resolver = new LearningNodeResolver({ PATH: installed })
    const runtime = new JavascriptSingleSampleRuntime(request, workspace, mocked.native, resolver)
    const session = new ExerciseSession({ request, ownerId: 'unit-js', workspace, adapter: runtime, checkpoints: {
      read: async () => { throw Error('not used') }, write: async () => {},
    } })
    return { ...mocked, resolver, runtime, session }
  }
  it('requires Core barriers and executes exactly sample zero with detached prefix/suffix', async () => {
    const f = await fixture()
    try {
      await f.session.runPhase('prepare')
      await expect(f.runtime.runPhase('compile', { ...probeContext(), jobMemoryBytes: 2 * 1024 ** 3 })).rejects.toThrow()
      await f.session.verifyExecutionBarrier(); await f.session.runPhase('compile')
      await f.session.verifyExecutionBarrier(); await f.session.runPhase('execute')
      await expect(f.session.runPhase('execute')).rejects.toThrow()
      const result = f.runtime.result()
      expect(result.cases).toHaveLength(1); expect(result.notRunCaseIndices).toEqual([1])
      result.cases[0].actual = 999
      expect(f.runtime.result().cases[0].actual).toBe(8)
      expect(f.native.start).toHaveBeenCalledTimes(3)
    } finally { await f.session.close() }
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })
  it('rejects result publication while a Core-owned barrier is pending', async () => {
    const f = await fixture()
    await f.session.runPhase('prepare')
    const evidence = await f.runtime.evidence(), pending = gate<typeof evidence>()
    const spy = vi.spyOn(f.runtime, 'evidence').mockImplementation(() => pending.promise)
    const work = f.session.verifyExecutionBarrier()
    await Promise.resolve()
    expect(() => f.runtime.result()).toThrow()
    pending.resolve(evidence); await work; spy.mockRestore()
    expect(() => f.runtime.result()).not.toThrow()
    await f.session.close()
  })
  it('retains asynchronous syntax preflight through cancellation and never launches late', async () => {
    const f = await fixture(), pending = gate<void>(), entered = gate<void>()
    await f.session.runPhase('prepare'); await f.session.verifyExecutionBarrier()
    vi.spyOn(f.resolver, 'revalidate').mockImplementationOnce(async () => { entered.resolve(); await pending.promise })
    const work = f.session.runPhase('compile'); void work.catch(() => {})
    await entered.promise
    const close = f.session.close('OWNER_LOST'); void close.catch(() => {})
    expect(f.session.ownsResources).toBe(true)
    expect(f.runtime.diagnostics().probe[0].handlesClosed).toBe(false)
    pending.resolve(); await expect(work).rejects.toThrow(); await close
    expect(f.native.start).toHaveBeenCalledOnce()
    expect(() => f.runtime.result()).toThrow()
    expect(f.session.snapshot().cleanup.cleanupComplete).toBe(true)
  })
})

/* global setTimeout */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { runRunner } from '../../scripts/run-smart-hints-openrouter-live.mjs'

const roots = [], children = []
afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.startsWith(join(tmpdir(), 'sh4-supervisor-'))) throw Error('Unexpected cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(patch = {}) {
  const rootPath = await mkdtemp(join(tmpdir(), 'sh4-supervisor-')); roots.push(rootPath)
  await mkdir(join(rootPath, 'out'))
  const historical = join(rootPath, 'out/sh4-openrouter-manual-live-result.json')
  await writeFile(historical, JSON.stringify({ result: 'STOP', code: 'KEY_MISSING_OR_INVALID' }))
  const signals = new EventEmitter()
  const attemptId = `test-${randomUUID()}`, directory = join(rootPath, 'out/sh4-attempts/live', attemptId)
  const destination = join(directory, 'result.json')
  const options = { rootPath, attemptId, env: { OPENROUTER_API_KEY: 'SYNTHETIC-ONLY-never-a-real-key' }, signals,
    prepare: async () => {}, timeoutMs: 3000, ...patch }
  return { destination, directory, historical, options, signals }
}
const fake = handler => env => {
  const child = new EventEmitter()
  setTimeout(() => { void handler(child, env) }, 0)
  return child
}
it('claims a distinct attempt before build; build failure preserves historical results', async () => {
  const f = await fixture({ prepare: async () => { throw Error('PRIVATE synthetic credential') } })
  const launch = vi.fn()
  const result = await runRunner({ ...f.options, launch })
  expect(result).toMatchObject({ code: 'PREPARATION_FAILED', runnerState: 'FINISHED', httpRequests: 0 })
  expect(JSON.parse(await readFile(f.historical, 'utf8')).code).toBe('KEY_MISSING_OR_INVALID')
  expect(launch).not.toHaveBeenCalled()
  expect(JSON.parse(await readFile(f.destination, 'utf8'))).toEqual(result)
  expect(JSON.stringify(result)).not.toContain('PRIVATE')
})
it('blocks Electron Node mode without launching or inspecting credentials', async () => {
  const f = await fixture({ env: { ELECTRON_RUN_AS_NODE: '1' } }), launch = vi.fn()
  expect((await runRunner({ ...f.options, launch })).code).toBe('ELECTRON_RUN_AS_NODE_SET')
  expect(launch).not.toHaveBeenCalled()
})
it('records asynchronous spawn failure safely', async () => {
  const f = await fixture()
  const result = await runRunner({ ...f.options, launch: fake(child => child.emit('error', Error('PRIVATE'))) })
  expect(result.code).toBe('ELECTRON_LAUNCH_FAILED')
  expect(JSON.stringify(result)).not.toContain('PRIVATE')
})
it('preserves exit code/signal and reports missing evidence even on exit zero', async () => {
  const f = await fixture()
  const result = await runRunner({ ...f.options, launch: fake(child => child.emit('close', 0, null)) })
  expect(result).toMatchObject({ code: 'ELECTRON_EXIT_WITHOUT_RESULT', exitCode: 0, httpRequests: 'UNKNOWN', inferenceRequests: 'UNKNOWN' })
})
it('passes a snapshot environment to the child and accepts only this run final result', async () => {
  const f = await fixture()
  const result = await runRunner({ ...f.options, launch: fake(async (child, env) => {
    expect(env.OPENROUTER_API_KEY).toBe(f.options.env.OPENROUTER_API_KEY)
    await writeFile(join(f.directory, `progress-${env.SH4_RUN_ID}-1.json`), JSON.stringify({ runId: env.SH4_RUN_ID, runnerState: 'FINISHED', result: 'STOP', code: 'CONSENT_CANCELLED', httpRequests: 0 }))
    child.emit('close', 1, null)
  }) })
  expect(result.code).toBe('CONSENT_CANCELLED')
  expect(f.options.env.SH4_RUN_ID).toBeUndefined()
  expect(JSON.stringify(result)).not.toContain(f.options.env.OPENROUTER_API_KEY)
})
it('rejects stale final evidence from a different run', async () => {
  const f = await fixture()
  const result = await runRunner({ ...f.options, launch: fake(async (child, env) => {
    await writeFile(join(f.directory, `progress-${env.SH4_RUN_ID}-1.json`), JSON.stringify({ runId: 'old', runnerState: 'FINISHED', result: 'PASS' }))
    child.emit('close', 0, null)
  }) })
  expect(result.code).toBe('ELECTRON_EXIT_WITHOUT_RESULT')
})
it('watchdog kills an actual isolated hanging child tree and keeps reservation intact', async () => {
  const f = await fixture({ timeoutMs: 1000 })
  const marker = join(f.options.rootPath, 'out/sh4-openrouter-live-attempt.json')
  await writeFile(marker, 'existing-reservation')
  const result = await runRunner({ ...f.options, launch: () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { env: {}, stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' })
    children.push(child)
    return child
  } })
  expect(result).toMatchObject({ code: 'RUNNER_TIMEOUT', cleanup: 'TREE_TERMINATED', httpRequests: 'UNKNOWN' })
  expect(() => process.kill(children.at(-1).pid, 0)).toThrow()
  expect(await readFile(marker, 'utf8')).toBe('existing-reservation')
  expect(f.signals.listenerCount('SIGTERM')).toBe(0)
})
it('interrupts invoke owned-child cleanup and record cleanup failure', async () => {
  const f = await fixture(), terminate = vi.fn(async () => { throw Error('PRIVATE') })
  const result = await runRunner({ ...f.options, terminate, launch: fake(() => f.signals.emit('SIGINT')) })
  expect(terminate).toHaveBeenCalledOnce()
  expect(result).toMatchObject({ code: 'INTERRUPTED', cleanup: 'FAILED' })
})
it('timeout during preparation never launches a child later', async () => {
  let finish
  const f = await fixture({ timeoutMs: 20, prepare: () => new Promise(done => { finish = done }) }), launch = vi.fn()
  const result = await runRunner({ ...f.options, launch })
  finish()
  await new Promise(done => setTimeout(done, 20))
  expect(result.code).toBe('RUNNER_TIMEOUT'); expect(launch).not.toHaveBeenCalled()
})
it('reports a persisted consent stall and preserves that stage during watchdog cleanup', async () => {
  const events = []
  const f = await fixture({ timeoutMs: 150, pollMs: 5, onStage: (stage, message) => events.push({ stage, message }) })
  const result = await runRunner({ ...f.options, launch: fake(async (_child, env) => {
    await writeFile(join(f.directory, `progress-${env.SH4_RUN_ID}-1.json`), JSON.stringify({ runId: env.SH4_RUN_ID, runnerState: 'RUNNING', result: 'STOP',
      stage: 'PREFLIGHT_CONSENT', httpRequests: 0, inferenceRequests: 0, keyPresent: true }))
  }) })
  expect(events).toEqual([{ stage: 'PREFLIGHT_CONSENT', message: expect.stringContaining('60s') }])
  expect(result).toMatchObject({ code: 'RUNNER_TIMEOUT', lastStage: 'PREFLIGHT_CONSENT', httpRequests: 'UNKNOWN' })
})
it('rejects unknown stages for terminal output and bounds stalled cleanup', async () => {
  const onStage = vi.fn()
  const f = await fixture({ timeoutMs: 100, cleanupMs: 20, pollMs: 5, onStage })
  const result = await runRunner({ ...f.options, terminate: () => new Promise(() => {}), launch: fake(async (_child, env) => {
    await writeFile(join(f.directory, `progress-${env.SH4_RUN_ID}-1.json`), JSON.stringify({ runId: env.SH4_RUN_ID, stage: 'PRIVATE-UNTRUSTED-TEXT' }))
  }) })
  expect(onStage).not.toHaveBeenCalled()
  expect(result).toMatchObject({ code: 'RUNNER_TIMEOUT', cleanup: 'FAILED', runnerState: 'FINISHED' })
})
it('retains a matching safe Main fallback when shared-result persistence failed', async () => {
  const f = await fixture()
  const result = await runRunner({ ...f.options, launch: fake(async (child, env) => {
    await writeFile(join(f.directory, `failure-${env.SH4_RUN_ID}.json`), JSON.stringify({
      runId: env.SH4_RUN_ID, code: 'MAIN_FAILED', result: 'STOP', runnerState: 'FINISHED',
      lastStage: 'USER_DATA_CREATING', failureCategory: 'EACCES' }))
    child.emit('close', 1, null)
  }) })
  expect(result).toMatchObject({ code: 'MAIN_FAILED', lastStage: 'USER_DATA_CREATING', failureCategory: 'EACCES' })
  expect(JSON.parse(await readFile(f.destination, 'utf8'))).toEqual(result)
})
it('reads immutable snapshots in numeric order and publishes the final summary', async () => {
  const f = await fixture()
  const directory = f.directory
  const result = await runRunner({ ...f.options, launch: fake(async (child, env) => {
    for (const sequence of [2, 10]) await writeFile(join(directory, `progress-${env.SH4_RUN_ID}-${sequence}.json`), JSON.stringify({
      runId: env.SH4_RUN_ID, sequence, stage: 'PREFLIGHT_CONSENT', result: 'STOP',
      code: sequence === 10 ? 'PREFLIGHT_CONSENT_TIMEOUT' : 'NOT_STARTED', runnerState: sequence === 10 ? 'FINISHED' : 'RUNNING', httpRequests: 0 }))
    // A temporary/unpublished record cannot be treated as evidence.
    await writeFile(join(directory, `progress-${env.SH4_RUN_ID}-11.json.tmp`), 'partial')
    child.emit('close', 1, null)
  }) })
  expect(result).toMatchObject({ code: 'PREFLIGHT_CONSENT_TIMEOUT', sequence: 10 })
  expect(JSON.parse(await readFile(f.destination, 'utf8'))).toEqual(result)
  expect(JSON.parse(await readFile(join(directory, `progress-${result.runId}-2.json`), 'utf8')).code).toBe('NOT_STARTED')
})

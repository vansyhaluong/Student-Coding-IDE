import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { claimAttempt, loadAttempt, acquireAttemptLock, reserveInference, publishExclusive } from '../../scripts/sh4-attempt-store.mjs'
import { runRunner } from '../../scripts/run-smart-hints-openrouter-live.mjs'

const roots = []
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') }) })
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.startsWith(join(tmpdir(), 'sh4-attempt-'))) throw Error('UNEXPECTED_CLEANUP_PATH')
    await rm(root, { recursive: true, force: true })
  }
})
async function root() { const value = await mkdtemp(join(tmpdir(), 'sh4-attempt-')); roots.push(value); return value }
const options = (attemptId = 'north-one') => ({ attemptId, runId: randomUUID(), profile: 'NORTH_MINI_CODE_FREE', executionMode: 'OFFLINE' })

it('two sequential attempts keep independent model/scope/time, reservation and atomic result; history is untouched', async () => {
  const directory = await root()
  await mkdir(join(directory, 'out'))
  for (const name of ['sh4-openrouter-live-attempt.json', 'sh4-openrouter-manual-live-result.json']) await writeFile(join(directory, 'out', name), 'HISTORICAL')
  const artifacts = []
  for (const id of ['north-one', 'north-two']) {
    const attempt = await claimAttempt(directory, options(id)), release = await acquireAttemptLock(attempt)
    expect(attempt.manifestValue).toMatchObject({ attemptId: id, model: 'cohere/north-mini-code:free', maximumInferenceRequests: 1,
      approvalReference: id, approvalScope: 'SYNTHETIC_CSHARP_HINT_L1_ONE_INFERENCE', retry: false, timeoutMs: 30000, maxOutputTokens: 2048 })
    expect(Number.isFinite(Date.parse(attempt.manifestValue.recordedAt))).toBe(true)
    await reserveInference(attempt)
    await publishExclusive(attempt.result, { ...attempt.manifestValue, result: 'PASS' })
    artifacts.push(await readFile(attempt.result, 'utf8'))
    await release()
  }
  expect(artifacts[0]).not.toEqual(artifacts[1])
  expect(await readFile(join(directory, 'out/sh4-attempts/offline/north-one/result.json'), 'utf8')).toBe(artifacts[0])
  for (const name of ['sh4-openrouter-live-attempt.json', 'sh4-openrouter-manual-live-result.json']) expect(await readFile(join(directory, 'out', name), 'utf8')).toBe('HISTORICAL')
})

it('simultaneous same-ID claims have one winner; profile changes cannot rebind a claimed approval', async () => {
  const directory = await root(), input = options()
  const claims = await Promise.allSettled(Array.from({ length: 8 }, () => claimAttempt(directory, input)))
  expect(claims.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  await expect(claimAttempt(directory, { ...input, profile: 'FREE_ROUTER' })).rejects.toMatchObject({ code: 'EEXIST' })
})

it('different IDs cannot run concurrently, including after an unclean supervisor death', async () => {
  const directory = await root(), a = await claimAttempt(directory, options('a')), b = await claimAttempt(directory, options('b'))
  const release = await acquireAttemptLock(a)
  await reserveInference(a)
  await expect(acquireAttemptLock(b)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(JSON.parse(await readFile(a.reservation, 'utf8')).delivery).toBe('UNKNOWN')
  await expect(reserveInference(a)).rejects.toMatchObject({ code: 'EEXIST' })
  // Only a normal owned shutdown releases the active lock; never a startup retry.
  await release()
})

it('cross-process duplicate reservation allows exactly one fake dispatch', async () => {
  const directory = await root(), input = options(), attempt = await claimAttempt(directory, input)
  const release = await acquireAttemptLock(attempt)
  const module = new URL('../../scripts/sh4-attempt-store.mjs', import.meta.url).href
  const code = `import {loadAttempt,reserveInference} from ${JSON.stringify(module)};
    try {const a=await loadAttempt(process.argv[1],process.argv[2],'OFFLINE',process.argv[3],'NORTH_MINI_CODE_FREE');await reserveInference(a);process.stdout.write('FAKE_DISPATCH');}
    catch {process.exitCode=2;}`
  const results = await Promise.all(Array.from({ length: 4 }, () => new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, directory, input.attemptId, input.runId], { env: {}, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.on('error', reject); child.on('close', exit => done({ exit, output }))
  })))
  expect(results.filter(r => r.exit === 0 && r.output === 'FAKE_DISPATCH')).toHaveLength(1)
  expect(results.filter(r => r.exit === 2)).toHaveLength(3)
  await release()
})

it('abrupt supervisor-process death leaves UNKNOWN reservation and active lock; neither same-ID nor new-ID restarts dispatch', async () => {
  const directory = await root(), input = options('crashed-supervisor')
  const module = new URL('../../scripts/sh4-attempt-store.mjs', import.meta.url).href
  const code = `import {claimAttempt,acquireAttemptLock,reserveInference} from ${JSON.stringify(module)};
    const a=await claimAttempt(process.argv[1],JSON.parse(process.argv[2]));await acquireAttemptLock(a);await reserveInference(a);process.exit(17);`
  const exit = await new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, directory, JSON.stringify(input)], { env: {}, windowsHide: true, stdio: 'ignore' })
    child.on('error', reject); child.on('close', done)
  })
  expect(exit).toBe(17)
  const reservation = join(directory, 'out/sh4-attempts/offline/crashed-supervisor/reservation.json')
  expect(JSON.parse(await readFile(reservation, 'utf8')).delivery).toBe('UNKNOWN')
  const prepare = vi.fn(), launch = vi.fn(), signals = new EventEmitter()
  expect(await runRunner({ rootPath: directory, ...input, env: {}, signals, prepare, launch })).toMatchObject({ code: 'ATTEMPT_ALREADY_EXISTS' })
  expect(await runRunner({ rootPath: directory, ...options('different-id'), env: {}, signals, prepare, launch })).toMatchObject({ code: 'ATTEMPT_ACTIVE_OR_RECOVERY_REQUIRED', httpRequests: 0 })
  expect(prepare).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled()
  expect(JSON.parse(await readFile(reservation, 'utf8')).delivery).toBe('UNKNOWN')
})

it('atomic result publishes one complete JSON and cannot replace an existing result or publish partial JSON', async () => {
  const directory = await root(), attempt = await claimAttempt(directory, options())
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, value) => publishExclusive(attempt.result, { value, payload: 'x'.repeat(32768) })))
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  const before = await readFile(attempt.result, 'utf8')
  expect(JSON.parse(before).payload).toHaveLength(32768)
  await expect(publishExclusive(attempt.result, { replaced: true })).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(attempt.result, 'utf8')).toBe(before)
  expect((await readdir(attempt.directory)).filter(n => n.endsWith('.tmp'))).toEqual([])
})

it('failed JSON publication leaves no final result and cannot authorize a reservation', async () => {
  const directory = await root(), attempt = await claimAttempt(directory, options())
  const circular = {}; circular.self = circular
  await expect(publishExclusive(attempt.result, circular)).rejects.toThrow()
  await expect(access(attempt.result)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(reserveInference(attempt)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['../escape', 'C:/escape', '', 'con', 'UPPER', 'x'.repeat(65), undefined])('invalid ID %s fails before creating artifacts', async attemptId => {
  const directory = await root()
  await expect(claimAttempt(directory, { ...options(), attemptId })).rejects.toThrow()
  expect(await readdir(directory)).toEqual([])
})

it('Main cannot use a manifest with a different run/model or after lock release', async () => {
  const directory = await root(), input = options(), attempt = await claimAttempt(directory, input), release = await acquireAttemptLock(attempt)
  await expect(loadAttempt(directory, input.attemptId, 'OFFLINE', randomUUID(), input.profile)).rejects.toThrow()
  await expect(loadAttempt(directory, input.attemptId, 'OFFLINE', input.runId, 'FREE_ROUTER')).rejects.toThrow()
  await release()
  await expect(loadAttempt(directory, input.attemptId, 'OFFLINE', input.runId, input.profile)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('child crash after reservation records UNKNOWN, leaves reservation, and rejects relaunch before preparation', async () => {
  const directory = await root(), input = options(), signals = new EventEmitter(), prepare = vi.fn(async () => {})
  const result = await runRunner({ rootPath: directory, ...input, signals, env: {}, prepare, launch: env => {
    const child = new EventEmitter()
    void (async () => {
      const attempt = await loadAttempt(directory, input.attemptId, input.executionMode, env.SH4_RUN_ID, input.profile)
      await reserveInference(attempt)
      child.emit('close', 9, null)
    })()
    return child
  } })
  expect(result).toMatchObject({ code: 'ELECTRON_EXIT_WITHOUT_RESULT', httpDelivery: 'UNKNOWN', inferenceRequests: 'UNKNOWN', inferenceReservation: 'RESERVED' })
  const before = await readFile(join(directory, 'out/sh4-attempts/offline', input.attemptId, 'result.json'), 'utf8')
  const launch = vi.fn()
  expect(await runRunner({ rootPath: directory, ...input, signals, env: {}, prepare, launch })).toMatchObject({ code: 'ATTEMPT_ALREADY_EXISTS' })
  expect(prepare).toHaveBeenCalledOnce(); expect(launch).not.toHaveBeenCalled()
  expect(await readFile(join(directory, 'out/sh4-attempts/offline', input.attemptId, 'result.json'), 'utf8')).toBe(before)
})

it('live CLI without explicit attempt ID exits before history, preparation or credential access', async () => {
  const script = fileURLToPath(new URL('../../scripts/run-smart-hints-openrouter-live.mjs', import.meta.url))
  const result = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [script, '--north-mini-code-free'], { env: {}, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let output = ''; child.stderr.on('data', d => { output += d }); child.on('error', reject); child.on('close', exit => done({ exit, output }))
  })
  expect(result).toMatchObject({ exit: 1, output: expect.stringContaining('requires an explicit --attempt-id') })
})

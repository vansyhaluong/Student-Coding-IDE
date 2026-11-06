import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { runRunner } from '../../scripts/run-smart-hints-gemini-live.mjs'
import { claimAttempt, loadAttempt, acquireAttemptLock, reserveInference, publishExclusive } from '../../scripts/sh4-attempt-store.mjs'

const roots = []
async function root() { const dir = await mkdtemp(join(tmpdir(), 'sh4-gemini-')); roots.push(dir); return dir }
afterEach(async () => { for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true }) })
it('Gemini manifests/reservations are immutable, separate from OpenRouter history and cannot rebind a spent ID', async () => {
  const dir = await root(), runId = randomUUID()
  await mkdir(resolve(dir, 'out/sh4-attempts'), { recursive: true })
  const old = resolve(dir, 'out/sh4-attempts/historical.json'); await writeFile(old, 'HISTORICAL-OPENROUTER')
  const options = { attemptId: 'gemini-offline-test', runId, profile: 'GEMINI_FLASH_LITE', executionMode: 'OFFLINE' }
  const attempt = await claimAttempt(dir, options), release = await acquireAttemptLock(attempt)
  expect(attempt.directory).toBe(resolve(dir, 'out/sh4-gemini-attempts/offline/gemini-offline-test'))
  expect(attempt.manifestValue).toMatchObject({ model: 'gemini-3.1-flash-lite', timeoutMs: 30000, maximumInferenceRequests: 1, retry: false, paidFallback: false })
  await loadAttempt(dir, options.attemptId, 'OFFLINE', runId, options.profile)
  await reserveInference(attempt)
  const reservation = await readFile(attempt.reservation, 'utf8')
  await expect(reserveInference(attempt)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(attempt.reservation, 'utf8')).toBe(reservation)
  await publishExclusive(attempt.result, { ...attempt.manifestValue, result: 'PASS' })
  await expect(loadAttempt(dir, options.attemptId, 'OFFLINE', runId, options.profile)).rejects.toThrow('ATTEMPT_FINISHED')
  await expect(claimAttempt(dir, options)).rejects.toMatchObject({ code: 'EEXIST' })
  await release(); expect(await readFile(old, 'utf8')).toBe('HISTORICAL-OPENROUTER')
})
it('Gemini supervisor timeout terminates only its child and releases timer/listeners/lock', async () => {
  const dir = await root(), signals = new EventEmitter(), terminate = vi.fn(async child => { child.exitCode = 1 }), child = new EventEmitter()
  child.exitCode = null; child.signalCode = null; child.pid = 12345
  const result = await runRunner({ rootPath: dir, env: {}, prepare: async () => {}, launch: () => child, terminate, signals,
    attemptId: 'gemini-timeout', timeoutMs: 30, cleanupMs: 50, pollMs: 5, executionMode: 'OFFLINE' })
  expect(result).toMatchObject({ code: 'RUNNER_TIMEOUT', cleanup: 'TREE_TERMINATED', inferenceRequests: 'UNKNOWN', model: 'gemini-3.1-flash-lite' })
  expect(terminate).toHaveBeenCalledWith(child)
  expect(signals.listenerCount('SIGINT')).toBe(0); expect(signals.listenerCount('SIGTERM')).toBe(0)
  await expect(access(resolve(dir, 'out/sh4-gemini-attempts/offline/active.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('Gemini CLI rejects unapproved live/alternate-model flags without launching Electron', async () => {
  const run = promisify(execFile)
  for (const args of [['--attempt-id', 'unapproved'], ['--live-approved', '--north-mini-code-free', '--attempt-id', 'forbidden']]) {
    await expect(run(process.execPath, [resolve('scripts/run-smart-hints-gemini-live.mjs'), ...args], { env: {}, windowsHide: true })).rejects.toMatchObject({ code: 1 })
  }
})
it('legacy OpenRouter CLI refuses live before creating any attempt or reading a key', async () => {
  const run = promisify(execFile)
  await expect(run(process.execPath, [resolve('scripts/run-smart-hints-openrouter-live.mjs'), '--attempt-id', 'retired-provider'], { env: {}, windowsHide: true })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('OPENROUTER_RETIRED') })
})

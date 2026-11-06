import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { claimAttempt, acquireAttemptLock, reserveInference, publishExclusive } from '../../scripts/sh4-attempt-store.mjs'
import { runOpenRouterSmoke } from '../../scripts/sh4-openrouter-smoke'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.startsWith(join(tmpdir(), 'sh4-workflow-'))) throw Error('UNEXPECTED_CLEANUP_PATH')
    await rm(root, { recursive: true, force: true })
  }
})
it('two complete North attempts use separate real reservations and results with injected offline transport', async () => {
  vi.stubGlobal('fetch', () => { throw Error('REAL_NETWORK_FORBIDDEN') })
  const root = await mkdtemp(join(tmpdir(), 'sh4-workflow-')); roots.push(root)
  const model = 'cohere/north-mini-code:free', pricing = { prompt: '0', completion: '0' }, supported_parameters = ['max_tokens']
  const posts: Request[] = [], first: string[] = []
  const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
  for (const attemptId of ['approved-one', 'approved-two']) {
    const attempt = await claimAttempt(root, { attemptId, runId: randomUUID(), executionMode: 'OFFLINE', profile: 'NORTH_MINI_CODE_FREE' })
    const release = await acquireAttemptLock(attempt)
    try {
      const result = await runOpenRouterSmoke({ electronMainDevelopment: true, modelProfile: 'NORTH_MINI_CODE_FREE',
        readKey: () => 'SYNTHETIC-ONLY-ATTEMPT-TEST', confirm: async () => true,
        reserve: () => reserveInference(attempt), send: async request => {
          if (request.method === 'GET') {
            if (request.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 1 } } })
            if (request.url.endsWith('/models')) return json({ data: [{ id: model, pricing, supported_parameters }] })
            if (request.url.endsWith('/endpoints')) return json({ data: { id: model, endpoints: [{ status: 0, pricing, supported_parameters }] } })
            throw Error('UNEXPECTED_ROUTE')
          }
          const reservation = JSON.parse(await readFile(attempt.reservation, 'utf8'))
          expect(reservation).toMatchObject({ attemptId, model, delivery: 'UNKNOWN' })
          expect(await request.clone().json()).toMatchObject({ model, provider: { allow_fallbacks: false, max_price: { prompt: 0, completion: 0, request: 0 } }, max_tokens: 2048 })
          posts.push(request)
          return json({ model, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ kind: 'HINT', level: 1,
            paragraphs: ['Compare the returned value to the public examples.'], nextQuestion: 'What changes?', evidence: [] }) } }] })
        } })
      expect(result).toMatchObject({ result: 'PASS', inferenceRequests: 1, schemaValidation: 'PASS' })
      await publishExclusive(attempt.result, { ...attempt.manifestValue, ...result })
      await expect(reserveInference(attempt)).rejects.toMatchObject({ code: 'EEXIST' })
      first.push(await readFile(attempt.result, 'utf8'))
    } finally { await release() }
  }
  expect(posts).toHaveLength(2)
  expect(await readFile(join(root, 'out/sh4-attempts/offline/approved-one/result.json'), 'utf8')).toBe(first[0])
  expect(first[0]).not.toBe(first[1])
})

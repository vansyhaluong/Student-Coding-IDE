/* global __dirname, fetch */
import { app } from 'electron'
import process from 'node:process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runOpenRouterSmoke } from './sh4-openrouter-smoke'
import { NORTH_MINI_CODE_FREE_MODEL, OPENROUTER_FREE_MODEL } from '../src/main/services/learning/smart-hints/openrouter-provider'
import { loadAttempt, publishExclusive, reserveInference, type Attempt } from './sh4-attempt-store.mjs'
import { showRunnerConsent, type ConsentWindowState } from './sh4-consent-window'

// Isolated Electron Main entry. Never imported by src/main/index.ts or Renderer.
const root = resolve(__dirname, '../../../..')
const runId = process.env.SH4_RUN_ID
const offline = process.env.SH4_OFFLINE_CHECK === '1'
const attemptId = process.env.SH4_ATTEMPT_ID
let attempt: Attempt | undefined
const modelProfile = process.env.SH4_MODEL_PROFILE === 'NORTH_MINI_CODE_FREE' ? 'NORTH_MINI_CODE_FREE' : 'FREE_ROUTER'
const selectedModel = modelProfile === 'NORTH_MINI_CODE_FREE' ? NORTH_MINI_CODE_FREE_MODEL : OPENROUTER_FREE_MODEL
let sequence = 0
const consentWindows: ConsentWindowState[] = []
const validRun = typeof runId === 'string' && /^[a-f0-9-]{36}$/.test(runId)
let lastEvidence: Record<string, unknown> = { httpRequests: 'UNKNOWN', inferenceRequests: 'UNKNOWN', httpDelivery: 'UNKNOWN' }
async function persist(evidence: Record<string, unknown>, finished = false): Promise<void> {
  if (!validRun || !attempt) throw new Error('SUPERVISOR_REQUIRED')
  // Main publishes immutable snapshots. Only the supervisor publishes the single final result.
  const destination = resolve(attempt.directory, `progress-${runId}-${++sequence}.json`)
  const value = { ...evidence, ...attempt.manifestValue, runId, sequence, consentWindows: [...consentWindows], runnerState: finished ? 'FINISHED' : 'RUNNING',
    updatedAt: new Date().toISOString(), executionMode: offline ? 'OFFLINE' : 'LIVE', productionEnabled: false, retry: false, paidFallback: false }
  await publishExclusive(destination, value)
  lastEvidence = value
}
async function main(): Promise<void> {
  if (!validRun || !attemptId || process.env.SH4_EXECUTION_MODE !== (offline ? 'OFFLINE' : 'LIVE')) { app.exit(1); return }
  attempt = await loadAttempt(root, attemptId, offline ? 'OFFLINE' : 'LIVE', runId, modelProfile)
  if (process.type !== 'browser' || app.isPackaged || process.argv.some(arg => /^--(?:inspect|remote-debugging-port)(?:=|$)/.test(arg))) {
    await persist({ ...lastEvidence, result: 'STOP', code: 'ELECTRON_MAIN_DEVELOPMENT_REQUIRED' }, true)
    app.exit(1); return
  }
  await persist({ ...lastEvidence, result: 'STOP', code: 'MAIN_STARTING', stage: 'MAIN_STARTING' })
  const userData = resolve(attempt.directory, 'user-data')
  await persist({ ...lastEvidence, stage: 'USER_DATA_CREATING' })
  await mkdir(userData, { recursive: true })
  await persist({ ...lastEvidence, stage: 'USER_DATA_CONFIGURING' })
  app.setPath('userData', userData)
  await persist({ ...lastEvidence, stage: 'ELECTRON_READY_WAIT' })
  await app.whenReady()
  // Closing a consent window must settle the workflow, not implicitly quit Main
  // before its final evidence is published or between the two consent steps.
  app.on('window-all-closed', () => {})
  const json = (data: unknown) => new globalThis.Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  const offlineSend = async (request: Request): Promise<Response> => {
    // Entirely synthetic; no fetch or real credential loading; reservation is isolated under offline/.
    if (request.method === 'GET' && request.url === 'https://openrouter.ai/api/v1/key') return json({ data: {
      is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 1 } } })
    if (request.method === 'GET' && request.url === 'https://openrouter.ai/api/v1/models') return json({ data: [{
      id: selectedModel, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] }] })
    if (request.method === 'GET' && request.url === 'https://openrouter.ai/api/v1/models/cohere/north-mini-code:free/endpoints') return json({ data: { id: selectedModel, endpoints: [{ status: 0, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] }] } })
    if (request.method !== 'POST' || request.url !== 'https://openrouter.ai/api/v1/chat/completions') throw new Error('OFFLINE_ROUTE_DENIED')
    return json({ model: modelProfile === 'NORTH_MINI_CODE_FREE' ? selectedModel : 'synthetic/offline:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant',
      content: JSON.stringify({ kind: 'HINT', thinking: 'Compare the return value with the public examples.', steps: ['Return the required value.'], code: { language: 'csharp', text: 'return x + 1;' }, evidence: [] }) } }] })
  }
  const evidence = await runOpenRouterSmoke({ electronMainDevelopment: !app.isPackaged, modelProfile,
    readKey: offline ? () => 'SYNTHETIC-ONLY-OFFLINE-SMOKE' : () => process.env.OPENROUTER_API_KEY,
    send: offline ? offlineSend : request => fetch(request), // Live network only in the explicit live branch.
    progress: evidence => persist({ ...evidence }),
    confirm: (stage, details, signal) => showRunnerConsent({ stage, details: `Attempt: ${attempt!.manifestValue.attemptId}. Recorded: ${attempt!.manifestValue.recordedAt}. Scope: ${attempt!.manifestValue.approvalScope}.\n${details}`, signal, offline, onShown: async state => {
      consentWindows.push(state)
      await persist({ ...lastEvidence })
    } }),
    reserve: () => reserveInference(attempt!) })
  await persist({ ...evidence }, true)
  app.exit(evidence.result === 'PASS' ? 0 : 1)
}
void main().catch(async error => {
  // Fixed categories only; never write exception messages, stacks or environment.
  const categories = ['EACCES', 'EPERM', 'EBUSY', 'ENOENT', 'ERR_INVALID_ARG_TYPE']
  const failureCategory = categories.includes(error?.code) ? error.code : 'NATIVE_OR_UNKNOWN'
  try { await persist({ ...lastEvidence, result: 'STOP', code: 'MAIN_FAILED', lastStage: lastEvidence.stage, failureCategory }, true) }
  catch {
    try { if (attempt) await publishExclusive(resolve(attempt.directory, `failure-${runId}.json`), {
      ...attempt.manifestValue, runId, code: 'MAIN_FAILED', lastStage: lastEvidence.stage, failureCategory,
      result: 'STOP', runnerState: 'FINISHED', executionMode: offline ? 'OFFLINE' : 'LIVE',
      httpRequests: 'UNKNOWN', inferenceRequests: 'UNKNOWN', httpDelivery: 'UNKNOWN' }) }
    catch { process.stderr.write('SH-4 STOP: result persistence failed; no retry.\n') }
  }
  app.exit(1)
})

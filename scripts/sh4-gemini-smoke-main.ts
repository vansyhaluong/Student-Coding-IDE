/* global __dirname, fetch */
import { app, BrowserWindow } from 'electron'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runGeminiSmoke } from './sh4-gemini-smoke'
import { GEMINI_MODEL, GEMINI_MODEL_URL, GEMINI_GENERATE_URL } from '../src/main/services/learning/smart-hints/gemini-provider'
import { loadAttempt, publishExclusive, reserveInference, type Attempt } from './sh4-attempt-store.mjs'
import { showRunnerConsent, type ConsentWindowState } from './sh4-consent-window'

const root = resolve(__dirname, '../../../..'), runId = process.env.SH4_RUN_ID, attemptId = process.env.SH4_ATTEMPT_ID
const offline = process.env.SH4_OFFLINE_CHECK === '1'
const automate = offline && process.env.SH4_GEMINI_OFFLINE_SMOKE === '1'
let attempt: Attempt | undefined, sequence = 0
const consentWindows: ConsentWindowState[] = [], checks: string[] = []
let lastEvidence: Record<string, unknown> = { httpRequests: 'UNKNOWN', inferenceRequests: 'UNKNOWN', httpDelivery: 'UNKNOWN' }
const check = (condition: boolean, name: string) => { if (!condition) throw new Error('OFFLINE_CHECK_FAILED'); checks.push(name) }
async function persist(evidence: Record<string, unknown>, finished = false) {
  if (!attempt || !runId) throw new Error('SUPERVISOR_REQUIRED')
  const value = { ...evidence, ...attempt.manifestValue, provider: 'GOOGLE_GEMINI', runId, sequence: ++sequence,
    consentWindows: [...consentWindows], checks: [...checks], runnerState: finished ? 'FINISHED' : 'RUNNING',
    executionMode: offline ? 'OFFLINE' : 'LIVE', ...(offline ? { realHttpRequests: 0 } : {}),
    productionEnabled: false, retry: false, paidFallback: false }
  await publishExclusive(resolve(attempt.directory, `progress-${runId}-${sequence}.json`), value)
  lastEvidence = value
}
async function main() {
  if (!runId || !/^[a-f0-9-]{36}$/.test(runId) || !attemptId || process.env.SH4_EXECUTION_MODE !== (offline ? 'OFFLINE' : 'LIVE')) { app.exit(1); return }
  attempt = await loadAttempt(root, attemptId, offline ? 'OFFLINE' : 'LIVE', runId, 'GEMINI_FLASH_LITE')
  if (process.type !== 'browser' || app.isPackaged || !offline && process.env.SH4_GEMINI_LIVE_APPROVED !== '1'
    || process.argv.some(a => /^--(?:inspect|remote-debugging-port)(?:=|$)/.test(a))) { app.exit(1); return }
  const userData = resolve(attempt.directory, 'user-data')
  await mkdir(userData, { recursive: true }); app.setPath('userData', userData)
  await app.whenReady(); app.on('window-all-closed', () => {})
  const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  if (offline) globalThis.fetch = async () => { throw new Error('REAL_NETWORK_FORBIDDEN') }
  const offlineSend = async (request: Request) => {
    check(request.headers.get('x-goog-api-key') === 'SYNTHETIC-ONLY-GEMINI-OFFLINE', 'synthetic header credential')
    check(!request.url.includes('?') && request.redirect === 'error', 'fixed route/no query key/no redirects')
    if (request.method === 'GET' && request.url === GEMINI_MODEL_URL) return json({ name: `models/${GEMINI_MODEL}`, supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 })
    check(request.method === 'POST' && request.url === GEMINI_GENERATE_URL, 'only Gemini inference endpoint')
    const body = await request.json()
    check(body.generationConfig.responseMimeType === 'application/json' && !!body.generationConfig.responseJsonSchema
      && body.generationConfig.maxOutputTokens === 2048 && !body.tools, 'structured output/budget/no tools')
    return json({ modelVersion: GEMINI_MODEL, candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ kind: 'HINT', thinking: 'Compare the return value with the public examples.', steps: ['Return the required value.'], code: { language: 'csharp', text: 'return x + 1;' }, evidence: [] }) }] } }], usageMetadata: { candidatesTokenCount: 30, thoughtsTokenCount: 0 } })
  }
  const evidence = await runGeminiSmoke({ electronMainDevelopment: true, liveApproved: offline || process.env.SH4_GEMINI_LIVE_APPROVED === '1',
    readKey: offline ? () => 'SYNTHETIC-ONLY-GEMINI-OFFLINE' : () => process.env.GEMINI_API_KEY,
    send: offline ? offlineSend : request => fetch(request), progress: value => persist({ ...value }),
    reserve: () => reserveInference(attempt!),
    confirm: (stage, details, signal) => showRunnerConsent({ provider: 'GEMINI', stage,
      details: `Attempt: ${attemptId}.\n${details}`, signal, offline,
      onShown: async state => {
        consentWindows.push(state); await persist({ ...lastEvidence })
        if (!automate) return
        check(state.visible && state.focused && !state.minimized && state.taskbar, `${stage}: visible focused taskbar consent`)
        const window = BrowserWindow.getAllWindows().find(w => w.getTitle().includes(`SH-4 OFFLINE`) && w.getTitle().includes(stage))
        check(!!window, `${stage}: consent window exists`)
        const safe = await window!.webContents.executeJavaScript(`typeof require === 'undefined' && typeof process === 'undefined' && document.activeElement?.textContent === 'Cancel' && document.body.textContent.includes('gemini-3.1-flash-lite')`)
        check(safe === true, `${stage}: no Node/Cancel default/model disclosed`)
        await writeFile(resolve(attempt!.directory, `consent-${stage.toLowerCase()}.png`), (await window!.webContents.capturePage()).toPNG())
        // Only this explicit OFFLINE test branch drives buttons. Live always waits for the user.
        setTimeout(() => { if (!window!.isDestroyed()) void window!.webContents.executeJavaScript(`document.querySelector('button.confirm').click()`).catch(() => {}) }, 0)
      } }) })
  if (automate) check(evidence.result === 'PASS' && evidence.httpRequests === 2 && evidence.inferenceRequests === 1
    && consentWindows.length === 2 && BrowserWindow.getAllWindows().length === 0, 'offline end-to-end: one inference/two consents/no windows leaked')
  await persist({ ...evidence }, true)
  app.exit(evidence.result === 'PASS' ? 0 : 1)
}
void main().catch(async () => {
  try { await persist({ ...lastEvidence, result: 'STOP', code: 'MAIN_FAILED' }, true) }
  catch { process.stderr.write('SH-4 Gemini STOP: evidence persistence failed; no retry.\n') }
  app.exit(1)
})

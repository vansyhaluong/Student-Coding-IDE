/* global __dirname */
// Explicit offline GUI integration suite. Never imported by live Main.
import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { showRunnerConsent, type ConsentWindowState } from './sh4-consent-window'
import { NORTH_MINI_CODE_FREE_MODEL, OPENROUTER_FREE_MODEL } from '../src/main/services/learning/smart-hints/openrouter-provider'
import { loadAttempt, publishExclusive, reserveInference, type Attempt } from './sh4-attempt-store.mjs'
import { runOpenRouterSmoke } from './sh4-openrouter-smoke'

const root = resolve(__dirname, '../../../..'), runId = process.env.SH4_RUN_ID
let attempt: Attempt | undefined
const modelProfile = process.env.SH4_MODEL_PROFILE === 'NORTH_MINI_CODE_FREE' ? 'NORTH_MINI_CODE_FREE' : 'FREE_ROUTER'
const selectedModel = modelProfile === 'NORTH_MINI_CODE_FREE' ? NORTH_MINI_CODE_FREE_MODEL : OPENROUTER_FREE_MODEL
const checks: { name: string; pass: boolean }[] = []
const windows: ConsentWindowState[] = []
const check = (name: string, pass: boolean) => { checks.push({ name, pass }); if (!pass) throw new Error('OFFLINE_CHECK_FAILED') }
async function publish(pass: boolean) {
  const path = resolve(attempt!.directory, `progress-${runId}-1.json`)
  await publishExclusive(path, { ...attempt!.manifestValue, runId, executionMode: 'OFFLINE', runnerState: 'FINISHED',
    result: pass ? 'PASS' : 'FAIL', code: pass ? 'OFFLINE_CONSENT_TESTS_COMPLETE' : 'OFFLINE_CONSENT_TESTS_FAILED',
    checks, consentWindows: windows, productionEnabled: false, retry: false, paidFallback: false,
    realHttpRequests: 0 })
}
async function main() {
  if (!runId || !/^[a-f0-9-]{36}$/.test(runId) || process.env.SH4_OFFLINE_CHECK !== '1' || app.isPackaged) { app.exit(1); return }
  if (!process.env.SH4_ATTEMPT_ID) { app.exit(1); return }
  attempt = await loadAttempt(root, process.env.SH4_ATTEMPT_ID, 'OFFLINE', runId, modelProfile)
  const userData = resolve(attempt.directory, 'consent-test-user-data')
  await mkdir(userData, { recursive: true }); app.setPath('userData', userData)
  await app.whenReady(); app.on('window-all-closed', () => {})
  // Defense in depth: no live fetch can be used by this test entry.
  globalThis.fetch = async () => { throw new Error('REAL_NETWORK_FORBIDDEN') }
  const json = (value: unknown) => new globalThis.Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
  const cases = ['CONFIRM_BOTH', 'CANCEL_PREFLIGHT', 'CANCEL_SNAPSHOT', 'CLOSE_PREFLIGHT', 'TIMEOUT_PREFLIGHT'] as const
  for (const name of cases) {
    let calls = 0, reserved = 0
    const startedAt = Date.now()
    const result = await runOpenRouterSmoke({ electronMainDevelopment: true, modelProfile, readKey: () => 'SYNTHETIC-ONLY-OFFLINE-GUI',
      send: async request => {
        calls++
        if (request.url.endsWith('/key')) return json({ data: { is_free_tier: true, limit_remaining: null, free_model_daily_requests: { remaining: 1 } } })
        if (request.url.endsWith('/models')) return json({ data: [{ id: selectedModel, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] }] })
        if (request.url.endsWith('/endpoints')) return json({ data: { id: selectedModel, endpoints: [{ status: 0, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['max_tokens'] }] } })
        if (request.method !== 'POST' || request.url !== 'https://openrouter.ai/api/v1/chat/completions') throw new Error('OFFLINE_ROUTE_DENIED')
        return json({ model: modelProfile === 'NORTH_MINI_CODE_FREE' ? selectedModel : 'synthetic/offline:free', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ kind: 'HINT', thinking: 'Compare the return value with the public examples.', steps: ['Return the required value.'], code: { language: 'csharp', text: 'return x + 1;' }, evidence: [] }) } }] })
      }, reserve: async () => { reserved++; check(`${name}: at most one synthetic reservation`, reserved === 1); await reserveInference(attempt!) },
      confirm: (stage, details, signal) => showRunnerConsent({ stage, details, signal, offline: true, onShown: async state => {
        check(`${name}/${stage}: selected model disclosed`, details.includes(selectedModel))
        windows.push(state)
        check(`${name}/${stage}: visible and focused taskbar window`, state.visible && state.focused && !state.minimized && state.taskbar)
        const candidates = BrowserWindow.getAllWindows().filter(window => window.getTitle().includes(`SH-4 OFFLINE`) && window.getTitle().includes(stage))
        check(`${name}/${stage}: one matching window`, candidates.length === 1)
        const window = candidates[0]
        const page = await window.webContents.executeJavaScript(`({ cancelFocused: document.activeElement?.textContent === 'Cancel',
          buttons: [...document.querySelectorAll('button')].map(button => button.textContent), noNode: typeof require === 'undefined' && typeof process === 'undefined',
          offline: document.body.textContent.includes('OFFLINE TEST'), scrollable: document.querySelector('main').clientHeight > 0 })`)
        check(`${name}/${stage}: Cancel default, two buttons, no Node, offline label`, page.cancelFocused && page.buttons.length === 2 && page.noNode && page.offline && page.scrollable)
        if (name === 'CONFIRM_BOTH') {
          const image = await window.webContents.capturePage()
          await writeFile(resolve(attempt!.directory, `consent-${stage.toLowerCase()}.png`), image.toPNG())
        }
        if (name === 'TIMEOUT_PREFLIGHT') return // Actual unchanged 60s workflow deadline, no input.
        if (name === 'CLOSE_PREFLIGHT') { window.close(); return }
        const cancel = name === 'CANCEL_PREFLIGHT' || (name === 'CANCEL_SNAPSHOT' && stage === 'SNAPSHOT')
        // Test-only DOM input in actual Electron. Live/offline interactive entry never clicks itself.
        await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(cancel ? 'button:not(.confirm)' : 'button.confirm')}).click()`)
      } }) })
    check(`${name}: all windows disposed`, BrowserWindow.getAllWindows().length === 0)
    if (name === 'CONFIRM_BOTH') check(`${name}: fake flow complete`, result.result === 'PASS' && calls === (modelProfile === 'NORTH_MINI_CODE_FREE' ? 4 : 3) && reserved === 1)
    else if (name === 'CANCEL_SNAPSHOT') check(`${name}: no inference`, result.code === 'CONSENT_CANCELLED' && calls === (modelProfile === 'NORTH_MINI_CODE_FREE' ? 3 : 2) && reserved === 0)
    else if (name === 'TIMEOUT_PREFLIGHT') check(`${name}: 60s timeout and no dispatch`, result.code === 'PREFLIGHT_CONSENT_TIMEOUT' && Date.now() - startedAt >= 60000 && calls === 0 && reserved === 0)
    else check(`${name}: no dispatch`, result.code === 'CONSENT_CANCELLED' && calls === 0 && reserved === 0)
  }
  await publish(true); app.exit(0)
}
void main().catch(async () => { try { await publish(false) } finally { app.exit(1) } })

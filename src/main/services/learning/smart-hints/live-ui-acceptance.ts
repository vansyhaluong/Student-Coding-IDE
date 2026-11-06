import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SmartHintsService } from './service'
import { GeminiSmartHintsAdapter, geminiKeyState, GEMINI_MODEL, GEMINI_SMOKE_TIMEOUT_MS } from './gemini-provider'
import { SmartProviderError } from './adapter'
import type { ProviderTransport } from '../analysis/contracts'

export const LIVE_UI_SAMPLES = {
  csharp: 'public class Solution\n{\n    public int Sum(int a, int b)\n    {\n        return a + 0;\n    }\n}\n',
  javascript: 'function Sum(a, b) {\n    return a + 0;\n}\n',
} as const
export interface LiveUiApproval { id: string; budget: number; project: string }
type LiveUiNotice = 'SH4_UI_DISABLED' | 'SH4_UI_READY' | 'SH4_UI_INFERENCE_RESERVED'
  | 'SH4_UI_APPROVAL_INVALID' | 'SH4_UI_APPROVAL_CANCELLED' | 'SH4_UI_APPROVAL_ALREADY_USED'
  | 'SH4_UI_APPROVAL_IO_FAILED' | 'SH4_UI_KEY_MISSING' | 'SH4_UI_KEY_FORMAT_INVALID'
  | 'SH4_UI_BUDGET_EXHAUSTED' | 'SH4_UI_APPROVAL_EXPIRED'
const switches = ['--sh4-live-ui', '--live-ui-approved', '--free-tier-confirmed', '--samples-only-confirmed']
/** Dedicated launcher argv only; environment variables never authorize this mode. */
export function liveUiApproval(argv: readonly string[]): LiveUiApproval | undefined {
  if (!argv.includes('--sh4-live-ui')) return undefined
  const args = argv.slice(argv.indexOf('--sh4-live-ui'))
  const allowed = [...switches, '--approval-id', '--budget', '--project-id']
  const values = new Map<string, string>()
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!allowed.includes(name) || values.has(name)) throw Error('SH4_UI_GATE_INVALID')
    if (switches.includes(name)) values.set(name, 'true')
    else {
      const value = args[++i]
      if (!value || value.startsWith('--')) throw Error('SH4_UI_GATE_INVALID')
      values.set(name, value)
    }
  }
  const id = values.get('--approval-id') ?? '', project = values.get('--project-id') ?? '', raw = values.get('--budget') ?? ''
  if (switches.some(name => !values.has(name)) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)
    || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^(?:[1-9]|[12][0-9]|30)$/.test(raw)) throw Error('SH4_UI_GATE_INVALID')
  return { id, project, budget: Number(raw) }
}
export interface LiveUiOptions {
  development: boolean; argv: readonly string[]; evidenceRoot: string
  readKey(): string | undefined
  confirm(approval: LiveUiApproval): Promise<boolean>
  transport?: ProviderTransport
  clock?: () => number
  notice?(code: LiveUiNotice): void
}
/** Main-only provisioning. Approval is one launch, <=30 minutes, no refund/reuse. */
export async function createLiveUiAcceptance(options: LiveUiOptions): Promise<SmartHintsService | undefined> {
  if (!options.development) return undefined // Before argv, filesystem, dialog or secret access.
  let approval: LiveUiApproval | undefined
  try { approval = liveUiApproval(options.argv) }
  catch (error) { options.notice?.('SH4_UI_APPROVAL_INVALID'); throw error }
  if (!approval) return undefined
  if (!await options.confirm(approval)) { options.notice?.('SH4_UI_APPROVAL_CANCELLED'); return new SmartHintsService() }
  const clock = options.clock ?? Date.now, expiresAt = clock() + 30 * 60000
  const directory = join(options.evidenceRoot, approval.id)
  try {
    await mkdir(directory, { recursive: true })
    // Atomic ownership: a second launch with the same ID cannot renew the budget.
    await writeFile(join(directory, 'approval.json'), JSON.stringify({ ...approval, model: GEMINI_MODEL,
      expiresAt, timeoutMs: GEMINI_SMOKE_TIMEOUT_MS, maxOutputTokens: 2048,
      sampleExercise: 'ch2-01', freeTierAttested: true, samplesOnlyAttested: true, productionEnabled: false }), { flag: 'wx' })
  } catch (error) {
    options.notice?.(error !== null && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'
      ? 'SH4_UI_APPROVAL_ALREADY_USED' : 'SH4_UI_APPROVAL_IO_FAILED')
    throw error // Main catches without logging the Node error or its paths.
  }
  let key = options.readKey() ?? ''
  const keyState = geminiKeyState(key)
  if (keyState !== 'VALID') {
    key = ''; options.notice?.(keyState === 'KEY_MISSING' ? 'SH4_UI_KEY_MISSING' : 'SH4_UI_KEY_FORMAT_INVALID')
    options.notice?.('SH4_UI_DISABLED'); return new SmartHintsService()
  }
  let reserved = 0, stopped = false
  const budget = approval.budget
  const check = () => {
    if (stopped) throw new SmartProviderError('RATE_LIMIT')
    if (clock() >= expiresAt || reserved >= budget) {
      options.notice?.(clock() >= expiresAt ? 'SH4_UI_APPROVAL_EXPIRED' : 'SH4_UI_BUDGET_EXHAUSTED')
      throw new SmartProviderError('RATE_LIMIT')
    }
  }
  const adapter = new GeminiSmartHintsAdapter(options.transport ?? { send: request => fetch(request) },
    { value: () => key, clear: () => { key = '' } }, { timeoutMs: GEMINI_SMOKE_TIMEOUT_MS,
      beforeInference: async signal => {
        check(); if (signal.aborted) throw new SmartProviderError('TIMEOUT')
        const slot = ++reserved // Never refund, including ambiguous/cancelled delivery or write failure.
        await writeFile(join(directory, `inference-${slot}.json`), JSON.stringify({ slot, reservedAt: clock() }), { flag: 'wx' })
        if (signal.aborted || stopped || clock() >= expiresAt) throw new SmartProviderError('TIMEOUT')
        options.notice?.('SH4_UI_INFERENCE_RESERVED')
      } })
  options.notice?.('SH4_UI_READY')
  return new SmartHintsService({ mode: 'GEMINI_FREE', dispose: () => { stopped = true; adapter.dispose() },
    run: async (capture, hints, signal) => {
      check()
      const source = capture.source.replace(/\r\n/g, '\n'), sample = LIVE_UI_SAMPLES[capture.binding.language]
      if (capture.binding.exerciseId !== 'ch2-01' || capture.binding.origin.kind !== 'PRACTICE'
        || (source !== sample && source !== sample.replace('a + 0', 'a + b'))) throw new SmartProviderError('INVALID_INPUT')
      return adapter.run(capture, hints, signal)
    } }, clock, undefined, { timeoutMs: GEMINI_SMOKE_TIMEOUT_MS })
}

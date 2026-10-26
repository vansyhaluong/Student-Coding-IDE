import { writeFile } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { nativePilot, retryRetainedPilot, type PilotReceipt } from '../fixtures/learning/official-runtime/pilot-native'
import { PILOT_IDS, FAULTS, SOLUTIONS } from '../fixtures/learning/official-runtime/pilot-solutions'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_OFFICIAL_PILOT_LIVE === '1'
const pairs = PILOT_IDS.flatMap(id => (['csharp', 'javascript'] as const).map(language => ({ id, language })))
async function record(receipt: PilotReceipt, assertion: () => void) {
  try { assertion(); receipt.assertion = 'PASS' }
  catch (error) { receipt.assertion = 'FAIL'; receipt.assertionError = String(error); throw error }
  finally {
    await writeFile(`out/e3-s5/native/${receipt.id}-${receipt.language}-${receipt.mode}.json`, JSON.stringify(receipt, null, 2))
    console.log(`[S5] ${receipt.id}/${receipt.language}/${receipt.mode}: ${receipt.assertion}; cases=${receipt.result?.cases.length ?? receipt.publicResult?.csharp?.result.cases.length ?? receipt.publicResult?.javascript?.result.cases.length ?? 0}; raw=${receipt.rawBytes}; ms=${receipt.elapsedMs?.toFixed(0)}`)
  }
}
function common(r: PilotReceipt) {
  expect(r.errors).toEqual([]); expect(r.violations).toEqual([]); expect(r.retained).not.toBe(true)
  expect(r.ledger).toMatchObject({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
  expect(r.jobs.every(j => j.releases === 1 && j.closes === 1 && j.coverageComplete)).toBe(true)
  expect(new Set(r.jobs.map(j => `${j.pid}:${j.created}`)).size).toBe(r.jobs.length)
  expect(r.phases.filter(p => p.phase === 'prepare')).toHaveLength(1)
  expect(r.phases.filter(p => p.phase === 'compile')).toHaveLength(1)
  expect(new Set(r.phases.map(p => p.operationDeadline)).size).toBe(1)
  for (const p of r.phases) {
    const budget = p.phase === 'prepare' ? 10000 : p.phase === 'compile' ? 30000 : 2000
    expect(p.remainingAtEntryMs).toBeGreaterThan(0); expect(p.remainingAtEntryMs).toBeLessThanOrEqual(budget)
    expect(p.deadline).toBeLessThanOrEqual(p.operationDeadline)
  }
}
describe.skipIf(!enabled)('S5 exact eight-ID Official Runtime pilot, real complete sets', () => {
  afterAll(async () => { await retryRetainedPilot() })
  it.each(pairs)('$id/$language completes its full frozen set once with exact actuals and VERIFIED cleanup', async ({ id, language }) => {
    const { receipt: r, judge } = await nativePilot(id, language)
    await record(r, () => {
      common(r)
      expect(r.result).toMatchObject({ disposition: 'EXHAUSTED', planAcquired: true, failure: null, endReason: 'COMPLETED',
        cleanup: { proof: 'VERIFIED', cleanupComplete: true, processClean: true, pendingIo: false } })
      expect(r.result!.cases.map(c => c.kind === 'RETURNED' ? c.actual : c.kind)).toEqual(judge.cases.map(c => c.expected))
      expect(r.result!.notRunCaseIndices).toEqual([])
      expect(r.seen).toEqual(judge.cases.map((_c, i) => i)); expect(r.requests.map(c => c.caseIndex)).toEqual(r.seen)
      expect(r.jobs.filter(j => j.phase === 'execute')).toHaveLength(judge.cases.length)
      expect(r.jobs.filter(j => j.phase === 'compile')).toHaveLength(1)
      expect(r.jobs.filter(j => j.phase === 'probe')).toHaveLength(language === 'javascript' ? 1 : 0)
      expect(r.barriers).toBe(judge.cases.length + (language === 'javascript' ? 2 : 1))
      expect(r.rawBytes).toBeLessThanOrEqual(1024 ** 2)
      expect(Buffer.byteLength(JSON.stringify(r.result))).toBeLessThan(1024 ** 2)
      expect(r.executionMs).toBeLessThan(60000); expect(r.snapshotCount).toBe(0)
    })
  }, 80_000)
  it.each((['csharp', 'javascript'] as const).flatMap(language => FAULTS.map(fault => ({ language, fault }))))('$language/$fault keeps truthful failure/STOP, suffix and cleanup', async ({ language, fault }) => {
    const { receipt: r, judge } = await nativePilot('ch2-04', language, { fault })
    await record(r, () => {
      common(r)
      expect(r.result).toMatchObject({ planAcquired: true, cleanup: { proof: 'VERIFIED', cleanupComplete: true, pendingIo: false } })
      expect(r.snapshotCount).toBe(0)
      const result = r.result!, attempted = fault === 'compile-syntax' ? 0 : fault === 'output' ? 2 : 1
      expect(result.cases).toHaveLength(attempted)
      expect(result.notRunCaseIndices).toEqual(judge.cases.slice(attempted).map((_c, i) => i + attempted))
      expect(r.jobs.filter(j => j.phase === 'execute')).toHaveLength(attempted)
      if (fault === 'stop') {
        expect(result).toMatchObject({ disposition: 'CONSUMER_STOP', failure: null, endReason: 'COMPLETED' }); expect(r.seen).toEqual([0])
      } else if (fault === 'hook-throw') {
        expect(result).toMatchObject({ disposition: 'EXECUTION_FAILURE', endReason: 'INTERNAL_ERROR', failure: { kind: 'INFRASTRUCTURE_FAILURE', phase: 'cleanup' }, cases: [{ kind: 'RETURNED' }] })
      } else if (fault === 'compile-syntax') {
        expect(result.compile?.status).toBe('FAILED')
        expect(result.failure?.kind).toBe(language === 'csharp' ? 'COMPILE_ERROR' : 'SYNTAX_ERROR'); expect(r.seen).toEqual([])
      } else if (fault === 'cancel') {
        expect(result).toMatchObject({ disposition: 'INVALIDATED', endReason: 'CONTEXT_CHANGED', cases: [{ kind: 'INTERRUPTED', reason: 'CANCELLED' }] })
      } else if (fault === 'timeout' || fault === 'output') {
        expect(result.cases.at(-1)).toMatchObject({ kind: 'INTERRUPTED', reason: fault === 'timeout' ? 'TIMEOUT' : 'OUTPUT_LIMIT' })
        expect(result.endReason).toBe(fault === 'timeout' ? 'EXECUTE_TIMEOUT' : 'OUTPUT_LIMIT')
      } else {
        expect(result.cases[0].kind).toBe(fault === 'protocol' ? 'PROTOCOL_FAILURE' : fault === 'user' ? 'USER_EXCEPTION' : 'INVALID_RESULT')
        expect(r.seen).toEqual([])
        if (fault !== 'protocol') expect(result.cases[0].process?.exitCode).toBe(language === 'csharp' ? 0 : 1)
      }
    })
  }, 80_000)
  it.each(['csharp', 'javascript'] as const)('%s public Run still uses the public two-sample binding after pilot composition', async language => {
    expect(SOLUTIONS['ch2-04'][language]).toBeTruthy()
    const { receipt: r, judge } = await nativePilot('ch2-04', language, { publicRun: true })
    await record(r, () => {
      common(r)
      const result = language === 'csharp' ? r.publicResult!.csharp!.result : r.publicResult!.javascript!.result
      expect(result.cases.map(c => c.actual)).toEqual(judge.cases.slice(0, 2).map(c => c.expected))
      expect(result.failure).toBeNull(); expect(result.notRunCaseIndices).toEqual([])
      expect(r.publicResult!.cleanup).toMatchObject({ proof: 'VERIFIED', cleanupComplete: true }); expect(r.snapshotCount).toBeGreaterThan(0)
    })
  }, 80_000)
})

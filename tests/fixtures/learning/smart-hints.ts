import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import type { SmartPrepare, SmartOutput, SmartStatus, SmartStart } from '../../../src/shared/contracts/smart-hints'
import type { ValidatedPublicPackage } from '../../../src/main/services/learning/content/exercise-package-contracts'
import type { ExercisePackageRegistry, PublicPackageLease, PackagePrepareOwner } from '../../../src/main/services/learning/content/exercise-package-registry'
import type { ExerciseSnapshot } from '../../../src/shared/contracts/exercise'
import { bindSmartAction, type SmartCapture } from '../../../src/main/services/learning/smart-hints/capture'
import { sourceFingerprint } from '../../../src/main/services/learning/smart-hints/public-run-receipt'
import { smartPosition } from '../../../src/shared/contracts/smart-hints-validation'

export const source = 'function solve(x) {\n  return x;\n}\n'
export function fixAction(code = source, startOffset = code.indexOf('return'), endOffset = startOffset + 6): Extract<SmartPrepare['action'], { kind: 'SUGGEST_FIX' }> {
  const a = smartPosition(code, startOffset), b = smartPosition(code, endOffset)
  return { kind: 'SUGGEST_FIX', selection: { startOffset, endOffset, text: code.slice(startOffset, endOffset),
    startLine: a.line, startColumn: a.column, endLine: b.line, endColumn: b.column } }
}
export function request(patch: Partial<SmartPrepare> = {}): SmartPrepare {
  return { requestId: randomUUID(), clientContextId: randomUUID(), exerciseId: 'synthetic', language: 'javascript',
    sourceRevision: 1, source, origin: { kind: 'PRACTICE', modelId: randomUUID(), modelVersion: 1, eol: 'LF' },
    action: { kind: 'ANALYZE' }, run: null, ...patch }
}
export const output: SmartOutput = { kind: 'ANALYSIS', hypotheses: ['Có thể cần kiểm tra phép tính.'], suggestions: ['Đối chiếu public sample.'], evidence: [] }
export function capture(q: SmartPrepare, generation = 1): SmartCapture {
  return { action: structuredClone(q.action), binding: { clientContextId: q.clientContextId, contextGeneration: generation, exerciseId: q.exerciseId,
    language: q.language, packageVersion: 1, sourceRevision: q.sourceRevision, fingerprint: sourceFingerprint(q.source),
    sourceBytes: Buffer.byteLength(q.source), origin: structuredClone(q.origin), action: bindSmartAction(q.action) }, source: q.source,
  statement: 'Trả về x + 1.', constraints: ['x là int32'], signature: { functionName: 'solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' },
  signatureIdentity: { version: 1, hash: 'a'.repeat(64) }, runContext: { kind: 'CODE_ONLY', reason: 'NO_MATCHING_PUBLIC_RUN' } }
}
export function publicData(): ValidatedPublicPackage {
  return { metadata: { schemaVersion: 1, exerciseId: 'synthetic', packageVersion: 1,
    metadata: { chapter: 2, order: 1, title: 'Synthetic', difficulty: 'Easy', source: { url: 'https://leetcode.com/problems/synthetic/', publisher: 'Synthetic', usage: 'Test' } },
    statement: 'Trả về x + 1.', constraints: ['x là int32'], signature: { version: 1, hash: 'a'.repeat(64), functionName: 'solve', parameters: [{ name: 'x', type: 'int32' }], returnType: 'int32' },
    comparator: { id: 'exact-typed', version: 1 }, official: { testSetId: 'HIDDEN_CANARY', version: 1, hash: 'b'.repeat(64) } },
    samples: { schemaVersion: 1, exerciseId: 'synthetic', signatureVersion: 1, signatureHash: 'a'.repeat(64),
      samples: [{ id: 'public-a', args: [1], expected: 2 }, { id: 'public-b', args: [3], expected: 4 }] },
    starters: { csharp: 'int Solve(int x) { return x; }', javascript: source } }
}
export function registry(data = publicData()) {
  let pinned = false
  const release = vi.fn(() => { pinned = false })
  const acquirePublic = vi.fn(async (_id: string, owner: PackagePrepareOwner) => {
    owner.check(); pinned = true
    return { data, release, representCooperative: async (json: string) => ({ data: JSON.parse(json), release: vi.fn() }) } as unknown as PublicPackageLease
  })
  return { packages: { acquirePublic } as Pick<ExercisePackageRegistry, 'acquirePublic'>, acquirePublic, release, data, get pinned() { return pinned } }
}
export function start(s: SmartStatus): SmartStart {
  if (s.state !== 'PREPARED') throw Error('Not prepared')
  return { requestId: s.requestId, operationId: s.operationId, captureToken: s.captureToken, consentVersion: 1, consentGranted: true }
}
export const reference = (s: SmartStatus) => ({ requestId: s.requestId, operationId: s.operationId })
export function snapshot(language: 'csharp' | 'javascript' = 'javascript'): ExerciseSnapshot {
  const result = { cases: [{ caseIndex: 0, outcome: 'RETURNED' as const, actual: 1, stdout: 'HIDDEN_CANARY', stderr: 'PRIVATE_PATH', exitCode: 0, failure: null },
    { caseIndex: 1, outcome: 'RETURNED' as const, actual: 3, stdout: '', stderr: '', exitCode: 0, failure: null }], notRunCaseIndices: [], failure: null }
  const schema = { parameterTypes: ['int32' as const], returnType: 'int32' as const, sampleCount: 2 }
  return { sessionId: `exercise_${randomUUID()}`, generation: 1, sequence: 7, exerciseId: 'synthetic', language, sourceRevision: 1,
    phase: 'finished', reason: 'COMPLETED', stdout: 'HIDDEN_CANARY', stderr: 'PRIVATE_PATH',
    cleanup: { state: 'FINALIZED', proof: 'VERIFIED', cleanupComplete: true, processClean: true, workspace: 'REMOVED', pendingIo: false },
    ...(language === 'javascript' ? { javascript: { schema, result: { ...result, syntax: { status: 'SUCCEEDED' as const, exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null } } } }
      : { csharp: { schema, result: { ...result, compile: { status: 'SUCCEEDED' as const, exitCode: 0, diagnostics: [], stdout: '', stderr: '', failure: null } } } }) }
}
export function envelope(content = JSON.stringify(output)) {
  return JSON.stringify({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { completion_tokens: 100 } })
}
export const response = (raw = envelope()) => new Response(raw, { headers: { 'content-type': 'application/json' } })

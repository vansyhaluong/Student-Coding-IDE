import { describe, expect, it } from 'vitest'
import { validateAnalysisPrepare, validateAnalysisStart, validateAnalysisReference, isAnalysisStatus } from '../../src/shared/contracts/analysis-validation'
import { analysis } from '../fixtures/learning/analysis'
describe('D2 semantic contracts', () => {
  it.each(['source', 'prompt', 'endpoint', 'model', 'apiKey', 'owner', 'path', 'expected', 'judge'])('rejects renderer-supplied %s', field => {
    expect(validateAnalysisPrepare({ requestId: 'r', sourceReference: 'opaque', [field]: 'forged' }).ok).toBe(false)
    expect(validateAnalysisStart({ requestId: 'r', captureToken: 'token', consentVersion: 1, [field]: 'forged' }).ok).toBe(false)
  })
  it('requires exact nonempty references and consent; rejects accessors and extra result data', () => {
    for (const q of [null, {}, { requestId: '' }, { requestId: 'x', sourceReference: 'x' }]) expect(validateAnalysisReference(q).ok).toBe(false)
    expect(validateAnalysisStart({ requestId: 'r', captureToken: 't' }).ok).toBe(false)
    expect(validateAnalysisPrepare({ get requestId() { throw Error('getter') }, sourceReference: 's' }).ok).toBe(false)
    const st = { requestId: 'r', sequence: 0, state: 'COMPLETE', advisory: true, analysis }
    expect(isAnalysisStatus(st)).toBe(true)
    for (const extra of [{ usage: {} }, { raw: 'x' }, { headers: {} }, { analysis: { ...analysis, verdict: 'Accepted' } }, { sequence: -1 }]) expect(isAnalysisStatus({ ...st, ...extra })).toBe(false)
  })
})

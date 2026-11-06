import { ANALYSIS_FAILURE_CODES, type Analysis, type AnalysisPrepare, type AnalysisReference,
  type AnalysisStart, type AnalysisStatus } from './analysis'
import type { ValidationResult } from './validation'

export function analysisFields(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return false
  const own = Reflect.ownKeys(v)
  return own.length === keys.length && own.every(k => typeof k === 'string' && keys.includes(k)
    && Object.getOwnPropertyDescriptor(v, k)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value'))
}
const token = (v: unknown, max = 128): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && v.length <= max
const integer = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && !Object.is(v, -0)
function result<T>(v: unknown, valid: boolean): ValidationResult<T> {
  return valid ? { ok: true, value: structuredClone(v) as T } : { ok: false, issues: [{ path: '$', message: 'Invalid analysis request.' }] }
}
export const validateAnalysisReference = (v: unknown) => result<AnalysisReference>(v, analysisFields(v, ['requestId']) && token(v.requestId))
export const validateAnalysisPrepare = (v: unknown) => result<AnalysisPrepare>(v,
  analysisFields(v, ['requestId', 'sourceReference']) && token(v.requestId) && token(v.sourceReference, 512))
export const validateAnalysisStart = (v: unknown) => result<AnalysisStart>(v,
  analysisFields(v, ['requestId', 'captureToken', 'consentVersion']) && token(v.requestId) && token(v.captureToken) && v.consentVersion === 1)
export function analysisWellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    } else if (c >= 0xdc00 && c <= 0xdfff) return false
  }
  return true
}
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && analysisWellFormed(v)
  && !v.includes('\0') && new TextEncoder().encode(v).byteLength <= max
export function isAnalysis(v: unknown): v is Analysis {
  const complexity = (c: unknown) => analysisFields(c, ['bigO', 'explanation']) && text(c.bigO, 128) && text(c.explanation, 4096)
  const list = (a: unknown) => Array.isArray(a) && a.length >= 1 && a.length <= 8 && a.every(x => text(x, 2048))
  return analysisFields(v, ['schemaVersion', 'algorithmAnalysis', 'timeComplexity', 'spaceComplexity', 'codeQuality', 'improvements'])
    && v.schemaVersion === 1 && text(v.algorithmAnalysis, 8192) && complexity(v.timeComplexity) && complexity(v.spaceComplexity)
    && list(v.codeQuality) && list(v.improvements) && new TextEncoder().encode(JSON.stringify(v)).byteLength <= 32768
}
export function isAnalysisStatus(v: unknown): v is AnalysisStatus {
  if (!v || typeof v !== 'object') return false
  if (!Reflect.ownKeys(v).every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value'))) return false
  const o = v as Record<string, unknown>, base = ['requestId', 'sequence', 'state']
  if (!token(o.requestId) || !integer(o.sequence)) return false
  if (['PREPARING', 'RUNNING', 'CANCELLED'].includes(o.state as string)) return analysisFields(o, base)
  if (o.state === 'FAILED') return analysisFields(o, [...base, 'code']) && ANALYSIS_FAILURE_CODES.includes(o.code as never)
  if (o.state === 'COMPLETE') return analysisFields(o, [...base, 'advisory', 'analysis']) && o.advisory === true && isAnalysis(o.analysis)
  return o.state === 'PREPARED' && analysisFields(o, [...base, 'captureToken', 'expiresAt', 'consentVersion', 'submissionId',
    'exerciseId', 'language', 'packageVersion', 'sourceBytes', 'statementBytes']) && token(o.captureToken) && integer(o.expiresAt, 1)
    && o.consentVersion === 1 && token(o.submissionId) && token(o.exerciseId, 64) && ['csharp', 'javascript'].includes(o.language as string)
    && integer(o.packageVersion, 1) && integer(o.sourceBytes, 1) && o.sourceBytes <= 16384
    && integer(o.statementBytes, 1) && o.statementBytes <= 8192
}

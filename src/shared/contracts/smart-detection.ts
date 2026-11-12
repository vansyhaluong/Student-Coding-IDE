import type { SmartIssue } from './smart-hints'
import { analysisFields as fields, analysisWellFormed } from './analysis-validation'
const text = (v: unknown, cap: number): v is string => typeof v === 'string' && !!v.trim()
  && analysisWellFormed(v) && new TextEncoder().encode(v).length <= cap
const dense = (v: unknown): v is unknown[] => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= 8
  && Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i)))
    .every(d => !!d && d.enumerable && Object.hasOwn(d, 'value'))
const list = (v: unknown): v is string[] => dense(v) && v.every(x => typeof x === 'string' && /^R[1-9][0-9]?$/.test(x))
const keys = ['type', 'severity', 'message', 'explanation', 'reason', 'impact', 'guidance', 'evidence', 'range']
export function isIssueRange(v: unknown): v is NonNullable<SmartIssue['range']> {
  return fields(v, ['startOffset', 'endOffset', 'quote']) && Number.isSafeInteger(v.startOffset) && Number.isSafeInteger(v.endOffset)
    && (v.startOffset as number) >= 0 && (v.endOffset as number) > (v.startOffset as number) && text(v.quote, 1024)
}
export function validIssueRange(source: string, range: NonNullable<SmartIssue['range']>): boolean {
  const boundary = (n: number) => !(source.charCodeAt(n - 1) === 13 && source.charCodeAt(n) === 10)
    && !(source.charCodeAt(n - 1) >= 0xd800 && source.charCodeAt(n - 1) <= 0xdbff && source.charCodeAt(n) >= 0xdc00 && source.charCodeAt(n) <= 0xdfff)
  return isIssueRange(range) && range.endOffset <= source.length && boundary(range.startOffset) && boundary(range.endOffset)
    && source.slice(range.startOffset, range.endOffset) === range.quote
}
export function isDetectionWire(v: unknown, evidence?: string[]): v is { kind: 'DETECTION'; issues: Omit<SmartIssue, 'id' | 'provenance' | 'verification' | 'locationStatus'>[] } {
  return fields(v, ['kind', 'issues']) && v.kind === 'DETECTION' && dense(v.issues)
    && v.issues.every(x => fields(x, keys) && issueFields(x, evidence) && (x.range === null || isIssueRange(x.range)))
    && new TextEncoder().encode(JSON.stringify(v)).length <= 24000
}
function issueFields(x: Record<string, unknown>, evidence?: string[]): boolean {
  return ['syntax', 'logic', 'runtime', 'other'].includes(x.type as string) && ['error', 'warning', 'info'].includes(x.severity as string)
    && text(x.message, 256) && [x.explanation, x.reason, x.impact, x.guidance].every(s => text(s, 2048))
    && list(x.evidence) && (!evidence || x.evidence.every(id => evidence.includes(id)))
}
export function isDetection(v: unknown, source?: string, evidence?: string[]): v is { kind: 'DETECTION'; issues: SmartIssue[] } {
  if (!fields(v, ['kind', 'issues']) || v.kind !== 'DETECTION' || !dense(v.issues)) return false
  const ids = new Set<string>()
  return v.issues.every(x => {
    if (!fields(x, [...keys, 'id', 'provenance', 'verification', 'locationStatus']) || !issueFields(x, evidence)
      || !text(x.id, 80) || ids.has(x.id as string) || x.provenance !== 'AI_INFERENCE' || x.verification !== 'SUSPECTED') return false
    ids.add(x.id as string)
    return x.range === null ? ['UNLOCATED', 'INVALID_AI_RANGE'].includes(x.locationStatus as string)
      : x.locationStatus === 'LOCATED' && isIssueRange(x.range) && (source === undefined || validIssueRange(source, x.range))
  })
}

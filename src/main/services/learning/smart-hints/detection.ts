import { randomUUID } from 'node:crypto'
import { isDetectionWire, validIssueRange } from '../../../../shared/contracts/smart-detection'
import type { SmartIssue, SmartOutput } from '../../../../shared/contracts/smart-hints'
import type { SmartCapture } from './capture'
import { SmartProviderError } from './adapter'

function resolveRange(source: string, range: SmartIssue['range']): SmartIssue['range'] {
  if (!range) return null
  if (validIssueRange(source, range)) return structuredClone(range)
  const startOffset = source.indexOf(range.quote)
  // A unique exact quotation is source evidence; an arbitrary occurrence is not.
  if (startOffset < 0 || source.indexOf(range.quote, startOffset + 1) !== -1) return null
  const resolved = { startOffset, endOffset: startOffset + range.quote.length, quote: range.quote }
  return validIssueRange(source, resolved) ? resolved : null
}

export function constructDetection(c: SmartCapture, wire: unknown): Extract<SmartOutput, { kind: 'DETECTION' }> {
  const evidence = c.runContext.kind === 'RUN_PUBLIC' ? c.runContext.observations.map(o => o.evidenceId) : []
  if (c.action.kind !== 'DETECT_ISSUES' || c.binding.origin.kind !== 'PRACTICE' || !isDetectionWire(wire, evidence)) throw new SmartProviderError('INVALID_RESPONSE')
  return { kind: 'DETECTION', issues: wire.issues.map(issue => {
    const range = resolveRange(c.source, issue.range)
    return { ...structuredClone(issue), id: randomUUID(), range,
      locationStatus: issue.range === null ? 'UNLOCATED' : range ? 'LOCATED' : 'INVALID_AI_RANGE',
      provenance: 'AI_INFERENCE', verification: 'SUSPECTED' }
  }) }
}

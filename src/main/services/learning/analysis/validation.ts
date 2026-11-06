import { POLICY, type Analysis, type AnalysisInput } from './contracts'
import { analysisWellFormed } from '../../../../shared/contracts/analysis-validation'

const bad = (): never => { throw Error('INVALID_DATA') }
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return bad()
  const proto = Object.getPrototypeOf(v)
  if (proto !== null && proto !== Object.prototype) return bad()
  return v as Record<string, unknown>
}
export function fields(v: unknown, keys: string[]): Record<string, unknown> {
  const o = object(v), own = Reflect.ownKeys(o)
  if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) return bad()
  // Callers must supply plain data, not accessors or lazy getters.
  for (const key of keys) if (!Object.hasOwn(o, key) || !Object.getOwnPropertyDescriptor(o, key)?.enumerable
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(o, key)!, 'value')) return bad()
  return o
}
export function text(v: unknown, maxBytes: number): string {
  if (typeof v !== 'string' || !v.trim() || !analysisWellFormed(v) || v.includes('\0')
    || Buffer.byteLength(v) > maxBytes) return bad()
  return v
}
export function inputSnapshot(v: unknown): Readonly<AnalysisInput> {
  const o = fields(v, ['language', 'source', 'publicStatement', 'packageVersion'])
  if (typeof o.language !== 'string' || !['csharp', 'javascript'].includes(o.language)
    || !Number.isSafeInteger(o.packageVersion) || (o.packageVersion as number) < 1) return bad()
  return Object.freeze({ language: o.language as AnalysisInput['language'], source: text(o.source, POLICY.sourceBytes),
    publicStatement: text(o.publicStatement, POLICY.statementBytes), packageVersion: o.packageVersion as number })
}

/** Bounded JSON grammar pre-scan: duplicate decoded keys, dangerous keys, depth/nodes.
 * JSON.parse is used only for individual JSON string tokens, never to erase duplicates. */
export function strictJson(source: string, maxBytes: number): unknown {
  if (!analysisWellFormed(source) || Buffer.byteLength(source) > maxBytes) return bad()
  let at = 0, nodes = 0
  const ws = () => { while (' \t\n\r'.includes(source[at] ?? 'X')) at++ }
  function string(): string {
    const start = at++
    while (at < source.length) {
      const c = source[at++]
      if (c === '\\') { at++; continue }
      if (c === '"') {
        const value: unknown = JSON.parse(source.slice(start, at))
        if (typeof value !== 'string' || !analysisWellFormed(value)) return bad()
        return value
      }
    }
    return bad()
  }
  function value(depth: number): unknown {
    ws(); if (++nodes > 2048 || depth > 10) return bad()
    if (source[at] === '"') return string()
    if (source[at] === '{') {
      at++; ws(); const result: Record<string, unknown> = Object.create(null), keys = new Set<string>()
      if (source[at] === '}') { at++; return result }
      while (at < source.length) {
        ws(); if (source[at] !== '"') return bad()
        const key = string()
        if (keys.has(key) || keys.size >= 64 || key.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(key)) return bad()
        keys.add(key); ws(); if (source[at++] !== ':') return bad()
        result[key] = value(depth + 1); ws()
        const next = source[at++]; if (next === '}') return result
        if (next !== ',') return bad()
      }
      return bad()
    }
    if (source[at] === '[') {
      at++; ws(); const list: unknown[] = []
      if (source[at] === ']') { at++; return list }
      while (at < source.length) {
        list.push(value(depth + 1)); ws()
        const next = source[at++]; if (next === ']') return list
        if (next !== ',') return bad()
      }
      return bad()
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const)
      if (source.startsWith(literal, at)) { at += literal.length; return result }
    const token = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!token || !Number.isFinite(Number(token[0]))) return bad()
    at += token[0].length; return Number(token[0])
  }
  const result = value(0); ws(); if (at !== source.length) return bad()
  return result
}
export function validateAnalysis(source: string): Analysis {
  const o = fields(strictJson(source, POLICY.analysisBytes), ['schemaVersion', 'algorithmAnalysis', 'timeComplexity', 'spaceComplexity', 'codeQuality', 'improvements'])
  if (o.schemaVersion !== 1) return bad()
  function complexity(v: unknown) {
    const c = fields(v, ['bigO', 'explanation'])
    return { bigO: text(c.bigO, 128), explanation: text(c.explanation, 4096) }
  }
  function list(v: unknown): string[] {
    if (!Array.isArray(v) || v.length < 1 || v.length > 8) return bad()
    return v.map(item => text(item, 2048))
  }
  return { schemaVersion: 1, algorithmAnalysis: text(o.algorithmAnalysis, 8192),
    timeComplexity: complexity(o.timeComplexity), spaceComplexity: complexity(o.spaceComplexity),
    codeQuality: list(o.codeQuality), improvements: list(o.improvements) }
}

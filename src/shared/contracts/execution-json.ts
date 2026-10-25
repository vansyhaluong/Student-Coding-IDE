import { EXERCISE_LIMITS } from './exercise'
import { JAVASCRIPT_PROTOCOL_MAX_DEPTH } from './javascript-execution'

const unicode = (v: string): boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)
const bytes = (v: string): number => new TextEncoder().encode(v).byteLength

/** Scan before JSON.parse to bound nesting and reject duplicate decoded property names.
 * JSON.parse still checks the entire grammar; this scanner also requires one document. */
export function parseExecutionJson(input: string | Uint8Array): unknown {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) throw new Error('input')
  if (input.length > EXERCISE_LIMITS.outputBytes) throw new Error('size')
  const text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input)
  if (!unicode(text) || bytes(text) > EXERCISE_LIMITS.outputBytes) throw new Error('unicode/bytes')
  let pos = 0
  const whitespace = (): void => { while (/[\t\n\r ]/.test(text[pos] ?? '') && pos < text.length) pos++ }
  const string = (): string => {
    const start = pos++
    while (pos < text.length) {
      const c = text[pos++]
      if (c === '"') return JSON.parse(text.slice(start, pos)) as string
      if (c === '\\') pos++
    }
    throw new Error('string')
  }
  const scan = (depth: number): void => {
    if (depth > JAVASCRIPT_PROTOCOL_MAX_DEPTH) throw new Error('depth')
    whitespace()
    const token = text[pos]
    if (token === '"') { string(); return }
    if (token === '{' || token === '[') {
      const object = token === '{', end = object ? '}' : ']'
      const names = new Set<string>()
      pos++; whitespace()
      if (text[pos] === end) { pos++; return }
      for (;;) {
        whitespace()
        if (object) {
          if (text[pos] !== '"') throw new Error('key')
          const key = string()
          if (names.has(key)) throw new Error('duplicate')
          names.add(key); whitespace()
          if (text[pos++] !== ':') throw new Error('colon')
        }
        scan(depth + 1); whitespace()
        if (text[pos] === end) { pos++; return }
        if (text[pos++] !== ',') throw new Error('separator')
      }
    }
    const primitive = /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y
    primitive.lastIndex = pos
    if (!primitive.exec(text)) throw new Error('token')
    pos = primitive.lastIndex
  }
  scan(0); whitespace()
  if (pos !== text.length) throw new Error('trailing')
  return JSON.parse(text) as unknown
}


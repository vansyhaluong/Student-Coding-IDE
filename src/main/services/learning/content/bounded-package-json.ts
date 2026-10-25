import { PACKAGE_POLICY as P, packageCheck as check, packageResult, type PackageValidationResult } from './exercise-package-policy'
import type { PackageAllocationObserver, ParsedAllocation } from './exercise-package-budget'
import { CHARACTER_WORK, NODE_WORK, WORK_BARRIER, WORK_CHECK, runPackageWork, runPackageWorkSync,
  PackageWorkInterrupted, PackageWorkBatch, type PackageWork, type PackageWorkControl } from './exercise-package-work'

/** Byte input only: never walk/stringify caller-supplied objects, invoke accessors
 * or coerce input. The caller already owns these bytes; bounded filesystem reads
 * and hash verification are Step 2, not claimed by this in-memory parser. */
export function decodePackageUtf8(bytes: Uint8Array, maximum: number): string {
  check(bytes instanceof Uint8Array && bytes.byteLength <= maximum, 'PACKAGE_ASSET_LIMIT')
  check(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), 'PACKAGE_JSON_INVALID')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { check(false, 'PACKAGE_JSON_INVALID') }
}

/** Root depth=0; nodes include each scalar/container, not object property names.
 * Counts decoded string units before materialization, with bounded key-only Sets.
 * Each byte/character is visited a bounded number of times; recursion depth≤12. */
function* scan(text: string): PackageWork<ParsedAllocation> {
  let pos = 0, nodes = 0, properties = 0, canonicalBytes = 0
  const syntax = (ok: unknown): void => check(ok, 'PACKAGE_JSON_INVALID')
  const bound = (ok: unknown): void => check(ok, 'PACKAGE_STRUCTURE_LIMIT')
  function* whitespace(): PackageWork<void> {
    if (pos >= text.length || !/[\x20\t\r\n]/.test(text[pos])) return
    const batch = new PackageWorkBatch(CHARACTER_WORK, () => {
      pos++
      return pos >= text.length || !/[\x20\t\r\n]/.test(text[pos])
    })
    while (!batch.done) yield { batch }
  }
  function* string(key: boolean): PackageWork<string> {
    canonicalBytes += 2
    let units = 0, high = false, name = ''
    let mode: 'open' | 'unit' | 'escape' | 'hex' = 'open', hex = '', digits = 0
    const decoded = (code: number): void => {
      if (high) syntax(code >= 0xdc00 && code <= 0xdfff)
      else syntax(!(code >= 0xdc00 && code <= 0xdfff))
      if (high) canonicalBytes += 4
      else if (code >= 0xd800 && code <= 0xdbff) { /* charged with low surrogate */ }
      else if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) canonicalBytes += 2
      else canonicalBytes += code < 32 ? 6 : code < 128 ? 1 : code < 2048 ? 2 : 3
      high = code >= 0xd800 && code <= 0xdbff
      bound(++units <= (key ? P.keyUnits : P.generalStringUnits))
      if (key) name += String.fromCharCode(code)
    }
    const batch = new PackageWorkBatch(CHARACTER_WORK, () => {
      let closed = false
      if (mode === 'open') { syntax(text[pos++] === '"'); mode = 'unit' }
      else if (mode === 'unit') {
        const code = text.charCodeAt(pos++)
        if (code === 34) { syntax(!high); closed = true }
        else {
          syntax(code >= 32)
          if (code === 92) mode = 'escape'
          else decoded(code)
        }
      } else if (mode === 'escape') {
        const escape = text[pos++]
        if (escape === 'u') { mode = 'hex'; digits = 0; hex = '' }
        else {
          const escapeCodes: Record<string, number> = { '"': 34, '\\': 92, '/': 47, b: 8, f: 12, n: 10, r: 13, t: 9 }
          syntax(Object.hasOwn(escapeCodes, escape)); decoded(escapeCodes[escape]); mode = 'unit'
        }
      } else {
        hex += text[pos++] ?? ''
        if (++digits === 4) { syntax(/^[0-9a-fA-F]{4}$/.test(hex)); decoded(Number.parseInt(hex, 16)); mode = 'unit' }
      }
      if (!closed && mode === 'unit' && pos >= text.length) syntax(false)
      return closed
    })
    while (!batch.done) yield { batch }
    return name
  }
  function* value(depth: number): PackageWork<void> {
    yield NODE_WORK
    bound(depth <= P.depth && ++nodes <= P.assetNodes); yield* whitespace()
    const token = text[pos]
    if (token === '"') { yield* string(false); return }
    if (token === '{' || token === '[') {
      canonicalBytes += 2
      const object = token === '{', end = object ? '}' : ']'
      const keys = new Set<string>()
      let entries = 0
      yield CHARACTER_WORK; pos++; yield* whitespace()
      if (text[pos] === end) { yield CHARACTER_WORK; pos++; return }
      while (pos < text.length) {
        if (entries > 0) canonicalBytes++
        bound(++entries <= (object ? P.objectProperties : P.arrayElements))
        if (object) {
          canonicalBytes++ // colon
          bound(++properties <= P.assetProperties)
          const key = yield* string(true)
          syntax(!keys.has(key) && !['__proto__', 'prototype', 'constructor'].includes(key))
          keys.add(key); yield* whitespace(); yield CHARACTER_WORK; syntax(text[pos++] === ':')
        }
        yield* value(depth + 1); yield* whitespace()
        if (text[pos] === end) { yield CHARACTER_WORK; pos++; return }
        yield CHARACTER_WORK; syntax(text[pos++] === ','); yield* whitespace()
      }
      syntax(false); return
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, pos)) {
        for (let i = 0; i < literal.length; i++) { yield CHARACTER_WORK; pos++ }
        canonicalBytes += literal.length; return
      }
    }
    const start = pos
    while (pos < text.length && /[0-9eE+.-]/.test(text[pos])) {
      yield CHARACTER_WORK
      bound(++pos - start <= P.numericTokenCharacters)
    }
    const number = text.slice(start, pos)
    syntax(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(number) && Number.isFinite(Number(number)))
    canonicalBytes += JSON.stringify(Number(number)).length
  }
  yield* value(0); yield* whitespace(); syntax(pos === text.length)
  return { canonicalBytes, nodes }
}

export function parseBoundedPackageJson(bytes: Uint8Array, maximum: number = P.jsonBytes, allocations?: PackageAllocationObserver): PackageValidationResult<unknown> {
  return packageResult(() => runPackageWorkSync(parsePackageJsonWork(bytes, maximum, allocations)))
}

/** Generator frames are the resumable lexical/container stack (depth bounded by
 * policy). Sync and cooperative drivers execute these exact same transitions. */
export function* parsePackageJsonWork(bytes: Uint8Array, maximum: number, allocations?: PackageAllocationObserver): PackageWork<unknown> {
  yield WORK_BARRIER
  const text = decodePackageUtf8(bytes, Math.min(maximum, P.jsonBytes))
  yield WORK_BARRIER
  const statistics = yield* scan(text)
  yield WORK_BARRIER
  allocations?.parsed(statistics) // immediately before whole-tree allocation
  yield WORK_CHECK
  const value: unknown = JSON.parse(text)
  yield WORK_BARRIER
  return value
}
export async function cooperativePackageResult<T>(work: PackageWork<T>, control: PackageWorkControl): Promise<PackageValidationResult<T>> {
  try { return { ok: true, value: await runPackageWork(work, control) } }
  catch (error) {
    // Owner/deadline exceptions are not schema corruption and keep their identity.
    if (error instanceof PackageWorkInterrupted) throw error
    return packageResult<T>(() => { throw error })
  }
}
export function parseBoundedPackageJsonCooperative(bytes: Uint8Array, maximum: number, allocations: PackageAllocationObserver | undefined,
  control: PackageWorkControl): Promise<PackageValidationResult<unknown>> {
  return cooperativePackageResult(parsePackageJsonWork(bytes, maximum, allocations), control)
}

import { describe, expect, it, vi } from 'vitest'
import { PackageResidentBudget } from '../../src/main/services/learning/content/exercise-package-budget'
import { parseBoundedPackageJson } from '../../src/main/services/learning/content/bounded-package-json'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'

describe('S3-D1 exact logical reservations', () => {
  it.each([' { "a" : [true, null, -0, 1e20, 1e-7] } ',
    String.raw`"\uD83D\uDE00\n\t\b\f\r\u0000\"\\/"`,
    '{"\\u0061":[{},[],"\\u00e9\\u4e00"]}', '1.0000', '1e-999', '1.7976931348623157e308'])('matches canonical JSON bytes: %s', text => {
    const budget = new PackageResidentBudget(), scope = budget.scope()
    const result = parseBoundedPackageJson(Buffer.from(text), undefined, scope)
    expect(result.ok).toBe(true)
    if (result.ok) expect(budget.snapshot().parsedBytes).toBe(Buffer.byteLength(JSON.stringify(result.value)))
    scope.release(); expect(budget.snapshot()).toEqual({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
  it('counts root/container/scalar nodes, not keys, and denies before JSON.parse', () => {
    const budget = new PackageResidentBudget(), scope = budget.scope()
    expect(parseBoundedPackageJson(Buffer.from('{"a":[true,null,{}]}'), undefined, scope).ok).toBe(true)
    expect(budget.snapshot().nodes).toBe(5)
    scope.parsed({ canonicalBytes: P.residentLogicalBytes - budget.snapshot().parsedBytes, nodes: 0 })
    const spy = vi.spyOn(JSON, 'parse')
    try {
      expect(parseBoundedPackageJson(Buffer.from('0'), undefined, scope)).toEqual({ ok: false, code: 'PACKAGE_RESIDENT_LIMIT' })
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore(); scope.release() }
  })
  it.each(['bytes', 'nodes', 'raw'] as const)('enforces exact %s ceiling atomically, releases idempotently', kind => {
    const budget = new PackageResidentBudget(), s = budget.scope()
    const max = kind === 'bytes' ? P.residentLogicalBytes : kind === 'nodes' ? P.residentNodes : P.rawBufferBytes
    const reserve = (n: number) => kind === 'raw' ? s.raw(n) : s.parsed({ canonicalBytes: kind === 'bytes' ? n : 0, nodes: kind === 'nodes' ? n : 0 })
    reserve(max - 1); reserve(1)
    const before = budget.snapshot()
    expect(() => reserve(1)).toThrow('PACKAGE_RESIDENT_LIMIT')
    expect(budget.snapshot()).toEqual(before)
    s.release(); s.release()
    expect(budget.snapshot()).toEqual({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
    expect(() => reserve(1)).toThrow('PACKAGE_RESIDENT_LIMIT')
  })
  it('accounts raw and parsed overlap across scopes and rejects invalid quantities', () => {
    const budget = new PackageResidentBudget(), a = budget.scope(), b = budget.scope()
    const release = a.raw(P.rawBufferBytes)
    b.parsed({ canonicalBytes: 42, nodes: 5 })
    expect(budget.snapshot()).toEqual({ parsedBytes: 42, nodes: 5, rawBytes: P.rawBufferBytes })
    expect(() => b.raw(1)).toThrow('PACKAGE_RESIDENT_LIMIT')
    for (const n of [-1, NaN, Infinity, 0.5]) expect(() => a.raw(n)).toThrow('PACKAGE_RESIDENT_LIMIT')
    release(); release(); a.release(); b.release()
    expect(budget.snapshot()).toEqual({ parsedBytes: 0, nodes: 0, rawBytes: 0 })
  })
})

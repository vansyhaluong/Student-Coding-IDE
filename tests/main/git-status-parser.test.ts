import { describe, expect, it } from 'vitest'
import { GitStatusParser, MAX_GIT_STATUS_TOKEN_BYTES } from '../../src/main/services/git/git-status-parser'
import { isGitRelativePath, validateGitStatus, validateGitMutationOutcome } from '../../src/shared/contracts'

const oid = '1'.repeat(40)
const headers = `# branch.oid ${oid}\0# branch.head main\0`
const ordinary = (xy: string, path = 'file.txt') => `1 ${xy} N... 100644 100644 100644 ${oid} ${oid} ${path}\0`
const renamed = (xy = 'RM', score = 'R100') => `2 ${xy} N... 100644 100644 100644 ${oid} ${oid} ${score} new name.txt\0old name.txt\0`
const conflict = `u UU N... 100644 100644 100644 100644 ${oid} ${oid} ${oid} conflict.txt\0`
function parse(body: string, chunkSize = 7) {
  const parser = new GitStatusParser()
  const bytes = Buffer.from(headers + body)
  for (let i = 0; i < bytes.length; i += chunkSize) parser.push(bytes.subarray(i, i + chunkSize))
  return parser.finish().status
}

describe('Phase 5B porcelain v2 parser', () => {
  it.each([
    ['M.', 'MODIFIED', null], ['.M', null, 'MODIFIED'], ['MM', 'MODIFIED', 'MODIFIED'],
    ['A.', 'ADDED', null], ['.A', null, 'ADDED'], ['D.', 'DELETED', null],
    ['.D', null, 'DELETED'], ['T.', 'MODIFIED', null], ['AM', 'ADDED', 'MODIFIED'],
  ])('preserves independent slots for %s', (xy, staged, unstaged) => {
    expect(parse(ordinary(xy!)).entries).toEqual([{
      path: 'file.txt', staged: staged ? { kind: staged } : null,
      unstaged: unstaged ? { kind: unstaged } : null, untracked: false,
    }])
  })

  it('parses clean, untracked, Unicode/spaces, copies and read-only conflicts', () => {
    expect(parse('')).toEqual({ entries: [], didHitLimit: false })
    const status = parse('? -資料 đẹp [ab].txt\0' + renamed('C.', 'C98') + conflict, 1)
    expect(status.entries).toEqual([
      { path: '-資料 đẹp [ab].txt', staged: null, unstaged: null, untracked: true },
      { path: 'new name.txt', staged: { kind: 'COPIED', previousPath: 'old name.txt' }, unstaged: null, untracked: false },
      { path: 'conflict.txt', staged: { kind: 'CONFLICTED' }, unstaged: { kind: 'CONFLICTED' }, untracked: false },
    ])
    expect(validateGitStatus(status).ok).toBe(true)
  })

  it('handles every split point, including UTF-8 and rename pair boundaries', () => {
    const body = renamed() + ordinary('M.', '資料 đẹp.txt') + '? another file\0'
    const bytes = Buffer.from(headers + body)
    const expected = parse(body)
    for (let split = 0; split <= bytes.length; split += 1) {
      const parser = new GitStatusParser()
      parser.push(bytes.subarray(0, split))
      parser.push(bytes.subarray(split))
      expect(parser.finish().status).toEqual(expected)
    }
    expect(parse(body, bytes.length)).toEqual(expected)
  })

  it('retains internal unborn state but exposes no branch data', () => {
    const parser = new GitStatusParser()
    parser.push(Buffer.from('# branch.oid (initial)\0# branch.head main\0' + ordinary('A.')))
    const result = parser.finish()
    expect(result.unborn).toBe(true)
    expect(Object.keys(result.status)).toEqual(['entries', 'didHitLimit'])
  })

  it('requires a complete 1001st logical entry, never a partial rename', () => {
    const thousand = Array.from({ length: 1000 }, (_, i) => `? ${i}.txt\0`).join('')
    expect(parse(thousand).didHitLimit).toBe(false)
    const parser = new GitStatusParser()
    expect(parser.push(Buffer.from(headers + thousand))).toBe(false)
    const pair = renamed()
    expect(parser.push(Buffer.from(pair.slice(0, pair.indexOf('\0') + 1)))).toBe(false)
    expect(parser.push(Buffer.from('old name.txt\0? discarded.txt\0'))).toBe(true)
    expect(parser.finish().status).toEqual({ entries: parse(thousand).entries, didHitLimit: true })
  })

  it.each([
    '', 'x invalid\0', '! ignored.txt\0', '1 broken\0', ordinary('ZZ'), ordinary('..'),
    ordinary('R.'), renamed('M.'), renamed('R.', 'R101'), renamed().replace('N...', 'S...'),
    renamed().slice(0, -1), ordinary('M.').replace('100644', 'garbage'),
    ordinary('M.').replace(oid, 'bad-oid'), '? ../escape\0', '? C:relative\0',
    '? same.txt\0? SAME.txt\0', '? unterminated', ordinary('M.').replace('N...', 'invalid'),
  ])('fails closed on malformed/unsupported stream %j', (body) => {
    if (body === '') {
      expect(() => new GitStatusParser().finish()).toThrowError(/invalid/)
    } else expect(() => parse(body)).toThrowError(/invalid/)
  })

  it('rejects oversized partial tokens and invalid UTF-8', () => {
    const parser = new GitStatusParser()
    expect(() => parser.push(Buffer.alloc(MAX_GIT_STATUS_TOKEN_BYTES + 1, 65))).toThrowError(/invalid/)
    const utf8 = new GitStatusParser()
    utf8.push(Buffer.from(headers))
    expect(() => utf8.push(Buffer.from([63, 32, 0xff, 0]))).toThrowError(/invalid/)
  })
})

describe('Phase 5B exact contracts and Windows paths', () => {
  it.each(['', '.', '..', '../a', 'a/../b', './a', 'a/./b', '/a', '\\a', 'C:foo', 'C:/a',
    '\\\\server\\share', 'a\0b', 'a//b', 'a\\b', 'a/', 'a:b', 'a*', 'a?', 'a"', 'a\n', 'a\t',
    'a.', 'a ', 'CON', 'NUL.txt', '.git/config', 'a/.git/index'])('rejects path %j', (path) => {
    expect(isGitRelativePath(path)).toBe(false)
  })
  it.each(['-dash.txt', '[abc].txt', 'space name.txt', '資料/đẹp.txt'])('accepts literal file %s', (path) => {
    expect(isGitRelativePath(path)).toBe(true)
  })
  it('rejects incoherent slots, unknown fields and mutation outcomes', () => {
    const valid = parse(ordinary('MM'))
    for (const entry of [
      { ...valid.entries[0], untracked: true },
      { ...valid.entries[0], staged: null, unstaged: null },
      { ...valid.entries[0], staged: { kind: 'MODIFIED', previousPath: 'old' } },
      { ...valid.entries[0], staged: { kind: 'RENAMED' } },
      { ...valid.entries[0], staged: { kind: 'CONFLICTED' } },
      { ...valid.entries[0], xy: 'MM' },
    ]) expect(validateGitStatus({ entries: [entry], didHitLimit: false }).ok).toBe(false)
    expect(validateGitStatus({ ...valid, didHitLimit: true }).ok).toBe(false)
    expect(validateGitMutationOutcome({ applied: true, status: valid, refreshRequired: false }).ok).toBe(true)
    expect(validateGitMutationOutcome({ applied: true, status: null, refreshRequired: true }).ok).toBe(true)
    for (const value of [
      { applied: false, status: null, refreshRequired: true },
      { applied: true, status: null, refreshRequired: false },
      { applied: true, status: valid, refreshRequired: true },
      { applied: true, status: valid, refreshRequired: false, args: [] },
    ]) expect(validateGitMutationOutcome(value).ok).toBe(false)
  })
})

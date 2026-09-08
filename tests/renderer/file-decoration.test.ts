import { describe, expect, it } from 'vitest'
import { fileDecoration } from '../../src/renderer/src/features/git/file-decoration'
import type { GitChange } from '../../src/shared/contracts'

describe('approved file Git decoration priority', () => {
  const changes: GitChange[] = [{ kind: 'DELETED' }, { kind: 'MODIFIED' }, { kind: 'ADDED' },
    { kind: 'RENAMED', previousPath: 'old.ts' }, { kind: 'COPIED', previousPath: 'old.ts' }]
  const badges = ['D', 'M', 'A', 'R', 'C']
  it('projects every pair of normal slots with Orca priority without changing either slot', () => {
    for (const [left, staged] of changes.entries()) for (const [right, unstaged] of changes.entries()) {
      const entry = { path: 'file.ts', staged, unstaged, untracked: false }
      const before = JSON.stringify(entry)
      expect(fileDecoration(entry)?.badge).toBe(badges[Math.min(left, right)])
      expect(JSON.stringify(entry)).toBe(before)
    }
  })
  it('keeps conflict distinct from untracked and copied', () => {
    expect(fileDecoration({ path: 'file.ts', staged: { kind: 'CONFLICTED' }, unstaged: { kind: 'CONFLICTED' }, untracked: false }))
      .toMatchObject({ badge: '!', label: 'Conflicted — read-only' })
    expect(fileDecoration({ path: 'file.ts', staged: null, unstaged: null, untracked: true })?.badge).toBe('U')
  })
})

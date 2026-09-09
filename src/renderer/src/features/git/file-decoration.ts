import type { GitStatusEntry } from '../../../../shared/contracts'

const normal = {
  DELETED: { badge: 'D', label: 'Deleted', rank: 5 },
  MODIFIED: { badge: 'M', label: 'Modified', rank: 4 },
  ADDED: { badge: 'A', label: 'Added', rank: 3 },
  RENAMED: { badge: 'R', label: 'Renamed', rank: 2 },
  COPIED: { badge: 'C', label: 'Copied', rank: 1 },
} as const

/** Display projection only: preserves both index/worktree slots in the source DTO. */
export function fileDecoration(entry: GitStatusEntry) {
  const changes = [entry.staged, entry.unstaged]
  if (changes.some((change) => change?.kind === 'CONFLICTED')) {
    return { badge: '!', label: 'Conflicted — read-only', kind: 'conflicted' }
  }
  if (entry.untracked) return { badge: 'U', label: 'Untracked', kind: 'untracked' }
  let selected: keyof typeof normal | null = null
  for (const change of changes) {
    if (!change || change.kind === 'CONFLICTED') continue
    if (!selected || normal[change.kind].rank > normal[selected].rank) selected = change.kind
  }
  return selected ? { ...normal[selected], kind: selected.toLowerCase() } : null
}

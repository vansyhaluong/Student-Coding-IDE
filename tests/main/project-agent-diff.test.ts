import { describe, expect, it } from 'vitest'
import { PROJECT_AGENT_LIMITS } from '../../src/shared/contracts/project-agent'
import { diffProjectText } from '../../src/main/services/ai/project-agent-diff'

describe('project agent file diff', () => {
  it('keeps nearby context and skips unchanged lines farther away', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join('\n') + '\n'
    const after = ['a', 'b', 'c', 'D', 'e', 'f', 'g', 'h', 'i'].join('\n') + '\n'
    expect(diffProjectText(before, after)).toEqual([
      { id: 'l0', type: 'context', content: 'a', oldLine: 1, newLine: 1 },
      { id: 'l1', type: 'context', content: 'b', oldLine: 2, newLine: 2 },
      { id: 'l2', type: 'context', content: 'c', oldLine: 3, newLine: 3 },
      { id: 'l3', type: 'removed', content: 'd', oldLine: 4 },
      { id: 'l4', type: 'added', content: 'D', newLine: 4 },
      { id: 'l5', type: 'context', content: 'e', oldLine: 5, newLine: 5 },
      { id: 'l6', type: 'context', content: 'f', oldLine: 6, newLine: 6 },
      { id: 'l7', type: 'context', content: 'g', oldLine: 7, newLine: 7 },
    ])
  })

  it('caps a very large rewrite', () => {
    const before = ''
    const after = Array.from({ length: PROJECT_AGENT_LIMITS.diffLines + 5 }, (_, index) => `line ${index}`).join('\n')
    const lines = diffProjectText(before, after)
    expect(lines).toHaveLength(PROJECT_AGENT_LIMITS.diffLines)
    expect(lines.at(-1)).toEqual({ id: 'truncated', type: 'context', content: 'The rest of this diff is hidden.' })
    expect(lines[0]).toMatchObject({ type: 'added', content: 'line 0', newLine: 1 })
  })
})

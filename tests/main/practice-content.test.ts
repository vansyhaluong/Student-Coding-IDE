import { describe, expect, it } from 'vitest'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { isExercise, isPracticeLoad, matchesExerciseType, validateExerciseDraft, isPracticeState } from '../../src/shared/contracts/practice'

describe('9C authored catalogue and function contract', () => {
  it('contains exactly 63 unique exercises, 3 per difficulty in chapters 2–8 only', () => {
    expect(exercises).toHaveLength(63)
    expect(new Set(exercises.map(e => e.id)).size).toBe(63)
    expect(exercises.some(e => e.chapter === 1)).toBe(false)
    for (let chapter = 2; chapter <= 8; chapter++) for (const difficulty of ['Easy', 'Medium', 'Hard']) {
      expect(exercises.filter(e => e.chapter === chapter && e.difficulty === difficulty)).toHaveLength(3)
    }
  })
  it.each(exercises)('$id has typed JSON tests, both function starters and independent source metadata', e => {
    expect(isExercise(e)).toBe(true)
    expect(e.samples).toHaveLength(2)
    expect(e.description.length).toBeGreaterThan(20)
    expect(e.constraints.length).toBeGreaterThan(0)
    expect(e.source.url.startsWith([5, 7, 8].includes(e.chapter) ? 'https://leetcode.com/problems/' : 'https://www.w3resource.com/csharp-exercises/')).toBe(true)
    expect(e.source.usage).toContain('biên soạn độc lập')
    const cs = e.languages.csharp.starter
    const js = e.languages.javascript.starter
    expect(cs).toContain('public class Solution')
    expect(cs).toContain(` ${e.functionName}(`)
    expect(js).toContain(`function ${e.functionName}(`)
    expect(cs).not.toMatch(/Main\(|Console\./)
    expect(js).not.toMatch(/process\.|console\./)
    for (const p of e.parameters) { expect(cs).toContain(p.name); expect(js).toContain(p.name) }
    for (const test of e.samples) {
      expect(JSON.parse(JSON.stringify(test))).toEqual(test)
      test.args.forEach((arg, i) => expect(matchesExerciseType(arg, e.parameters[i].type)).toBe(true))
      expect(matchesExerciseType(test.expected, e.returnType)).toBe(true)
    }
  })
  it('rejects out-of-contract shapes, overflow, unknown ids and duplicate persisted keys', () => {
    expect(matchesExerciseType(2147483648, 'int32')).toBe(false)
    expect(matchesExerciseType(1.2, 'int32')).toBe(false)
    expect(matchesExerciseType([[1], [1, 2]], 'int32[][]')).toBe(false)
    expect(matchesExerciseType(['1'], 'int32[]')).toBe(false)
    expect(validateExerciseDraft({ exerciseId: '../x', language: 'csharp', code: '' }).ok).toBe(false)
    expect(validateExerciseDraft({ exerciseId: 'ch2-01', language: 'python', code: '' }).ok).toBe(false)
    expect(validateExerciseDraft({ exerciseId: 'ch2-01', language: 'csharp', code: '', path: 'C:/x' }).ok).toBe(false)
    const d = { exerciseId: 'ch2-01', language: 'csharp', code: '' }
    expect(isPracticeState({ drafts: [d, d], languages: [] })).toBe(false)
    expect(isPracticeLoad({ exercises, state: { drafts: [], languages: [] }, recovered: false })).toBe(true)
    expect(isExercise({ ...exercises[0], samples: [{ args: ['wrong', 2], expected: 4 }] })).toBe(false)
  })
})

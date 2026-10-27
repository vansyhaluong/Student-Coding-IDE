import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Exercise, ExerciseTest } from '../../../src/shared/contracts/practice'

// Read only public metadata, samples and starters. Never traverse judge/ or references/.
const root = resolve('resources/learning/exercises')
export const chapter3Exercises: Exercise[] = readdirSync(root).filter(id => /^ch3-\d+$/.test(id)).sort().map(id => {
  const read = (file: string) => readFileSync(resolve(root, id, file), 'utf8')
  const item = JSON.parse(read('exercise.json')), samples = JSON.parse(read('samples.json'))
  return { id: item.exerciseId, chapter: item.metadata.chapter, title: item.metadata.title, difficulty: item.metadata.difficulty,
    description: item.statement, constraints: item.constraints, functionName: item.signature.functionName,
    parameters: item.signature.parameters, returnType: item.signature.returnType, samples: samples.samples, source: item.metadata.source,
    languages: { csharp: { monacoId: 'csharp', starter: read('starters/csharp.txt') }, javascript: { monacoId: 'javascript', starter: read('starters/javascript.txt') } } }
})

// Independent examples derived from each public statement, not from Official testsets.
export const chapter3Examples: Record<string, ExerciseTest[]> = {
  'ch3-01': [ { args: [0], expected: true }, { args: [-1], expected: false }, { args: [1_000_000], expected: true } ],
  'ch3-02': [ { args: [1_000_000], expected: 1 }, { args: [-1_000_000], expected: -1 } ],
  'ch3-03': [ { args: [1, 2, 3], expected: 3 }, { args: [3, 2, 1], expected: 3 }, { args: [-1, -1, -1], expected: -1 } ],
  'ch3-04': [ { args: [2000], expected: true }, { args: [1900], expected: false }, { args: [2024], expected: true }, { args: [2025], expected: false }, { args: [1], expected: false }, { args: [9999], expected: false } ],
  'ch3-05': [ { args: [3, 3, 3], expected: 'equilateral' }, { args: [3, 4, 5], expected: 'scalene' }, { args: [5, 2, 3], expected: 'invalid' }, { args: [2, 5, 3], expected: 'invalid' }, { args: [4, 7, 4], expected: 'isosceles' }, { args: [7, 4, 4], expected: 'isosceles' } ],
  'ch3-06': [ { args: [2, 1900], expected: 28 }, { args: [2, 2000], expected: 29 }, { args: [1, 1], expected: 31 }, { args: [12, 9999], expected: 31 }, { args: [6, 2025], expected: 30 }, { args: [9, 2025], expected: 30 }, { args: [11, 2025], expected: 30 } ],
  'ch3-07': [ { args: [0, false], expected: 0 }, { args: [5, true], expected: 0 }, { args: [6, false], expected: 50 }, { args: [17, true], expected: 70 }, { args: [18, false], expected: 100 }, { args: [59, true], expected: 120 }, { args: [60, false], expected: 70 }, { args: [120, true], expected: 90 } ],
  'ch3-08': [ { args: [28, 2, 1900], expected: [1, 3, 1900] }, { args: [28, 2, 2000], expected: [29, 2, 2000] }, { args: [29, 2, 2000], expected: [1, 3, 2000] }, { args: [30, 4, 2025], expected: [1, 5, 2025] }, { args: [1, 1, 1], expected: [2, 1, 1] }, { args: [31, 12, 9998], expected: [1, 1, 9999] } ],
  'ch3-09': [ { args: [0], expected: 0 }, { args: [50], expected: 100 }, { args: [51], expected: 103 }, { args: [100], expected: 250 }, { args: [101], expected: 255 }, { args: [100_000], expected: 499_750 } ],
}

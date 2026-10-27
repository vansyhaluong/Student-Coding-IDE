import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Exercise, ExerciseTest } from '../../../src/shared/contracts/practice'

// Public-only assets: no traversal into judge/ or private reference solutions.
const root = resolve('resources/learning/exercises')
export const chapter7Exercises: Exercise[] = readdirSync(root).filter(id => /^ch7-\d+$/.test(id)).sort().map(id => {
  const read = (file: string) => readFileSync(resolve(root, id, file), 'utf8')
  const item = JSON.parse(read('exercise.json')), samples = JSON.parse(read('samples.json'))
  return { id: item.exerciseId, chapter: item.metadata.chapter, title: item.metadata.title, difficulty: item.metadata.difficulty,
    description: item.statement, constraints: item.constraints, functionName: item.signature.functionName,
    parameters: item.signature.parameters, returnType: item.signature.returnType, samples: samples.samples, source: item.metadata.source,
    languages: { csharp: { monacoId: 'csharp', starter: read('starters/csharp.txt') }, javascript: { monacoId: 'javascript', starter: read('starters/javascript.txt') } } }
})

// Independently specified examples; TwoSum inputs retain exactly one valid pair.
export const chapter7Examples: Record<string, ExerciseTest[]> = {
  'ch7-01': [ { args: [[-3, 4, 8], 5], expected: [0, 2] }, { args: [[0, 4, 0], 0], expected: [0, 2] }, { args: [[2, 5, 7], 12], expected: [1, 2] }, { args: [Array.from({ length: 1000 }, (_, i) => i), 1997], expected: [998, 999] }, { args: [[-10_000, 10_000], 0], expected: [0, 1] } ],
  'ch7-02': [ { args: [[7]], expected: 0 }, { args: [[1, 5]], expected: 4 }, { args: [[5, 5, 5]], expected: 0 }, { args: [[0, 10_000]], expected: 10_000 }, { args: [Array.from({ length: 10_000 }, (_, i) => i)], expected: 9999 }, { args: [[3, 1, 4, 0, 2]], expected: 3 } ],
  'ch7-03': [ { args: [[0]], expected: [1] }, { args: [[1, 2, 3]], expected: [1, 2, 4] }, { args: [[9, 9, 9]], expected: [1, 0, 0, 0] }, { args: [[8, 9]], expected: [9, 0] }, { args: [new Array(100).fill(9)], expected: [1, ...new Array(100).fill(0)] }, { args: [[1, ...new Array(99).fill(0)]], expected: [1, ...new Array(98).fill(0), 1] } ],
  'ch7-04': [ { args: [[0]], expected: 0 }, { args: [[-1000]], expected: -1000 }, { args: [[1, 2, 3]], expected: 6 }, { args: [[2, -1, 2, -1, 2]], expected: 4 }, { args: [new Array(10_000).fill(1000)], expected: 10_000_000 }, { args: [new Array(10_000).fill(-1000)], expected: -1000 } ],
  'ch7-05': [ { args: [[1, 2]], expected: [2, 1] }, { args: [[-2, 2]], expected: [2, -2] }, { args: [[0, 1, 0]], expected: [0, 0, 0] }, { args: [[-1, -2, -2]], expected: [4, 2, 2] }, { args: [new Array(20).fill(2)], expected: new Array(20).fill(524_288) }, { args: [[0, 0]], expected: [0, 0] } ],
  'ch7-06': [ { args: [[1], 1], expected: 0 }, { args: [[1], 2], expected: -1 }, { args: [[1, 3, 5], 5], expected: 2 }, { args: [[3, 5, 1], 1], expected: 2 }, { args: [[2, 1], 2], expected: 0 }, { args: [[-1_000_000, 0, 1_000_000], -1_000_000], expected: 0 }, { args: [Array.from({ length: 10_000 }, (_, i) => (i + 5000) % 10_000), 0], expected: 5000 } ],
  'ch7-07': [ { args: [[1, 1]], expected: 2 }, { args: [[1, 2, 0]], expected: 3 }, { args: [[3, 4, -1, 1]], expected: 2 }, { args: [[-1, -2, 0]], expected: 1 }, { args: [[7, 8, 9]], expected: 1 }, { args: [Array.from({ length: 10_000 }, (_, i) => i + 1)], expected: 10_001 }, { args: [[2, 2]], expected: 1 } ],
  'ch7-08': [ { args: [[]], expected: 0 }, { args: [[1]], expected: 0 }, { args: [[2, 1]], expected: 0 }, { args: [[5, 0, 1]], expected: 1 }, { args: [[0, 1, 0, 2]], expected: 1 }, { args: [[4, 2, 0, 3, 2, 5]], expected: 9 }, { args: [[10_000, ...new Array(9998).fill(0), 10_000]], expected: 99_980_000 } ],
  'ch7-09': [ { args: [[10]], expected: 1 }, { args: [[1, 1, 1]], expected: 3 }, { args: [[3, 2, 1]], expected: 6 }, { args: [[1, 3, 2, 2, 1]], expected: 7 }, { args: [[1, 2, 3, 2, 1]], expected: 9 }, { args: [Array.from({ length: 10_000 }, (_, i) => i)], expected: 50_005_000 }, { args: [[1, 2, 2, 1]], expected: 6 } ],
}

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Exercise, ExerciseTest } from '../../../src/shared/contracts/practice'

// Read only public metadata, samples and starters; never traverse judge/.
const root = resolve('resources/learning/exercises')
export const chapter6Exercises: Exercise[] = readdirSync(root).filter(id => /^ch6-\d+$/.test(id)).sort().map(id => {
  const read = (file: string) => readFileSync(resolve(root, id, file), 'utf8')
  const item = JSON.parse(read('exercise.json')), samples = JSON.parse(read('samples.json'))
  return { id: item.exerciseId, chapter: item.metadata.chapter, title: item.metadata.title, difficulty: item.metadata.difficulty,
    description: item.statement, constraints: item.constraints, functionName: item.signature.functionName,
    parameters: item.signature.parameters, returnType: item.signature.returnType, samples: samples.samples, source: item.metadata.source,
    languages: { csharp: { monacoId: 'csharp', starter: read('starters/csharp.txt') }, javascript: { monacoId: 'javascript', starter: read('starters/javascript.txt') } } }
})

// Independent examples from the public definitions, not Official datasets.
export const chapter6Examples: Record<string, ExerciseTest[]> = {
  'ch6-01': [ { args: [-1_000_000], expected: 1_000_000 }, { args: [1_000_000], expected: 1_000_000 }, { args: [7], expected: 7 }, { args: [-1], expected: 1 } ],
  'ch6-02': [ { args: [5, 10], expected: 9_765_625 }, { args: [-5, 10], expected: 9_765_625 }, { args: [-5, 9], expected: -1_953_125 }, { args: [0, 10], expected: 0 }, { args: [1, 10], expected: 1 }, { args: [-1, 0], expected: 1 } ],
  'ch6-03': [ { args: [7, -4], expected: -4 }, { args: [-1_000_000, 1_000_000], expected: -1_000_000 }, { args: [-7, -3], expected: -7 }, { args: [0, 0], expected: 0 }, { args: [1_000_000, 1_000_000], expected: 1_000_000 } ],
  'ch6-04': [ { args: [1, 10_000], expected: 10_000 }, { args: [20, 15], expected: 60 }, { args: [9999, 10_000], expected: 99_990_000 }, { args: [12, 18], expected: 36 }, { args: [1, 1], expected: 1 } ],
  'ch6-05': [ { args: [0], expected: true }, { args: [9], expected: true }, { args: [10], expected: false }, { args: [1221], expected: true }, { args: [1001], expected: true }, { args: [999_999_999], expected: true }, { args: [1_000_000_000], expected: false }, { args: [12345], expected: false } ],
  'ch6-06': [ { args: [2], expected: [1, 2] }, { args: [36], expected: [1, 2, 3, 4, 6, 9, 12, 18, 36] }, { args: [49], expected: [1, 7, 49] }, { args: [97], expected: [1, 97] }, { args: [100_000], expected: Array.from({ length: 100_000 }, (_, index) => index + 1).filter(divisor => 100_000 % divisor === 0) } ],
  'ch6-07': [ { args: [1, 0], expected: 1 }, { args: [20, 0], expected: 1 }, { args: [20, 20], expected: 1 }, { args: [20, 1], expected: 20 }, { args: [20, 10], expected: 184_756 }, { args: [20, 19], expected: 20 }, { args: [5, 2], expected: 10 } ],
  'ch6-08': [ { args: [9], expected: 9 }, { args: [10], expected: 1 }, { args: [99], expected: 9 }, { args: [999_999_999], expected: 9 }, { args: [1_000_000_000], expected: 1 }, { args: [199], expected: 1 } ],
  'ch6-09': [ { args: [2, 2], expected: 1 }, { args: [4, 4], expected: 0 }, { args: [49, 49], expected: 0 }, { args: [97, 101], expected: 2 }, { args: [0, 10_000], expected: 1229 }, { args: [9999, 10_000], expected: 0 }, { args: [1, 2], expected: 1 } ],
}

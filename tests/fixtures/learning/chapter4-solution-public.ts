import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Exercise, ExerciseTest } from '../../../src/shared/contracts/practice'

// Public assets only; do not traverse judge/ or private reference solutions.
const root = resolve('resources/learning/exercises')
export const chapter4Exercises: Exercise[] = readdirSync(root).filter(id => /^ch4-\d+$/.test(id)).sort().map(id => {
  const read = (file: string) => readFileSync(resolve(root, id, file), 'utf8')
  const item = JSON.parse(read('exercise.json')), samples = JSON.parse(read('samples.json'))
  return { id: item.exerciseId, chapter: item.metadata.chapter, title: item.metadata.title, difficulty: item.metadata.difficulty,
    description: item.statement, constraints: item.constraints, functionName: item.signature.functionName,
    parameters: item.signature.parameters, returnType: item.signature.returnType, samples: samples.samples, source: item.metadata.source,
    languages: { csharp: { monacoId: 'csharp', starter: read('starters/csharp.txt') }, javascript: { monacoId: 'javascript', starter: read('starters/javascript.txt') } } }
})

// Independently specified from the public statements; never copied from Official cases.
export const chapter4Examples: Record<string, ExerciseTest[]> = {
  'ch4-01': [ { args: [1], expected: 1 }, { args: [3], expected: 6 }, { args: [10_000], expected: 50_005_000 } ],
  'ch4-02': [ { args: [1], expected: 1 }, { args: [2], expected: 2 }, { args: [12], expected: 479_001_600 } ],
  'ch4-03': [ { args: [9], expected: 1 }, { args: [10], expected: 2 }, { args: [999], expected: 3 }, { args: [1000], expected: 4 }, { args: [1_000_000_000], expected: 10 } ],
  'ch4-04': [ { args: [9], expected: 9 }, { args: [10], expected: 1 }, { args: [1010], expected: 101 }, { args: [12_345_678], expected: 87_654_321 }, { args: [100_000_000], expected: 1 } ],
  'ch4-05': [ { args: [1, 1], expected: 1 }, { args: [1_000_000, 1_000_000], expected: 1_000_000 }, { args: [1, 1_000_000], expected: 1 }, { args: [30, 42], expected: 6 }, { args: [13, 17], expected: 1 } ],
  'ch4-06': [ { args: [0], expected: false }, { args: [2], expected: true }, { args: [3], expected: true }, { args: [4], expected: false }, { args: [49], expected: false }, { args: [1_000_000], expected: false } ],
  'ch4-07': [ { args: [0], expected: 0 }, { args: [2], expected: 1 }, { args: [3], expected: 2 }, { args: [10], expected: 4 }, { args: [100], expected: 25 }, { args: [100_000], expected: 9592 } ],
  'ch4-08': [ { args: [1], expected: false }, { args: [6], expected: true }, { args: [496], expected: true }, { args: [8128], expected: true }, { args: [36], expected: false }, { args: [1_000_000], expected: false } ],
  'ch4-09': [ { args: [1], expected: 1 }, { args: [2], expected: 1 }, { args: [3], expected: 2 }, { args: [10], expected: 55 }, { args: [45], expected: 1_134_903_170 } ],
}

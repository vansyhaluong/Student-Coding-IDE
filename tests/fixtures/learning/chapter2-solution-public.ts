import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Exercise, ExerciseTest } from '../../../src/shared/contracts/practice'

// Explicit public-only reads. No Official testset or developer reference access.
const root = resolve('resources/learning/exercises')
export const chapter2Exercises: Exercise[] = readdirSync(root).filter(id => /^ch2-\d+$/.test(id)).sort().map(id => {
  const read = (file: string) => readFileSync(resolve(root, id, file), 'utf8')
  const item = JSON.parse(read('exercise.json')), samples = JSON.parse(read('samples.json'))
  return { id: item.exerciseId, chapter: item.metadata.chapter, title: item.metadata.title, difficulty: item.metadata.difficulty,
    description: item.statement, constraints: item.constraints, functionName: item.signature.functionName,
    parameters: item.signature.parameters, returnType: item.signature.returnType, samples: samples.samples, source: item.metadata.source,
    languages: { csharp: { monacoId: 'csharp', starter: read('starters/csharp.txt') }, javascript: { monacoId: 'javascript', starter: read('starters/javascript.txt') } } }
})
// Independent boundary examples derived from public statements, not Official cases.
export const chapter2Examples: Record<string, ExerciseTest[]> = {
  'ch2-01': [{ args: [1_000_000, 1_000_000], expected: 2_000_000 }, { args: [-1_000_000, -1_000_000], expected: -2_000_000 }],
  'ch2-02': [{ args: [10000, 10000], expected: 40000 }, { args: [1, 10000], expected: 20002 }],
  'ch2-03': [{ args: [1], expected: 60 }, { args: [10000], expected: 600000 }],
  'ch2-04': [{ args: [0, 1], expected: [0, 0] }, { args: [12, 3], expected: [4, 0] }, { args: [1_000_000, 1], expected: [1_000_000, 0] }, { args: [1_000_000, 999], expected: [1001, 1] }],
  'ch2-05': [{ args: [999], expected: 27 }, { args: [101], expected: 2 }, { args: [909], expected: 18 }],
  'ch2-06': [{ args: [100], expected: 1 }, { args: [120], expected: 21 }, { args: [101], expected: 101 }, { args: [999], expected: 999 }],
  'ch2-07': [{ args: [0, 0], expected: 0 }, { args: [86399, 1], expected: 0 }, { args: [0, 86400], expected: 0 },
    { args: [12, 172800], expected: 12 }, { args: [86399, 1_000_000], expected: 49599 }],
  'ch2-08': [{ args: [25, 5], expected: 5 }, { args: [1, 1000], expected: 1 }, { args: [0, 1000], expected: 0 },
    { args: [1_000_000, 1], expected: 1_000_000 }, { args: [1_000_000, 999], expected: 1002 }],
  'ch2-09': [{ args: [0, 0, 1], expected: 0 }, { args: [100, 100, 1], expected: 100 }, { args: [0, 1, 3], expected: 3 },
    { args: [1, 1, 3], expected: 6 }, { args: [100, 0, 1000], expected: 100000 }, { args: [100, 100, 1000], expected: 50050000 }],
}

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Exercise, ExerciseTest } from '../../../src/shared/contracts/practice'

// Public assets only: metadata, samples and starters; never traverse judge/.
const root = resolve('resources/learning/exercises')
export const chapter5Exercises: Exercise[] = readdirSync(root).filter(id => /^ch5-\d+$/.test(id)).sort().map(id => {
  const read = (file: string) => readFileSync(resolve(root, id, file), 'utf8')
  const item = JSON.parse(read('exercise.json')), samples = JSON.parse(read('samples.json'))
  return { id: item.exerciseId, chapter: item.metadata.chapter, title: item.metadata.title, difficulty: item.metadata.difficulty,
    description: item.statement, constraints: item.constraints, functionName: item.signature.functionName,
    parameters: item.signature.parameters, returnType: item.signature.returnType, samples: samples.samples, source: item.metadata.source,
    languages: { csharp: { monacoId: 'csharp', starter: read('starters/csharp.txt') }, javascript: { monacoId: 'javascript', starter: read('starters/javascript.txt') } } }
})

// Independently authored from public statements. No Official testcase/Expected reads.
export const chapter5Examples: Record<string, ExerciseTest[]> = {
  'ch5-01': [ { args: ['  a   '], expected: 1 }, { args: ['abc'], expected: 3 }, { args: ['one two xyz'], expected: 3 }, { args: ['a'.repeat(1000)], expected: 1000 } ],
  'ch5-02': [ { args: ['', 'a'], expected: -1 }, { args: ['ab', 'abc'], expected: -1 }, { args: ['abc', 'abc'], expected: 0 }, { args: ['abc', 'c'], expected: 2 }, { args: ['aaaaa', 'aaa'], expected: 0 }, { args: ['a'.repeat(1000), 'a'.repeat(99) + 'b'], expected: -1 } ],
  'ch5-03': [ { args: [['']], expected: '' }, { args: [['abc', '']], expected: '' }, { args: [['alone']], expected: 'alone' }, { args: [['abcd', 'ab', 'abc']], expected: 'ab' }, { args: [['a'.repeat(100), 'a'.repeat(100)]], expected: 'a'.repeat(100) } ],
  'ch5-04': [ { args: ['  a  b   c  '], expected: 'c b a' }, { args: ['a   '], expected: 'a' }, { args: ['   xyz'], expected: 'xyz' }, { args: ['a'.repeat(1000)], expected: 'a'.repeat(1000) } ],
  'ch5-05': [ { args: ['a'], expected: 1 }, { args: ['aaaaa'], expected: 1 }, { args: ['abba'], expected: 2 }, { args: ['abcdef'], expected: 6 }, { args: ['abcdefghijklmnopqrstuvwxyz'.repeat(385).slice(0, 10_000)], expected: 26 } ],
  'ch5-06': [ { args: ['', ''], expected: true }, { args: ['a', ''], expected: false }, { args: ['abc', 'cab'], expected: true }, { args: ['aab', 'abb'], expected: false }, { args: ['a'.repeat(10_000), 'a'.repeat(10_000)], expected: true }, { args: ['a'.repeat(9999) + 'b', 'a'.repeat(10_000)], expected: false } ],
  'ch5-07': [ { args: ['aaab', 'aab'], expected: 'aab' }, { args: ['abaac', 'aac'], expected: 'aac' }, { args: ['ab', 'b'], expected: 'b' }, { args: ['zz', 'a'], expected: '' }, { args: ['cab', 'abc'], expected: 'cab' }, { args: ['xabycz', 'abc'], expected: 'abyc' }, { args: ['x'.repeat(997) + 'abc', 'abc'], expected: 'abc' }, { args: ['a'.repeat(1000), 'a'.repeat(1000)], expected: 'a'.repeat(1000) } ],
  'ch5-08': [ { args: ['', ''], expected: 0 }, { args: ['abc', ''], expected: 3 }, { args: ['abc', 'abc'], expected: 0 }, { args: ['a', 'b'], expected: 1 }, { args: ['ab', 'ba'], expected: 2 }, { args: ['abc', 'ac'], expected: 1 }, { args: ['a'.repeat(100), 'b'.repeat(100)], expected: 100 } ],
  'ch5-09': [ { args: ['', ''], expected: 1 }, { args: ['', 'a'], expected: 0 }, { args: ['a', 'aa'], expected: 0 }, { args: ['aaa', 'aa'], expected: 3 }, { args: ['ababa', 'aba'], expected: 4 }, { args: ['abcabc', 'abc'], expected: 4 }, { args: ['a'.repeat(20), 'a'.repeat(10)], expected: 184_756 }, { args: ['a'.repeat(20), 'a'.repeat(20)], expected: 1 } ],
}

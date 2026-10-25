import type { Exercise } from '../../../../shared/contracts/practice'
import type { ValidatedPublicPackage } from './exercise-package-contracts'
/** Explicit allowlist. No spread of private metadata, comparator or descriptors. */
export function publicExercise(data: ValidatedPublicPackage): Exercise {
  const m = data.metadata
  return { id: m.exerciseId, chapter: m.metadata.chapter, title: m.metadata.title, difficulty: m.metadata.difficulty,
    description: m.statement, constraints: m.constraints, functionName: m.signature.functionName,
    parameters: m.signature.parameters, returnType: m.signature.returnType,
    samples: data.samples.samples.map(s => ({ args: s.args, expected: s.expected })),
    languages: { csharp: { monacoId: 'csharp', starter: data.starters.csharp }, javascript: { monacoId: 'javascript', starter: data.starters.javascript } },
    source: m.metadata.source }
}

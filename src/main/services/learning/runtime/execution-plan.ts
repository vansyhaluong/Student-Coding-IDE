import type { ExerciseType } from '../../../../shared/contracts/practice'
import { matchesExerciseType } from '../../../../shared/contracts/practice'
import { exerciseCoreError } from './exercise-limits'

export type ExecutionValue = number | boolean | string | readonly number[] | readonly string[] | readonly (readonly number[])[]
export interface ExecutionSignature {
  readonly functionName: string
  readonly parameters: readonly { readonly name: string; readonly type: ExerciseType }[]
  readonly returnType: ExerciseType
}
/** Borrowed Main-only inputs. No Expected, visibility or Judge/package identities. */
export interface ExecutionPlan {
  readonly signature: ExecutionSignature
  readonly caseCount: number
  inputAt(index: number): readonly ExecutionValue[]
}
const types: readonly ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
/** Separate Official contract; this does not widen isExercise's public sample cap. */
export function checkExecutionSignature(signature: ExecutionSignature, caseCount: number): void {
  if (!Number.isSafeInteger(caseCount) || caseCount < 1 || caseCount > 128
    || !/^[A-Za-z][A-Za-z0-9]*$/.test(signature.functionName) || signature.parameters.length > 16
    || !types.includes(signature.returnType) || !signature.parameters.every(p => types.includes(p.type))) throw exerciseCoreError('HARNESS_SCHEMA')
}
export function checkExecutionInput(plan: ExecutionPlan, index: number): readonly ExecutionValue[] {
  if (!Number.isSafeInteger(index) || index < 0 || index >= plan.caseCount) throw exerciseCoreError('HARNESS_SCHEMA')
  const args = plan.inputAt(index)
  if (args.length !== plan.signature.parameters.length || !args.every((a, i) => matchesExerciseType(a, plan.signature.parameters[i].type))) throw exerciseCoreError('HARNESS_SCHEMA')
  return args
}

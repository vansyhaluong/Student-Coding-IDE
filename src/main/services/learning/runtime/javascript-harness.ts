import source from './javascript-harness-child.mjs?raw'
import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import { validateExerciseDraft } from '../../../../shared/contracts/practice'
import { validateJavascriptHarnessRequest, validateJavascriptSampleSchema } from '../../../../shared/contracts/javascript-execution-validation'
import type { JavascriptHarness, JavascriptHarnessFiles, JavascriptPreparedExecution, JavascriptPreparationContext, JavascriptHarnessPreparation } from './javascript-execution-contracts'
import { JavascriptHarnessWorkspace } from './javascript-harness-workspace'
import { exerciseCoreError } from './exercise-limits'
import { checkJavascriptWork } from './javascript-node-files'
import type { ExecutionSignature } from './execution-plan'
import { checkExecutionSignature } from './execution-plan'
import type { JavascriptSampleSchema } from '../../../../shared/contracts/javascript-execution'

/** Pure input-only preparation; does not evaluate code, create files or execute cases. */
export function javascriptSignaturePreparation(signature: ExecutionSignature, caseCount: number, code: string, schema: JavascriptSampleSchema): string {
  checkExecutionSignature(signature, caseCount)
  if (!validateJavascriptSampleSchema(schema).ok || schema.sampleCount !== caseCount || schema.returnType !== signature.returnType
    || JSON.stringify(schema.parameterTypes) !== JSON.stringify(signature.parameters.map(p => p.type))
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(code)) throw exerciseCoreError('INTERNAL_ERROR')
  const contents = JSON.stringify({ code, functionName: signature.functionName, schema })
  if (Buffer.byteLength(contents, 'utf8') > EXERCISE_LIMITS.outputBytes) throw exerciseCoreError('INTERNAL_ERROR')
  return contents
}
export function javascriptInputRequest(args: unknown, schema: JavascriptSampleSchema, caseIndex: number) {
  const checked = validateJavascriptHarnessRequest({ protocolVersion: 1, caseIndex, args }, schema, caseIndex)
  if (!checked.ok) throw exerciseCoreError('INTERNAL_ERROR')
  return checked.value
}

export const JAVASCRIPT_HARNESS_SOURCE = source
export class FixedJavascriptHarness implements JavascriptHarness {
  private retained?: { input: JavascriptHarnessPreparation; workspace: JavascriptHarnessWorkspace; files: JavascriptHarnessFiles }
  async prepare(input: JavascriptHarnessPreparation, context: JavascriptPreparationContext): Promise<JavascriptHarnessFiles> {
    checkJavascriptWork(context)
    const legacy = 'exercise' in input
    const signature = legacy ? input.exercise : input.signature
    if (this.retained || !validateExerciseDraft({ exerciseId: legacy ? input.exercise.id : input.exerciseId, language: 'javascript', code: input.code }).ok
      || legacy && input.schema.sampleCount !== input.exercise.samples.length) throw exerciseCoreError('INTERNAL_ERROR')
    const contents = javascriptSignaturePreparation(signature, input.schema.sampleCount, input.code, input.schema)
    const workspace = new JavascriptHarnessWorkspace(input.workspace), files = workspace.files
    this.retained = { input, workspace, files }
    await workspace.create(context)
    await workspace.write(files.sourcePath, contents, context)
    await workspace.write(files.harnessPath, source, context)
    await workspace.verify(context)
    return files
  }
  request(input: JavascriptPreparedExecution, caseIndex: number) {
    return javascriptInputRequest(input.exercise.samples[caseIndex]?.args, input.schema, caseIndex)
  }
  async revalidate(input: JavascriptHarnessPreparation, files: JavascriptHarnessFiles, context: JavascriptPreparationContext): Promise<void> {
    if (!this.retained || this.retained.input !== input || this.retained.files !== files) throw exerciseCoreError('WORKSPACE_REPLACED')
    await this.retained.workspace.verify(context)
  }
}

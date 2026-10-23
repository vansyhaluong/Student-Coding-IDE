import source from './javascript-harness-child.mjs?raw'
import { EXERCISE_LIMITS } from '../../../../shared/contracts/exercise'
import { validateExerciseDraft } from '../../../../shared/contracts/practice'
import { validateJavascriptHarnessRequest, validateJavascriptSampleSchema } from '../../../../shared/contracts/javascript-execution-validation'
import type { JavascriptHarness, JavascriptHarnessFiles, JavascriptPreparedExecution, JavascriptPreparationContext } from './javascript-execution-contracts'
import { JavascriptHarnessWorkspace } from './javascript-harness-workspace'
import { exerciseCoreError } from './exercise-limits'
import { checkJavascriptWork } from './javascript-node-files'

export const JAVASCRIPT_HARNESS_SOURCE = source
export class FixedJavascriptHarness implements JavascriptHarness {
  private retained?: { input: JavascriptPreparedExecution; workspace: JavascriptHarnessWorkspace; files: JavascriptHarnessFiles }
  async prepare(input: JavascriptPreparedExecution, context: JavascriptPreparationContext): Promise<JavascriptHarnessFiles> {
    checkJavascriptWork(context)
    if (this.retained || !validateExerciseDraft({ exerciseId: input.exercise.id, language: 'javascript', code: input.code }).ok
      || !validateJavascriptSampleSchema(input.schema).ok || !/^[A-Za-z][A-Za-z0-9]*$/.test(input.exercise.functionName)
      || input.schema.sampleCount !== input.exercise.samples.length || input.schema.returnType !== input.exercise.returnType
      || JSON.stringify(input.schema.parameterTypes) !== JSON.stringify(input.exercise.parameters.map(p => p.type))
      || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input.code)) throw exerciseCoreError('INTERNAL_ERROR')
    const contents = JSON.stringify({ code: input.code, functionName: input.exercise.functionName, schema: input.schema })
    if (Buffer.byteLength(contents, 'utf8') > EXERCISE_LIMITS.outputBytes) throw exerciseCoreError('INTERNAL_ERROR')
    const workspace = new JavascriptHarnessWorkspace(input.workspace), files = workspace.files
    this.retained = { input, workspace, files }
    await workspace.create(context)
    await workspace.write(files.sourcePath, contents, context)
    await workspace.write(files.harnessPath, source, context)
    await workspace.verify(context)
    return files
  }
  request(input: JavascriptPreparedExecution, caseIndex: number) {
    const checked = validateJavascriptHarnessRequest({ protocolVersion: 1, caseIndex, args: input.exercise.samples[caseIndex]?.args }, input.schema, caseIndex)
    if (!checked.ok) throw exerciseCoreError('INTERNAL_ERROR')
    return checked.value
  }
  async revalidate(input: JavascriptPreparedExecution, files: JavascriptHarnessFiles, context: JavascriptPreparationContext): Promise<void> {
    if (!this.retained || this.retained.input !== input || this.retained.files !== files) throw exerciseCoreError('WORKSPACE_REPLACED')
    await this.retained.workspace.verify(context)
  }
}

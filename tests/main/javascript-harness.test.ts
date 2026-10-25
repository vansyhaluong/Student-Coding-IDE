import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FixedJavascriptHarness, JAVASCRIPT_HARNESS_SOURCE } from '../../src/main/services/learning/runtime/javascript-harness'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import type { JavascriptPreparedExecution } from '../../src/main/services/learning/runtime/javascript-execution-contracts'
import { exercises } from '../fixtures/learning/legacy-exercises'
import { probeContext } from '../fixtures/learning/javascript-node-files'
import { EXERCISE_LIMITS } from '../../src/shared/contracts/exercise'
import { JAVASCRIPT_HARNESS_VERSION, JAVASCRIPT_PROTOCOL_MAX_DEPTH } from '../../src/shared/contracts/javascript-execution'

let root: string
describe.skipIf(process.platform !== 'win32')('Fixed JavaScript harness workspace and requests', () => {
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'Learning-js-harness-')) })
  afterEach(async () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('Learning-js-harness-')) throw Error('Unsafe fixture cleanup')
    await rm(root, { recursive: true, force: true })
  })
  async function fixture(code = 'function Sum(a,b){ return a+b; }') {
    const workspace = new ExerciseWorkspace(root, 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
    await workspace.prepare()
    const exercise = structuredClone(exercises[0])
    const input: JavascriptPreparedExecution = { workspace, exercise, code, sourceRevision: 1,
      schema: { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length },
      node: { executablePath: 'C:\\node.exe', canonicalPath: 'C:\\node.exe', version: 'v24.1.0', architecture: 'x64', identity: { volume: '1', fileId: '1' } } }
    return { input, harness: new FixedJavascriptHarness(), context: probeContext(), workspace }
  }
  it('writes fixed raw child asset and separate source data exclusively, without evaluating source', async () => {
    const code = 'throw Error("MUST NOT EVALUATE IN MAIN"); /* ' + String.fromCharCode(36) + '{ code } ' + String.fromCharCode(96) + ' " \\\\ */'
    const f = await fixture(code), files = await f.harness.prepare(f.input, f.context)
    expect(await readFile(files.harnessPath, 'utf8')).toBe(JAVASCRIPT_HARNESS_SOURCE)
    expect(JAVASCRIPT_HARNESS_SOURCE).not.toContain(code)
    expect(JSON.parse(await readFile(files.sourcePath, 'utf8'))).toEqual({ code, functionName: f.input.exercise.functionName, schema: f.input.schema })
    await f.harness.revalidate(f.input, files, f.context)
    await expect(f.harness.prepare(f.input, f.context)).rejects.toThrow()
    expect(f.harness.request(f.input, 0)).toEqual({ protocolVersion: 1, caseIndex: 0, args: f.input.exercise.samples[0].args })
    expect(() => f.harness.request(f.input, -1)).toThrow()
    expect(() => f.harness.request(f.input, f.input.schema.sampleCount)).toThrow()
    await f.workspace.releaseLease()
  })
  it('keeps child constants aligned with Step 1 without importing/evaluating the asset', () => {
    expect(JAVASCRIPT_HARNESS_VERSION).toBe(1); expect(JAVASCRIPT_PROTOCOL_MAX_DEPTH).toBe(12)
    expect(EXERCISE_LIMITS.outputBytes).toBe(1024 * 1024)
    expect(JAVASCRIPT_HARNESS_SOURCE).toContain('const MAX = 1024 * 1024, VERSION = 1, DEPTH = 12')
    expect(JAVASCRIPT_HARNESS_SOURCE).toContain('function bootstrap()')
  })
  it.each(['source', 'harness'] as const)('rejects %s replacement or edits before launch', async name => {
    const f = await fixture(), files = await f.harness.prepare(f.input, f.context)
    const file = name === 'source' ? files.sourcePath : files.harnessPath
    await rename(file, file + '.old'); await writeFile(file, await readFile(file + '.old'))
    await expect(f.harness.revalidate(f.input, files, f.context)).rejects.toMatchObject({ details: { reason: 'WORKSPACE_REPLACED' } })
    await f.workspace.releaseLease()
  })
  it('rejects in-place source mutation and foreign path objects', async () => {
    const f = await fixture(), files = await f.harness.prepare(f.input, f.context)
    await expect(f.harness.revalidate(f.input, { ...files }, f.context)).rejects.toThrow()
    await writeFile(files.sourcePath, 'changed')
    await expect(f.harness.revalidate(f.input, files, f.context)).rejects.toThrow()
    await f.workspace.releaseLease()
  })
  it('refuses a pre-existing JavaScript directory or reparse file', async () => {
    const f = await fixture(), files = await f.harness.prepare(f.input, f.context)
    await rename(files.sourcePath, files.sourcePath + '.old')
    await symlink(f.workspace.path, files.sourcePath, 'junction')
    await expect(f.harness.revalidate(f.input, files, f.context)).rejects.toThrow()
    const second = new FixedJavascriptHarness()
    await expect(second.prepare(f.input, f.context)).rejects.toThrow()
    await f.workspace.releaseLease()
  })
  it('rejects cancelled preparation, invalid Unicode/schema and lost lease', async () => {
    const f = await fixture()
    const controller = new AbortController(); controller.abort()
    await expect(f.harness.prepare(f.input, { ...f.context, signal: controller.signal })).rejects.toThrow()
    await expect(f.harness.prepare({ ...f.input, code: '\ud800' }, f.context)).rejects.toThrow()
    await expect(f.harness.prepare({ ...f.input, schema: { ...f.input.schema, sampleCount: 0 } }, f.context)).rejects.toThrow()
    await f.workspace.releaseLease()
    await expect(f.harness.prepare(f.input, f.context)).rejects.toThrow()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { exercises } from '../fixtures/learning/legacy-exercises'
import type { ExerciseType } from '../../src/shared/contracts/practice'
import { generateCsharpHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { CsharpDiagnostics } from '../../src/main/services/learning/runtime/csharp-diagnostics'
import { csharpResponseFile, csharpRuntimeConfig } from '../../src/main/services/learning/runtime/csharp-compiler'
import { CsharpCompileWorkspace } from '../../src/main/services/learning/runtime/csharp-compile-workspace'
import { ExerciseWorkspace } from '../../src/main/services/learning/runtime/exercise-workspace'
import type { CsharpSdkSelection } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import { validateCsharpCompilerDiagnostic } from '../../src/shared/contracts/csharp-execution-validation'

const types: ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
const names = ['int', 'bool', 'string', 'int[]', 'string[]', 'int[][]']
const sample = exercises[0]
const schema = (type: ExerciseType) => ({ parameterTypes: [type], returnType: type, sampleCount: 1 })
const sdk: CsharpSdkSelection = { sdkVersion: '10.0.900', runtimeVersion: '10.0.25', dotnetPath: 'C:\\SDK Unicode Ω\\dotnet.exe',
  sdkDirectory: 'C:\\SDK Unicode Ω\\sdk\\10.0.900', compilerPath: 'C:\\SDK Unicode Ω\\sdk\\10.0.900\\Roslyn\\bincore\\csc.dll',
  runtimeDirectory: 'C:\\SDK Unicode Ω\\shared\\Microsoft.NETCore.App\\10.0.25', referenceDirectory: 'C:\\SDK Unicode Ω\\ref',
  references: ['System.Runtime', 'System.Console', 'System.Text.Json', 'System.Collections'].map(name => `C:\\SDK Unicode Ω\\ref\\${name}.dll`), targetFramework: 'net10.0' }
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'learning csharp Ω ')); roots.push(root)
  const workspace = new ExerciseWorkspace(root, 'exercise_12345678-1234-4234-8234-123456789abc', { acquire: async () => ({ release: async () => {} }) })
  await workspace.prepare()
  const files = new CsharpCompileWorkspace(workspace, { signal: new AbortController().signal, deadline: performance.now() + 30_000 })
  return { workspace, files }
}

describe('C# harness/config generation (no C# execution)', () => {
  it.each(types)('generates statically typed %s invocation and bounded protocol', type => {
    const exercise = { ...sample, functionName: 'Echo', parameters: [{ name: 'value', type }], returnType: type, samples: [sample.samples[0]] }
    const source = generateCsharpHarness(exercise, schema(type)), name = names[types.indexOf(type)]
    expect(source).toContain(`global::System.Func<${name}, ${name}> invoke = new global::Solution().@Echo`)
    expect(source).toContain('actual = invoke(arg0)')
    expect(source).toContain('SetOut(global::System.IO.TextWriter.Synchronized(stdout))')
    expect(source).toContain('response.CopyTo(physicalOutput)')
    expect(source).toContain('UTF8Encoding(false, true)')
    expect(source).toContain('fields != 7'); expect(source).toContain('MaxDepth = 12')
    expect(source).not.toMatch(/Reflection|GetMethod|expected|NuGet/)
  })
  it('generates every existing Main catalogue signature without embedding examples or statements', () => {
    expect(exercises).toHaveLength(63)
    for (const exercise of exercises) {
      const source = generateCsharpHarness(exercise, { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length })
      expect(source).toContain(`().@${exercise.functionName}`)
      expect(source).not.toContain(exercise.description)
    }
  })
  it('rejects signature injection and schema disagreement', () => {
    expect(() => generateCsharpHarness({ ...sample, functionName: 'Sum(); Evil()' }, { parameterTypes: ['int32', 'int32'], returnType: 'int32', sampleCount: 2 })).toThrow()
    expect(() => generateCsharpHarness(sample, schema('boolean'))).toThrow()
  })
  it('serializes Main runtime selection per operation without a product patch lock', () => {
    for (const version of ['10.0.1', '10.0.25', '10.1.2']) expect(JSON.parse(csharpRuntimeConfig({ ...sdk, runtimeVersion: version })).runtimeOptions)
      .toEqual({ tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version }, rollForward: 'Disable' })
    expect(() => csharpRuntimeConfig({ ...sdk, runtimeVersion: '11.0.0' })).toThrow()
    expect(() => csharpRuntimeConfig({ ...sdk, runtimeVersion: '10.0.1-preview' })).toThrow()
  })
  it('uses fixed entry/output and explicit references; no restore, project, analyzers or arguments from source', async () => {
    const { files } = await workspace(), response = csharpResponseFile(sdk, files)
    expect(response).toContain('/main:StudentLearning.Harness')
    expect(response).toContain('/reference:"C:\\SDK Unicode Ω\\ref\\System.Text.Json.dll"')
    expect(response).toContain('/nostdlib+'); expect(response).toContain('/unsafe-')
    expect(response).not.toMatch(/csproj|MSBuild|NuGet|restore|analyzer|shared/)
    expect(() => csharpResponseFile({ ...sdk, references: sdk.references.slice(1) }, files)).toThrow()
    expect(() => csharpResponseFile({ ...sdk, references: [...sdk.references, 'C:\\outside.dll'] }, files)).toThrow()
  })
  it('writes exact Unicode student source exclusively and detects replacement', async () => {
    const { workspace: owner, files } = await workspace(); await files.create()
    const source = 'public class Solution { // tiếng Việt Ω\n }'
    await files.write(files.solution, source)
    expect(await readFile(files.solution, 'utf8')).toBe(source)
    await expect(files.write(files.solution, 'overwrite')).rejects.toThrow()
    await rename(files.solution, files.solution + '.old'); await writeFile(files.solution, source)
    await expect(files.verifyFiles()).rejects.toThrow()
    await owner.releaseLease()
  })
  it('rejects unprepared/lease-less workspaces and arbitrary write paths', async () => {
    const { workspace: owner, files } = await workspace()
    await expect(files.write(join(owner.root, 'escape.cs'), 'bad')).rejects.toThrow()
    await owner.releaseLease(); await expect(files.create()).rejects.toThrow()
  })
  it('does not adopt a pre-existing compilation directory or a junction', async () => {
    const { workspace: owner, files } = await workspace()
    await symlink(owner.root, files.directory, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(files.create()).rejects.toThrow()
    await rm(files.directory); await files.create()
    await expect(files.create()).rejects.toThrow()
  })
})

describe('Roslyn diagnostics normalization', () => {
  it('parses streamed Unicode/spaced paths, strips messages and validates safe DTOs', () => {
    const parser = new CsharpDiagnostics('C:\\workspace Ω\\Solution.cs', 'C:\\workspace Ω\\Harness.cs')
    parser.write('stdout', 'C:\\workspace Ω\\Sol'); parser.write('stdout', 'ution.cs(2,7): error CS1002: secret source and C:\\system\r\n')
    parser.write('stderr', 'C:\\workspace Ω\\Harness.cs(40,10): error CS1061: secret method')
    parser.finish()
    expect(parser.sourceError).toBe(true); expect(parser.infrastructureError).toBe(false)
    expect(parser.diagnostics.map(d => d.source)).toEqual(['solution', 'harness'])
    expect(parser.diagnostics.every(d => validateCsharpCompilerDiagnostic(d).ok)).toBe(true)
    expect(JSON.stringify(parser.streams())).not.toMatch(/secret|workspace|system/)
  })
  it('treats dependency/global/unknown harness errors as infrastructure, not syntax', () => {
    for (const text of ['error CS0006: secret dependency', 'Harness.cs(1,2): error CS1002: generated bug', 'C:\\private\\Other.cs(1,2): error CS1002: unknown location']) {
      const parser = new CsharpDiagnostics('Solution.cs', 'Harness.cs'); parser.write('stdout', text); parser.finish()
      expect(parser.infrastructureError).toBe(true); expect(parser.sourceError).toBe(false)
    }
  })
  it('bounds diagnostics and oversized/unknown lines without exposing raw output', () => {
    const parser = new CsharpDiagnostics('Solution.cs', 'Harness.cs')
    parser.write('stderr', 'C:\\secret'.repeat(30_000) + '\n')
    parser.write('stdout', 'Solution.cs(1,1): warning CS0168: secret\n'.repeat(1000)); parser.finish()
    expect(parser.truncated).toBe(true); expect(parser.diagnostics).toHaveLength(128)
    expect(Buffer.byteLength(JSON.stringify(parser.streams()))).toBeLessThan(16_384)
    expect(parser.streams().stderr).toBe('')
  })
  it('retains a real error diagnostic after warning truncation', () => {
    const parser = new CsharpDiagnostics('Solution.cs', 'Harness.cs')
    parser.write('stdout', 'Solution.cs(1,1): warning CS0168: unused\n'.repeat(128))
    parser.write('stderr', 'Solution.cs(2,1): error CS1002: semicolon\n'); parser.finish()
    expect(parser.diagnostics).toHaveLength(128)
    expect(parser.diagnostics.at(-1)).toMatchObject({ severity: 'error', code: 'CS1002' })
    expect(parser.sourceError).toBe(true)
  })
})

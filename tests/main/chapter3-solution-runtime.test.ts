import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { generateCsharpHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { matchesExerciseType } from '../../src/shared/contracts/practice'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter3Exercises, chapter3Examples } from '../fixtures/learning/chapter3-solution-public'

// Narrow teaching-code verification, not a native Runtime/Job/Judge acceptance.
// Sources are only the authored Chapter 3 examples and the existing pure harness generator.
const evidence = resolve('out/solution-chapter3-20261027')
mkdirSync(evidence, { recursive: true })
const runRoot = mkdtempSync(join(evidence, 'runtime-'))
const dotnetRoot = 'C:/Program Files/dotnet'
const dotnet = join(dotnetRoot, 'dotnet.exe'), sdk = '10.0.112', runtime = '10.0.12'
const compiler = join(dotnetRoot, 'sdk', sdk, 'Roslyn/bincore/csc.dll')
const refDir = join(dotnetRoot, 'packs/Microsoft.NETCore.App.Ref', runtime, 'ref/net10.0')
const available = process.platform === 'win32' && existsSync(dotnet) && existsSync(compiler) && existsSync(refDir)
if (!available) writeFileSync(join(runRoot, 'csharp-unverified.json'), JSON.stringify({ status: 'UNVERIFIED', reason: 'Required local .NET 10 SDK/reference pack unavailable' }))
const hash = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex')
const environment = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_EnableDiagnostics: '0' }

for (const exercise of chapter3Exercises) {
  const cases = [...exercise.samples, ...chapter3Examples[exercise.id]]
  it(`${exercise.id}: authored JavaScript returns typed expected values on public and independently specified examples`, () => {
    const code = solutionCode(solutionFor(exercise)!, 'javascript')
    const outcomes = cases.map((sample, index) => {
      const actual = runInNewContext(`${code}\n${exercise.functionName}(...args)`, { args: structuredClone(sample.args) }, { timeout: 1000 })
      return { kind: index < exercise.samples.length ? 'PUBLIC_SAMPLE' : 'INDEPENDENT_EXAMPLE', args: sample.args, expected: sample.expected, actual, pass: matchesExerciseType(actual, exercise.returnType) && JSON.stringify(actual) === JSON.stringify(sample.expected) }
    })
    writeFileSync(join(runRoot, `${exercise.id}-javascript.json`), JSON.stringify({ engine: process.version, codeSha256: hash(code), outcomes }, null, 2))
    expect(outcomes.every(outcome => outcome.pass)).toBe(true)
  })

  it.skipIf(!available)(`${exercise.id}: authored C# compiles against the real signature harness and returns public/independent results on .NET 10`, () => {
    const directory = join(runRoot, exercise.id); mkdirSync(directory)
    const code = solutionCode(solutionFor(exercise)!, 'csharp')
    const schema = { parameterTypes: exercise.parameters.map(parameter => parameter.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }
    const harness = generateCsharpHarness(exercise, schema)
    const solution = join(directory, 'Solution.cs'), harnessFile = join(directory, 'Harness.cs'), dll = join(directory, 'Solution.dll')
    const config = join(directory, 'Solution.runtimeconfig.json'), response = join(directory, 'compile.rsp')
    writeFileSync(solution, code); writeFileSync(harnessFile, harness)
    writeFileSync(config, JSON.stringify({ runtimeOptions: { tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version: runtime }, rollForward: 'Disable' } }))
    const quote = (path: string) => `"${path}"`
    const flags = ['/nologo', '/nostdlib+', '/target:exe', '/platform:x64', '/unsafe-', '/checked-', '/optimize+', '/debug-', '/deterministic+', '/nullable:enable', '/langversion:default', '/utf8output', '/codepage:65001', '/main:StudentLearning.Harness', `/out:${quote(dll)}`,
      ...readdirSync(refDir).filter(name => name.endsWith('.dll')).map(name => `/reference:${quote(join(refDir, name))}`), quote(solution), quote(harnessFile)]
    writeFileSync(response, flags.join('\n'))
    const args = ['exec', '--fx-version', runtime, '--roll-forward', 'Disable', compiler, '/noconfig', `@${response}`]
    const compiled = spawnSync(dotnet, args, { cwd: directory, env: environment, encoding: 'utf8', windowsHide: true, timeout: 30000 })
    writeFileSync(join(directory, 'compile-receipt.json'), JSON.stringify({ sdk, runtime, command: [dotnet, ...args], codeSha256: hash(code), harnessSha256: hash(harness), exitCode: compiled.status, error: compiled.error?.message, stdout: compiled.stdout, stderr: compiled.stderr }, null, 2))
    expect(compiled.error).toBeUndefined(); expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0)
    const outcomes = cases.map((sample, index) => {
      // The public sample-count contract stays unchanged; each synthetic invocation is index 0.
      const input = JSON.stringify({ protocolVersion: 1, caseIndex: 0, args: sample.args })
      const result = spawnSync(dotnet, ['exec', '--runtimeconfig', config, dll], { cwd: directory, env: environment, input, encoding: 'utf8', windowsHide: true, timeout: 5000 })
      const value = result.status === 0 ? JSON.parse(result.stdout) : undefined
      return { kind: index < exercise.samples.length ? 'PUBLIC_SAMPLE' : 'INDEPENDENT_EXAMPLE', args: sample.args, expected: sample.expected, exitCode: result.status, error: result.error?.message, response: value, stderr: result.stderr,
        pass: result.status === 0 && value?.outcome === 'RETURNED' && JSON.stringify(value.actual) === JSON.stringify(sample.expected) && value.stdout === '' && value.stderr === '' }
    })
    writeFileSync(join(directory, 'execution-receipt.json'), JSON.stringify({ codeSha256: hash(code), outcomes }, null, 2))
    expect(outcomes.every(outcome => outcome.pass)).toBe(true)
  }, 60000)
}

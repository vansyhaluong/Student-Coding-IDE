import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createContext, Script, runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { generateCsharpHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { matchesExerciseType } from '../../src/shared/contracts/practice'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter2Exercises, chapter2Examples } from '../fixtures/learning/chapter2-solution-public'

// Trusted authored teaching sources only; no native Judge, Official cases or IDE build.
const evidence = resolve('out/solution-chapter2-20261028')
mkdirSync(evidence, { recursive: true })
const runRoot = mkdtempSync(join(evidence, 'runtime-'))
const dotnetRoot = 'C:/Program Files/dotnet', sdk = '10.0.112', runtime = '10.0.12'
const dotnet = join(dotnetRoot, 'dotnet.exe'), compiler = join(dotnetRoot, 'sdk', sdk, 'Roslyn/bincore/csc.dll')
const refDir = join(dotnetRoot, 'packs/Microsoft.NETCore.App.Ref', runtime, 'ref/net10.0')
const available = process.platform === 'win32' && existsSync(dotnet) && existsSync(compiler) && existsSync(refDir)
if (!available) writeFileSync(join(runRoot, 'csharp-unverified.json'), JSON.stringify({ status: 'UNVERIFIED', reason: 'Required local SDK/reference pack missing' }))
const environment = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_EnableDiagnostics: '0' }
for (const exercise of chapter2Exercises) {
  const cases = [...exercise.samples, ...chapter2Examples[exercise.id]]
  it(`${exercise.id}: JavaScript public samples and independent boundaries`, () => {
    const code = solutionCode(solutionFor(exercise)!, 'javascript')
    for (const sample of cases) {
      const actual = runInNewContext(`${code}\n${exercise.functionName}(...args)`, { args: structuredClone(sample.args) }, { timeout: 1000 })
      expect(matchesExerciseType(actual, exercise.returnType)).toBe(true)
      expect(JSON.stringify(actual)).toBe(JSON.stringify(sample.expected))
    }
  })
  it.skipIf(!available)(`${exercise.id}: C# compiles with signature harness and returns public/independent results`, () => {
    const directory = join(runRoot, exercise.id); mkdirSync(directory)
    const code = solutionCode(solutionFor(exercise)!, 'csharp'), solution = join(directory, 'Solution.cs'), harnessFile = join(directory, 'Harness.cs')
    const dll = join(directory, 'Solution.dll'), config = join(directory, 'Solution.runtimeconfig.json'), response = join(directory, 'compile.rsp')
    const schema = { parameterTypes: exercise.parameters.map(p => p.type), returnType: exercise.returnType, sampleCount: exercise.samples.length }
    writeFileSync(solution, code); writeFileSync(harnessFile, generateCsharpHarness(exercise, schema))
    writeFileSync(config, JSON.stringify({ runtimeOptions: { tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version: runtime }, rollForward: 'Disable' } }))
    const quote = (p: string) => `"${p}"`
    writeFileSync(response, ['/nologo', '/nostdlib+', '/target:exe', '/platform:x64', '/unsafe-', '/checked-', '/optimize+', '/debug-', '/deterministic+', '/nullable:enable', '/langversion:default', '/utf8output', '/codepage:65001',
      '/main:StudentLearning.Harness', `/out:${quote(dll)}`, ...readdirSync(refDir).filter(n => n.endsWith('.dll')).map(n => `/reference:${quote(join(refDir, n))}`), quote(solution), quote(harnessFile)].join('\n'))
    const compiled = spawnSync(dotnet, ['exec', '--fx-version', runtime, '--roll-forward', 'Disable', compiler, '/noconfig', `@${response}`],
      { cwd: directory, env: environment, encoding: 'utf8', windowsHide: true, timeout: 30000 })
    expect(compiled.error).toBeUndefined(); expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0)
    const outcomes = cases.map(sample => {
      const result = spawnSync(dotnet, ['exec', '--runtimeconfig', config, dll], { cwd: directory, env: environment,
        input: JSON.stringify({ protocolVersion: 1, caseIndex: 0, args: sample.args }), encoding: 'utf8', windowsHide: true, timeout: 5000 })
      expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0)
      const value = JSON.parse(result.stdout)
      expect(value.outcome).toBe('RETURNED'); expect(value.actual).toEqual(sample.expected)
      expect(value.stdout).toBe(''); expect(value.stderr).toBe('')
      return { args: sample.args, expected: sample.expected, actual: value.actual }
    })
    writeFileSync(join(directory, 'receipt.json'), JSON.stringify({ sdk, runtime, outcomes }, null, 2))
  }, 60000)
}
function runner(id: string) {
  const exercise = chapter2Exercises.find(e => e.id === id)!, context = createContext({ args: [] as number[] })
  new Script(solutionCode(solutionFor(exercise)!, 'javascript')).runInContext(context)
  const invoke = new Script(`${exercise.functionName}(...args)`)
  return (...args: number[]) => { context.args = args; return invoke.runInContext(context) }
}
it('checks all three-digit inputs against independent text-based digit definitions', () => {
  const sum = runner('ch2-05'), reverse = runner('ch2-06')
  for (let n = 100; n <= 999; n++) {
    expect(sum(n)).toBe([...String(n)].reduce((total, digit) => total + Number(digit), 0))
    expect(reverse(n)).toBe(Number([...String(n)].reverse().join('')))
  }
})
it('checks division reconstruction/remainder bounds and box minimality on an independently enumerated finite domain', () => {
  const divide = runner('ch2-04'), boxes = runner('ch2-08')
  for (let a = 0; a <= 100; a++) for (let b = 1; b <= 12; b++) {
    const [q, r] = divide(a, b) as number[]
    expect(Number.isInteger(q) && Number.isInteger(r)).toBe(true)
    expect(q * b + r).toBe(a); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(b)
    const count = boxes(a, b) as number
    expect(Number.isInteger(count)).toBe(true); expect(count * b).toBeGreaterThanOrEqual(a)
    expect(count === 0 ? a === 0 : (count - 1) * b < a).toBe(true)
  }
})
it('checks arithmetic progression against independent repeated addition, including odd counts', () => {
  const sum = runner('ch2-09')
  for (let first = 0; first <= 10; first++) for (let step = 0; step <= 10; step++) for (let count = 1; count <= 20; count++) {
    let expected = 0, term = first
    for (let i = 0; i < count; i++) { expected += term; term += step }
    expect(sum(first, step, count)).toBe(expected)
  }
})

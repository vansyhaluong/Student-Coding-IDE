import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createContext, Script, runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { generateCsharpHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { matchesExerciseType } from '../../src/shared/contracts/practice'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter5Exercises, chapter5Examples } from '../fixtures/learning/chapter5-solution-public'

// Narrow teaching-code verification, not a native Runtime/Job/Judge acceptance.
// Sources are only the authored Chapter 5 examples and the existing pure harness generator.
const evidence = resolve('out/solution-chapter5-20261027')
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

for (const exercise of chapter5Exercises) {
  const cases = [...exercise.samples, ...chapter5Examples[exercise.id]]
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

// Independent, exhaustive small-domain definitions for the highest-risk algorithms.
// These run only authored JavaScript, never the IDE/native Runtime or Official data.
function shortWords(limit: number) {
  const words = ['']
  for (let size = 1; size <= limit; size++) {
    for (let mask = 0; mask < 2 ** size; mask++) {
      let text = ''
      for (let index = 0; index < size; index++) text += mask & (1 << index) ? 'b' : 'a'
      words.push(text)
    }
  }
  return words
}
function runner(id: string) {
  const exercise = chapter5Exercises.find(item => item.id === id)!
  const context = createContext({ args: [] as string[] })
  new Script(solutionCode(solutionFor(exercise)!, 'javascript')).runInContext(context, { timeout: 1000 })
  const invoke = new Script(`${exercise.functionName}(...args)`)
  return (...args: string[]) => { context.args = args; return invoke.runInContext(context, { timeout: 1000 }) as string | number }
}
const oracleReceipts: Record<string, { checked: number; failures: unknown[] }> = {}
function recordOracle(id: string, checked: number, failures: unknown[]) {
  oracleReceipts[id] = { checked, failures }
  writeFileSync(join(runRoot, 'small-domain-oracles.json'), JSON.stringify({ alphabet: 'ab', oracles: oracleReceipts }, null, 2))
  expect(failures).toEqual([])
}

it('ch5-05: matches brute-force unique-substring enumeration on all binary strings through length 4', () => {
  const invoke = runner('ch5-05'), failures: unknown[] = []
  const inputs = shortWords(4)
  for (const text of inputs) {
    let expected = 0
    for (let start = 0; start < text.length; start++) {
      for (let end = start + 1; end <= text.length; end++) {
        const candidate = text.slice(start, end)
        if (new Set(candidate).size === candidate.length) expected = Math.max(expected, candidate.length)
      }
    }
    const actual = invoke(text)
    if (actual !== expected) failures.push({ text, expected, actual })
  }
  recordOracle('ch5-05', inputs.length, failures)
}, 15000)

it('ch5-07: matches enumerated minimum covering windows, excluding non-unique answers per the public contract', () => {
  const invoke = runner('ch5-07'), failures: unknown[] = []
  let checked = 0
  for (const text of shortWords(4).filter(Boolean)) {
    for (const target of shortWords(2).filter(Boolean)) {
      let best = Infinity, candidates: string[] = []
      for (let start = 0; start < text.length; start++) {
        for (let end = start + 1; end <= text.length; end++) {
          const candidate = text.slice(start, end)
          const covers = [...new Set(target)].every(letter => candidate.split(letter).length >= target.split(letter).length)
          if (!covers || candidate.length > best) continue
          if (candidate.length < best) { best = candidate.length; candidates = [] }
          candidates.push(candidate)
        }
      }
      if (candidates.length > 1) continue
      const expected = candidates[0] ?? '', actual = invoke(text, target)
      checked++
      if (actual !== expected) failures.push({ text, target, expected, actual })
    }
  }
  recordOracle('ch5-07', checked, failures)
}, 15000)

function recursiveDistance(a: string, b: string): number {
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (a[0] === b[0]) return recursiveDistance(a.slice(1), b.slice(1))
  return 1 + Math.min(recursiveDistance(a.slice(1), b), recursiveDistance(a, b.slice(1)), recursiveDistance(a.slice(1), b.slice(1)))
}
it('ch5-08: matches direct recursive edit choices on all pairs of binary strings through length 3', () => {
  const invoke = runner('ch5-08'), inputs = shortWords(3), failures: unknown[] = []
  for (const a of inputs) {
    for (const b of inputs) {
      const expected = recursiveDistance(a, b), actual = invoke(a, b)
      if (actual !== expected) failures.push({ a, b, expected, actual })
    }
  }
  recordOracle('ch5-08', inputs.length ** 2, failures)
}, 15000)

it('ch5-09: matches enumerated position subsets on all binary source strings through length 4 and targets through length 3', () => {
  const invoke = runner('ch5-09'), sources = shortWords(4), targets = shortWords(3), failures: unknown[] = []
  for (const text of sources) {
    for (const target of targets) {
      let expected = 0
      for (let mask = 0; mask < 2 ** text.length; mask++) {
        let selected = ''
        for (let index = 0; index < text.length; index++) if (mask & (1 << index)) selected += text[index]
        if (selected === target) expected++
      }
      const actual = invoke(text, target)
      if (actual !== expected) failures.push({ text, target, expected, actual })
    }
  }
  recordOracle('ch5-09', sources.length * targets.length, failures)
}, 15000)

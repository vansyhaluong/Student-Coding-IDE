import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createContext, Script, runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { generateCsharpHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { matchesExerciseType } from '../../src/shared/contracts/practice'
import { solutionCode, solutionFor } from '../../src/renderer/src/features/learning/practice/solutions'
import { chapter7Exercises, chapter7Examples } from '../fixtures/learning/chapter7-solution-public'

// Narrow teaching-code verification, not a native Runtime/Job/Judge acceptance.
// Sources are only the authored Chapter 7 examples and the existing pure harness generator.
const evidence = resolve('out/solution-chapter7-20261027')
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

for (const exercise of chapter7Exercises) {
  const cases = [...exercise.samples, ...chapter7Examples[exercise.id]]
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

// Small, independent reference definitions; no Official cases or native execution.
function arrays(alphabet: number[], min: number, max: number) {
  const values: number[][] = []
  for (let size = min; size <= max; size++) {
    for (let encoded = 0; encoded < alphabet.length ** size; encoded++) {
      let rest = encoded
      const value: number[] = []
      for (let i = 0; i < size; i++) { value.push(alphabet[rest % alphabet.length]); rest = Math.floor(rest / alphabet.length) }
      values.push(value)
    }
  }
  return values
}
function runner(id: string) {
  const exercise = chapter7Exercises.find(item => item.id === id)!
  const context = createContext({ args: [] as (number[] | number)[] })
  new Script(solutionCode(solutionFor(exercise)!, 'javascript')).runInContext(context, { timeout: 1000 })
  const invoke = new Script(`${exercise.functionName}(...args)`)
  return (...args: (number[] | number)[]) => {
    // FirstMissingPositive deliberately rearranges its execution-local input.
    context.args = structuredClone(args)
    return invoke.runInContext(context, { timeout: 1000 }) as number | number[]
  }
}
const oracles: Record<string, { checked: number; failures: unknown[] }> = {}
function recordOracle(id: string, checked: number, failures: unknown[]) {
  oracles[id] = { checked, failures }
  writeFileSync(join(runRoot, 'independent-oracles.json'), JSON.stringify(oracles, null, 2))
  expect(failures).toEqual([])
}

it('ch7-01: matches enumerated distinct index pairs, checking only inputs with exactly one pair', () => {
  const invoke = runner('ch7-01'), failures: unknown[] = []
  let checked = 0
  for (const nums of arrays([-1, 0, 1], 2, 4)) {
    for (let target = -2; target <= 2; target++) {
      const pairs: number[][] = []
      for (let left = 0; left < nums.length; left++) {
        for (let right = left + 1; right < nums.length; right++) if (nums[left] + nums[right] === target) pairs.push([left, right])
      }
      if (pairs.length !== 1) continue
      const expected = pairs[0], actual = invoke(nums, target)
      checked++
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ nums, target, expected, actual })
    }
  }
  recordOracle('ch7-01', checked, failures)
}, 20000)

it('ch7-02: matches all chronological buy/sell choices on small price arrays', () => {
  const invoke = runner('ch7-02'), inputs = arrays([0, 1, 2], 1, 5), failures: unknown[] = []
  for (const prices of inputs) {
    let expected = 0
    for (let buy = 0; buy < prices.length; buy++) {
      for (let sell = buy + 1; sell < prices.length; sell++) expected = Math.max(expected, prices[sell] - prices[buy])
    }
    const actual = invoke(prices)
    if (actual !== expected) failures.push({ prices, expected, actual })
  }
  recordOracle('ch7-02', inputs.length, failures)
}, 20000)

it('ch7-03: matches independent BigInt increment for canonical decimal digit arrays from 0 through 250', () => {
  const invoke = runner('ch7-03'), failures: unknown[] = []
  for (let value = 0; value <= 250; value++) {
    const digits = [...String(value)].map(Number), expected = [...String(BigInt(value) + 1n)].map(Number), actual = invoke(digits)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ digits, expected, actual })
  }
  recordOracle('ch7-03', 251, failures)
}, 20000)

it('ch7-04: matches every nonempty subarray sum on small signed arrays', () => {
  const invoke = runner('ch7-04'), inputs = arrays([-1, 0, 1], 1, 5), failures: unknown[] = []
  for (const nums of inputs) {
    let expected = -Infinity
    for (let start = 0; start < nums.length; start++) {
      let sum = 0
      for (let end = start; end < nums.length; end++) { sum += nums[end]; expected = Math.max(expected, sum) }
    }
    const actual = invoke(nums)
    if (actual !== expected) failures.push({ nums, expected, actual })
  }
  recordOracle('ch7-04', inputs.length, failures)
}, 20000)

it('ch7-05: matches quadratic skip-one multiplication on small arrays with signed values and zeros', () => {
  const invoke = runner('ch7-05'), inputs = arrays([-1, 0, 1], 2, 5), failures: unknown[] = []
  for (const nums of inputs) {
    const expected = nums.map((_, excluded) => nums.reduce((product, value, index) => index === excluded ? product : product * value, 1))
    const actual = invoke(nums)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ nums, expected, actual })
  }
  recordOracle('ch7-05', inputs.length, failures)
}, 20000)

it('ch7-06: matches original-index lookup across all rotations of distinct sorted arrays through length 7', () => {
  const invoke = runner('ch7-06'), failures: unknown[] = []
  let checked = 0
  for (let size = 0; size <= 7; size++) {
    const sorted = Array.from({ length: size }, (_, i) => i * 2 - 6)
    for (let offset = 0; offset < Math.max(1, size); offset++) {
      const nums = [...sorted.slice(offset), ...sorted.slice(0, offset)]
      for (let target = -7; target <= 9; target++) {
        const expected = nums.indexOf(target), actual = invoke(nums, target)
        checked++
        if (actual !== expected) failures.push({ nums, target, expected, actual })
      }
    }
  }
  recordOracle('ch7-06', checked, failures)
}, 20000)

it('ch7-07: matches independent positive-set membership on small arrays with duplicates and out-of-range values', () => {
  const invoke = runner('ch7-07'), inputs = arrays([-1, 0, 1, 2, 3], 0, 4), failures: unknown[] = []
  for (const nums of inputs) {
    const present = new Set(nums)
    let expected = 1
    while (present.has(expected)) expected++
    const actual = invoke(nums)
    if (actual !== expected) failures.push({ nums, expected, actual })
  }
  recordOracle('ch7-07', inputs.length, failures)
}, 20000)

it('ch7-08: matches per-position left/right maximum enumeration for all small height profiles', () => {
  const invoke = runner('ch7-08'), inputs = arrays([0, 1, 2], 0, 6), failures: unknown[] = []
  for (const heights of inputs) {
    let expected = 0
    for (let i = 0; i < heights.length; i++) expected += Math.min(Math.max(...heights.slice(0, i + 1)), Math.max(...heights.slice(i))) - heights[i]
    const actual = invoke(heights)
    if (actual !== expected) failures.push({ heights, expected, actual })
  }
  recordOracle('ch7-08', inputs.length, failures)
}, 20000)

it('ch7-09: matches exhaustive feasible candy assignments for all ternary rating arrays through length 4', () => {
  const invoke = runner('ch7-09'), inputs = arrays([0, 1, 2], 1, 4), failures: unknown[] = []
  for (const ratings of inputs) {
    let expected = Infinity
    for (let encoded = 0; encoded < ratings.length ** ratings.length; encoded++) {
      let rest = encoded
      const candies = ratings.map(() => { const value = rest % ratings.length + 1; rest = Math.floor(rest / ratings.length); return value })
      const valid = ratings.every((rating, i) => i === 0 || rating === ratings[i - 1]
        || (rating > ratings[i - 1] ? candies[i] > candies[i - 1] : candies[i] < candies[i - 1]))
      if (valid) expected = Math.min(expected, candies.reduce((sum, value) => sum + value, 0))
    }
    const actual = invoke(ratings)
    if (actual !== expected) failures.push({ ratings, expected, actual })
  }
  recordOracle('ch7-09', inputs.length, failures)
}, 20000)

// Explicit, local Windows experiment. No Learning UI or public IPC integration.
import assert from 'node:assert/strict'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { exercises } from '../../src/main/services/learning/content/exercises'
import { isExercise, type Exercise, type ExerciseLanguage, type ExerciseType, type ExerciseValue } from '../../src/shared/contracts/practice'
import { command, ExerciseSpike, LIMITS, SpikeError, type RunEvidence, type RunOptions } from './runtime'
import { WindowsPipedProcessAdapter } from './windows-spike-adapter'
import { ProcessManager } from '../../src/main/services/process/process-manager'

const output = resolve(__dirname)
const native = join(output, 'run-process.node')
const node = process.execPath
const dotnet = join(process.env.ProgramFiles!, 'dotnet/dotnet.exe')
const sdk = '10.0.112' // Installed developer SDK measured in the preceding survey.
const records: Record<string, unknown>[] = []
const failures: string[] = []
const csTypes: Record<ExerciseType, string> = { int32: 'int', boolean: 'bool', string: 'string',
  'int32[]': 'int[]', 'string[]': 'string[]', 'int32[][]': 'int[][]' }
const values: Record<ExerciseType, ExerciseValue> = {
  int32: -2147483648, boolean: false, string: 'Tiếng Việt 🧊 "quote" \\ \n',
  'int32[]': [2147483647, -2147483648, 0], 'string[]': ['', '🧊', 'Việt\nNam'],
  'int32[][]': [[1, -2], [0, 2147483647]],
}
function base(language: ExerciseLanguage, extra: Partial<RunOptions> = {}): RunOptions {
  return { language, exercise: exercises[0], code: language === 'csharp'
    ? 'public class Solution { public int Sum(int a, int b) { return a+b; } }'
    : 'function Sum(a,b) { return a+b; }', cases: exercises[0].samples.map(t => t.args), node, dotnet, sdk, ...extra }
}
async function absent(path: string) { await assert.rejects(access(path)) }
function alive(pid: number) { try { process.kill(pid, 0); return true } catch { return false } }
async function waitFile(path: string): Promise<string> {
  const deadline = performance.now() + 1400
  while (performance.now() < deadline) {
    try { return await readFile(path, 'utf8') } catch { await new Promise(r => setTimeout(r, 10)) }
  }
  throw Error('Child PID evidence was not created')
}
async function test(name: string, work: (record: Record<string, unknown>) => Promise<void>) {
  const record: Record<string, unknown> = { name }, started = performance.now()
  try { await work(record); record.status = 'PASS' }
  catch (error) { record.status = 'FAIL'; record.error = error instanceof Error ? error.message : String(error); failures.push(name) }
  record.totalMs = Math.round(performance.now() - started)
  records.push(record)
  console.log(`${record.status}: ${name} (${record.totalMs} ms)${record.error ? `: ${record.error}` : ''}`)
}
async function run(options: RunOptions, record: Record<string, unknown>, expectedFailure?: string,
  setup?: (spike: ExerciseSpike) => void): Promise<RunEvidence | undefined> {
  const spike = new ExerciseSpike(output, native)
  setup?.(spike)
  let result: RunEvidence | undefined
  try {
    if (expectedFailure) await assert.rejects(spike.run(options), error => error instanceof SpikeError && error.reason === expectedFailure)
    else result = await spike.run(options)
    assert.equal(spike.processes.size, 0)
    if (spike.workspace) await absent(spike.workspace)
    record.cleanup = 'process ownership released; temporary workspace absent'
    record.commands = spike.commands.map(c => ({ pid: c.pid, exitCode: c.exitCode, ms: Math.round(c.ms), stdoutBytes: Buffer.byteLength(c.stdout), stderrBytes: Buffer.byteLength(c.stderr) }))
    if (result) {
      record.prepareMs = Math.round(result.prepareMs); record.compileMs = Math.round(result.compileMs)
      record.compileCount = result.compileCount
      if (result.offline) record.offlineRestore = result.offline
      record.executeMs = result.results.map(r => Math.round(r.command.ms))
      assert.equal(new Set(result.results.map(r => r.command.pid)).size, options.cases.length)
      assert.equal(result.compileCount, options.language === 'csharp' ? 1 : 0)
    }
    return result
  } finally { await spike.stop() }
}

async function main() {
await mkdir(output, { recursive: true })
await test('catalogue: all 63 exercises compatible with six synchronous JSON types', async record => {
  assert.equal(exercises.length, 63)
  for (const exercise of exercises) {
    assert.equal(isExercise(exercise), true)
    assert.match(exercise.functionName, /^[A-Za-z_][A-Za-z0-9_]*$/)
    for (const p of exercise.parameters) { assert.ok(p.type in csTypes); assert.match(p.name, /^[A-Za-z_][A-Za-z0-9_]*$/) }
    assert.ok(exercise.returnType in csTypes)
    assert.match(exercise.languages.csharp.starter, /public class Solution/)
    assert.match(exercise.languages.javascript.starter, new RegExp(`function ${exercise.functionName}\\(`))
  }
  record.exercises = 63; record.sampleCases = exercises.reduce((n, e) => n + e.samples.length, 0)
})
// Incompatibility must stop dependent experiments rather than silently adapting a problem.
if (failures.length) throw Error('Incompatible 9C exercise; stop and ask user')

const versions = new ExerciseSpike(output, native)
for (const [label, executable, args] of [['node', node, ['--version']], ['sdk', dotnet, ['--list-sdks']]] as const) {
  const value = await command(versions.processes, versions.owner, new WindowsPipedProcessAdapter(native), executable, args, output, LIMITS.probeMs)
  assert.equal(value.exitCode, 0)
  records.push({ name: `${label} inventory`, status: 'PASS', version: value.stdout.trim(), executable })
}
await versions.stop()

for (const language of ['csharp', 'javascript'] as const) {
  await test(`${language}: all 63 actual starters/signatures, 126 sample calls`, async record => {
    const expected: string[] = []
    const declarations: string[] = [], calls: string[] = []
    exercises.forEach((exercise, index) => {
      if (language === 'csharp') declarations.push(`namespace E${index} { ${exercise.languages.csharp.starter} }`)
      exercise.samples.forEach(sample => {
        expected.push(exercise.id)
        if (language === 'csharp') {
          const args = sample.args.map((value, i) => `System.Text.Json.JsonSerializer.Deserialize<${csTypes[exercise.parameters[i].type]}>(${JSON.stringify(JSON.stringify(value))})!`).join(',')
          calls.push(`try { _ = new E${index}.Solution().${exercise.functionName}(${args}); throw new System.Exception("Starter did not throw"); } catch(System.NotImplementedException) { results.Add(${JSON.stringify(exercise.id)}); }`)
        } else {
          calls.push(`try { (()=>{ ${exercise.languages.javascript.starter}; return ${exercise.functionName}(...${JSON.stringify(sample.args)}); })(); throw new TypeError('Starter did not throw'); } catch(error) { if(error.constructor !== Error) throw error; results.push(${JSON.stringify(exercise.id)}); }`)
        }
      })
    })
    const exercise: Exercise = { ...exercises[0], functionName: 'VerifyCatalogue', returnType: 'string[]',
      samples: [{ args: [14, -6], expected }] }
    const code = language === 'csharp' ? `${declarations.join('\n')}\npublic class Solution { public string[] VerifyCatalogue(int a,int b) { var results = new System.Collections.Generic.List<string>(); ${calls.join('\n')} return results.ToArray(); } }`
      : `function VerifyCatalogue(a,b) { const results=[]; ${calls.join('\n')} return results; }`
    const result = await run(base(language, { exercise, code, cases: [[14, -6]] }), record)
    assert.deepEqual(result!.results[0].value, expected)
    record.actualStarterCalls = expected.length
  })
  await test(`${language}: real Sum, two cases, separate processes`, async record => {
    const result = await run(base(language), record)
    assert.deepEqual(result!.results.map(r => r.value), [8, 0])
  })
  for (const type of Object.keys(values) as ExerciseType[]) {
    const value = values[type]
    const edge: ExerciseValue = type === 'int32' ? 2147483647 : type === 'boolean' ? true : type === 'string' ? '' : []
    const exercise: Exercise = { ...exercises[0], functionName: 'Echo', parameters: [{ name: 'value', type }], returnType: type,
      samples: [{ args: [value], expected: value }, { args: [edge], expected: edge }] }
    await test(`${language}: JSON ${type} argument and return`, async record => {
      const code = language === 'csharp' ? `public class Solution { public ${csTypes[type]} Echo(${csTypes[type]} value) { return value; } }`
        : 'function Echo(value) { return value; }'
      const result = await run(base(language, { exercise, code, cases: [[value], [edge]] }), record)
      assert.deepEqual(result!.results.map(r => r.value), [value, edge])
    })
  }
  await test(`${language}: ${language === 'csharp' ? 'compile error' : 'syntax error'}`, async record => {
    if (language === 'csharp') await run(base(language, { code: 'public class Solution { broken' }), record, 'COMPILE_ERROR')
    else {
      const result = await run(base(language, { code: 'function Sum( {' }), record)
      assert.deepEqual(result!.results.map(r => r.error), ['SyntaxError', 'SyntaxError'])
    }
  })
  await test(`${language}: runtime error`, async record => {
    const code = language === 'csharp' ? 'public class Solution { public int Sum(int a,int b) { throw new System.InvalidOperationException(); } }'
      : 'function Sum(a,b) { throw new Error("student failure"); }'
    const result = await run(base(language, { code }), record)
    assert.ok(result!.results.every(r => r.error === (language === 'csharp' ? 'InvalidOperationException' : 'Error')))
  })
  await test(`${language}: infinite loop times out`, async record => {
    const code = language === 'csharp' ? 'public class Solution { public int Sum(int a,int b) { while(true) {} } }'
      : 'function Sum(a,b) { while(true) {} }'
    await run(base(language, { code }), record, 'TIMEOUT')
  })
  if (language === 'csharp') await test('csharp: compile deadline, no execution after timeout', async record => {
    let executionStarted = false
    await run(base(language, { compileTimeoutMs: 10, onPhase: phase => { if (phase === 'execute') executionStarted = true } }), record, 'TIMEOUT')
    assert.equal(executionStarted, false)
  })
  await test(`${language}: aggregate stdout/stderr exceeds 64 KiB`, async record => {
    const code = language === 'csharp' ? 'public class Solution { public int Sum(int a,int b) { while(true) { System.Console.Write(new string(\'x\',4096)); System.Console.Error.Write(new string(\'y\',4096)); } } }'
      : 'function Sum(a,b) { while(true) { process.stdout.write("x".repeat(4096)); process.stderr.write("y".repeat(4096)); } }'
    await run(base(language, { code }), record, 'OUTPUT_LIMIT')
  })
  for (const phase of (language === 'csharp' ? ['prepare', 'compile', 'execute'] : ['prepare', 'execute']) as ('prepare' | 'compile' | 'execute')[]) {
    await test(`${language}: Stop while ${phase} process owned`, async record => {
      let stopped = false, spike!: ExerciseSpike
      const code = language === 'csharp' ? 'public class Solution { public int Sum(int a,int b) { while(true) {} } }'
        : 'function Sum(a,b) { while(true) {} }'
      await run(base(language, { code, onSpawn: current => {
        if (current === phase && !stopped) {
          stopped = true
          setTimeout(() => { void spike.stop() }, phase === 'prepare' ? 0 : 50)
        }
      } }), record, 'STOPPED', value => { spike = value })
      assert.equal(stopped, true)
    })
  }
  await test(`${language}: Stop before preparation`, async record => {
    const abort = new AbortController(); abort.abort()
    await run(base(language, { signal: abort.signal }), record, 'STOPPED')
  })
  await test(`${language}: missing runtime`, async record => {
    const exe = join(output, 'missing', language === 'csharp' ? 'dotnet.exe' : 'node.exe')
    await run(base(language, language === 'csharp' ? { dotnet: exe } : { node: exe }), record, 'MISSING_RUNTIME')
  })
  await test(`${language}: invalid executable image`, async record => {
    const directory = join(output, 'invalid-runtime'); await mkdir(directory, { recursive: true })
    const exe = join(directory, language === 'csharp' ? 'dotnet.exe' : 'node.exe')
    await writeFile(exe, 'This is a deliberate invalid PE image, not a runtime.')
    await run(base(language, language === 'csharp' ? { dotnet: exe } : { node: exe }), record, 'INVALID_RUNTIME')
  })
  await test(`${language}: descendant terminated after timeout`, async record => {
    let spike!: ExerciseSpike, observed: Promise<string> | undefined
    const childSource = 'setInterval(()=>{},1000)'
    const code = language === 'javascript'
      ? `function Sum(a,b) { const fs=require('node:fs'); const c=require('node:child_process').spawn(${JSON.stringify(node)},['-e',${JSON.stringify(childSource)}],{stdio:'ignore',windowsHide:true}); fs.writeFileSync('child.pid',String(c.pid)); while(true){} }`
      : `public class Solution { public int Sum(int a,int b) { var p=new System.Diagnostics.ProcessStartInfo(${JSON.stringify(node)}) {UseShellExecute=false,CreateNoWindow=true}; p.ArgumentList.Add("-e"); p.ArgumentList.Add(${JSON.stringify(childSource)}); var child=System.Diagnostics.Process.Start(p)!; System.IO.File.WriteAllText("child.pid",child.Id.ToString()); while(true){} } }`
    await run(base(language, { code, onSpawn: phase => {
      if (phase === 'execute') observed = waitFile(join(spike.workspace!, 'case-0/child.pid'))
    } }), record, 'TIMEOUT', value => { spike = value })
    assert.ok(observed)
    const childPid = Number(await observed)
    assert.ok(childPid > 0); assert.equal(alive(childPid), false)
    record.descendantPid = childPid; record.descendantAbsent = true
  })
}
await test('owner isolation: exercise Stop preserves another owned process/resource', async record => {
  const processes = new ProcessManager(), otherOwner = 'project-terminal-ownership-sentinel'
  const sentinel = join(output, 'sentinel.cjs'); await writeFile(sentinel, 'setInterval(()=>{},1000)')
  const abort = new AbortController()
  let pid = 0
  const other = command(processes, otherOwner, new WindowsPipedProcessAdapter(native), node, [sentinel], output, 10000,
    abort.signal, value => { pid = value }).catch(error => error)
  try {
    const spike = new ExerciseSpike(output, native, processes)
    await assert.rejects(spike.run(base('javascript', { code: 'function Sum(a,b) { while(true){} }',
      onSpawn: phase => { if (phase === 'execute') void spike.stop() } })), /STOPPED/)
    assert.equal(alive(pid), true); assert.equal(processes.size, 1)
    await absent(spike.workspace!)
    record.foreignPid = pid; record.survivedExerciseStop = true
  } finally { abort.abort(); await other; await processes.cleanupOwner(otherOwner) }
  assert.equal(processes.size, 0); assert.equal(alive(pid), false)
})
await test('JavaScript: invalid return type rejected', async record => {
  await run(base('javascript', { code: 'function Sum(a,b) { return "wrong type"; }' }), record, 'INVALID_RESULT')
})
await test('JavaScript: async function rejected', async record => {
  const result = await run(base('javascript', { code: 'async function Sum(a,b) { return a+b; }' }), record)
  assert.ok(result!.results.every(r => r.error === 'Error'))
})
await test('JavaScript: bounded result file', async record => {
  const exercise: Exercise = { ...exercises[0], returnType: 'string', samples: [{ args: [1, 2], expected: '' }] }
  await run(base('javascript', { exercise, cases: [[1, 2]], code: 'function Sum(a,b) { return "x".repeat(65537); }' }), record, 'RESULT_LIMIT')
})
await test('input contract: overflow and wrong argument type rejected before spawn', async record => {
  await run(base('javascript', { cases: [[2147483648, 0]] }), record, 'INVALID_INPUT')
  await run(base('csharp', { cases: [['bad int', 0]] }), record, 'INVALID_INPUT')
})
await writeFile(join(output, 'results.json'), JSON.stringify({ date: new Date().toISOString(), platform: process.platform,
  architecture: process.arch, hostNode: process.version, sdk, limits: LIMITS, records, failures }, null, 2))
console.log(`Evidence: ${join(output, 'results.json')}; failures: ${failures.length}`)
if (failures.length) process.exitCode = 1
}
void main().catch(error => { console.error(error); process.exitCode = 1 })

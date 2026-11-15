// Isolated offline G0 harness. No production import side effects, network, or app userData.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'
import console from 'node:console'
import { setTimeout, clearTimeout } from 'node:timers'
import * as esbuild from 'esbuild'
import electron from 'electron'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, readdir, mkdtemp, copyFile, stat, rename, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..')
const execute = promisify(execFile)
const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
const owned = await mkdtemp(join(tmpdir(), 'SH4 D6 G0 thử nghiệm '))
const dotnetRoot = 'C:/Program Files/dotnet', sdk = '10.0.112', roslyn = join(dotnetRoot, 'sdk', sdk, 'Roslyn/bincore')
const dotnet = join(dotnetRoot, 'dotnet.exe')
const protectedPaths = ['package.json', 'package-lock.json', 'electron.vite.config.ts',
  'src/shared/contracts/smart-hints.ts', 'src/shared/contracts/smart-hints-validation.ts',
  ...['service', 'capture', 'configuration', 'gemini-provider', 'gemini-schema', 'adapter'].map(n => `src/main/services/learning/smart-hints/${n}.ts`)]
async function hashes() { return Promise.all(protectedPaths.map(async p => createHash('sha256').update(await readFile(join(root, p))).digest('hex'))) }
const before = await hashes()

await esbuild.build({ stdin: { contents: `
import { FilesystemCsharpSdkResolver } from './src/main/services/learning/runtime/csharp-sdk-resolver';
import { performance } from 'node:perf_hooks';
(async () => {
 const resolver = new FilesystemCsharpSdkResolver({ roots: [process.argv[2]] });
 const result = await resolver.resolve({ signal: new AbortController().signal, deadline: performance.now() + 10000 });
 console.log(JSON.stringify({ state: result.state, sdk: result.selection?.sdkVersion, runtime: result.selection?.runtimeVersion }));
})().catch(() => { process.exitCode = 2 });`, loader: 'ts', resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile: join(owned, 'resolver.cjs'), logLevel: 'silent' })
const resolved = await execute(electron, [join(owned, 'resolver.cjs'), dotnetRoot],
  { cwd: owned, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 15000 })
const sdkResolution = JSON.parse(resolved.stdout)
assert.equal(sdkResolution.state, 'AVAILABLE')
assert.equal(sdkResolution.sdk, sdk)

// Compile ONLY the trusted probe helper, with installed reference assemblies; no MSBuild/restore/NuGet.
const packs = (await readdir(join(dotnetRoot, 'packs/Microsoft.NETCore.App.Ref'))).filter(v => v.startsWith('10.')).sort()
const ref = join(dotnetRoot, 'packs/Microsoft.NETCore.App.Ref', packs.at(-1), 'ref/net10.0')
const refs = (await readdir(ref)).filter(n => n.endsWith('.dll')).map(n => join(ref, n))
const output = join(owned, 'ParserProbe.dll')
const compilerArgs = ['/noconfig', '/nostdlib+', '/deterministic+', '/nullable:enable', '/langversion:14', '/target:exe',
  `/out:"${output}"`, ...refs.map(p => `/r:"${p}"`),
  ...['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll'].map(n => `/r:"${join(roslyn, n)}"`), `"${join(here, 'ParserProbe.cs')}"`]
await writeFile(join(owned, 'compile.rsp'), compilerArgs.join('\n'))
await execute(dotnet, [join(roslyn, 'csc.dll'), `@${join(owned, 'compile.rsp')}`], { cwd: owned, env, windowsHide: true, timeout: 30000, maxBuffer: 32768 })
for (const name of ['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll']) await copyFile(join(roslyn, name), join(owned, name))
await writeFile(join(owned, 'ParserProbe.runtimeconfig.json'), JSON.stringify({ runtimeOptions: {
  tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version: '10.0.0' }, rollForward: 'LatestPatch' } }))

// Bundle the installed dev tool into a self-contained runtime artifact; don't assume devDependency resolution at runtime.
await esbuild.build({ entryPoints: [join(here, 'js-parser.mjs')], bundle: true, platform: 'node', format: 'cjs',
  target: 'node24', outfile: join(owned, 'js-parser.cjs'), legalComments: 'eof', logLevel: 'silent' })
await writeFile(join(owned, 'runtime-probe.cjs'), `
const { Worker } = require('node:worker_threads'); const path = require('node:path');
let bytes = 0, chunks = []; process.stdin.on('data', c => { bytes += c.length; if (bytes > 262144) process.exit(2); chunks.push(c) });
process.stdin.on('end', () => {
 const inputs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
 const hanging = process.argv.includes('--cancel') || process.argv.includes('--deadline');
 const worker = new Worker(path.join(__dirname, 'js-parser.cjs'), { workerData: { hang: hanging }, resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 } });
 let ready; const timer = setTimeout(() => { worker.terminate().then(() => { process.stdout.write(JSON.stringify({ timeout: true })); }) }, 5000);
 worker.on('message', message => {
  if (message.ready) { ready = message; if (hanging) {
   const terminate = () => worker.terminate().then(() => { clearTimeout(timer); process.stdout.write(JSON.stringify({ mode: process.argv.includes('--deadline') ? 'deadline' : 'cancel', terminated: true, threadId: worker.threadId })); });
   if (process.argv.includes('--deadline')) setTimeout(terminate, 50); else terminate();
  } else worker.postMessage(inputs); }
  else { clearTimeout(timer); process.stdout.write(JSON.stringify({ ready, results: message })); }
 });
 worker.on('error', () => { clearTimeout(timer); process.exitCode = 2; });
});
`)

function fixture(id, source, selected, replacement, expected = 'ACCEPT', extra = {}) {
  const start = source.indexOf(selected)
  assert.notEqual(start, -1)
  return { id, source, start, end: start + selected.length, replacement, expected, entry: 'sum',
    parameters: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }], returnType: 'int', ...extra }
}
const js = 'function sum(a, b) { return a; }\nfunction other() { return 1; }'
const cs = 'public class Solution { public int Sum(int a, int b) { return a; } public int Other() { return 1; } }'
const method = 'public int Sum(int a, int b) { return a; }'
const jsWhole = 'function sum(a, b) { return a; }'
const csharp = (id, source, selected, replacement, expected = 'ACCEPT') => fixture(id, source, selected, replacement, expected, { entry: 'Sum' })
const fixtures = {
  javascript: [
    fixture('expression', js, 'a;', 'a + b;'), // replaced below with exact expression boundary
    fixture('statement', js, 'return a;', 'return a + b;'),
    fixture('whole-function', js, jsWhole, 'function sum(a, b) { return a + b; }'),
    fixture('multiline', js.replace('return a;', 'const v = a;\nreturn v;'), 'const v = a;\nreturn v;', 'const v = a + b;\nreturn v;'),
    fixture('params-changed', js, jsWhole, 'function sum(b, a) { return a + b; }', 'SIGNATURE'),
    fixture('entry-renamed', js, jsWhole, 'function add(a, b) { return a + b; }', 'SIGNATURE'),
    fixture('signature-default', js.replace('sum(a, b)', 'sum(a, b = 1)'), 'return a;', 'return a + b;', 'SIGNATURE'),
    fixture('malformed', js, 'return a;', 'return (;', 'SYNTAX'),
    fixture('whole-file', js, js, js, 'WHOLE_FILE'),
    fixture('trivia-bypass', `${jsWhole}\n// trivia only`, jsWhole, jsWhole, 'WHOLE_FILE'),
    fixture('partial-header', js, 'sum(a, b)', 'sum(a, b)', 'TARGET'),
    fixture('structure-escape', js, 'return a;', 'return a; } function injected() { return 0;', 'STRUCTURE'),
    fixture('no-execution', js.replace('return a;', "throw new Error('G0_EXECUTION_CANARY'); return a;"), 'return a;', 'return a + b;'),
    fixture('unicode-offset', `// 😀\r\n${js}`, 'return a;', 'return a + b;'),
    fixture('typed-js-reject', js.replace('sum(a, b)', 'sum(a: number, b)'), 'return a;', 'return a + b;', 'UNSUPPORTED_GRAMMAR'),
  ],
  csharp: [
    csharp('expression', cs, 'a;', 'a + b;'),
    csharp('statement', cs, 'return a;', 'return a + b;'),
    csharp('whole-function', cs, method, 'public int Sum(int a, int b) { return a + b; }'),
    csharp('multiline', cs.replace('return a;', 'int v = a;\nreturn v;'), 'int v = a;\nreturn v;', 'int v = a + b;\nreturn v;'),
    csharp('params-changed', cs, method, 'public int Sum(int b, int a) { return a + b; }', 'SIGNATURE'),
    csharp('return-changed', cs, method, 'public long Sum(int a, int b) { return a + b; }', 'SIGNATURE'),
    csharp('static-changed', cs, method, 'public static int Sum(int a, int b) { return a + b; }', 'SIGNATURE'),
    csharp('entry-renamed', cs, method, 'public int Add(int a, int b) { return a + b; }', 'SIGNATURE'),
    csharp('malformed', cs, 'return a;', 'return (;', 'SYNTAX'),
    csharp('whole-file', cs, cs, cs, 'WHOLE_FILE'),
    csharp('partial-header', cs, 'Sum(int a, int b)', 'Sum(int a, int b)', 'TARGET'),
    csharp('structure-escape', cs, 'return a;', 'return a; } public int Injected() { return 0;', 'STRUCTURE'),
    csharp('no-execution', cs.replace('return a;', 'throw new System.Exception("G0_EXECUTION_CANARY"); return a;'), 'return a;', 'return a + b;'),
    csharp('unicode-offset', `// 😀\r\n${cs}`, 'return a;', 'return a + b;'),
    csharp('directive-reject', `#nullable enable\n${cs}`, 'return a;', 'return a + b;', 'UNSUPPORTED_GRAMMAR'),
  ],
}
// Read only public starters/metadata; no Judge assets or student files.
const packageRoot = join(root, 'resources/learning/exercises/ch2-01')
const metadata = JSON.parse(await readFile(join(packageRoot, 'exercise.json'), 'utf8'))
const publicSignature = metadata.signature
for (const language of ['csharp', 'javascript']) {
  const starter = await readFile(join(packageRoot, `starters/${language}.txt`), 'utf8')
  const input = fixture('public-starter-metadata', starter,
    language === 'csharp' ? 'throw new System.NotImplementedException();' : 'throw new Error("Chưa triển khai");',
    'return a + b;', 'ACCEPT', { entry: publicSignature.functionName })
  fixtures[language].push(input)
}
const aliases = ['int', 'bool', 'string', 'int[]', 'string[]', 'int[][]']
for (const alias of aliases) {
  const source = `public class Solution { public ${alias} Solve(${alias} value) { return value; } }`
  const input = fixture(`type-${alias}`, source, 'value;', `default(${alias})`, 'ACCEPT', {
    entry: 'Solve', parameters: [{ name: 'value', type: alias }], returnType: alias,
  })
  input.end--
  fixtures.csharp.push(input)
}
fixtures.csharp.push(csharp('cross-functions', cs, `${method.slice(method.indexOf('return'))} public int Other() { return 1;`, 'return a;', 'TARGET'))
fixtures.javascript.push(fixture('cross-functions', js, 'return a; }\nfunction other() { return 1;', 'return a;', 'TARGET'))
fixtures.csharp.push(csharp('helper-whole-function', cs, 'public int Other() { return 1; }', 'public int Other() { return 2; }'))
fixtures.csharp.push(csharp('helper-expression', cs, '1;', '2'))
fixtures.csharp.at(-1).end--
fixtures.javascript.push(fixture('helper-whole-function', js, 'function other() { return 1; }', 'function other() { return 2; }'))
fixtures.javascript.push(fixture('helper-expression', js, '1;', '2'))
fixtures.javascript.at(-1).end--
for (const language of Object.keys(fixtures)) {
  const first = fixtures[language][0]; first.end--; first.replacement = 'a + b'
  const base = fixtures[language][1]
  const unicode = { ...base, id: 'split-surrogate', source: `// 😀\r\n${base.source}`, start: 4, end: 5, expected: 'RANGE' }
  const crlf = { ...base, id: 'split-crlf', source: `// 😀\r\n${base.source}`, start: 6, end: 7, expected: 'RANGE' }
  const invalid = { ...base, id: 'out-of-bounds', end: base.source.length + 1, expected: 'RANGE' }
  fixtures[language].push(unicode, crlf, invalid)
}

async function run(executable, args, inputs, extraEnv = {}) {
  const began = performance.now()
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd: owned, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', bytes = 0
    const timer = setTimeout(() => { child.kill(); reject(new Error('PROBE_DEADLINE')) }, 10000)
    child.stdout.on('data', b => { bytes += b.length; if (bytes > 65536) child.kill(); else stdout += b })
    child.stderr.resume() // No uncontrolled process errors are copied to report.
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('PROBE_EXIT')); else resolveRun({ value: JSON.parse(stdout), elapsedMs: Math.round(performance.now() - began) }) })
    child.stdin.end(JSON.stringify(inputs))
  })
}

const csResult = await run(dotnet, [output], fixtures.csharp)
const jsResult = await run(electron, [join(owned, 'runtime-probe.cjs')], fixtures.javascript, { ELECTRON_RUN_AS_NODE: '1' })
for (const [language, result] of [['csharp', csResult], ['javascript', jsResult]]) {
  for (const row of result.value.results) {
    const expected = fixtures[language].find(f => f.id === row.id).expected
    assert.equal(row.reason, expected, `${language}/${row.id}: expected ${expected}, got ${row.reason}`)
  }
}

const workerTermination = []
for (const mode of ['cancel', 'deadline']) {
  const result = await run(electron, [join(owned, 'runtime-probe.cjs'), `--${mode}`], [], { ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(result.value.terminated, true)
  assert.equal(result.value.threadId, -1)
  workerTermination.push(result.value)
}
async function terminateHelper(mode) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(dotnet, [output, '--hang'], { cwd: owned, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let ready = false, sent = false
    const outer = setTimeout(() => { child.kill(); reject(new Error('HANG_PROBE_DEADLINE')) }, 5000)
    child.stderr.resume()
    child.stdout.once('data', () => { ready = true; if (mode === 'cancel') { sent = child.kill(); } else setTimeout(() => { sent = child.kill() }, 50) })
    child.on('error', reject)
    child.on('exit', () => { clearTimeout(outer); resolveRun({ mode, ready, terminated: sent, exitObserved: true }) })
  })
}
const helperTermination = [await terminateHelper('cancel'), await terminateHelper('deadline')]
for (const row of helperTermination) assert.equal(row.ready && row.terminated && row.exitObserved, true)

// Demonstrate missing packaged dependencies fail, not a fallback to the repository.
const noTs = await execute(electron, ['-e', "try { require('typescript'); process.exit(2) } catch(e) { process.stdout.write(e.code) }"],
  { cwd: owned, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true })
assert.equal(noTs.stdout, 'MODULE_NOT_FOUND')
const missingLibrary = join(owned, 'Microsoft.CodeAnalysis.CSharp.dll'), heldLibrary = missingLibrary + '.held'
await rename(missingLibrary, heldLibrary)
let missingRoslynFailedClosed = false
try { await run(dotnet, [output], fixtures.csharp) } catch (error) { missingRoslynFailedClosed = error.message === 'PROBE_EXIT' }
finally { await rename(heldLibrary, missingLibrary) }
assert.equal(missingRoslynFailedClosed, true)
const libraries = await Promise.all(['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll'].map(async name => ({ name, bytes: (await stat(join(owned, name))).size })))
assert.deepEqual(await hashes(), before)
const report = { scope: 'ISOLATED_G0_SYNTHETIC_ONLY', runAtUtc: new Date().toISOString(), sdk, sdkResolution, referencePack: packs.at(-1),
  roslyn: csResult.value.roslyn, electronRuntime: jsResult.value.ready,
  artifacts: { csharpHelperBytes: (await stat(output)).size, roslynLibraries: libraries,
    javascriptBundleBytes: (await stat(join(owned, 'js-parser.cjs'))).size, devDependencyAbsentAtRuntime: true,
    relocatedNonAsciiSpacePath: true },
  csharp: { elapsedMs: csResult.elapsedMs, cases: csResult.value.results },
  javascript: { elapsedMs: jsResult.elapsedMs, cases: jsResult.value.results },
  lifecycle: { workerTermination, helperTermination, missingRoslynFailedClosed },
  protectedFilesUnchanged: true, liveRequests: 0, productionDependenciesInstalled: 0 }
// Remove only this run's known files after all children/workers exit; no recursive or wildcard deletion.
const known = new Set(['resolver.cjs', 'compile.rsp', 'ParserProbe.dll', 'ParserProbe.runtimeconfig.json',
  'Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll', 'js-parser.cjs', 'runtime-probe.cjs'])
for (const name of await readdir(owned)) {
  assert.equal(known.has(name), true)
  const target = resolve(owned, name)
  assert.equal(dirname(target), owned)
  await unlink(target)
}
await rmdir(owned)
report.lifecycle.ownedArtifactsRemovedAfterExit = true
await writeFile(join(here, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ status: 'PASS', csharpCases: report.csharp.cases.length, javascriptCases: report.javascript.cases.length,
  roslyn: report.roslyn, electronRuntime: report.electronRuntime, csharpElapsedMs: report.csharp.elapsedMs,
  javascriptElapsedMs: report.javascript.elapsedMs, javascriptBundleBytes: report.artifacts.javascriptBundleBytes,
  lifecycle: report.lifecycle, protectedFilesUnchanged: true }, null, 2))

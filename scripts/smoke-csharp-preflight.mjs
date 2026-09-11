/* global console, process, AbortController */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const { CsharpPreflightProcess } = require(resolve('out/main/csharp-preflight-runtime.js'))
const binding = require(resolve('out/main/native/run-process.node'))
const sdkRoot = resolve('spikes/csharp-lsp-compatibility/.dotnet')
const runtime = { executable: join(sdkRoot, 'dotnet.exe'), sdks: [] }
const runner = new CsharpPreflightProcess({ detect: async () => ({ runtime,
  status: { state: 'AVAILABLE', reason: null, warnings: [] } }) }, () => binding,
{ ...process.env, DOTNET_ROOT: sdkRoot, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1',
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', MSBUILDDISABLENODEREUSE: '1' })
const signal = new AbortController().signal
async function snapshot(root) {
  const result = {}
  const scan = async (dir) => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await scan(path)
      else if (entry.isFile()) result[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex')
    }
  }
  await scan('')
  return result
}
async function main() {
try {
  await app.whenReady()
  for (const extension of ['sln', 'slnx']) {
    const root = resolve('spikes/csharp-lsp-compatibility/fixtures/solution-' + extension)
    const before = await snapshot(root)
    const sdk = await runner.execute(['--version'], root, signal)
    assert.equal(sdk.exitCode, 0); assert.match(sdk.stdout.trim(), /^10\./)
    const solution = await runner.execute(['sln', join(root, 'SpikeSolution.' + extension), 'list'], root, signal)
    assert.equal(solution.exitCode, 0); assert.match(solution.stdout, /SpikeApp\.csproj/)
    const evaluation = await runner.execute(['msbuild', join(root, 'SpikeApp/SpikeApp.csproj'), '-nologo', '-verbosity:quiet',
      '-interactive:false', '-nodeReuse:false', '-noAutoResponse',
      '-getProperty:TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion', '-getItem:ProjectReference'],
    join(root, 'SpikeApp'), signal)
    assert.equal(evaluation.exitCode, 0)
    const parsed = JSON.parse(evaluation.stdout)
    assert.equal(parsed.Properties.TargetFramework, 'net10.0')
    assert.ok(Array.isArray(parsed.Items.ProjectReference))
    assert.deepEqual(await snapshot(root), before)
    console.log(JSON.stringify({ preflightNative: 'PASS', fixture: extension, evaluationJson: true, fixtureUnchanged: true }))
  }
  const broken = resolve('spikes/csharp-lsp-compatibility/fixtures/invalid-workspace')
  const result = await runner.execute(['msbuild', join(broken, 'Broken.csproj'), '-nologo', '-verbosity:quiet',
    '-interactive:false', '-nodeReuse:false', '-noAutoResponse',
    '-getProperty:TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion', '-getItem:ProjectReference'], broken, signal)
  assert.notEqual(result.exitCode, 0)
  console.log(JSON.stringify({ malformedProjectExit: 'PASS' }))
} catch (error) {
  console.error(error); process.exitCode = 1
} finally {
  try { await runner.stop() } catch (error) { console.error(error); process.exitCode = 1 }
  app.exit(process.exitCode ?? 0)
}
}
void main()

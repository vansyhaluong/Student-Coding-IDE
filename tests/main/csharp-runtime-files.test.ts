import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, expect, it } from 'vitest'
import { CsharpRuntimeFiles } from '../../src/main/services/learning/runtime/csharp-runtime-files'
import type { CsharpSdkSelection } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import { exerciseCoreError } from '../../src/main/services/learning/runtime/exercise-limits'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'runtime-identity-')); roots.push(root)
  const runtime = join(root, 'shared', 'Microsoft.NETCore.App', '10.0.7'), host = join(root, 'host', 'fxr', '10.0.7')
  await mkdir(runtime, { recursive: true }); await mkdir(host, { recursive: true })
  await writeFile(join(root, 'dotnet.exe'), 'synthetic host'); await writeFile(join(runtime, 'coreclr.dll'), 'synthetic runtime')
  await writeFile(join(host, 'hostfxr.dll'), 'synthetic fxr')
  const sdk = { dotnetPath: join(root, 'dotnet.exe'), runtimeDirectory: runtime, runtimeVersion: '10.0.7' } as CsharpSdkSelection
  const context = { signal: new AbortController().signal, deadline: performance.now() + 10_000 }
  const proof = new CsharpRuntimeFiles(); await proof.capture(sdk, context)
  return { root, runtime, host, sdk, context, proof }
}
describe('retained runtime file identities (synthetic files, no SDK validity/execution evidence)', () => {
  it('validates unchanged identities without rediscovering a runtime', async () => {
    const f = await fixture(); await expect(f.proof.validate(f.context)).resolves.toBeUndefined()
  })
  it.each(['host', 'runtime', 'fxr'] as const)('rejects modified %s files', async which => {
    const f = await fixture(), file = which === 'host' ? f.sdk.dotnetPath : which === 'runtime' ? join(f.runtime, 'coreclr.dll') : join(f.host, 'hostfxr.dll')
    await writeFile(file, 'different bytes and size')
    await expect(f.proof.validate(f.context)).rejects.toThrow()
  })
  it('rejects replacement identities even when the contents are equivalent', async () => {
    const f = await fixture(), file = join(f.runtime, 'coreclr.dll')
    await rename(file, file + '.old'); await writeFile(file, 'synthetic runtime')
    await expect(f.proof.validate(f.context)).rejects.toThrow()
  })
  it('rejects new host selections introduced after prepare', async () => {
    const f = await fixture(); await mkdir(join(f.root, 'host', 'fxr', '10.0.8'))
    await expect(f.proof.validate(f.context)).rejects.toThrow()
  })
  it('checks the current deadline and cancellation throughout validation', async () => {
    const f = await fixture()
    await expect(f.proof.validate({ ...f.context, deadline: performance.now() - 1 })).rejects.toMatchObject({ details: { reason: 'PHASE_DEADLINE' } })
    const abort = new AbortController(); abort.abort(exerciseCoreError('OWNER_LOST'))
    await expect(f.proof.validate({ ...f.context, signal: abort.signal })).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
  })
})

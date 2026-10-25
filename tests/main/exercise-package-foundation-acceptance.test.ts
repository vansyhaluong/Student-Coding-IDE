import { afterEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { canonicalSignatureBytes, openAnchoredExerciseResources, rawPackageDigest } from '../../src/main/services/learning/content/exercise-package-resources'
import { ExercisePackageRegistry } from '../../src/main/services/learning/content/exercise-package-registry'
import { IpcHandlerRegistry, type IpcMainLike } from '../../src/main/ipc/ipc-handler-registry'
import { PracticeIpcService } from '../../src/main/ipc/practice-ipc-service'
import { createPracticeStore } from '../../src/main/services/learning/practice-store'
import { createPracticeBridge } from '../../src/preload/bridge/practice'

vi.mock('node:fs/promises', async () => ({ ...await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises') }))
const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('exercise-package-step5-')) throw Error('Unsafe fixture cleanup')
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('full-profile public IPC never reads or projects hidden evidence; corrupt official data never becomes official-ready', async () => {
  // Synthetic security sentinel only; not an Official Test Set for any real exercise.
  const directory = await fs.mkdtemp(join(tmpdir(), 'exercise-package-step5-')); directories.push(directory)
  const root = join(directory, 'resources/learning/exercises'), id = 'synthetic-65'
  const hidden = 'PRIVATE_SYNTHETIC_EVIDENCE_DO_NOT_PROJECT'
  const signature = { version: 1, hash: '', functionName: 'Solve', parameters: [{ name: 'value', type: 'string' as const }], returnType: 'string' as const }
  const signatureHash = rawPackageDigest(canonicalSignatureBytes(signature))
  const judge = Buffer.from(JSON.stringify({ schemaVersion: 1, exerciseId: id, testSetId: 'synthetic-only', version: 1,
    signatureVersion: 1, signatureHash, comparator: { id: 'exact-typed', version: 1 }, cases: [
      { id: 'public-1', sampleId: 'public-1', visibility: 'public', args: ['public'], expected: 'public' },
      { id: 'hidden-1', visibility: 'hidden', args: [hidden], expected: hidden },
    ] }))
  const assets = {
    metadata: Buffer.from(JSON.stringify({ schemaVersion: 1, exerciseId: id, packageVersion: 1,
      metadata: { chapter: 2, order: 0, title: 'Synthetic security fixture', difficulty: 'Easy',
        source: { url: 'https://leetcode.com/problems/synthetic/', publisher: 'Fixture', usage: 'Not production Official Tests' } },
      statement: 'Public statement', constraints: [], signature: { ...signature, hash: signatureHash },
      comparator: { id: 'exact-typed', version: 1 }, official: { testSetId: 'synthetic-only', version: 1, hash: rawPackageDigest(judge) } })),
    samples: Buffer.from(JSON.stringify({ schemaVersion: 1, exerciseId: id, signatureVersion: 1, signatureHash,
      samples: [{ id: 'public-1', args: ['public'], expected: 'public' }] })), judge,
    csharp: Buffer.from('// synthetic'), javascript: Buffer.from('// synthetic'),
  }
  const paths = { metadata: 'exercise.json', samples: 'samples.json', judge: 'judge/v1.json', csharp: 'starters/csharp.txt', javascript: 'starters/javascript.txt' }
  const descriptors: Record<string, { path: string; bytes: number; sha256: string }> = {}
  for (const key of Object.keys(assets) as (keyof typeof assets)[]) {
    const target = join(root, id, paths[key]); await fs.mkdir(dirname(target), { recursive: true }); await fs.writeFile(target, assets[key])
    descriptors[key] = { path: paths[key], bytes: assets[key].length, sha256: rawPackageDigest(assets[key]) }
  }
  const raw = Buffer.from(JSON.stringify({ schemaVersion: 2, policyVersion: 2, version: 1,
    packages: [{ profile: 'full', exerciseId: id, packageVersion: 1, assets: descriptors }] }))
  await fs.writeFile(join(root, 'manifest.json'), raw)
  await fs.mkdir(join(directory, 'user-data'))
  const registry = new ExercisePackageRegistry(scope => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath: join(directory, 'resources') },
    { version: 1, rawBytes: raw.length, sha256: rawPackageDigest(raw) }, scope))
  await registry.whenStarted()
  const store = createPracticeStore(join(directory, 'user-data/drafts.json')); await store.start()
  const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
  const ipc = new IpcHandlerRegistry({ handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => { handlers.delete(channel) } })
  const service = new PracticeIpcService(ipc, store, () => {}, () => {}, registry)
  service.start()
  const bridge = createPracticeBridge({ invoke: (channel, value) => handlers.get(channel)!({ sender: { id: 5 } }, value), on() {}, removeListener() {} })
  const open = fs.open, opened: string[] = []
  vi.spyOn(fs, 'open').mockImplementation((...args: Parameters<typeof fs.open>) => { opened.push(String(args[0])); return open(...args) })
  try {
    const list = await bridge.list({}), detail = await bridge.detail({ exerciseId: id })
    expect(list.ok && detail.ok).toBe(true)
    expect(opened.some(path => path.endsWith('v1.json'))).toBe(false)
    for (const result of [list, detail]) {
      const encoded = JSON.stringify(result)
      expect(encoded).not.toContain(hidden)
      for (const key of ['official', 'judge', 'sha256', 'testSetId', 'comparator', 'signatureHash', 'visibility', 'stack', 'console']) expect(encoded).not.toContain('"' + key + '"')
    }
    await fs.appendFile(join(root, id, 'judge/v1.json'), ' ')
    await expect(registry.acquire(id, { owner: {}, generation: 1, phase: 'prepare', isCurrent: () => true,
      check() {}, retain() {}, canRelease: () => true })).rejects.toHaveProperty('code', 'PACKAGE_LOAD_FAILED')
    expect(registry.readiness(id)).toMatchObject({ judgeReady: false, submitReady: false, releaseReady: false, failure: 'PACKAGE_INTEGRITY_FAILED' })
    const publicAfterFault = await bridge.detail({ exerciseId: id })
    expect(publicAfterFault.ok).toBe(true)
    expect(JSON.stringify(publicAfterFault)).not.toContain(hidden)
    expect(registry.readiness(id)).toMatchObject({ verifiedCapability: 'public', judgeReady: false, submitReady: false })
  } finally { await service.stop(); await store.stop(); await registry.stop() }
})

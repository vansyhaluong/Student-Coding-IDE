import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { catalogue, frozen, checkFullReceipt, sha, languages } from '../fixtures/learning/official-runtime/catalogue-evidence'
import { PILOT_IDS, SOLUTIONS } from '../fixtures/learning/official-runtime/pilot-solutions'
import type { PilotReceipt } from '../fixtures/learning/official-runtime/pilot-native'
import { generateCsharpSignatureHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { javascriptSignaturePreparation } from '../../src/main/services/learning/runtime/javascript-harness'

describe('S6 catalogue contracts and existing pilot evidence (no new native launch)', () => {
  it('pins exactly55 new ID sources to reviewed references and input-only signature generation', async () => {
    const { remaining, sources, pins } = await catalogue()
    expect(remaining).toHaveLength(55)
    for (const id of remaining) {
      const { metadata, judge } = await frozen(id)
      for (const language of languages) {
        const code = sources[id][language], file = language === 'csharp' ? 'Solution.cs' : 'solution.js'
        expect(sha(code)).toBe(pins[id].source[language])
        expect(sha(await readFile(`scripts/learning-official-tests/references/${id}/${file}`))).toBe(pins[id].reference[language])
        expect(code).not.toMatch(/module\.exports|namespace |public static class Solution|"expected"|"visibility"|"testSetId"/)
      }
      const schema = { parameterTypes: metadata.signature.parameters.map(p => p.type), returnType: metadata.signature.returnType, sampleCount: judge.cases.length }
      const cs = generateCsharpSignatureHarness(metadata.signature, schema)
      const js = JSON.parse(javascriptSignaturePreparation(metadata.signature, schema.sampleCount, sources[id].javascript, schema))
      expect(Object.keys(js).sort()).toEqual(['code', 'functionName', 'schema'])
      expect(js.functionName).toBe(pins[id].functionName)
      expect(cs).not.toContain(metadata.official.hash)
      expect(JSON.stringify(js)).not.toMatch(/"expected"|"visibility"|"testSetId"|"args"/)
    }
  })
  it('matches every manifest7 asset to source and compiled bytes,63 sets/504 cases', async () => {
    const { manifest, ids } = await catalogue()
    const raw = await readFile('resources/learning/exercises/manifest.json')
    expect(sha(raw)).toBe('75ddbf0447e4708882c1e8e1f96e7cbebf97bf5aa170a14713e96755a9d3e081')
    expect(await readFile('out/main/resources/learning/exercises/manifest.json')).toEqual(raw)
    const counts = await Promise.all(manifest.packages.map(async pack => {
      await Promise.all(Object.values(pack.assets).map(async asset => {
        const path = `${pack.exerciseId}/${asset.path}`
        const [source, compiled] = await Promise.all([
          readFile(`resources/learning/exercises/${path}`), readFile(`out/main/resources/learning/exercises/${path}`),
        ])
        expect(source.length).toBe(asset.bytes); expect(sha(source)).toBe(asset.sha256)
        expect(compiled).toEqual(source)
      }))
      return (await frozen(pack.exerciseId)).judge.cases.length
    }))
    expect(ids).toHaveLength(63); expect(counts.reduce((n, count) => n + count, 0)).toBe(504)
  }, 20_000)
  it('revalidates16 accepted S5 full receipts without rerunning any pilot operation', async () => {
    const pins = JSON.parse(await readFile('tests/fixtures/learning/official-runtime/pilot-pins.json', 'utf8'))
    for (const id of PILOT_IDS) for (const language of languages) {
      const receipt = JSON.parse(await readFile(`out/e3-s5/native/${id}-${language}-full.json`, 'utf8')) as PilotReceipt
      expect(receipt.assertion).toBe('PASS'); expect(sha(SOLUTIONS[id][language])).toBe(pins[id][language])
      await checkFullReceipt(receipt, SOLUTIONS[id][language])
    }
  })
  it('refuses partial execution, mismatched identity/order, missing barriers and unsafe cleanup in reused evidence', async () => {
    const original = JSON.parse(await readFile('out/e3-s5/native/ch2-04-csharp-full.json', 'utf8')) as PilotReceipt
    for (const mutate of [
      (r: PilotReceipt) => { r.result = { ...r.result!, cases: r.result!.cases.slice(0, -1) } },
      (r: PilotReceipt) => { r.identity = { ...r.identity, signatureHash: 'wrong' } },
      (r: PilotReceipt) => { r.requests.reverse() },
      (r: PilotReceipt) => { r.barriers-- },
      (r: PilotReceipt) => { r.result = { ...r.result!, cleanup: { ...r.result!.cleanup, cleanupComplete: false } } },
      (r: PilotReceipt) => { r.rawBytes = 1024 ** 2 + 1 },
    ]) {
      const changed = structuredClone(original); mutate(changed)
      await expect(checkFullReceipt(changed, SOLUTIONS['ch2-04'].csharp)).rejects.toThrow()
    }
  })
  it('keeps catalogue sources/evidence out of production service, build and public entries', async () => {
    for (const path of ['src/main/services/learning/exercise-service.ts', 'src/main/index.ts', 'electron.vite.config.ts', 'src/shared/contracts/index.ts'])
      expect(await readFile(path, 'utf8')).not.toMatch(/catalogue-solutions|catalogue-evidence|official-runtime-catalogue|catalogue-pins/)
  })
})

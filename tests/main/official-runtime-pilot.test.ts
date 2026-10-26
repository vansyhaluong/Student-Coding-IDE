import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { PILOT_IDS, SOLUTIONS, FAULTS, faultSource } from '../fixtures/learning/official-runtime/pilot-solutions'
import { generateCsharpSignatureHarness } from '../../src/main/services/learning/runtime/csharp-harness'
import { javascriptSignaturePreparation } from '../../src/main/services/learning/runtime/javascript-harness'
import { isExercise } from '../../src/shared/contracts/practice'

describe('S5 pinned pilot assets and input-only test consumer contract (no native execution)', () => {
  it('pins exactly the approved eight IDs and sixteen reviewed harness-compatible sources', async () => {
    const pins = JSON.parse(await readFile('tests/fixtures/learning/official-runtime/pilot-pins.json', 'utf8'))
    expect(PILOT_IDS).toEqual(['ch2-04', 'ch3-04', 'ch3-07', 'ch5-03', 'ch5-07', 'ch7-01', 'ch8-01', 'ch4-03'])
    expect(Object.keys(pins)).toEqual([...PILOT_IDS])
    for (const id of PILOT_IDS) for (const language of ['csharp', 'javascript'] as const) {
      const code = SOLUTIONS[id][language]
      expect(createHash('sha256').update(code).digest('hex')).toBe(pins[id][language])
      expect(code).not.toMatch(/module\.exports|^namespace |public static class Solution/)
    }
  })
  it('keeps frozen signature/count/source identity, including13/21, out of fake public Exercises', async () => {
    const inputTypes = new Set<string>()
    for (const id of PILOT_IDS) {
      const metadata = JSON.parse(await readFile(`resources/learning/exercises/${id}/exercise.json`, 'utf8'))
      const raw = await readFile(`resources/learning/exercises/${id}/judge/v1.json`), judge = JSON.parse(raw.toString())
      expect(createHash('sha256').update(raw).digest('hex')).toBe(metadata.official.hash)
      if (id === 'ch8-01') expect(judge.cases).toHaveLength(13)
      if (id === 'ch4-03') expect(judge.cases).toHaveLength(21)
      for (const p of metadata.signature.parameters) inputTypes.add(p.type)
      const schema = { parameterTypes: metadata.signature.parameters.map((p: { type: string }) => p.type), returnType: metadata.signature.returnType, sampleCount: judge.cases.length }
      const harness = generateCsharpSignatureHarness(metadata.signature, schema)
      const source = JSON.parse(javascriptSignaturePreparation(metadata.signature, schema.sampleCount, SOLUTIONS[id].javascript, schema))
      expect(Object.keys(source).sort()).toEqual(['code', 'functionName', 'schema'])
      expect(source.functionName).toBe(metadata.signature.functionName)
      expect(harness).not.toContain(metadata.official.hash)
      expect(JSON.stringify(source)).not.toMatch(/"expected"|"visibility"|"testSetId"|"args"/)
      expect(isExercise({ ...metadata, samples: judge.cases })).toBe(false)
    }
    expect([...inputTypes].sort()).toEqual(['boolean', 'int32', 'int32[]', 'int32[][]', 'string', 'string[]'].sort())
  })
  it('keeps failure programs bounded and distinct from successful pinned sources or a Judge', () => {
    for (const language of ['csharp', 'javascript'] as const) for (const fault of FAULTS) {
      const source = faultSource(language, fault)
      expect(Buffer.byteLength(source)).toBeLessThan(256 * 1024)
      expect(source).not.toMatch(/"expected"|"visibility"|"testSetId"|Accepted|WrongAnswer/)
      if (fault === 'timeout' || fault === 'cancel') expect(source).toMatch(/while\(true\)|for\(;;\)/)
    }
  })
  it('keeps pilot fixtures out of production composition and public contracts', async () => {
    for (const path of ['src/main/services/learning/exercise-service.ts', 'src/main/index.ts', 'electron.vite.config.ts', 'src/shared/contracts/index.ts'])
      expect(await readFile(path, 'utf8')).not.toMatch(/pilot-solutions|pilot-native|official-runtime-pilot|pilot-pins/)
  })
})

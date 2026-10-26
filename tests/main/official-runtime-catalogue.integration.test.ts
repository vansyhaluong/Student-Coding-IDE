import { mkdir, writeFile } from 'node:fs/promises'
import { afterAll, describe, it } from 'vitest'
import { catalogue, checkFullReceipt, languages } from '../fixtures/learning/official-runtime/catalogue-evidence'
import { nativePilot, retryRetainedPilot } from '../fixtures/learning/official-runtime/pilot-native'

const enabled = process.platform === 'win32' && process.arch === 'x64' && process.env.LEARNING_OFFICIAL_CATALOGUE_LIVE === '1'
const { remaining, sources } = await catalogue()
const pairs = remaining.flatMap(id => languages.map(language => ({ id, language })))
describe.skipIf(!enabled)('S6 remaining110 complete Official operations, no pilot rerun', () => {
  afterAll(async () => { await retryRetainedPilot() })
  it.each(pairs)('$id/$language full frozen set through the existing private service', async ({ id, language }) => {
    const path = `out/e3-s6/native/${id}-${language}-full.json`
    await mkdir('out/e3-s6/native', { recursive: true })
    let operation: Awaited<ReturnType<typeof nativePilot>>
    try { operation = await nativePilot(id, language, { code: sources[id][language], evidenceDirectory: 'out/e3-s6/native' }) }
    catch (error) {
      await writeFile(path, JSON.stringify({ id, language, assertion: 'UNVERIFIED', launchError: String(error) }, null, 2))
      throw error
    }
    const r = operation.receipt
    try { await checkFullReceipt(r, sources[id][language]); r.assertion = 'PASS' }
    catch (error) { r.assertion = 'FAIL'; r.assertionError = String(error); throw error }
    finally {
      await writeFile(path, JSON.stringify(r, null, 2))
      console.log(`[S6] ${id}/${language} ${r.assertion} ${r.result?.cases.length ?? 0}/${r.caseCount} cases, ${r.rawBytes} raw bytes, ${r.executionMs?.toFixed(0)}ms`)
    }
  }, 80_000)
})

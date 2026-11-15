// Deterministic Windows sharing regression; no compiler or crash scenario retry.
import assert from 'node:assert/strict'
import console from 'node:console'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { writeFileSync, readFileSync, renameSync } from 'node:fs'
import { currentRun, output } from './staged-integrity.mjs'
const { evidence } = currentRun()
const native = createRequire(import.meta.url)(join(output, 'exercise-process.node'))
const path = join(evidence, 'rename-sharing-probe.json'), temporary = `${path}.tmp`
writeFileSync(path, JSON.stringify({ sequence: 1 }))
writeFileSync(temporary, JSON.stringify({ sequence: 2 }))
const handle = native.lockFile(path)
let error
try { renameSync(temporary, path) } catch (e) { error = { code: e.code, message: e.message } }
finally { native.closeHandle(handle) }
assert.ok(error, 'Windows destination without delete sharing must reject replacement')
assert.equal(JSON.parse(readFileSync(path, 'utf8')).sequence, 1)
assert.equal(JSON.parse(readFileSync(temporary, 'utf8')).sequence, 2)
// The old predicate never evaluates its second Promise, even after await.
let abortReads = 0
const exists = async name => name === 'continue' ? false : (++abortReads, true)
assert.equal(await (exists('continue') || exists('abort')), false)
assert.equal(abortReads, 0)
assert.equal((await exists('continue')) || (await exists('abort')), true)
assert.equal(abortReads, 1)
writeFileSync(join(evidence, 'harness-regression.json'), JSON.stringify({
  status: 'PASS', renameFailure: error, staleDestinationSequence: 1, pendingTemporarySequence: 2,
  oldAbortReads: 0, correctedAbortReads: abortReads,
  limitation: 'Deterministic reproduction of failure mechanisms; R6 did not capture its original rename exception.'
}, null, 2))
console.log('C02 harness regression PASS')

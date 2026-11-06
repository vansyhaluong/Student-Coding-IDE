// Isolated runner bookkeeping only. No credentials, transport or production imports.
import { mkdir, open, link, unlink, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

export const models = { FREE_ROUTER: 'openrouter/free', NORTH_MINI_CODE_FREE: 'cohere/north-mini-code:free', GEMINI_FLASH_LITE: 'gemini-3.1-flash-lite' }
const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/
export function attemptPaths(root, attemptId, executionMode, provider = 'OPENROUTER') {
  if (!['OPENROUTER', 'GEMINI'].includes(provider) || typeof attemptId !== 'string' || !idPattern.test(attemptId) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(attemptId) || !['LIVE', 'OFFLINE'].includes(executionMode)) throw Error('INVALID_ATTEMPT')
  const parent = resolve(root, provider === 'GEMINI' ? 'out/sh4-gemini-attempts' : 'out/sh4-attempts', executionMode.toLowerCase())
  const directory = resolve(parent, attemptId)
  return { directory, lock: resolve(parent, 'active.lock'), manifest: resolve(directory, 'attempt.json'),
    reservation: resolve(directory, 'reservation.json'), result: resolve(directory, 'result.json') }
}

/** Complete file publication without replacement. NTFS hard-link creation is atomic.
 * A crash before publication leaves at most an inert temp file; never dispatch then.
 * Unsupported filesystem/permissions fail closed, never fall back to replacing rename.
 */
export async function publishExclusive(destination, value) {
  const temporary = `${destination}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx')
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() }
  finally { await file.close() }
  try { await link(temporary, destination) }
  finally { await unlink(temporary) }
}

export async function claimAttempt(root, { attemptId, runId, profile, executionMode }) {
  if (!Object.hasOwn(models, profile) || !/^[a-f0-9-]{36}$/.test(runId)) throw Error('INVALID_ATTEMPT')
  const paths = attemptPaths(root, attemptId, executionMode, profile === 'GEMINI_FLASH_LITE' ? 'GEMINI' : 'OPENROUTER')
  await mkdir(resolve(paths.directory, '..'), { recursive: true })
  // The directory is the permanent launch claim, even if manifest publication crashes.
  await mkdir(paths.directory)
  const manifest = { schemaVersion: 1, attemptId, runId, profile, model: models[profile], executionMode,
    recordedAt: new Date().toISOString(), approvalReference: attemptId,
    approvalScope: 'SYNTHETIC_CSHARP_HINT_L1_ONE_INFERENCE', maximumInferenceRequests: 1,
    timeoutMs: 30000, maxOutputTokens: 2048, productionEnabled: false, retry: false, paidFallback: false }
  await publishExclusive(paths.manifest, manifest)
  return { ...paths, manifestValue: manifest }
}

export async function loadAttempt(root, attemptId, executionMode, runId, profile) {
  const paths = attemptPaths(root, attemptId, executionMode, profile === 'GEMINI_FLASH_LITE' ? 'GEMINI' : 'OPENROUTER')
  const value = JSON.parse(await readFile(paths.manifest, 'utf8'))
  if (value.attemptId !== attemptId || value.runId !== runId || value.profile !== profile
    || value.model !== models[profile] || value.executionMode !== executionMode
    || value.timeoutMs !== 30000 || value.maxOutputTokens !== 2048 || value.retry !== false || value.paidFallback !== false || value.productionEnabled !== false
    || value.maximumInferenceRequests !== 1 || value.approvalScope !== 'SYNTHETIC_CSHARP_HINT_L1_ONE_INFERENCE') throw Error('INVALID_ATTEMPT')
  const owner = JSON.parse(await readFile(paths.lock, 'utf8'))
  if (owner.attemptId !== attemptId || owner.runId !== runId) throw Error('LOCK_OWNERSHIP')
  try { await readFile(paths.result); throw Error('ATTEMPT_FINISHED') } catch (error) { if (error.code !== 'ENOENT') throw error }
  return { ...paths, manifestValue: value }
}

/** One active runner per execution mode, including distinct attempts/processes.
 * Abrupt supervisor death leaves a stale lock requiring explicit human recovery.
 */
export async function acquireAttemptLock(attempt) {
  const file = await open(attempt.lock, 'wx')
  try { await file.writeFile(JSON.stringify({ attemptId: attempt.manifestValue.attemptId, runId: attempt.manifestValue.runId }) + '\n'); await file.sync() }
  finally { await file.close() }
  return async () => {
    const owner = JSON.parse(await readFile(attempt.lock, 'utf8'))
    if (owner.runId !== attempt.manifestValue.runId || owner.attemptId !== attempt.manifestValue.attemptId) throw Error('LOCK_OWNERSHIP')
    await unlink(attempt.lock)
  }
}

export async function reserveInference(attempt) {
  const owner = JSON.parse(await readFile(attempt.lock, 'utf8'))
  if (owner.runId !== attempt.manifestValue.runId || owner.attemptId !== attempt.manifestValue.attemptId) throw Error('LOCK_OWNERSHIP')
  // Atomic no-clobber publication arbitrates duplicate callbacks/processes.
  await publishExclusive(attempt.reservation, { ...attempt.manifestValue, reservedAt: new Date().toISOString(), delivery: 'UNKNOWN' })
}

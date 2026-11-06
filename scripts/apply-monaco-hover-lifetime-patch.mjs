/* global console, process, Buffer */
// Approved SH-3 option A. Exact pinned dependency patch; never a provider flag.
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, open, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const MONACO_VERSION = '0.56.0'
export const ORIGINAL_SHA256 = 'f8723b599a57a3a4e1b3bb207d5b9019a7f5c0aa6c5e98be8461352ffa147c2d'
export const PATCHED_SHA256 = '49706328ce8207052cba8eb759098cbd8c7c8acb680a755d4eba395c86002e1b'
export const TARGET = 'esm/vs/editor/standalone/browser/standaloneCodeEditor.js'
export const BACKUP = '.student-ide-hover-lifetime-v1.original.js'
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function patchSource(bytes) {
  if (digest(bytes) !== ORIGINAL_SHA256) throw Error('Monaco pristine source hash mismatch; no patch applied.')
  const source = bytes.toString('utf8')
  return Buffer.from(source
    .replace("{ StandaloneKeybindingService, updateConfigurationService }", "{ StandaloneKeybindingService, StandaloneServices, updateConfigurationService }")
    .replace('=> instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));',
      '=> StandaloneServices.initialize({}).createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));'), 'utf8')
}

async function backupBytes(path) {
  try {
    const bytes = await readFile(path)
    if (digest(bytes) !== ORIGINAL_SHA256) throw Error('Monaco captured original backup hash mismatch.')
    return bytes
  } catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
async function replaceChecked(target, bytes, expectedCurrent) {
  const temporary = join(dirname(target), `.student-ide-hover-${randomUUID()}.tmp`)
  let failure
  try {
    const handle = await open(temporary, 'wx')
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
    if (digest(await readFile(temporary)) !== digest(bytes)) throw Error('Monaco staged write verification failed.')
    if (digest(await readFile(target)) !== expectedCurrent) throw Error('Monaco target changed during patch; no replacement applied.')
    await rename(temporary, target)
    if (digest(await readFile(target)) !== digest(bytes)) throw Error('Monaco final write verification failed.')
  } catch (error) { failure = error } finally {
    try { await unlink(temporary) } catch (error) {
      if (error.code !== 'ENOENT') failure = failure ? new AggregateError([failure, error], 'Monaco patch and temporary cleanup failed.') : error
    }
  }
  if (failure) throw failure
}

export async function patchMonacoHoverLifetime(packageRoot, action = 'apply') {
  if (!['apply', 'check', 'rollback'].includes(action)) throw Error('Unknown Monaco patch action.')
  const root = resolve(packageRoot)
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (metadata.version !== MONACO_VERSION) throw Error(`Refusing Monaco ${metadata.version}; expected exactly ${MONACO_VERSION}.`)
  const target = join(root, TARGET), backupPath = join(root, BACKUP)
  const bytes = await readFile(target), hash = digest(bytes)
  if (![ORIGINAL_SHA256, PATCHED_SHA256].includes(hash)) throw Error('Monaco source matches neither approved original nor patched hash.')
  let captured = await backupBytes(backupPath)
  if (hash === PATCHED_SHA256 && !captured) throw Error('Monaco patched source has no verified captured original for rollback.')
  if (action === 'check') {
    if (hash !== PATCHED_SHA256) throw Error('Monaco approved hover lifetime patch is not applied.')
    return { state: 'PATCHED', changed: false, hash }
  }
  if (action === 'rollback') {
    if (hash === ORIGINAL_SHA256) return { state: 'ORIGINAL', changed: false, hash }
    await replaceChecked(target, captured, PATCHED_SHA256)
    return { state: 'ORIGINAL', changed: true, hash: ORIGINAL_SHA256 }
  }
  if (hash === PATCHED_SHA256) return { state: 'PATCHED', changed: false, hash }
  const patched = patchSource(bytes)
  if (digest(patched) !== PATCHED_SHA256) throw Error('Monaco proposed replacement does not match the approved patched hash.')
  if (!captured) {
    try { await writeFile(backupPath, bytes, { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    captured = await backupBytes(backupPath)
    if (!captured) throw Error('Monaco captured original was not retained.')
  }
  await replaceChecked(target, patched, ORIGINAL_SHA256)
  return { state: 'PATCHED', changed: true, hash: PATCHED_SHA256 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length > 1 || args.some(a => !['--check', '--rollback'].includes(a))) throw Error('Usage: monaco:patch [--check|--rollback]')
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'monaco-editor')
  const result = await patchMonacoHoverLifetime(packageRoot, args[0] === '--check' ? 'check' : args[0] === '--rollback' ? 'rollback' : 'apply')
  console.log(`Monaco ${MONACO_VERSION} hover lifetime: ${result.state}, changed=${result.changed}, sha256=${result.hash}`)
}

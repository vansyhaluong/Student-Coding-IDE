import { beforeAll, afterEach, expect, it } from 'vitest'
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { Buffer } from 'node:buffer'
import { dirname, join, resolve } from 'node:path'
import { MONACO_VERSION, ORIGINAL_SHA256, PATCHED_SHA256, TARGET, BACKUP, digest, patchSource,
  patchMonacoHoverLifetime } from '../../scripts/apply-monaco-hover-lifetime-patch.mjs'

const roots = []
let pristine
beforeAll(async () => {
  const installed = resolve('node_modules/monaco-editor')
  const bytes = await readFile(join(installed, TARGET))
  pristine = digest(bytes) === ORIGINAL_SHA256 ? bytes : await readFile(join(installed, BACKUP))
  expect(digest(pristine)).toBe(ORIGINAL_SHA256)
})
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.startsWith(join(tmpdir(), 'sh3-monaco-patch-'))) throw Error('Unexpected fixture cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(version = MONACO_VERSION, bytes = pristine) {
  const root = await mkdtemp(join(tmpdir(), 'sh3-monaco-patch-')); roots.push(root)
  await mkdir(dirname(join(root, TARGET)), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ version }))
  await writeFile(join(root, TARGET), bytes)
  return root
}
it('only the approved import and callback differ; expected resulting hash is fixed', () => {
  const patched = patchSource(pristine)
  expect(digest(patched)).toBe(PATCHED_SHA256)
  const before = pristine.toString().split('\n'), after = patched.toString().split('\n')
  expect(before.length).toBe(after.length)
  const changes = after.filter((line, i) => line !== before[i])
  expect(changes).toHaveLength(2)
  expect(changes[0]).toContain('StandaloneServices, updateConfigurationService')
  expect(changes[1]).toContain('StandaloneServices.initialize({}).createInstance')
})
it('captures exact original, applies, verifies and is idempotent without touching mtime', async () => {
  const root = await fixture()
  expect(await patchMonacoHoverLifetime(root)).toEqual({ state: 'PATCHED', changed: true, hash: PATCHED_SHA256 })
  expect(await readFile(join(root, BACKUP))).toEqual(pristine)
  const modified = (await stat(join(root, TARGET), { bigint: true })).mtimeNs
  expect(await patchMonacoHoverLifetime(root)).toEqual({ state: 'PATCHED', changed: false, hash: PATCHED_SHA256 })
  expect((await stat(join(root, TARGET), { bigint: true })).mtimeNs).toBe(modified)
  expect((await patchMonacoHoverLifetime(root, 'check')).state).toBe('PATCHED')
})
it('checked rollback restores exact bytes, remains idempotent and can reapply', async () => {
  const root = await fixture(); await patchMonacoHoverLifetime(root)
  expect(await patchMonacoHoverLifetime(root, 'rollback')).toEqual({ state: 'ORIGINAL', changed: true, hash: ORIGINAL_SHA256 })
  expect(await readFile(join(root, TARGET))).toEqual(pristine)
  expect((await patchMonacoHoverLifetime(root, 'rollback')).changed).toBe(false)
  expect((await patchMonacoHoverLifetime(root)).hash).toBe(PATCHED_SHA256)
})
it('check mode refuses unpatched bytes without writing a backup or changing source', async () => {
  const root = await fixture()
  await expect(patchMonacoHoverLifetime(root, 'check')).rejects.toThrow('not applied')
  expect(await readFile(join(root, TARGET))).toEqual(pristine)
  await expect(stat(join(root, BACKUP))).rejects.toMatchObject({ code: 'ENOENT' })
})
it.each(['0.55.1', '0.56.1', '0.57.0'])('rejects version %s before writing', async version => {
  const root = await fixture(version)
  await expect(patchMonacoHoverLifetime(root)).rejects.toThrow('expected exactly')
  expect(await readFile(join(root, TARGET))).toEqual(pristine)
  await expect(stat(join(root, BACKUP))).rejects.toMatchObject({ code: 'ENOENT' })
})
it.each(['apply', 'rollback', 'check'])('unknown source refuses %s without replacement', async action => {
  const unknown = Buffer.from('user dependency changes')
  const root = await fixture(MONACO_VERSION, unknown)
  await expect(patchMonacoHoverLifetime(root, action)).rejects.toThrow('neither approved')
  expect(await readFile(join(root, TARGET))).toEqual(unknown)
})
it.each(['apply', 'rollback', 'check'])('invalid captured original refuses %s', async action => {
  const root = await fixture(); await patchMonacoHoverLifetime(root)
  await writeFile(join(root, BACKUP), 'tampered backup')
  await expect(patchMonacoHoverLifetime(root, action)).rejects.toThrow('backup hash mismatch')
  expect(digest(await readFile(join(root, TARGET)))).toBe(PATCHED_SHA256)
})
it.each(['apply', 'rollback', 'check'])('patched bytes without backup refuse %s', async action => {
  const root = await fixture(); await patchMonacoHoverLifetime(root); await unlink(join(root, BACKUP))
  await expect(patchMonacoHoverLifetime(root, action)).rejects.toThrow('no verified captured original')
  expect(digest(await readFile(join(root, TARGET)))).toBe(PATCHED_SHA256)
})
it('does not overwrite an existing invalid backup when source is still pristine', async () => {
  const root = await fixture(); await writeFile(join(root, BACKUP), 'existing user file')
  await expect(patchMonacoHoverLifetime(root)).rejects.toThrow('backup hash mismatch')
  expect(await readFile(join(root, TARGET))).toEqual(pristine)
  expect(await readFile(join(root, BACKUP), 'utf8')).toBe('existing user file')
})

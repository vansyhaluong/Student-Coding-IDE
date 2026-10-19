import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createPracticeStore, savePracticeDraft } from '../../src/main/services/learning/practice-store'

const directories: string[] = []
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }) })
it('retains independent exercise/language drafts and last language after fresh startup, including empty code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'practice-9c-')); directories.push(directory)
  const path = join(directory, 'learning', 'drafts.json')
  const store = createPracticeStore(path); await store.start()
  await Promise.all([
    savePracticeDraft(store, { exerciseId: 'ch2-01', language: 'csharp', code: '// C#' }),
    savePracticeDraft(store, { exerciseId: 'ch2-01', language: 'javascript', code: '' }),
    savePracticeDraft(store, { exerciseId: 'ch3-02', language: 'csharp', code: '// another' }),
  ])
  await store.stop()
  const restarted = createPracticeStore(path); await restarted.start()
  expect(restarted.getValue().drafts).toHaveLength(3)
  expect(restarted.getValue().drafts.find(d => d.language === 'javascript')?.code).toBe('')
  expect(restarted.getValue().languages.find(l => l.exerciseId === 'ch2-01')?.language).toBe('javascript')
  await savePracticeDraft(restarted, { exerciseId: 'ch2-01', language: 'csharp', code: '// reset only C#' })
  expect(restarted.getValue().drafts.find(d => d.language === 'javascript')?.code).toBe('')
  await restarted.stop()
  await writeFile(path, 'broken json')
  const recovered = createPracticeStore(path); await recovered.start()
  expect(recovered.recovered).toBe(true)
  expect(recovered.getValue().drafts.find(d => d.language === 'javascript')?.code).toBe('')
  await recovered.stop()
})

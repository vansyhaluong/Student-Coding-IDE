import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

import { PersistenceService } from '../../src/main/services/persistence/persistence-service'

interface TestState {
  value: number
}

const temporaryDirectories: string[] = []

async function createStore(): Promise<{
  filePath: string
  store: PersistenceService<TestState>
}> {
  const directory = await mkdtemp(join(tmpdir(), 'student-ide-persistence-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, 'state.json')
  return {
    filePath,
    store: new PersistenceService<TestState>({
      filePath,
      schemaVersion: 1,
      defaultValue: () => ({ value: 0 }),
      validate: (value): value is TestState => (
        typeof value === 'object'
        && value !== null
        && 'value' in value
        && typeof value.value === 'number'
      ),
    }),
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('PersistenceService', () => {
  it('loads defaults when no state exists', async () => {
    const { store } = await createStore()
    await expect(store.load()).resolves.toEqual({
      value: { value: 0 },
      source: 'default',
      recovered: false,
    })
  })

  it('writes versioned JSON and reads it back', async () => {
    const { filePath, store } = await createStore()
    await store.update({ value: 1 })

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      schemaVersion: 1,
      data: { value: 1 },
    })
    await expect(store.load()).resolves.toEqual({
      value: { value: 1 },
      source: 'primary',
      recovered: false,
    })
  })

  it('serializes writes and retains the prior valid document as backup', async () => {
    const { filePath, store } = await createStore()
    await store.save({ value: 1 })
    await Promise.all([
      store.save({ value: 2 }),
      store.save({ value: 3 }),
    ])

    expect(JSON.parse(await readFile(filePath, 'utf8')).data).toEqual({
      value: 3,
    })
    expect(JSON.parse(await readFile(`${filePath}.bak`, 'utf8')).data)
      .toEqual({ value: 2 })
  })

  it('recovers from a corrupt primary document using the backup', async () => {
    const { filePath, store } = await createStore()
    await store.save({ value: 1 })
    await store.save({ value: 2 })
    await writeFile(filePath, '{ invalid json', 'utf8')

    await expect(store.load()).resolves.toEqual({
      value: { value: 1 },
      source: 'backup',
      recovered: true,
    })
  })

  it('falls back safely for an unsupported schema', async () => {
    const { filePath, store } = await createStore()
    await writeFile(filePath, JSON.stringify({
      schemaVersion: 99,
      data: { value: 42 },
    }), 'utf8')

    await expect(store.load()).resolves.toEqual({
      value: { value: 0 },
      source: 'default',
      recovered: true,
    })
  })
})

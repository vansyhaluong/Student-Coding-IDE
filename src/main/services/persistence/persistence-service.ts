import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname } from 'node:path'

import type { ManagedService } from '../../app/desktop-application'

export interface PersistenceFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  copyFile(source: string, destination: string): Promise<void>
  rename(source: string, destination: string): Promise<void>
  unlink(path: string): Promise<void>
}

export interface VersionedDocument<T> {
  schemaVersion: number
  data: T
}

export interface PersistenceLoadResult<T> {
  value: T
  source: 'primary' | 'backup' | 'default'
  recovered: boolean
}

export interface PersistenceStoreOptions<T> {
  filePath: string
  schemaVersion: number
  defaultValue(): T
  validate(value: unknown): value is T
  migrate?(version: number, data: unknown): unknown
  fileSystem?: PersistenceFileSystem
}

const nodeFileSystem: PersistenceFileSystem = {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rename,
  unlink,
}

export class PersistenceService<T> implements ManagedService {
  readonly name = 'PersistenceService'
  private writeQueue: Promise<void> = Promise.resolve()
  private writeSequence = 0
  private readonly fileSystem: PersistenceFileSystem
  private currentValue: T | undefined
  recovered = false

  constructor(private readonly options: PersistenceStoreOptions<T>) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem
  }

  async start(): Promise<void> {
    const loaded = await this.load()
    this.currentValue = loaded.value
    this.recovered = loaded.recovered
  }

  getValue(): T {
    return structuredClone(this.currentValue ?? this.options.defaultValue())
  }

  async update(value: T): Promise<void> {
    const snapshot = structuredClone(value)
    await this.updateWith(() => snapshot)
  }

  updateWith(change: (current: T) => T): Promise<void> {
    const run = this.writeQueue.then(async () => {
      const next = structuredClone(change(this.getValue()))
      if (!this.options.validate(next)) throw new Error('Invalid persisted state')
      await this.writeDocument(next)
      this.currentValue = next
    })
    this.writeQueue = run.catch(() => undefined)
    return run
  }

  async load(): Promise<PersistenceLoadResult<T>> {
    const primary = await this.readCandidate(this.options.filePath)
    if (primary.status === 'valid') {
      return {
        value: primary.document.data,
        source: 'primary',
        recovered: false,
      }
    }

    const backup = await this.readCandidate(this.backupPath)
    if (backup.status === 'valid') {
      return {
        value: backup.document.data,
        source: 'backup',
        recovered: true,
      }
    }

    return {
      value: this.options.defaultValue(),
      source: 'default',
      recovered: primary.status === 'invalid' || backup.status === 'invalid',
    }
  }

  save(value: T): Promise<void> {
    const snapshot = structuredClone(value)
    const run = this.writeQueue.then(() => {
      if (!this.options.validate(snapshot)) throw new Error('Invalid persisted state')
      return this.writeDocument(snapshot)
    })
    this.writeQueue = run.catch(() => undefined)
    return run
  }

  async stop(): Promise<void> {
    await this.writeQueue
  }

  private async writeDocument(value: T): Promise<void> {
    const directory = dirname(this.options.filePath)
    const temporaryPath = `${this.options.filePath}.tmp-${process.pid}-${++this.writeSequence}`
    const document: VersionedDocument<T> = {
      schemaVersion: this.options.schemaVersion,
      data: value,
    }

    await this.fileSystem.mkdir(directory, { recursive: true })
    await this.fileSystem.writeFile(
      temporaryPath,
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8',
    )

    try {
      const current = await this.readCandidate(this.options.filePath)
      if (current.status === 'valid') {
        await this.fileSystem.copyFile(
          this.options.filePath,
          this.backupPath,
        )
      }
      if (current.status === 'invalid') await this.fileSystem.copyFile(this.options.filePath, this.options.filePath + '.corrupt')
      await this.fileSystem.rename(temporaryPath, this.options.filePath)
    } catch (error) {
      await this.fileSystem.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  private async readCandidate(path: string): Promise<
    | { status: 'valid'; document: VersionedDocument<T> }
    | { status: 'missing' | 'invalid' }
  > {
    try {
      const parsed: unknown = JSON.parse(
        await this.fileSystem.readFile(path, 'utf8'),
      )
      if (typeof parsed === 'object' && parsed !== null && 'schemaVersion' in parsed && 'data' in parsed
        && Number.isInteger(parsed.schemaVersion) && Number(parsed.schemaVersion) >= 1 && Number(parsed.schemaVersion) < this.options.schemaVersion && this.options.migrate) {
        let version = Number(parsed.schemaVersion)
        while (version < this.options.schemaVersion) { parsed.data = this.options.migrate(version, parsed.data); version++ }
        parsed.schemaVersion = version
      }
      if (!isVersionedDocument(parsed, this.options.schemaVersion)) {
        return { status: 'invalid' }
      }
      if (!this.options.validate(parsed.data)) {
        return { status: 'invalid' }
      }
      return {
        status: 'valid',
        document: {
          schemaVersion: parsed.schemaVersion,
          data: parsed.data,
        },
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return { status: 'missing' }
      }
      return { status: 'invalid' }
    }
  }

  private get backupPath(): string {
    return `${this.options.filePath}.bak`
  }
}

function isVersionedDocument(
  value: unknown,
  schemaVersion: number,
): value is VersionedDocument<unknown> {
  return typeof value === 'object'
    && value !== null
    && 'schemaVersion' in value
    && value.schemaVersion === schemaVersion
    && 'data' in value
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT'
}

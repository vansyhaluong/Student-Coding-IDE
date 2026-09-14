import { defaultSettings, validateSettings, type AppSettings, type RecentProjectMetadata, isProjectId } from '../../../shared/contracts'
import { validateExactObject } from '../../../shared/contracts/validation'
import { PersistenceService } from '../persistence/persistence-service'
import { DomainError } from '../../errors/app-error'
export interface AppMetadata { recentProjects: RecentProjectMetadata[]; settings: AppSettings }
export function validRecent(v: unknown): v is RecentProjectMetadata {
  const r = validateExactObject(v, ['id', 'name', 'rootPath', 'lastOpenedAt'])
  return r.ok && isProjectId(r.value.id) && typeof r.value.name === 'string'
    && typeof r.value.rootPath === 'string' && !r.value.rootPath.includes(String.fromCharCode(0))
    && typeof r.value.lastOpenedAt === 'string' && Number.isFinite(Date.parse(r.value.lastOpenedAt))
}
export function isAppMetadata(v: unknown): v is AppMetadata {
  const r = validateExactObject(v, ['recentProjects', 'settings'])
  return r.ok && Array.isArray(r.value.recentProjects) && r.value.recentProjects.every(validRecent) && validateSettings(r.value.settings).ok
}
export function createAppPersistence(filePath: string): PersistenceService<AppMetadata> {
  return new PersistenceService({ filePath, schemaVersion: 2, defaultValue: () => ({ recentProjects: [], settings: defaultSettings() }),
    validate: isAppMetadata, migrate(version, data) {
      const r = validateExactObject(data, ['recentProjects'])
      if (version !== 1 || !r.ok || !Array.isArray(r.value.recentProjects) || !r.value.recentProjects.every(validRecent)) throw Error('Invalid legacy state')
      return { recentProjects: r.value.recentProjects, settings: defaultSettings() }
    } })
}
export class SettingsService {
  constructor(private readonly store: PersistenceService<AppMetadata>) {}
  get() { return { settings: this.store.getValue().settings, recovered: this.store.recovered } }
  async update(value: AppSettings) {
    const valid = validateSettings(value)
    if (!valid.ok) throw new DomainError({ code: 'INVALID_INPUT', message: 'Choose valid settings values.', retryable: false })
    try { await this.store.updateWith(current => ({ ...current, settings: valid.value })) }
    catch { throw new DomainError({ code: 'INTERNAL_ERROR', message: 'Settings could not be saved. Check access to application data and try again.', retryable: true }) }
    return this.get()
  }
}

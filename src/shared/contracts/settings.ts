import type { AppResult } from './app-error'
import { validateExactObject, type ValidationResult } from './validation'
export interface AppSettings { theme: 'dark' | 'light' | 'system'; fontSize: number; tabSize: 2 | 4; autoSave: boolean }
export const defaultSettings = (): AppSettings => ({ theme: 'dark', fontSize: 13, tabSize: 2, autoSave: false })
export function validateSettings(value: unknown): ValidationResult<AppSettings> {
  const r = validateExactObject(value, ['theme', 'fontSize', 'tabSize', 'autoSave'])
  if (!r.ok) return r
  const s = r.value
  if (typeof s.theme !== 'string' || !['dark', 'light', 'system'].includes(s.theme)
    || typeof s.fontSize !== 'number' || !Number.isInteger(s.fontSize) || s.fontSize < 8 || s.fontSize > 40
    || (s.tabSize !== 2 && s.tabSize !== 4) || typeof s.autoSave !== 'boolean')
    return { ok: false, issues: [{ path: '$', message: 'Invalid settings' }] }
  return { ok: true, value: { theme: s.theme as AppSettings['theme'], fontSize: s.fontSize, tabSize: s.tabSize, autoSave: s.autoSave } }
}
export interface SettingsSnapshot { settings: AppSettings; recovered: boolean }
export interface DependencyGuidance { node: 'AVAILABLE' | 'MISSING' | 'INVALID_CONFIGURATION'; git: 'AVAILABLE' | 'MISSING' | 'INVALID_CONFIGURATION' }
export function isSettingsSnapshot(v: unknown): v is SettingsSnapshot {
  const r = validateExactObject(v, ['settings', 'recovered'])
  return r.ok && validateSettings(r.value.settings).ok && typeof r.value.recovered === 'boolean'
}
export function isDependencyGuidance(v: unknown): v is DependencyGuidance {
  const r = validateExactObject(v, ['node', 'git'])
  return r.ok && [r.value.node, r.value.git].every(s => typeof s === 'string' && ['AVAILABLE', 'MISSING', 'INVALID_CONFIGURATION'].includes(s))
}
export const SETTINGS_CHANNELS = { get: 'settings:get', update: 'settings:update', dependencies: 'settings:dependencies' } as const
export interface SettingsApi {
  get(): Promise<AppResult<SettingsSnapshot>>
  update(settings: AppSettings): Promise<AppResult<SettingsSnapshot>>
  dependencies(): Promise<AppResult<DependencyGuidance>>
}

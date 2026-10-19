import type { AppResult } from './app-error'
import { isPlainObject, validateExactObject, type ValidationResult } from './validation'

export const PRACTICE_CHANNELS = {
  load: 'practice:load', save: 'practice:save', prepareClose: 'practice:prepare-close',
  resolveClose: 'practice:resolve-close', resume: 'practice:resume',
} as const
export type ExerciseLanguage = 'csharp' | 'javascript'
export type ExerciseType = 'int32' | 'boolean' | 'string' | 'int32[]' | 'string[]' | 'int32[][]'
export type ExerciseValue = number | boolean | string | number[] | string[] | number[][]
export interface ExerciseTest { args: ExerciseValue[]; expected: ExerciseValue }
export interface Exercise {
  id: string; chapter: number; title: string; difficulty: 'Easy' | 'Medium' | 'Hard'
  description: string; constraints: string[]
  functionName: string; parameters: { name: string; type: ExerciseType }[]; returnType: ExerciseType
  languages: Record<ExerciseLanguage, { monacoId: ExerciseLanguage; starter: string }>
  samples: ExerciseTest[]
  source: { url: string; publisher: string; usage: string }
}
export interface ExerciseDraft {
  exerciseId: string; language: ExerciseLanguage; code: string
}
export interface PracticeState {
  drafts: ExerciseDraft[]
  languages: { exerciseId: string; language: ExerciseLanguage }[]
}
export interface PracticeLoad { exercises: Exercise[]; state: PracticeState; recovered: boolean }
export interface PracticeApi {
  load(): Promise<AppResult<PracticeLoad>>
  save(request: ExerciseDraft): Promise<AppResult<null>>
  onPrepareClose(listener: (token: string) => void): () => void
  onResume(listener: () => void): () => void
  resolveClose(token: string, saved: boolean): Promise<AppResult<null>>
}
export const isExerciseLanguage = (v: unknown): v is ExerciseLanguage => v === 'csharp' || v === 'javascript'
export const isExerciseId = (v: unknown): v is string => typeof v === 'string' && /^ch[2-8]-0[1-9]$/.test(v)
export function validateExerciseDraft(v: unknown): ValidationResult<ExerciseDraft> {
  const exact = validateExactObject(v, ['exerciseId', 'language', 'code'])
  if (exact.ok && isExerciseId(exact.value.exerciseId) && isExerciseLanguage(exact.value.language)
    && typeof exact.value.code === 'string' && exact.value.code.length <= 256 * 1024) {
    return { ok: true, value: { exerciseId: exact.value.exerciseId, language: exact.value.language, code: exact.value.code } }
  }
  return { ok: false, issues: [{ path: '$', message: 'Invalid exercise draft' }] }
}
export function isPracticeState(v: unknown): v is PracticeState {
  if (!isPlainObject(v) || !Array.isArray(v.drafts) || !Array.isArray(v.languages)
    || v.drafts.length > 126 || v.languages.length > 63) return false
  const keys = new Set<string>()
  const ids = new Set<string>()
  return v.drafts.every(d => {
    const valid = validateExerciseDraft(d)
    if (!valid.ok) return false
    const key = `${valid.value.exerciseId}/${valid.value.language}`
    if (keys.has(key)) return false
    keys.add(key); return true
  }) && v.languages.every(l => {
    if (!isPlainObject(l) || !isExerciseId(l.exerciseId) || !isExerciseLanguage(l.language) || ids.has(l.exerciseId)) return false
    ids.add(l.exerciseId); return true
  })
}
const types: ExerciseType[] = ['int32', 'boolean', 'string', 'int32[]', 'string[]', 'int32[][]']
export function matchesExerciseType(v: unknown, type: ExerciseType): boolean {
  const integer = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
  if (type === 'int32') return integer(v)
  if (type === 'string') return typeof v === 'string'
  if (type === 'boolean') return typeof v === 'boolean'
  if (!Array.isArray(v)) return false
  if (type === 'int32[]') return v.every(integer)
  if (type === 'string[]') return v.every(s => typeof s === 'string')
  return v.every(row => Array.isArray(row) && row.length === v[0].length && row.every(integer))
}
export function isExercise(v: unknown): v is Exercise {
  if (!isPlainObject(v) || !isExerciseId(v.id) || v.chapter !== Number(v.id[2]) || typeof v.title !== 'string'
    || !['Easy', 'Medium', 'Hard'].includes(String(v.difficulty)) || typeof v.description !== 'string'
    || !Array.isArray(v.constraints) || !v.constraints.every(c => typeof c === 'string')
    || typeof v.functionName !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(v.functionName)
    || !Array.isArray(v.parameters) || !types.includes(v.returnType as ExerciseType)
    || !isPlainObject(v.languages) || !isPlainObject(v.source) || typeof v.source.url !== 'string'
    || !/^https:\/\/(leetcode\.com\/problems\/|www\.w3resource\.com\/csharp-exercises\/)/.test(v.source.url)
    || typeof v.source.publisher !== 'string' || typeof v.source.usage !== 'string') return false
  const parameters = v.parameters
  if (!parameters.every(p => isPlainObject(p) && typeof p.name === 'string' && /^[a-z][a-zA-Z0-9]*$/.test(p.name) && types.includes(p.type as ExerciseType))) return false
  const returnType = v.returnType as ExerciseType
  return ['csharp', 'javascript'].every(lang => {
    const l = (v.languages as Record<string, unknown>)[lang]
    return isPlainObject(l) && l.monacoId === lang && typeof l.starter === 'string'
  }) && Array.isArray(v.samples) && v.samples.length > 0 && v.samples.every(t => isPlainObject(t)
    && Array.isArray(t.args) && t.args.length === parameters.length
    && t.args.every((arg, i) => matchesExerciseType(arg, parameters[i].type)) && matchesExerciseType(t.expected, returnType))
}
export function isPracticeLoad(v: unknown): v is PracticeLoad {
  return isPlainObject(v) && Array.isArray(v.exercises) && v.exercises.length === 63 && v.exercises.every(isExercise)
    && new Set(v.exercises.map(e => e.id)).size === 63 && isPracticeState(v.state) && typeof v.recovered === 'boolean'
}
export function validateCloseResolution(v: unknown): ValidationResult<{ token: string; saved: boolean }> {
  const r = validateExactObject(v, ['token', 'saved'])
  if (r.ok && typeof r.value.token === 'string' && /^[a-f0-9-]{36}$/.test(r.value.token) && typeof r.value.saved === 'boolean') {
    return { ok: true, value: { token: r.value.token, saved: r.value.saved } }
  }
  return { ok: false, issues: [{ path: '$', message: 'Invalid close resolution' }] }
}

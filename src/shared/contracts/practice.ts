import type { AppResult } from './app-error'
import { isPlainObject, validateExactObject, type ValidationResult } from './validation'
import { PUBLIC_PACKAGE_LIMITS as L } from './exercise-package'

export const PRACTICE_CHANNELS = {
  load: 'practice:load', save: 'practice:save', prepareClose: 'practice:prepare-close',
  resolveClose: 'practice:resolve-close', resume: 'practice:resume',
  list: 'practice:list', detail: 'practice:detail', draft: 'practice:draft',
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
  list(request: PracticePageRequest): Promise<AppResult<PracticePage>>
  detail(request: { exerciseId: string }): Promise<AppResult<{ exercise: Exercise; language: ExerciseLanguage }>>
  draft(request: PracticeDraftRequest): Promise<AppResult<PracticeDraftChunk>>
  load(): Promise<AppResult<PracticeLoad>>
  save(request: ExerciseDraft): Promise<AppResult<null>>
  onPrepareClose(listener: (token: string) => void): () => void
  onResume(listener: () => void): () => void
  resolveClose(token: string, saved: boolean): Promise<AppResult<null>>
}
export const isExerciseLanguage = (v: unknown): v is ExerciseLanguage => v === 'csharp' || v === 'javascript'
export const isExerciseId = (v: unknown): v is string => typeof v === 'string' && v.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v)
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
    || v.drafts.length > L.packages * 2 || v.languages.length > L.packages) return false
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
  if (!validateExactObject(v, ['id', 'chapter', 'title', 'difficulty', 'description', 'constraints', 'functionName', 'parameters', 'returnType', 'languages', 'samples', 'source']).ok
    || !isPlainObject(v) || !isExerciseId(v.id) || !Number.isInteger(v.chapter) || Number(v.chapter) < 2 || Number(v.chapter) > 8 || typeof v.title !== 'string'
    || !['Easy', 'Medium', 'Hard'].includes(String(v.difficulty)) || typeof v.description !== 'string'
    || !Array.isArray(v.constraints) || !v.constraints.every(c => typeof c === 'string')
    || typeof v.functionName !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(v.functionName)
    || !Array.isArray(v.parameters) || !types.includes(v.returnType as ExerciseType)
    || !isPlainObject(v.languages) || !isPlainObject(v.source) || typeof v.source.url !== 'string'
    || !/^https:\/\/(leetcode\.com\/problems\/|www\.w3resource\.com\/csharp-exercises\/)/.test(v.source.url)
    || typeof v.source.publisher !== 'string' || typeof v.source.usage !== 'string') return false
  const parameters = v.parameters
  if (parameters.length > 16 || !parameters.every(p => validateExactObject(p, ['name', 'type']).ok && isPlainObject(p) && typeof p.name === 'string' && /^[A-Za-z][a-zA-Z0-9]*$/.test(p.name) && types.includes(p.type as ExerciseType))) return false
  const returnType = v.returnType as ExerciseType
  return ['csharp', 'javascript'].every(lang => {
    const l = (v.languages as Record<string, unknown>)[lang]
    return validateExactObject(l, ['monacoId', 'starter']).ok && isPlainObject(l) && l.monacoId === lang && typeof l.starter === 'string'
  }) && validateExactObject(v.languages, ['csharp', 'javascript']).ok && validateExactObject(v.source, ['url', 'publisher', 'usage']).ok
    && Array.isArray(v.samples) && v.samples.length > 0 && v.samples.length <= 16 && v.samples.every(t => validateExactObject(t, ['args', 'expected']).ok && isPlainObject(t)
    && Array.isArray(t.args) && t.args.length === parameters.length
    && t.args.every((arg, i) => matchesExerciseType(arg, parameters[i].type)) && matchesExerciseType(t.expected, returnType))
}
export function isPracticeLoad(v: unknown): v is PracticeLoad {
  return isPlainObject(v) && Array.isArray(v.exercises) && v.exercises.length <= L.packages && v.exercises.every(isExercise)
    && new Set(v.exercises.map(e => e.id)).size === v.exercises.length && isPracticeState(v.state) && typeof v.recovered === 'boolean' && encodedWithin(v, L.pageBytes)
}

export interface ExerciseSummary { id: string; chapter: number | null; title: string; difficulty: Exercise['difficulty'] | null; hasDraft: boolean; available: boolean }
export interface PracticePageRequest { cursor?: string; limit?: number }
export interface PracticePage { items: ExerciseSummary[]; nextCursor: string | null; recovered: boolean }
export interface PracticeDraftRequest { exerciseId: string; language: ExerciseLanguage; offset: number; revision?: string }
export interface PracticeDraftChunk { text: string; nextOffset: number | null; exists: boolean; revision: string }
export const encodedWithin = (v: unknown, maximum: number): boolean => new TextEncoder().encode(JSON.stringify(v)).byteLength <= maximum
export function validatePracticePage(v: unknown): ValidationResult<PracticePageRequest> {
  const r = validateExactObject(v, ['cursor', 'limit'])
  if (r.ok && (r.value.cursor === undefined || typeof r.value.cursor === 'string' && r.value.cursor.length <= 512 && /^[a-f0-9-]{36}:\d{1,4}$/.test(r.value.cursor))
    && (r.value.limit === undefined || Number.isInteger(r.value.limit) && Number(r.value.limit) >= 1 && Number(r.value.limit) <= L.pageMaximum)) return { ok: true, value: r.value as PracticePageRequest }
  return { ok: false, issues: [{ path: '$', message: 'Invalid practice page' }] }
}
export function validatePracticeIdentity(v: unknown): ValidationResult<{ exerciseId: string }> {
  const r = validateExactObject(v, ['exerciseId'])
  return r.ok && isExerciseId(r.value.exerciseId) ? { ok: true, value: { exerciseId: r.value.exerciseId } } : { ok: false, issues: [{ path: '$', message: 'Invalid exercise identity' }] }
}
export function validatePracticeDraftRead(v: unknown): ValidationResult<PracticeDraftRequest> {
  const r = validateExactObject(v, ['exerciseId', 'language', 'offset', 'revision'])
  return r.ok && isExerciseId(r.value.exerciseId) && isExerciseLanguage(r.value.language) && Number.isInteger(r.value.offset) && Number(r.value.offset) >= 0 && Number(r.value.offset) <= 256 * 1024
    && (r.value.offset === 0 && r.value.revision === undefined || typeof r.value.revision === 'string' && /^[a-f0-9]{64}$/.test(r.value.revision))
    ? { ok: true, value: r.value as unknown as PracticeDraftRequest } : { ok: false, issues: [{ path: '$', message: 'Invalid draft read' }] }
}
export function isPracticePage(v: unknown): v is PracticePage {
  return validateExactObject(v, ['items', 'nextCursor', 'recovered']).ok && isPlainObject(v) && Array.isArray(v.items) && v.items.length <= L.pageMaximum
    && v.items.every(e => validateExactObject(e, ['id', 'chapter', 'title', 'difficulty', 'hasDraft', 'available']).ok && isPlainObject(e) && isExerciseId(e.id)
      && typeof e.title === 'string' && e.title.length <= 256 && typeof e.hasDraft === 'boolean' && typeof e.available === 'boolean'
      && (e.available ? Number.isInteger(e.chapter) && Number(e.chapter) >= 2 && Number(e.chapter) <= 8 && ['Easy', 'Medium', 'Hard'].includes(String(e.difficulty))
        : e.chapter === null && e.difficulty === null))
    && (v.nextCursor === null || typeof v.nextCursor === 'string' && v.nextCursor.length <= 512 && /^[a-f0-9-]{36}:\d{1,4}$/.test(v.nextCursor)) && typeof v.recovered === 'boolean' && encodedWithin(v, L.pageBytes)
}
export function isPracticeDetail(v: unknown): v is { exercise: Exercise; language: ExerciseLanguage } {
  return validateExactObject(v, ['exercise', 'language']).ok && isPlainObject(v) && isExercise(v.exercise) && isExerciseLanguage(v.language) && encodedWithin(v, L.detailBytes)
}
export function isPracticeDraftChunk(v: unknown): v is PracticeDraftChunk {
  return validateExactObject(v, ['text', 'nextOffset', 'exists', 'revision']).ok && isPlainObject(v) && typeof v.text === 'string' && v.text.length <= 4096
    && typeof v.revision === 'string' && /^[a-f0-9]{64}$/.test(v.revision)
    && (v.nextOffset === null || Number.isInteger(v.nextOffset) && Number(v.nextOffset) >= 0 && Number(v.nextOffset) <= 256 * 1024)
    && typeof v.exists === 'boolean' && encodedWithin(v, L.pageBytes)
}
export function validateCloseResolution(v: unknown): ValidationResult<{ token: string; saved: boolean }> {
  const r = validateExactObject(v, ['token', 'saved'])
  if (r.ok && typeof r.value.token === 'string' && /^[a-f0-9-]{36}$/.test(r.value.token) && typeof r.value.saved === 'boolean') {
    return { ok: true, value: { token: r.value.token, saved: r.value.saved } }
  }
  return { ok: false, issues: [{ path: '$', message: 'Invalid close resolution' }] }
}

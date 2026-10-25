import { useEffect, useRef, useState } from 'react'
import type { Exercise, ExerciseLanguage, ExerciseSummary, PracticeState } from '../../../../../shared/contracts/practice'
import { DraftQueue } from './draft-queue'
import { PUBLIC_PACKAGE_LIMITS } from '../../../../../shared/contracts/exercise-package'

/** Explicit source replacement intent, separate from ordinary draft echoes. Renderer-only. */
export interface PracticeSourceReplacement { exerciseId: string; language: ExerciseLanguage; code: string }

export function usePractice(active: boolean) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [summaries, setSummaries] = useState<ExerciseSummary[]>([])
  const opening = useRef(0)
  const requested = useRef<string | undefined>(undefined)
  const [state, setState] = useState<PracticeState>({ drafts: [], languages: [] })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recovered, setRecovered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [sourceRevision, setSourceRevision] = useState(0)
  const [sourceReplacement, setSourceReplacement] = useState<PracticeSourceReplacement>()
  const locked = useRef(false)
  const mounted = useRef(false)
  const api = window.studentIde.learning.practice
  const catalogue = useRef<{ api: typeof api; revision: number; task: Promise<{ items: ExerciseSummary[]; recovered: boolean }> }>(undefined)
  const [queue] = useState(() => new DraftQueue({ save: draft => api.save(draft) }, value => { if (mounted.current) setError(value) }))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let live = true
    if (!api) return
    // StrictMode replays effects in development. Retain the same bounded read
    // across that replay instead of competing with our own Main owner lease.
    // Cleanup suppresses publication, not the already admitted I/O or pagination.
    if (!catalogue.current || catalogue.current.api !== api || catalogue.current.revision !== revision) catalogue.current = { api, revision, task: (async () => {
      const items: ExerciseSummary[] = [], seen = new Set<string>()
      let cursor: string | undefined
      let recovered: boolean
      do {
        const result = await api.list(cursor ? { cursor } : {})
        if (!result.ok) throw new Error('Practice unavailable')
        for (const item of result.value.items) {
          if (seen.has(item.id) || items.length >= PUBLIC_PACKAGE_LIMITS.packages) throw new Error('Invalid catalogue pagination')
          seen.add(item.id); items.push(item)
        }
        recovered = result.value.recovered
        const next = result.value.nextCursor ?? undefined
        if (next && (next === cursor || result.value.items.length === 0)) throw new Error('Invalid practice cursor')
        cursor = next
      } while (cursor)
      return { items, recovered }
    })() }
    void catalogue.current.task.then(result => {
      if (!live) return
      setSummaries(result.items)
      setRecovered(result.recovered); setReady(true); setError(result.items.some(e => !e.available) ? 'Một số bài tập không khả dụng. Hãy thử tải lại.' : null)
    }).catch(() => { if (live) setError('Không thể tải bài tập và Code Draft. Hãy thử lại.') })
    return () => { live = false }
  }, [api, revision])
  const open = async (id?: string) => {
    requested.current = id
    setSourceReplacement(undefined)
    const generation = ++opening.current
    if (!id) { setExercises([]); return }
    if (!await queue.flush()) return
    try {
      const result = await api.detail({ exerciseId: id })
      if (!result.ok) throw new Error('Exercise unavailable')
      const drafts: PracticeState['drafts'] = []
      for (const language of ['csharp', 'javascript'] as const) {
        let code = '', offset = 0, revision: string | undefined
        for (let chunk = 0; chunk <= 64; chunk++) {
          const part = await api.draft({ exerciseId: id, language, offset, ...(revision ? { revision } : {}) })
          if (!part.ok) throw new Error('Draft unavailable')
          code += part.value.text
          if (revision && revision !== part.value.revision) throw new Error('Draft changed')
          revision = part.value.revision
          if (code.length > 256 * 1024) throw new Error('Invalid draft length')
          if (part.value.nextOffset === null) { if (part.value.exists) drafts.push({ exerciseId: id, language, code }); break }
          if (part.value.nextOffset <= offset || part.value.nextOffset !== code.length || chunk === 64) throw new Error('Invalid draft pagination')
          offset = part.value.nextOffset
        }
      }
      if (!mounted.current || generation !== opening.current || locked.current) return
      setExercises([result.value.exercise]); setState({ drafts, languages: [{ exerciseId: id, language: result.value.language }] }); setError(null)
    } catch { if (mounted.current && generation === opening.current) setError('Không thể tải bài tập hoặc Code Draft. Hãy thử lại.') }
  }
  useEffect(() => {
    if (!api) return
    let live = true
    const removeClose = api.onPrepareClose(token => {
      if (!live) return
      locked.current = true; setClosing(true)
      void queue.flush().then(saved => api.resolveClose(token, saved)).then(result => {
        if (live && !result.ok) { locked.current = false; setClosing(false); setError('Chưa thể xác nhận lưu Draft để đóng ứng dụng. Hãy thử lại.') }
      }).catch(() => { if (live) { locked.current = false; setClosing(false); setError('Chưa thể xác nhận lưu Draft để đóng ứng dụng. Hãy thử lại.') } })
    })
    const removeResume = api.onResume(() => { if (live) { locked.current = false; setClosing(false) } })
    return () => { live = false; removeClose(); removeResume(); queue.cancelTimer() }
  }, [api, queue])
  useEffect(() => { if (!active) void queue.flush() }, [active, queue])
  const languageFor = (id: string): ExerciseLanguage => state.languages.find(l => l.exerciseId === id)?.language ?? 'csharp'
  const codeFor = (exercise: Exercise, language: ExerciseLanguage): string =>
    state.drafts.find(d => d.exerciseId === exercise.id && d.language === language)?.code ?? exercise.languages[language].starter
  const edit = (exercise: Exercise, language: ExerciseLanguage, code: string) => {
    if (!mounted.current || locked.current || !ready) return false
    const draft = { exerciseId: exercise.id, language, code }
    setSummaries(items => items.map(item => item.id === exercise.id ? { ...item, hasDraft: true } : item))
    // A later edit/context selection retires an old replacement intent. It must
    // never replay when that exercise's editor is mounted again.
    setSourceReplacement(undefined)
    setSourceRevision(value => value + 1)
    setState(current => ({
      drafts: [...current.drafts.filter(d => d.exerciseId !== draft.exerciseId || d.language !== language), draft],
      languages: [...current.languages.filter(l => l.exerciseId !== draft.exerciseId), { exerciseId: draft.exerciseId, language }],
    }))
    queue.enqueue(draft)
    return true
  }
  const replaceSource = (exercise: Exercise, language: ExerciseLanguage, code: string) => {
    if (edit(exercise, language, code)) setSourceReplacement({ exerciseId: exercise.id, language, code })
  }
  const selectLanguage = async (exercise: Exercise, language: ExerciseLanguage) => {
    if (locked.current || !await queue.flush() || !mounted.current) return false
    edit(exercise, language, codeFor(exercise, language))
    return queue.flush()
  }
  return { exercises, summaries, open, state, ready, error, recovered, closing, sourceRevision, sourceReplacement, replaceSource, languageFor, codeFor, edit, selectLanguage,
    hasPending: () => queue.hasPending(), flush: () => queue.flush(), retry: () => { if (queue.hasPending()) void queue.flush(); else if (ready && requested.current) void open(requested.current); else setRevision(r => r + 1) } }
}

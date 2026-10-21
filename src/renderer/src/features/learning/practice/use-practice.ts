import { useEffect, useRef, useState } from 'react'
import type { Exercise, ExerciseLanguage, PracticeState } from '../../../../../shared/contracts/practice'
import { DraftQueue } from './draft-queue'

export function usePractice(active: boolean) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [state, setState] = useState<PracticeState>({ drafts: [], languages: [] })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recovered, setRecovered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [sourceRevision, setSourceRevision] = useState(0)
  const locked = useRef(false)
  const mounted = useRef(false)
  const api = window.studentIde.learning.practice
  const [queue] = useState(() => new DraftQueue({ save: draft => api.save(draft) }, value => { if (mounted.current) setError(value) }))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let live = true
    if (!api) return
    void api.load().then(result => {
      if (!live) return
      if (!result.ok) { setError('Không thể tải bài tập và Code Draft. Hãy thử lại.'); return }
      setExercises(result.value.exercises); setState(result.value.state)
      setRecovered(result.value.recovered); setReady(true); setError(null)
    }).catch(() => { if (live) setError('Không thể tải bài tập và Code Draft. Hãy thử lại.') })
    return () => { live = false }
  }, [api, revision])
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
    if (!mounted.current || locked.current || !ready) return
    const draft = { exerciseId: exercise.id, language, code }
    setSourceRevision(value => value + 1)
    setState(current => ({
      drafts: [...current.drafts.filter(d => d.exerciseId !== draft.exerciseId || d.language !== language), draft],
      languages: [...current.languages.filter(l => l.exerciseId !== draft.exerciseId), { exerciseId: draft.exerciseId, language }],
    }))
    queue.enqueue(draft)
  }
  const selectLanguage = async (exercise: Exercise, language: ExerciseLanguage) => {
    if (locked.current || !await queue.flush() || !mounted.current) return false
    edit(exercise, language, codeFor(exercise, language))
    return queue.flush()
  }
  return { exercises, state, ready, error, recovered, closing, sourceRevision, languageFor, codeFor, edit, selectLanguage,
    hasPending: () => queue.hasPending(), flush: () => queue.flush(), retry: () => { if (ready) void queue.flush(); else setRevision(r => r + 1) } }
}

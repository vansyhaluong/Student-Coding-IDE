import { useEffect, useState } from 'react'
import type { LearningCourse } from '../../../../shared/contracts/learning'

export function useLearningCourse() {
  const [course, setCourse] = useState<LearningCourse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void window.studentIde.learning.getCourse().then(result => {
      if (!active) return
      if (result.ok) { setCourse(result.value); setError(null) }
      else setError(result.error.message)
    }).catch(() => { if (active) setError('Không thể tải nội dung học tập. Vui lòng thử lại.') })
    return () => { active = false }
  }, [revision])
  return { course, error, retry: () => { setError(null); setRevision(value => value + 1) } }
}

// Vite embeds these authored inputs into Main. No repository paths are read at runtime.
import manifest from '../../../../../docs/learning/manifest.json?raw'
import one from '../../../../../docs/learning/chapters/chapter-01.md?raw'
import two from '../../../../../docs/learning/chapters/chapter-02.md?raw'
import three from '../../../../../docs/learning/chapters/chapter-03.md?raw'
import four from '../../../../../docs/learning/chapters/chapter-04.md?raw'
import five from '../../../../../docs/learning/chapters/chapter-05.md?raw'
import six from '../../../../../docs/learning/chapters/chapter-06.md?raw'
import seven from '../../../../../docs/learning/chapters/chapter-07.md?raw'
import eight from '../../../../../docs/learning/chapters/chapter-08.md?raw'
import { isLearningCourse, type LearningCourse } from '../../../../shared/contracts/learning'
import { DomainError } from '../../../errors/app-error'

export function getBundledCourse(): LearningCourse {
  const course: unknown = { manifest: JSON.parse(manifest), materials: [one, two, three, four, five, six, seven, eight]
    .map((markdown, i) => ({ chapterId: `chapter-0${i + 1}`, markdown })) }
  if (!isLearningCourse(course)) throw new DomainError({ code: 'INTERNAL_ERROR',
    message: 'The bundled Learning content is invalid.', retryable: false })
  return course
}

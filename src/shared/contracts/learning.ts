import type { AppResult } from './app-error'
import type { PracticeApi } from './practice'
import type { ExerciseApi } from './exercise'
import type { SubmissionApi } from './submission'
import type { AnalysisApi } from './analysis'
import type { SmartHintsApi } from './smart-hints'
import type { LearningChatApi } from './learning-chat'
import { isPlainObject } from './validation'

export const LEARNING_CHANNELS = { getCourse: 'learning:get-course' } as const
export type LearningChapterOrder = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export interface LearningReference { publisher: string; url: string; sourceLicenseStatus: string }
export interface LearningChapter {
  id: string
  order: LearningChapterOrder
  title: string
  contentPath: string
  sections: string[]
  references: LearningReference[]
  specialIntroductionChapter: boolean
  requiresPractice: false | null
  requiresQuiz: false | null
}
export interface LearningManifest {
  schemaVersion: 1
  courseId: 'ky-thuat-lap-trinh'
  courseTitle: string
  language: 'vi'
  exampleLanguage: 'csharp'
  readingMode: 'single-scroll-page-per-chapter'
  offline: true
  chapterCount: 8
  chapters: LearningChapter[]
  sourceUsePolicy: { authoredContent: string; externalSourceMaterial: string; licenseMetadataMeaning: string }
}
export interface LearningMaterial { chapterId: string; markdown: string }
export interface LearningCourse { manifest: LearningManifest; materials: LearningMaterial[] }
export interface LearningApi { getCourse(): Promise<AppResult<LearningCourse>>; practice: PracticeApi; exercise: ExerciseApi; submission: SubmissionApi; analysis: AnalysisApi; smartHints: SmartHintsApi; chat: LearningChatApi }

const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
function reference(v: unknown): v is LearningReference {
  return isPlainObject(v) && text(v.publisher) && text(v.sourceLicenseStatus) && text(v.url)
    && /^https:\/\/learn\.microsoft\.com\/[^\s]+$/.test(v.url)
}
export function isLearningCourse(v: unknown): v is LearningCourse {
  if (!isPlainObject(v) || !isPlainObject(v.manifest) || !Array.isArray(v.materials)) return false
  const m = v.manifest
  if (m.schemaVersion !== 1 || m.courseId !== 'ky-thuat-lap-trinh' || !text(m.courseTitle)
    || m.language !== 'vi' || m.exampleLanguage !== 'csharp' || m.offline !== true
    || m.readingMode !== 'single-scroll-page-per-chapter' || m.chapterCount !== 8
    || !Array.isArray(m.chapters) || m.chapters.length !== 8 || v.materials.length !== 8
    || !isPlainObject(m.sourceUsePolicy) || !text(m.sourceUsePolicy.authoredContent)
    || !text(m.sourceUsePolicy.externalSourceMaterial) || !text(m.sourceUsePolicy.licenseMetadataMeaning)) return false
  const chapters = m.chapters
  return chapters.every((c: unknown, i: number) => {
    const id = `chapter-0${i + 1}`
    return isPlainObject(c) && c.id === id && c.order === i + 1 && text(c.title)
      && c.contentPath === `chapters/${id}.md` && Array.isArray(c.sections) && c.sections.length > 0 && c.sections.every(text)
      && Array.isArray(c.references) && c.references.length > 0 && c.references.every(reference)
      && c.specialIntroductionChapter === (i === 0)
      && c.requiresPractice === (i === 0 ? false : null) && c.requiresQuiz === (i === 0 ? false : null)
  }) && v.materials.every((material: unknown, i: number) => isPlainObject(material)
    && material.chapterId === `chapter-0${i + 1}` && text(material.markdown) && material.markdown.length <= 256 * 1024)
}

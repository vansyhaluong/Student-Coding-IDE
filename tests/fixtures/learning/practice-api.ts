import type { Exercise, PracticeState, PracticeApi } from '../../../src/shared/contracts/practice'
/** Renderer transport fixture; security/parity assertions use the real Main bridge. */
export function pagedPracticeFixture(exercises: Exercise[], state: () => PracticeState): Pick<PracticeApi, 'list' | 'detail' | 'draft'> {
  return {
    list: async request => {
      const offset = Number(request.cursor ?? 0), end = offset + (request.limit ?? 32)
      return { ok: true, value: { items: exercises.slice(offset, end).map(e => ({ id: e.id, chapter: e.chapter, title: e.title,
        difficulty: e.difficulty, hasDraft: state().drafts.some(d => d.exerciseId === e.id), available: true })), nextCursor: end < exercises.length ? String(end) : null, recovered: false } }
    },
    detail: async ({ exerciseId }) => ({ ok: true, value: { exercise: structuredClone(exercises.find(e => e.id === exerciseId)!),
      language: state().languages.find(l => l.exerciseId === exerciseId)?.language ?? 'csharp' } }),
    draft: async ({ exerciseId, language, offset }) => {
      const draft = state().drafts.find(d => d.exerciseId === exerciseId && d.language === language), code = draft?.code ?? '', end = Math.min(code.length, offset + 4096)
      return { ok: true, value: { text: code.slice(offset, end), nextOffset: end < code.length ? end : null, exists: !!draft, revision: 'a'.repeat(64) } }
    },
  }
}

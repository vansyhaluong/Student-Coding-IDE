import { PersistenceService } from '../persistence/persistence-service'
import { isPracticeState, type ExerciseDraft, type PracticeState } from '../../../shared/contracts/practice'

export function createPracticeStore(filePath: string) {
  return new PersistenceService<PracticeState>({ filePath, schemaVersion: 1,
    defaultValue: () => ({ drafts: [], languages: [] }), validate: isPracticeState })
}
export async function savePracticeDraft(store: PersistenceService<PracticeState>, draft: ExerciseDraft): Promise<void> {
  await store.updateWith(current => ({
    drafts: [...current.drafts.filter(d => d.exerciseId !== draft.exerciseId || d.language !== draft.language), draft],
    languages: [...current.languages.filter(l => l.exerciseId !== draft.exerciseId), { exerciseId: draft.exerciseId, language: draft.language }],
  }))
}

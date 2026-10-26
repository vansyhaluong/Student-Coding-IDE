/** Transport correlation only; Main remains the owner/authority. */
export function createLearningOrder() {
  let highest = 0, current: { mode: 'RUN' | 'SUBMIT'; id: string } | undefined, epoch = 0
  return {
    get epoch() { return epoch },
    accept(mode: 'RUN' | 'SUBMIT', id: string, generation: number): boolean {
      if (generation < highest || generation === highest && (!current || current.mode !== mode || current.id !== id)) return false
      highest = generation; current = { mode, id }; return true
    },
    current(mode: 'RUN' | 'SUBMIT', id: string, generation: number): boolean { return generation === highest && current?.mode === mode && current.id === id },
    invalidate() { epoch++; current = undefined },
  }
}
export type LearningOrder = ReturnType<typeof createLearningOrder>

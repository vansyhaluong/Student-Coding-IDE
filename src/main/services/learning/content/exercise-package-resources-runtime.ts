import anchor from 'virtual:exercise-package-anchor'
import { openAnchoredExerciseResources } from './exercise-package-resources'
import type { PackageAllocationObserver } from './exercise-package-budget'
import type { PackageWorkControl } from './exercise-package-work'

/** Separate Main build entry retains the compiled anchor without wiring a registry
 * into ExerciseService. Bootstrap supplies trusted Electron facts in Step3. */
export function openBundledExerciseResources(environment: { packaged: boolean; resourcesPath: string }, allocations?: PackageAllocationObserver, control?: PackageWorkControl) {
  return openAnchoredExerciseResources({ ...environment, mainOutput: __dirname }, anchor, allocations, control)
}

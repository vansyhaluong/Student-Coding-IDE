import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ExercisePackageRegistry } from '../../../src/main/services/learning/content/exercise-package-registry'
import { openAnchoredExerciseResources, rawPackageDigest } from '../../../src/main/services/learning/content/exercise-package-resources'

/** Test-only trust anchor from checked-in migration data, not runtime bootstrap. */
export async function sourceRegistry() {
  const resourcesPath = resolve('resources'), raw = await readFile(resolve(resourcesPath, 'learning/exercises/manifest.json'))
  const registry = new ExercisePackageRegistry((scope, control) => openAnchoredExerciseResources({ packaged: true, mainOutput: '', resourcesPath },
    { version: 7, rawBytes: raw.length, sha256: rawPackageDigest(raw) }, scope, control))
  await registry.whenStarted()
  if (registry.status().state !== 'AVAILABLE') throw new Error('Migration fixture registry unavailable')
  return registry
}

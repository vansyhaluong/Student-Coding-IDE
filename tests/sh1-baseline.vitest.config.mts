import { defineConfig } from 'vitest/config'
import { execFileSync } from 'node:child_process'

// Read-only control: no checkout/stash/replacement of the dirty working tree.
// Restrict HEAD overlays to the two Main files exercised by the legacy Run case.
const controls = ['src/main/services/learning/exercise-service.ts', 'src/main/services/learning/package-run-binding.ts']
export default defineConfig({
  plugins: [{ name: 'sh1-read-only-head-control', enforce: 'pre', transform(_code, id) {
    const path = id.replaceAll('\\', '/').split('?')[0], match = controls.find(p => path.endsWith('/' + p))
    if (match) return { code: execFileSync('git', ['show', `HEAD:${match}`], { encoding: 'utf8' }), map: null }
  } }],
  test: { include: ['tests/main/exercise-service.test.ts'], maxWorkers: 1 },
})

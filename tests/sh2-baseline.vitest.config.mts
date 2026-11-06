import { defineConfig } from 'vitest/config'
import { execFileSync } from 'node:child_process'

// Read-only SH-2 absence control. No checkout, fixture changes or timeout changes.
// Remaining dirty Main/WA/content work is deliberately retained in this control.
const controls = ['PracticeWorkspace.tsx', 'PracticeDescription.tsx', 'PracticeEditor.tsx', 'PracticeSolution.tsx']
  .map(name => `src/renderer/src/features/learning/practice/${name}`)
export default defineConfig({
  plugins: [{ name: 'sh2-read-only-head-control', enforce: 'pre', transform(_code, id) {
    const path = id.replaceAll('\\', '/').split('?')[0], match = controls.find(p => path.endsWith('/' + p))
    if (match) return { code: execFileSync('git', ['show', `HEAD:${match}`], { encoding: 'utf8' }), map: null }
  } }],
  test: { include: ['tests/renderer/learning-workspace.test.tsx'] },
})

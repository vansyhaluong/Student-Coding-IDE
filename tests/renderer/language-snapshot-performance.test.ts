import { describe, expect, it } from 'vitest'

import {
  planProjectSourceSnapshot,
  ProjectSourceSnapshotState,
} from '../../src/renderer/src/features/language/project-source-snapshot'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId

describe('bounded project snapshot measurement', () => {
  it('measures a 1,000-file, approximately 8 MiB source fixture', () => {
    const candidates = Array.from({ length: 1_000 }, (_, index) => ({
      relativePath: `src/module-${index}.ts`,
      content: `export const value${index} = ${index}\n${'x'.repeat(8_192)}`,
    }))
    const beforeHeap = process.memoryUsage().heapUsed
    const before = performance.now()
    const plan = planProjectSourceSnapshot(candidates, {
      maximumFiles: 1_000,
      maximumTotalBytes: 10 * 1024 * 1024,
      maximumFileBytes: 256 * 1024,
    })
    const state = new ProjectSourceSnapshotState()
    state.apply(state.activate(projectId), plan, [])
    const elapsedMilliseconds = performance.now() - before
    const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - beforeHeap)

    expect(plan.sources).toHaveLength(1_000)
    expect(state.getSources()).toHaveLength(1_000)
    expect(plan.selectedBytes).toBeGreaterThan(7.5 * 1024 * 1024)
    expect(elapsedMilliseconds).toBeLessThan(2_000)
    console.info(JSON.stringify({
      smoke: 'bounded-project-snapshot',
      files: plan.sources.length,
      bytes: plan.selectedBytes,
      elapsedMilliseconds: Math.round(elapsedMilliseconds),
      heapDeltaBytes,
    }))
  })
})

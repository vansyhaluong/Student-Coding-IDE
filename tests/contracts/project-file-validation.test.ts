import { describe, expect, it } from 'vitest'

import {
  validateCreateEntryRequest,
  validateCreateProjectRequest,
  validateProjectPathRequest,
  validateRenameEntryRequest,
  validateWriteFileRequest,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678'

describe('Phase 2B contract validation', () => {
  it('accepts exact project and file request shapes', () => {
    expect(validateCreateProjectRequest({ name: 'hello-world' }).ok).toBe(true)
    expect(validateProjectPathRequest({ projectId, relativePath: 'src/main.ts' }).ok).toBe(true)
    expect(validateCreateEntryRequest({ projectId, parentPath: 'src', name: 'main.ts' }).ok).toBe(true)
    expect(validateRenameEntryRequest({ projectId, relativePath: 'src/main.ts', newName: 'index.ts' }).ok).toBe(true)
    expect(validateWriteFileRequest({ projectId, relativePath: 'src/main.ts', content: 'text' }).ok).toBe(true)
  })

  it('rejects missing, malformed, foreign-format, and unknown fields', () => {
    expect(validateCreateProjectRequest({ name: '', extra: true }).ok).toBe(false)
    expect(validateCreateProjectRequest({ name: '../escape' }).ok).toBe(false)
    expect(validateCreateProjectRequest({ name: 'NUL.txt' }).ok).toBe(false)
    expect(validateProjectPathRequest({ projectId: 'foreign', relativePath: '' }).ok).toBe(false)
    expect(validateProjectPathRequest({ projectId, relativePath: 42 }).ok).toBe(false)
    expect(validateCreateEntryRequest({ projectId, parentPath: '', name: 'a', mode: 'write' }).ok).toBe(false)
    expect(validateWriteFileRequest({ projectId, relativePath: 'a.ts', content: 42 }).ok).toBe(false)
  })
})

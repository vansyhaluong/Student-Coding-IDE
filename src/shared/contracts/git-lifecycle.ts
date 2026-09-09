import { isProjectId, type ProjectId } from './project'
import { validateExactObject, type ValidationResult } from './validation'

export interface GitRequestIdentity {
  readonly requestId: string
  readonly projectId: ProjectId
  readonly generation: string
}

export function validateGitIdentity(value: unknown): ValidationResult<GitRequestIdentity> {
  const result = validateExactObject(value, ['requestId', 'projectId', 'generation'])
  if (!result.ok) return result
  const { requestId, projectId, generation } = result.value
  if (!isProjectId(projectId) || !token(requestId) || !token(generation)) {
    return { ok: false, issues: [{ path: '$', message: 'Invalid Git identity' }] }
  }
  return { ok: true, value: { requestId, projectId, generation } }
}

function token(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
}

export const GIT_CONTEXT_CHANNEL = 'git:get-context'

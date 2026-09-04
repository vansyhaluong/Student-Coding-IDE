import type { ProjectId } from '../../../../shared/contracts'

export interface ProjectDocumentIdentity {
  readonly projectId: ProjectId
  readonly relativePath: string
}

export function projectDocumentUri(projectId: ProjectId, relativePath: string): string {
  const encodedPath = normalizeProjectRelativePath(relativePath)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return `student-ide://project/${encodeURIComponent(projectId)}/${encodedPath}`
}

export function parseProjectDocumentUri(uri: string): ProjectDocumentIdentity | null {
  try {
    const parsed = new URL(uri)
    if (parsed.protocol !== 'student-ide:' || parsed.hostname !== 'project') return null
    const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts.length < 2) return null
    const [projectId, ...pathParts] = parts
    return {
      projectId: projectId as ProjectId,
      relativePath: normalizeProjectRelativePath(pathParts.join('/')),
    }
  } catch {
    return null
  }
}

export function normalizeProjectRelativePath(relativePath: string): string {
  const replaced = relativePath.replaceAll('\\', '/')
  if (replaced.startsWith('/') || /^[a-z]:/i.test(replaced)) {
    throw new Error('Expected a project-relative path.')
  }
  const parts: string[] = []
  for (const part of replaced.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') throw new Error('Parent traversal is not allowed.')
    parts.push(part)
  }
  if (parts.length === 0) throw new Error('Expected a file path.')
  return parts.join('/')
}

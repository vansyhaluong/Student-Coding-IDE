import { describe, expect, it, vi } from 'vitest'
import type { FileEntry, FileStat, ProjectId } from '../../src/shared/contracts'
import { validateProjectAgentTurnResult } from '../../src/shared/contracts/project-agent-validation'
import { DomainError } from '../../src/main/errors/app-error'
import {
  assessProjectAgentPath,
  PROJECT_AGENT_PARENT_DIRECTORIES,
  ProjectAgentService,
  type AgentModel,
  type ProjectAgentFilePort,
  type ProjectAgentOwner,
  type ProjectAgentProjects,
} from '../../src/main/services/ai/project-agent-service'

const projectA = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const projectB = 'project_bbbbbbbbbbbbbbbbbbbbbbbb' as ProjectId
const owner: ProjectAgentOwner = { id: 7, scope: 'frame-a' }

function action(
  actionName: 'reply' | 'read' | 'list' | 'propose' | 'create' | 'delete' | 'rename',
  relativePath = '',
  content = '',
  summary = '',
  text = '',
  destinationPath = '',
) {
  return { action: actionName, text, relativePath, destinationPath, content, summary }
}

function createHarness(initial: ProjectId | null = projectA) {
  let active: ProjectId | null = initial
  const listeners = new Set<(project: { id: ProjectId } | null) => void>()
  const reads: string[] = []
  const writes: { path: string; content: string }[] = []
  const creates: string[] = []
  const directoriesCreated: string[] = []
  const deleted: string[] = []
  const directoriesRemoved: string[] = []
  const moved: { source: string; destination: string }[] = []
  const moveFailures = new Set<string>()
  const occupyMoveFailures = new Set<string>()
  const directoryFailures = new Set<string>()
  const writeFailures = new Set<string>()
  const occupiedWriteFailures = new Set<string>()
  const rawWriteFailures = new Set<string>()
  const deleteFileFailures = new Set<string>()
  const rawDeleteFailures = new Set<string>()
  const rawDirectoryDeleteFailures = new Set<string>()
  const directoryDeleteFailures = new Set<string>()
  const rawMoveFailures = new Set<string>()
  const files = new Map<string, string>([['src/main.ts', 'const value = 1\n']])
  const directories = new Set(['', 'src'])
  const symbolicPaths = new Set(['src/link.ts'])
  const listed: FileEntry[] = [
    { name: 'main.ts', relativePath: 'src/main.ts', kind: 'file', isSymbolicLink: false },
    { name: 'node_modules', relativePath: 'src/node_modules', kind: 'directory', isSymbolicLink: false },
    { name: '.env', relativePath: 'src/.env', kind: 'file', isSymbolicLink: false },
    { name: 'link.ts', relativePath: 'src/link.ts', kind: 'file', isSymbolicLink: true },
  ]
  const projects: ProjectAgentProjects = {
    getActiveProject: () => active ? { id: active } : null,
    getAuthorizedProject: (projectId) => {
      if (!active || active !== projectId) {
        throw new DomainError({
          code: 'PERMISSION_DENIED',
          message: 'The project is no longer authorized.',
          operation: 'project:authorize',
          retryable: false,
        })
      }
      return { id: active }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const disk: ProjectAgentFilePort = {
    async stat(projectId, relativePath): Promise<FileStat> {
      projects.getAuthorizedProject(projectId)
      if (directories.has(relativePath)) {
        return {
          name: relativePath || 'project',
          relativePath,
          kind: 'directory',
          isSymbolicLink: symbolicPaths.has(relativePath),
          size: 0,
          modifiedAt: '2026-01-01T00:00:00.000Z',
        }
      }
      const content = files.get(relativePath)
      if (content === undefined) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          operation: 'file:stat',
          retryable: false,
        })
      }
      return {
        name: relativePath,
        relativePath,
        kind: 'file',
        isSymbolicLink: symbolicPaths.has(relativePath),
        size: content.length,
        modifiedAt: '2026-01-01T00:00:00.000Z',
      }
    },
    async read(projectId, relativePath) {
      projects.getAuthorizedProject(projectId)
      reads.push(relativePath)
      const content = files.get(relativePath)
      if (content === undefined) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          operation: 'file:read',
          retryable: false,
        })
      }
      return content
    },
    async listDirectory(projectId, relativePath) {
      projects.getAuthorizedProject(projectId)
      if (relativePath === 'src') return listed
      const prefix = relativePath.length === 0 ? '' : `${relativePath}/`
      const seen = new Set<string>()
      const entries: FileEntry[] = []
      const add = (fullPath: string, kind: 'file' | 'directory') => {
        if (fullPath.length === 0 || fullPath === relativePath) return
        if (prefix.length > 0 && !fullPath.startsWith(prefix)) return
        const rest = prefix.length === 0 ? fullPath : fullPath.slice(prefix.length)
        const name = rest.split('/')[0] ?? ''
        if (name.length === 0 || seen.has(name)) return
        seen.add(name)
        const childPath = prefix.length === 0 ? name : `${prefix}${name}`
        entries.push({
          name,
          relativePath: childPath,
          kind: rest.includes('/') ? 'directory' : kind,
          isSymbolicLink: symbolicPaths.has(childPath),
        })
      }
      for (const directory of directories) add(directory, 'directory')
      for (const file of files.keys()) add(file, 'file')
      return entries
    },
    async write(projectId, relativePath, content) {
      projects.getAuthorizedProject(projectId)
      if (rawWriteFailures.has(relativePath)) throw new Error('EACCES secret-stack')
      if (writeFailures.has(relativePath)) {
        if (occupiedWriteFailures.has(relativePath)) files.set(relativePath, 'partial\n')
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'The file could not be written.',
          operation: 'file:write',
          retryable: false,
        })
      }
      writes.push({ path: relativePath, content })
      files.set(relativePath, content)
    },
    async createFile(projectId, parentPath, name) {
      projects.getAuthorizedProject(projectId)
      if (!directories.has(parentPath)) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The parent directory does not exist.',
          operation: 'file:create',
          retryable: false,
        })
      }
      const relativePath = parentPath.length === 0 ? name : `${parentPath}/${name}`
      if (files.has(relativePath)) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'A file or folder with that name already exists.',
          operation: 'file:create',
          retryable: false,
        })
      }
      files.set(relativePath, '')
      creates.push(relativePath)
      return { name, relativePath, kind: 'file', isSymbolicLink: false }
    },
    async createDirectory(projectId, parentPath, name) {
      projects.getAuthorizedProject(projectId)
      if (!directories.has(parentPath)) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The parent directory does not exist.',
          operation: 'file:create-directory',
          retryable: false,
        })
      }
      const relativePath = parentPath.length === 0 ? name : `${parentPath}/${name}`
      if (directoryFailures.has(relativePath)) {
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'The folder could not be created.',
          operation: 'file:create-directory',
          retryable: false,
        })
      }
      if (files.has(relativePath) || directories.has(relativePath)) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'A file or folder with that name already exists.',
          operation: 'file:create-directory',
          retryable: false,
        })
      }
      directories.add(relativePath)
      directoriesCreated.push(relativePath)
      return { name, relativePath, kind: 'directory' as const, isSymbolicLink: false }
    },
    async deleteFile(projectId, relativePath) {
      projects.getAuthorizedProject(projectId)
      if (rawDeleteFailures.has(relativePath)) throw new Error('EPERM secret-stack')
      if (deleteFileFailures.has(relativePath)) {
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'The file could not be removed.',
          operation: 'file:delete-file',
          retryable: false,
        })
      }
      if (directories.has(relativePath)) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'Only a file can be deleted.',
          operation: 'file:delete-file',
          retryable: false,
        })
      }
      if (!files.has(relativePath)) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          operation: 'file:delete-file',
          retryable: false,
        })
      }
      files.delete(relativePath)
      deleted.push(relativePath)
    },
    async deleteEmptyDirectory(projectId, relativePath) {
      projects.getAuthorizedProject(projectId)
      if (rawDirectoryDeleteFailures.has(relativePath)) throw new Error('EBUSY secret-stack')
      if (directoryDeleteFailures.has(relativePath)) {
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'The folder could not be removed.',
          operation: 'file:delete-empty-directory',
          retryable: false,
        })
      }
      if (!directories.has(relativePath) || relativePath.length === 0 || symbolicPaths.has(relativePath)) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'Only an empty folder can be deleted.',
          operation: 'file:delete-empty-directory',
          retryable: false,
        })
      }
      const prefix = `${relativePath}/`
      const occupied = [...directories].some((directory) => directory.startsWith(prefix))
        || [...files.keys()].some((file) => file.startsWith(prefix))
      if (occupied) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'That folder is not empty.',
          operation: 'file:delete-empty-directory',
          retryable: false,
        })
      }
      directories.delete(relativePath)
      directoriesRemoved.push(relativePath)
    },
    async move(projectId, source, destination) {
      projects.getAuthorizedProject(projectId)
      if (rawMoveFailures.has(destination)) throw new Error('EPERM secret-stack')
      if (moveFailures.has(destination)) {
        if (occupyMoveFailures.has(destination)) {
          const parent = destination.includes('/') ? destination.slice(0, destination.lastIndexOf('/')) : ''
          if (parent.length > 0) files.set(`${parent}/stray.ts`, 'x\n')
        }
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'The file could not be moved.',
          operation: 'file:move',
          retryable: false,
        })
      }
      const content = files.get(source)
      if (content === undefined) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          operation: 'file:move',
          retryable: false,
        })
      }
      const parent = destination.includes('/') ? destination.slice(0, destination.lastIndexOf('/')) : ''
      if (!directories.has(parent)) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The parent directory does not exist.',
          operation: 'file:move',
          retryable: false,
        })
      }
      if (files.has(destination) || directories.has(destination)) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'A file or folder with that name already exists.',
          operation: 'file:move',
          retryable: false,
        })
      }
      files.delete(source)
      files.set(destination, content)
      moved.push({ source, destination })
      return {
        name: destination.split('/').at(-1) ?? destination,
        relativePath: destination,
        kind: 'file' as const,
        isSymbolicLink: false,
      }
    },
  }
  const steps: unknown[] = []
  let complete: AgentModel['complete'] = async () => steps.shift()
  const model: AgentModel = {
    ready: () => true,
    providerGeneration: () => 1,
    complete: (step, signal) => complete(step, signal),
  }
  const service = new ProjectAgentService(projects, disk, model)
  return {
    service,
    reads,
    writes,
    creates,
    directories,
    directoriesCreated,
    deleted,
    directoriesRemoved,
    symbolicPaths,
    moveFailures,
    occupyMoveFailures,
    directoryFailures,
    writeFailures,
    occupiedWriteFailures,
    rawWriteFailures,
    deleteFileFailures,
    rawDeleteFailures,
    rawDirectoryDeleteFailures,
    directoryDeleteFailures,
    rawMoveFailures,
    moved,
    files,
    steps,
    setComplete(next: AgentModel['complete']) { complete = next },
    switchTo(projectId: ProjectId | null) {
      active = projectId
      for (const listener of listeners) listener(projectId ? { id: projectId } : null)
    },
  }
}

describe('project agent path policy', () => {
  it('rejects traversal, absolute paths, streams, and sensitive files', () => {
    for (const path of ['../secret', '..\\secret', 'C:/secret', 'C:\\secret', '\\\\server\\share', '/etc/passwd', 'src/file.txt:stream', '.env', 'src/.env.local', 'src/.git/config', 'node_modules/pkg/index.js', 'dist/app.js']) {
      expect(() => assessProjectAgentPath(path, 'read')).toThrow(DomainError)
    }
    expect(assessProjectAgentPath('src/main.ts', 'read')).toBe('src/main.ts')
    expect(assessProjectAgentPath('', 'list')).toBe('')
    expect(() => assessProjectAgentPath('', 'edit')).toThrow(DomainError)
    expect(() => assessProjectAgentPath('../new.ts', 'create')).toThrow(DomainError)
    expect(() => assessProjectAgentPath('.env', 'create')).toThrow(DomainError)
    expect(() => assessProjectAgentPath('src/.env.local', 'create')).toThrow(DomainError)
    expect(assessProjectAgentPath('src/auth.ts', 'create')).toBe('src/auth.ts')
    expect(() => assessProjectAgentPath('../gone.ts', 'delete')).toThrow(DomainError)
    expect(() => assessProjectAgentPath('.env', 'delete')).toThrow(DomainError)
    expect(() => assessProjectAgentPath('src/.env.local', 'rename')).toThrow(DomainError)
    expect(() => assessProjectAgentPath('../out.ts', 'rename')).toThrow(DomainError)
    expect(assessProjectAgentPath('src/main.ts', 'delete')).toBe('src/main.ts')
    expect(assessProjectAgentPath('lib/app.ts', 'rename')).toBe('lib/app.ts')
  })
})

describe('project agent confirm gate', () => {
  it('writes an edit during the turn and returns a diff without a proposal', async () => {
    const harness = createHarness()
    harness.steps.push(
      action('propose', 'src/main.ts', 'const value = 2\n', 'Update the value.'),
      action('reply', '', '', '', 'The edit is ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Change the value.',
      history: [],
    })
    expect(validateProjectAgentTurnResult(turn).ok).toBe(true)
    expect(harness.writes).toEqual([{ path: 'src/main.ts', content: 'const value = 2\n' }])
    expect(harness.creates).toEqual([])
    expect(turn.proposals).toEqual([])
    expect(turn.applied).toHaveLength(1)
    expect(turn.applied[0]).toMatchObject({
      kind: 'edit',
      relativePath: 'src/main.ts',
      updated: 'const value = 2\n',
    })
    expect(turn.applied[0]?.lines).toEqual([
      { id: 'l0', type: 'removed', content: 'const value = 1', oldLine: 1 },
      { id: 'l1', type: 'added', content: 'const value = 2', newLine: 1 },
    ])
    expect(JSON.stringify(turn.applied[0]?.lines)).not.toContain('const value = 1\nconst value = 2')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: true,
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(harness.writes).toHaveLength(1)
    expect(harness.files.get('src/main.ts')).toBe('const value = 2\n')
  })

  it('does not read or write a rejected path', async () => {
    const harness = createHarness()
    harness.steps.push(
      action('read', '../secret'),
      action('reply', '', '', '', 'I cannot read that path.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Read the secret.',
      history: [],
    })
    expect(harness.reads).toEqual([])
    expect(harness.writes).toEqual([])
    expect(turn.proposals).toEqual([])
    expect(turn.applied).toEqual([])
    expect(turn.text).toBe('I cannot read that path.')
  })

  it('hides excluded and linked directory entries', async () => {
    const harness = createHarness()
    const seen: string[] = []
    harness.steps.push(action('list', 'src'), action('reply', '', '', '', 'Listed.'))
    harness.setComplete(async (step) => {
      seen.push(JSON.stringify(step.contents))
      return harness.steps.shift()
    })
    const session = harness.service.session()
    await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'List src.',
      history: [],
    })
    const listed = seen.join('\n')
    expect(listed).toContain('src/main.ts')
    expect(listed).not.toContain('node_modules')
    expect(listed).not.toContain('.env')
    expect(listed).not.toContain('link.ts')
  })
})

describe('project agent create and multi-file proposals', () => {
  it('writes a missing file during the turn and rejects a bad path', async () => {
    const harness = createHarness()
    harness.steps.push(
      action('create', '../secret.ts', 'nope\n', 'Escape.'),
      action('create', '.env', 'TOKEN=1\n', 'Hide a secret.'),
      action('create', 'src/auth.ts', 'export function login() {}\n', 'Add login.'),
      action('reply', '', '', '', 'The new file is ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Add auth.ts.',
      history: [],
    })
    expect(turn.proposals).toEqual([])
    expect(turn.applied.map((item) => item.relativePath)).toEqual(['src/auth.ts'])
    expect(turn.applied[0]?.kind).toBe('create')
    expect(turn.applied[0]?.lines).toEqual([
      { id: 'l0', type: 'added', content: 'export function login() {}', newLine: 1 },
    ])
    expect(harness.creates).toEqual(['src/auth.ts'])
    expect(harness.writes).toEqual([{ path: 'src/auth.ts', content: 'export function login() {}\n' }])
    expect(harness.files.get('src/auth.ts')).toBe('export function login() {}\n')
    expect(harness.files.has('../secret.ts')).toBe(false)
    expect(harness.files.has('.env')).toBe(false)
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.creates).toEqual(['src/auth.ts'])
  })

  it('writes each edit and create during the same turn', async () => {
    const harness = createHarness()
    harness.steps.push(
      action('create', 'src/auth.ts', 'export {}\n', 'Add auth.'),
      action('propose', 'src/main.ts', 'const value = 2\n', 'Update main.'),
      action('reply', '', '', '', 'Two files are ready.'),
    )
    const session = harness.service.session()
    const request = {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Update main and add auth.',
      history: [] as [],
    }
    const turn = await harness.service.turn(owner, request)
    expect(turn.proposals).toEqual([])
    expect(turn.applied.map((item) => item.kind)).toEqual(['create', 'edit'])
    expect(harness.files.get('src/auth.ts')).toBe('export {}\n')
    expect(harness.files.get('src/main.ts')).toBe('const value = 2\n')
  })

  it('sends the earlier reply when the next file is requested', async () => {
    const harness = createHarness()
    harness.steps.push(
      action('propose', 'src/main.ts', 'const value = 2\n', 'Update main.'),
      action('reply', '', '', '', 'Main is ready.'),
    )
    const session = harness.service.session()
    await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Change the value.',
      history: [],
    })
    const seen: string[] = []
    harness.steps.push(
      action('create', 'src/auth.ts', 'export {}\n', 'Add auth.'),
      action('reply', '', '', '', 'Auth is ready.'),
    )
    harness.setComplete(async (step) => {
      seen.push(step.contents.map((item) => item.text).join('\n'))
      return harness.steps.shift()
    })
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Now add auth.ts.',
      history: [
        { role: 'user', text: 'Change the value.' },
        { role: 'assistant', text: 'Main is ready.' },
      ],
    })
    expect(seen[0]).toContain('Main is ready.')
    expect(seen[0]).toContain('Now add auth.ts.')
    expect(turn.proposals).toEqual([])
    expect(turn.applied.map((item) => item.relativePath)).toEqual(['src/auth.ts'])
    expect(harness.creates).toEqual(['src/auth.ts'])
    expect(harness.files.get('src/main.ts')).toBe('const value = 2\n')
  })
})

describe('project agent stale project generation', () => {
  it('rejects a turn and an apply after the project changes', async () => {
    const harness = createHarness()
    harness.steps.push(action('read', 'src/main.ts'), action('reply', '', '', '', 'Read it.'))
    const session = harness.service.session()
    harness.switchTo(projectB)
    await expect(harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Read the file.',
      history: [],
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', operation: 'project-agent:authorize' })
    expect(harness.reads).toEqual([])

    harness.switchTo(projectA)
    const current = harness.service.session()
    harness.steps.length = 0
    harness.steps.push(
      action('delete', 'src/main.ts', '', 'Remove main.'),
      action('reply', '', '', '', 'Ready.'),
    )
    const turn = await harness.service.turn(owner, {
      projectId: current.projectId,
      generation: current.generation,
      message: 'Delete it.',
      history: [],
    })
    expect(turn.applied).toEqual([])
    expect(turn.proposals).toHaveLength(1)
    harness.switchTo(projectB)
    await expect(harness.service.apply(owner, {
      projectId: current.projectId,
      generation: current.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(harness.writes).toEqual([])
    expect(harness.deleted).toEqual([])
    expect(harness.files.has('src/main.ts')).toBe(true)
  })

  it('cancels an in-flight turn when the project changes', async () => {
    const harness = createHarness()
    let release: ((value: unknown) => void) | undefined
    harness.setComplete((_step, signal) => new Promise((resolve, reject) => {
      const abort = () => reject(new Error('aborted'))
      signal.addEventListener('abort', abort, { once: true })
      release = (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      }
    }))
    const session = harness.service.session()
    const pending = harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Work for a while.',
      history: [],
    })
    const cancelled = expect(pending).rejects.toMatchObject({
      code: 'PROCESS_CANCELLED',
      message: 'The project agent turn was cancelled.',
    })
    await Promise.resolve()
    harness.switchTo(projectB)
    await cancelled
    release?.(action('reply', '', '', '', 'too late'))
    expect(harness.reads).toEqual([])
    expect(harness.writes).toEqual([])
  })
})

describe('project agent delete, rename, and parent folders', () => {
  it('deletes one file only after confirmation and rejects a second apply', async () => {
    const harness = createHarness()
    harness.files.set('src/old.ts', 'export const old = 1\n')
    harness.steps.push(
      action('delete', 'src/old.ts', '', 'Remove the old helper.'),
      action('reply', '', '', '', 'The delete is ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Delete the old helper.',
      history: [],
    })
    expect(harness.deleted).toEqual([])
    expect(turn.proposals.map((item) => `${item.kind}:${item.relativePath}`)).toEqual(['delete:src/old.ts'])
    expect(turn.proposals[0]?.destinationPath).toBe('')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.files.has('src/old.ts')).toBe(true)
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })).resolves.toMatchObject({ relativePath: 'src/old.ts', destinationPath: '' })
    expect(harness.deleted).toEqual(['src/old.ts'])
    expect(harness.files.has('src/old.ts')).toBe(false)
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(harness.deleted).toEqual(['src/old.ts'])
  })

  it('rejects delete paths outside the project and refuses a directory', async () => {
    const harness = createHarness()
    const seen: string[] = []
    harness.steps.push(
      action('delete', '../secret.ts', '', 'Escape.'),
      action('delete', '.env', '', 'Hide a secret.'),
      action('delete', 'src', '', 'Remove the folder.'),
      action('reply', '', '', '', 'Nothing was deleted.'),
    )
    harness.setComplete(async (step) => {
      seen.push(step.contents.map((item) => item.text).join('\n'))
      return harness.steps.shift()
    })
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Delete those paths.',
      history: [],
    })
    expect(turn.proposals).toEqual([])
    expect(harness.deleted).toEqual([])
    expect(harness.files.has('src/main.ts')).toBe(true)
    const transcript = seen.join('\n')
    expect(transcript).toContain('That folder is not empty.')
    expect(transcript).not.toContain('src/main.ts')
  })

  it('renames in place and moves to an existing folder only after confirmation', async () => {
    const harness = createHarness()
    harness.directories.add('lib')
    harness.files.set('src/old.ts', 'export const old = 1\n')
    const seen: string[] = []
    harness.steps.push(
      action('rename', '../secret.ts', '', 'Escape.', '', 'src/nope.ts'),
      action('rename', 'src/main.ts', '', 'Hide it.', '', '.env'),
      action('rename', 'src/main.ts', '', 'Already there.', '', 'src/old.ts'),
      action('rename', 'src/main.ts', '', 'Rename main.', '', 'src/app.ts'),
      action('rename', 'src/old.ts', '', 'Move the helper.', '', 'lib/old.ts'),
      action('reply', '', '', '', 'The paths are ready.'),
    )
    harness.setComplete(async (step) => {
      seen.push(step.contents.map((item) => item.text).join('\n'))
      return harness.steps.shift()
    })
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Rename and move the files.',
      history: [],
    })
    expect(harness.moved).toEqual([])
    expect(turn.proposals.map((item) => `${item.relativePath}->${item.destinationPath}`)).toEqual([
      'src/main.ts->src/app.ts',
      'src/old.ts->lib/old.ts',
    ])
    expect(seen.join('\n')).toContain('The destination already exists.')
    const renamed = turn.proposals[0]!
    const moved = turn.proposals[1]!
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: renamed.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.files.has('src/main.ts')).toBe(true)
    await harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: renamed.proposalId,
      confirmed: true,
    })
    expect(harness.files.get('src/app.ts')).toBe('const value = 1\n')
    expect(harness.files.has('src/main.ts')).toBe(false)
    expect(harness.files.has('src/old.ts')).toBe(true)
    harness.files.set('lib/old.ts', 'taken')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: moved.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ message: 'The destination already exists.' })
    expect(harness.files.get('src/old.ts')).toBe('export const old = 1\n')
    harness.files.delete('lib/old.ts')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: moved.proposalId,
      confirmed: true,
    })).resolves.toMatchObject({ relativePath: 'src/old.ts', destinationPath: 'lib/old.ts' })
    expect(harness.moved).toEqual([
      { source: 'src/main.ts', destination: 'src/app.ts' },
      { source: 'src/old.ts', destination: 'lib/old.ts' },
    ])
  })

  it('creates missing parent folders for a new file and stops at the depth bound', async () => {
    const harness = createHarness()
    const deep = `${Array.from({ length: PROJECT_AGENT_PARENT_DIRECTORIES + 1 }, (_, index) => `d${index}`).join('/')}/file.ts`
    harness.steps.push(
      action('create', 'src/feature/auth.ts', 'export {}\n', 'Add feature auth.'),
      action('create', deep, 'nope\n', 'Too deep.'),
      action('reply', '', '', '', 'The files are ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Add the files.',
      history: [],
    })
    expect(turn.proposals).toEqual([])
    expect(turn.applied.map((item) => item.relativePath)).toEqual(['src/feature/auth.ts'])
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.files.get('src/feature/auth.ts')).toBe('export {}\n')
    expect(harness.files.has(deep)).toBe(false)
  })

  it('creates missing destination parents for a move and rejects a deeper path before any write', async () => {
    const harness = createHarness()
    harness.files.set('src/old.ts', 'export const old = 1\n')
    const deep = `${Array.from({ length: PROJECT_AGENT_PARENT_DIRECTORIES + 1 }, (_, index) => `m${index}`).join('/')}/file.ts`
    harness.steps.push(
      action('rename', 'src/main.ts', '', 'Into modules.', '', 'node_modules/app.ts'),
      action('rename', 'src/main.ts', '', 'Move into feature.', '', 'src/feature/app.ts'),
      action('rename', '../secret.ts', '', 'Escape.', '', 'src/safe.ts'),
      action('rename', 'src/old.ts', '', 'Too deep.', '', deep),
      action('reply', '', '', '', 'The moves are ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Move the files into new folders.',
      history: [],
    })
    expect(harness.directoriesCreated).toEqual([])
    expect(harness.moved).toEqual([])
    expect(turn.proposals.map((item) => `${item.relativePath}->${item.destinationPath}`)).toEqual([
      'src/main.ts->src/feature/app.ts',
      `src/old.ts->${deep}`,
    ])
    const moved = turn.proposals[0]!
    const tooDeep = turn.proposals[1]!
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: moved.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.directoriesCreated).toEqual([])
    expect(harness.files.has('src/main.ts')).toBe(true)
    await harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: moved.proposalId,
      confirmed: true,
    })
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.files.get('src/feature/app.ts')).toBe('const value = 1\n')
    expect(harness.files.has('src/main.ts')).toBe(false)
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: tooDeep.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ message: 'That file is nested too deeply to create its parent folders.' })
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.files.get('src/old.ts')).toBe('export const old = 1\n')
    expect(harness.files.has(deep)).toBe(false)
  })

  it('deletes one empty directory after confirmation and refuses a non-empty directory', async () => {
    const harness = createHarness()
    harness.directories.add('notes')
    harness.directories.add('full')
    harness.directories.add('link-dir')
    harness.symbolicPaths.add('link-dir')
    harness.files.set('full/a.ts', 'keep\n')
    const seen: string[] = []
    harness.steps.push(
      action('delete', '../secret', '', 'Escape.'),
      action('delete', '.env', '', 'Hide a secret.'),
      action('delete', 'full', '', 'Remove the full folder.'),
      action('delete', 'link-dir', '', 'Remove a link.'),
      action('delete', 'notes', '', 'Remove the empty notes folder.'),
      action('reply', '', '', '', 'The folder is ready.'),
    )
    harness.setComplete(async (step) => {
      seen.push(step.contents.map((item) => item.text).join('\n'))
      return harness.steps.shift()
    })
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Delete the empty notes folder.',
      history: [],
    })
    expect(harness.directoriesRemoved).toEqual([])
    expect(harness.deleted).toEqual([])
    expect(turn.proposals.map((item) => `${item.kind}:${item.relativePath}`)).toEqual(['delete-directory:notes'])
    expect(turn.proposals[0]?.original).toBe('')
    expect(turn.proposals[0]?.updated).toBe('')
    const transcript = seen.join('\n')
    expect(transcript).toContain('That folder is not empty.')
    expect(transcript).toContain('Only a file or an empty folder can be deleted.')
    expect(harness.files.get('full/a.ts')).toBe('keep\n')
    const proposal = turn.proposals[0]!
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: proposal.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.directories.has('notes')).toBe(true)
    harness.files.set('notes/later.ts', 'x\n')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: proposal.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ message: 'That folder is not empty.' })
    expect(harness.directories.has('notes')).toBe(true)
    harness.files.delete('notes/later.ts')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: proposal.proposalId,
      confirmed: true,
    })).resolves.toMatchObject({ relativePath: 'notes', destinationPath: '' })
    expect(harness.directoriesRemoved).toEqual(['notes'])
    expect(harness.directories.has('notes')).toBe(false)
    expect(harness.files.has('src/main.ts')).toBe(true)
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: proposal.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('removes only folders created for a failed move and leaves pre-existing folders', async () => {
    const harness = createHarness()
    harness.directories.add('notes')
    harness.moveFailures.add('src/feature/nested/app.ts')
    harness.steps.push(
      action('rename', '../secret.ts', '', 'Escape.', '', 'src/nope.ts'),
      action('rename', 'src/main.ts', '', 'Move into new folders.', '', 'src/feature/nested/app.ts'),
      action('reply', '', '', '', 'The move is ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Move main into nested folders.',
      history: [],
    })
    const proposal = turn.proposals[0]!
    expect(proposal.destinationPath).toBe('src/feature/nested/app.ts')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: proposal.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.directoriesCreated).toEqual([])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.apply(owner, {
        projectId: session.projectId,
        generation: session.generation,
        proposalId: proposal.proposalId,
        confirmed: true,
      })).rejects.toMatchObject({ message: 'The file could not be moved.' })
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
    expect(harness.directoriesCreated).toEqual(['src/feature', 'src/feature/nested'])
    expect(harness.directoriesRemoved).toEqual(['src/feature/nested', 'src/feature'])
    expect(harness.directoriesRemoved.every((path) => (
      path !== 'src' && path !== 'notes' && path !== '' && !path.startsWith('..') && !path.includes('\\')
    ))).toBe(true)
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.moved).toEqual([])
  })

  it('reports a cleanup failure and does not delete a pre-existing or occupied folder', async () => {
    const harness = createHarness()
    harness.directories.add('notes')
    harness.moveFailures.add('src/feature/app.ts')
    harness.occupyMoveFailures.add('src/feature/app.ts')
    harness.steps.push(
      action('rename', 'src/main.ts', '', 'Move into feature.', '', 'src/feature/app.ts'),
      action('reply', '', '', '', 'The move is ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Move main.',
      history: [],
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.apply(owner, {
        projectId: session.projectId,
        generation: session.generation,
        proposalId: turn.proposals[0]!.proposalId,
        confirmed: true,
      })).rejects.toMatchObject({
        message: 'The file could not be moved. Created folders could not be removed: src/feature: That folder is not empty.',
      })
      expect(logged).toHaveBeenCalled()
      expect(logged.mock.calls.flat().join(' ')).not.toContain('x\n')
    } finally {
      logged.mockRestore()
    }
    expect(harness.directoriesRemoved).toEqual([])
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(true)
    expect(harness.files.get('src/feature/stray.ts')).toBe('x\n')
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
  })

  it('removes a parent created before a later folder creation fails', async () => {
    const harness = createHarness()
    harness.directoryFailures.add('src/feature/nested')
    harness.steps.push(
      action('rename', 'src/main.ts', '', 'Move deep.', '', 'src/feature/nested/app.ts'),
      action('reply', '', '', '', 'The move is ready.'),
    )
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Move main.',
      history: [],
    })
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ message: 'The folder could not be created.' })
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.directoriesRemoved).toEqual(['src/feature'])
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
  })
})

describe('project agent failed create cleanup', () => {
  it('removes only the empty file created for a failed write and leaves pre-existing files', async () => {
    const harness = createHarness()
    harness.files.set('notes/keep.ts', 'keep\n')
    harness.directories.add('notes')
    harness.writeFailures.add('src/feature/auth.ts')
    harness.steps.push(
      action('create', '../secret.ts', 'nope\n', 'Escape.'),
      action('create', 'src/feature/auth.ts', 'export {}\n', 'Add auth.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add auth under a new folder.',
        history: [],
      })).rejects.toMatchObject({ message: 'The file could not be written.' })
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'Apply the edit only after explicit confirmation.' })
    expect(harness.creates).toEqual(['src/feature/auth.ts'])
    expect(harness.deleted).toEqual(['src/feature/auth.ts'])
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.directoriesRemoved).toEqual(['src/feature'])
    const removed = [...harness.deleted, ...harness.directoriesRemoved]
    expect(removed.every((path) => assessProjectAgentPath(path, 'delete') === path)).toBe(true)
    expect(removed.every((path) => !path.startsWith('..') && !path.includes('\\') && !path.includes(':'))).toBe(true)
    expect(harness.files.has('src/feature/auth.ts')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.files.get('notes/keep.ts')).toBe('keep\n')
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.writes).toEqual([])
  })

  it('reports a cleanup failure and does not delete a pre-existing file', async () => {
    const harness = createHarness()
    harness.files.set('notes/keep.ts', 'keep\n')
    harness.writeFailures.add('src/new.ts')
    harness.deleteFileFailures.add('src/new.ts')
    harness.steps.push(
      action('create', 'src/new.ts', 'export {}\n', 'Add a file.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add new.ts.',
        history: [],
      })).rejects.toMatchObject({
        message: 'The file could not be written. Created file could not be removed: src/new.ts: The file could not be removed.',
      })
      expect(logged).toHaveBeenCalled()
      expect(logged.mock.calls.flat().join(' ')).not.toContain('export {}\n')
      expect(logged.mock.calls.flat().join(' ')).not.toContain('keep\n')
    } finally {
      logged.mockRestore()
    }
    expect(harness.deleted).toEqual([])
    expect(harness.files.get('src/new.ts')).toBe('')
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.files.get('notes/keep.ts')).toBe('keep\n')
  })

  it('leaves a created file that received content and leaves every other file', async () => {
    const harness = createHarness()
    harness.writeFailures.add('src/new.ts')
    harness.occupiedWriteFailures.add('src/new.ts')
    harness.steps.push(
      action('create', 'src/new.ts', 'export {}\n', 'Add a file.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add new.ts.',
        history: [],
      })).rejects.toMatchObject({
        message: 'The file could not be written. Created file could not be removed: The created file was no longer empty and was left in place.',
      })
      expect(logged.mock.calls.flat().join(' ')).not.toContain('partial\n')
    } finally {
      logged.mockRestore()
    }
    expect(harness.deleted).toEqual([])
    expect(harness.files.get('src/new.ts')).toBe('partial\n')
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
  })

  it('reports a clear message when edit, delete, or rename fails and hides the raw error', async () => {
    const harness = createHarness()
    harness.files.set('src/old.ts', 'export const old = 1\n')
    harness.files.set('src/other.ts', 'export const other = 1\n')
    harness.directories.add('notes')
    harness.rawWriteFailures.add('src/main.ts')
    harness.steps.push(
      action('propose', 'src/main.ts', 'const value = 2\n', 'Update main.'),
      action('delete', 'src/old.ts', '', 'Remove the helper.'),
      action('delete', 'notes', '', 'Remove the empty folder.'),
      action('rename', 'src/other.ts', '', 'Move the helper.', '', 'src/moved.ts'),
      action('reply', '', '', '', 'Four changes are ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Update, delete, and move.',
        history: [],
      })).rejects.toMatchObject({ message: 'The edit could not be saved.' })
      expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
      const turn = await harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Delete and move the rest.',
        history: [],
      })
      expect(turn.applied).toEqual([])
      const [fileDelete, folderDelete, rename] = turn.proposals
      expect(turn.proposals.map((item) => item.kind)).toEqual(['delete', 'delete-directory', 'rename'])
      harness.rawDeleteFailures.add('src/old.ts')
      await expect(harness.service.apply(owner, {
        projectId: session.projectId,
        generation: session.generation,
        proposalId: fileDelete!.proposalId,
        confirmed: true,
      })).rejects.toMatchObject({ message: 'The file could not be deleted.' })
      harness.rawDirectoryDeleteFailures.add('notes')
      await expect(harness.service.apply(owner, {
        projectId: session.projectId,
        generation: session.generation,
        proposalId: folderDelete!.proposalId,
        confirmed: true,
      })).rejects.toMatchObject({ message: 'The folder could not be deleted.' })
      harness.rawMoveFailures.add('src/moved.ts')
      await expect(harness.service.apply(owner, {
        projectId: session.projectId,
        generation: session.generation,
        proposalId: rename!.proposalId,
        confirmed: true,
      })).rejects.toMatchObject({ message: 'The file could not be moved.' })
      const loggedText = logged.mock.calls.flat().join(' ')
      expect(loggedText).not.toContain('secret-stack')
    } finally {
      logged.mockRestore()
    }
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.files.get('src/old.ts')).toBe('export const old = 1\n')
    expect(harness.files.get('src/other.ts')).toBe('export const other = 1\n')
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.deleted).toEqual([])
    expect(harness.directoriesRemoved).toEqual([])
    expect(harness.moved).toEqual([])
  })

  it('removes only folders created for a failed create, deepest first, and leaves pre-existing folders', async () => {
    const harness = createHarness()
    harness.files.set('notes/keep.ts', 'keep\n')
    harness.directories.add('notes')
    harness.writeFailures.add('src/feature/nested/auth.ts')
    harness.steps.push(
      action('create', '../secret.ts', 'nope\n', 'Escape.'),
      action('create', 'src/feature/nested/auth.ts', 'export {}\n', 'Add nested auth.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add nested auth.',
        history: [],
      })).rejects.toMatchObject({ message: 'The file could not be written.' })
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.directoriesCreated).toEqual(['src/feature', 'src/feature/nested'])
    expect(harness.directoriesRemoved).toEqual(['src/feature/nested', 'src/feature'])
    expect(harness.deleted).toEqual(['src/feature/nested/auth.ts'])
    expect(harness.directoriesRemoved.every((path) => (
      assessProjectAgentPath(path, 'delete') === path
      && path !== 'src'
      && path !== 'notes'
      && path !== ''
      && !path.startsWith('..')
      && !path.includes('\\')
    ))).toBe(true)
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.directories.has('src/feature/nested')).toBe(false)
    expect(harness.files.has('src/feature/nested/auth.ts')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.files.get('notes/keep.ts')).toBe('keep\n')
  })

  it('removes a parent created before a later folder creation fails and before any file exists', async () => {
    const harness = createHarness()
    harness.directories.add('notes')
    harness.directoryFailures.add('src/feature/nested')
    harness.steps.push(
      action('create', 'src/feature/nested/auth.ts', 'export {}\n', 'Add nested auth.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add nested auth.',
        history: [],
      })).rejects.toMatchObject({ message: 'The folder could not be created.' })
      expect(logged).not.toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.directoriesRemoved).toEqual(['src/feature'])
    expect(harness.creates).toEqual([])
    expect(harness.deleted).toEqual([])
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
  })

  it('reports a folder cleanup failure and does not delete a pre-existing folder', async () => {
    const harness = createHarness()
    harness.files.set('notes/keep.ts', 'keep\n')
    harness.directories.add('notes')
    harness.writeFailures.add('src/feature/auth.ts')
    harness.directoryDeleteFailures.add('src/feature')
    harness.steps.push(
      action('create', 'src/feature/auth.ts', 'export {}\n', 'Add auth.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add auth.',
        history: [],
      })).rejects.toMatchObject({
        message: 'The file could not be written. Created folders could not be removed: src/feature: The folder could not be removed.',
      })
      expect(logged).toHaveBeenCalled()
      expect(logged.mock.calls.flat().join(' ')).not.toContain('export {}\n')
      expect(logged.mock.calls.flat().join(' ')).not.toContain('keep\n')
    } finally {
      logged.mockRestore()
    }
    expect(harness.deleted).toEqual(['src/feature/auth.ts'])
    expect(harness.directoriesRemoved).toEqual([])
    expect(harness.directoriesRemoved).not.toContain('src')
    expect(harness.directoriesRemoved).not.toContain('notes')
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(true)
    expect(harness.files.has('src/feature/auth.ts')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.files.get('notes/keep.ts')).toBe('keep\n')
  })

  it('reports both the file cleanup failure and the folder cleanup failure', async () => {
    const harness = createHarness()
    harness.directories.add('notes')
    harness.writeFailures.add('src/feature/auth.ts')
    harness.deleteFileFailures.add('src/feature/auth.ts')
    harness.steps.push(
      action('create', 'src/feature/auth.ts', 'export {}\n', 'Add auth.'),
      action('reply', '', '', '', 'The file is ready.'),
    )
    const session = harness.service.session()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(harness.service.turn(owner, {
        projectId: session.projectId,
        generation: session.generation,
        message: 'Add auth.',
        history: [],
      })).rejects.toMatchObject({
        message: 'The file could not be written. Created file could not be removed: src/feature/auth.ts: The file could not be removed. Created folders could not be removed: src/feature: That folder is not empty.',
      })
      expect(logged.mock.calls.flat().join(' ')).not.toContain('export {}\n')
    } finally {
      logged.mockRestore()
    }
    expect(harness.deleted).toEqual([])
    expect(harness.directoriesRemoved).toEqual([])
    expect(harness.files.get('src/feature/auth.ts')).toBe('')
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(true)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
  })
})

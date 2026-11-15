import { describe, expect, it, vi } from 'vitest'
import type { FileEntry, FileStat, ProjectId } from '../../src/shared/contracts'
import { DomainError } from '../../src/main/errors/app-error'
import { GeminiProjectAgentModel } from '../../src/main/services/ai/project-agent-gemini'
import {
  ProjectAgentService,
  type ProjectAgentFilePort,
  type ProjectAgentOwner,
  type ProjectAgentProjects,
} from '../../src/main/services/ai/project-agent-service'

const projectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const owner: ProjectAgentOwner = { id: 3, scope: 'frame-gemini' }
const credential = 'stage2-test-credential'

function envelope(action: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{
      finishReason: 'STOP',
      content: { role: 'model', parts: [{ text: JSON.stringify(action) }] },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function action(
  name: string,
  relativePath = '',
  content = '',
  summary = '',
  text = '',
  destinationPath = '',
) {
  return { action: name, text, relativePath, destinationPath, content, summary }
}

function createService(send: (request: Request) => Promise<Response>, ready = true) {
  const files = new Map<string, string>([['src/main.ts', 'const value = 1\n']])
  const directories = new Set(['', 'src'])
  const writes: { path: string; content: string }[] = []
  const creates: string[] = []
  const directoriesCreated: string[] = []
  const deleted: string[] = []
  const directoriesRemoved: string[] = []
  const moved: { source: string; destination: string }[] = []
  const moveFailures = new Set<string>()
  const writeFailures = new Set<string>()
  const projects: ProjectAgentProjects = {
    getActiveProject: () => ({ id: projectId }),
    getAuthorizedProject: (requested) => {
      if (requested !== projectId) {
        throw new DomainError({
          code: 'PERMISSION_DENIED',
          message: 'The project is no longer authorized.',
          operation: 'project:authorize',
          retryable: false,
        })
      }
      return { id: projectId }
    },
    subscribe: () => () => undefined,
  }
  const disk: ProjectAgentFilePort = {
    async stat(requested, relativePath): Promise<FileStat> {
      projects.getAuthorizedProject(requested)
      if (directories.has(relativePath)) {
        return {
          name: relativePath || 'project',
          relativePath,
          kind: 'directory',
          isSymbolicLink: false,
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
        isSymbolicLink: false,
        size: content.length,
        modifiedAt: '2026-01-01T00:00:00.000Z',
      }
    },
    async read(requested, relativePath) {
      projects.getAuthorizedProject(requested)
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
    async listDirectory() {
      return []
    },
    async write(requested, relativePath, content) {
      projects.getAuthorizedProject(requested)
      if (writeFailures.has(relativePath)) {
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
    async createFile(requested, parentPath, name): Promise<FileEntry> {
      projects.getAuthorizedProject(requested)
      const relativePath = parentPath.length === 0 ? name : `${parentPath}/${name}`
      files.set(relativePath, '')
      creates.push(relativePath)
      return { name, relativePath, kind: 'file', isSymbolicLink: false }
    },
    async createDirectory(requested, parentPath, name): Promise<FileEntry> {
      projects.getAuthorizedProject(requested)
      const relativePath = parentPath.length === 0 ? name : `${parentPath}/${name}`
      directories.add(relativePath)
      directoriesCreated.push(relativePath)
      return { name, relativePath, kind: 'directory', isSymbolicLink: false }
    },
    async deleteFile(requested, relativePath) {
      projects.getAuthorizedProject(requested)
      if (!files.delete(relativePath)) {
        throw new DomainError({
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          operation: 'file:delete-file',
          retryable: false,
        })
      }
      deleted.push(relativePath)
    },
    async deleteEmptyDirectory(requested, relativePath) {
      projects.getAuthorizedProject(requested)
      if (!directories.has(relativePath) || relativePath.length === 0) {
        throw new DomainError({
          code: 'INVALID_INPUT',
          message: 'Only an empty folder can be deleted.',
          operation: 'file:delete-empty-directory',
          retryable: false,
        })
      }
      const prefix = `${relativePath}/`
      const occupied = [...files.keys()].some((file) => file.startsWith(prefix))
        || [...directories].some((directory) => directory.startsWith(prefix))
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
    async move(requested, source, destination): Promise<FileEntry> {
      projects.getAuthorizedProject(requested)
      if (moveFailures.has(destination)) {
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
      files.delete(source)
      files.set(destination, content)
      moved.push({ source, destination })
      return {
        name: destination.split('/').at(-1) ?? destination,
        relativePath: destination,
        kind: 'file',
        isSymbolicLink: false,
      }
    },
  }
  const model = new GeminiProjectAgentModel(
    { send },
    { ready: () => ready, generation: () => 2, value: () => credential },
  )
  return {
    service: new ProjectAgentService(projects, disk, model),
    files,
    writes,
    creates,
    directoriesCreated,
    deleted,
    directoriesRemoved,
    moveFailures,
    writeFailures,
    moved,
    directories,
  }
}

describe('project agent Gemini tool loop', () => {
  it('uses the supplied credential and applies scripted create and edit responses', async () => {
    const script = [
      action('create', 'src/auth.ts', 'export function login() {}\n', 'Add login.'),
      action('propose', 'src/main.ts', 'const value = 2\n', 'Update the value.'),
      action('reply', '', '', '', 'Both files are ready.'),
    ]
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      expect(body).not.toContain('"tools"')
      return envelope(script.shift())
    })
    const harness = createService(send)
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Add login and update main.',
      history: [],
    })
    expect(send).toHaveBeenCalledTimes(3)
    expect(turn.proposals).toEqual([])
    expect(turn.applied.map((item) => `${item.kind}:${item.relativePath}`)).toEqual([
      'create:src/auth.ts',
      'edit:src/main.ts',
    ])
    expect(turn.applied[0]?.lines.some((line) => line.type === 'added' && line.content === 'export function login() {}')).toBe(true)
    expect(turn.applied[1]?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'removed', content: 'const value = 1' }),
      expect.objectContaining({ type: 'added', content: 'const value = 2' }),
    ]))
    expect(harness.creates).toEqual(['src/auth.ts'])
    expect(harness.writes).toEqual([
      { path: 'src/auth.ts', content: 'export function login() {}\n' },
      { path: 'src/main.ts', content: 'const value = 2\n' },
    ])
    expect(harness.files.get('src/auth.ts')).toBe('export function login() {}\n')
    expect(harness.files.get('src/main.ts')).toBe('const value = 2\n')
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: true,
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(harness.writes).toHaveLength(2)
  })

  it('does not call Gemini when the Settings credential is not ready', async () => {
    const send = vi.fn(async () => envelope(action('reply', '', '', '', 'no')))
    const harness = createService(send, false)
    const session = harness.service.session()
    await expect(harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Edit the file.',
      history: [],
    })).rejects.toMatchObject({
      code: 'DEPENDENCY_MISSING',
      message: 'Gemini is not configured. Enable the existing Gemini key in Settings.',
    })
    expect(send).not.toHaveBeenCalled()
    expect(harness.writes).toEqual([])
  })

  it('surfaces a rejected key, an invalid response, and a cancelled request without writing', async () => {
    const rejected = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      return new Response(JSON.stringify({ error: credential }), { status: 401 })
    })
    const rejectedHarness = createService(rejected)
    const rejectedSession = rejectedHarness.service.session()
    await expect(rejectedHarness.service.turn(owner, {
      projectId: rejectedSession.projectId,
      generation: rejectedSession.generation,
      message: 'Edit the file.',
      history: [],
    })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      message: 'The Gemini key was rejected. Check the key in Settings.',
    })
    expect(rejected).toHaveBeenCalledTimes(1)
    expect(rejectedHarness.writes).toEqual([])
    expect(rejectedHarness.creates).toEqual([])

    const invalid = vi.fn(async () => envelope({
      action: 'exec', text: '', relativePath: 'src/main.ts', destinationPath: '', content: '', summary: '',
    }))
    const invalidHarness = createService(invalid)
    const invalidSession = invalidHarness.service.session()
    await expect(invalidHarness.service.turn(owner, {
      projectId: invalidSession.projectId,
      generation: invalidSession.generation,
      message: 'Edit the file.',
      history: [],
    })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'The project agent returned an invalid response.',
    })
    expect(invalidHarness.writes).toEqual([])

    let requestSignal: AbortSignal | undefined
    const hanging = vi.fn((request: Request) => new Promise<Response>((_resolve, reject) => {
      requestSignal = request.signal
      if (request.signal.aborted) {
        reject(new Error('aborted'))
        return
      }
      request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const hangingHarness = createService(hanging)
    const hangingSession = hangingHarness.service.session()
    const pending = hangingHarness.service.turn(owner, {
      projectId: hangingSession.projectId,
      generation: hangingSession.generation,
      message: 'Work for a while.',
      history: [],
    })
    const cancelled = expect(pending).rejects.toMatchObject({
      code: 'PROCESS_CANCELLED',
      message: 'The project agent turn was cancelled.',
    })
    await vi.waitFor(() => expect(hanging).toHaveBeenCalled())
    hangingHarness.service.cancel(owner, {
      projectId: hangingSession.projectId,
      generation: hangingSession.generation,
    })
    await cancelled
    expect(requestSignal?.aborted).toBe(true)
    expect(hangingHarness.writes).toEqual([])
    expect(hangingHarness.creates).toEqual([])
  })

  it('deletes and renames through the scripted Gemini loop only after confirmation', async () => {
    const script = [
      action('delete', 'src/old.ts', '', 'Remove the old helper.'),
      action('rename', 'src/main.ts', '', 'Move main into lib.', '', 'lib/app.ts'),
      action('reply', '', '', '', 'The file changes are ready.'),
    ]
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      expect(body).not.toContain('"tools"')
      const parsed = JSON.parse(body) as {
        generationConfig: { responseJsonSchema: { properties: { action: { enum: string[] } } } }
      }
      expect(parsed.generationConfig.responseJsonSchema.properties.action.enum).toEqual(
        expect.arrayContaining(['delete', 'rename']),
      )
      return envelope(script.shift())
    })
    const harness = createService(send)
    harness.files.set('src/old.ts', 'export const old = 1\n')
    harness.directories.add('lib')
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Delete the helper and move main.',
      history: [],
    })
    expect(send).toHaveBeenCalledTimes(3)
    expect(harness.deleted).toEqual([])
    expect(harness.moved).toEqual([])
    expect(turn.proposals.map((item) => item.kind)).toEqual(['delete', 'rename'])
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.files.has('src/old.ts')).toBe(true)
    await harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })
    expect(harness.files.has('src/main.ts')).toBe(true)
    await harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[1]!.proposalId,
      confirmed: true,
    })
    expect(harness.deleted).toEqual(['src/old.ts'])
    expect(harness.files.get('lib/app.ts')).toBe('const value = 1\n')
    expect(harness.files.has('src/main.ts')).toBe(false)
  })

  it('moves into a missing parent and deletes an empty folder only after confirmation', async () => {
    const script = [
      action('rename', 'src/main.ts', '', 'Move main into a new folder.', '', 'src/feature/app.ts'),
      action('delete', 'notes', '', 'Remove the empty notes folder.'),
      action('reply', '', '', '', 'The folder changes are ready.'),
    ]
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      expect(body).not.toContain('"tools"')
      return envelope(script.shift())
    })
    const harness = createService(send)
    harness.directories.add('notes')
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Move main into a new folder and delete notes.',
      history: [],
    })
    expect(send).toHaveBeenCalledTimes(3)
    expect(harness.directoriesCreated).toEqual([])
    expect(harness.moved).toEqual([])
    expect(harness.directoriesRemoved).toEqual([])
    expect(turn.proposals.map((item) => item.kind)).toEqual(['rename', 'delete-directory'])
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.files.has('src/main.ts')).toBe(true)
    await harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })
    expect(harness.directoriesCreated).toEqual(['src/feature'])
    expect(harness.files.get('src/feature/app.ts')).toBe('const value = 1\n')
    expect(harness.files.has('src/main.ts')).toBe(false)
    expect(harness.directories.has('notes')).toBe(true)
    await harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[1]!.proposalId,
      confirmed: true,
    })
    expect(harness.directoriesRemoved).toEqual(['notes'])
    expect(harness.directories.has('notes')).toBe(false)
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[1]!.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('removes folders created by a failed move through the scripted Gemini loop', async () => {
    const script = [
      action('rename', 'src/main.ts', '', 'Move main into a new folder.', '', 'src/feature/nested/app.ts'),
      action('reply', '', '', '', 'The move is ready.'),
    ]
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      expect(body).not.toContain('"tools"')
      return envelope(script.shift())
    })
    const harness = createService(send)
    harness.moveFailures.add('src/feature/nested/app.ts')
    harness.directories.add('notes')
    const session = harness.service.session()
    const turn = await harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Move main into nested folders.',
      history: [],
    })
    expect(send).toHaveBeenCalled()
    expect(turn.proposals.map((item) => item.kind)).toEqual(['rename'])
    expect(harness.directoriesCreated).toEqual([])
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: turn.proposals[0]!.proposalId,
      confirmed: true,
    })).rejects.toMatchObject({ message: 'The file could not be moved.' })
    expect(harness.directoriesCreated).toEqual(['src/feature', 'src/feature/nested'])
    expect(harness.directoriesRemoved).toEqual(['src/feature/nested', 'src/feature'])
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.files.has('src/main.ts')).toBe(true)
    expect(harness.moved).toEqual([])
  })

  it('removes the empty file from a failed create through the scripted Gemini loop', async () => {
    const script = [
      action('create', 'src/auth.ts', 'export function login() {}\n', 'Add login.'),
      action('reply', '', '', '', 'The file is ready.'),
    ]
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      expect(body).not.toContain('"tools"')
      return envelope(script.shift())
    })
    const harness = createService(send)
    harness.writeFailures.add('src/auth.ts')
    harness.files.set('notes/keep.ts', 'keep\n')
    const session = harness.service.session()
    await expect(harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Add login.',
      history: [],
    })).rejects.toMatchObject({ message: 'The file could not be written.' })
    expect(send).toHaveBeenCalled()
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.creates).toEqual(['src/auth.ts'])
    expect(harness.deleted).toEqual(['src/auth.ts'])
    expect(harness.files.has('src/auth.ts')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.files.get('notes/keep.ts')).toBe('keep\n')
    expect(harness.writes).toEqual([])
  })

  it('removes folders created by a failed create through the scripted Gemini loop', async () => {
    const script = [
      action('create', 'src/feature/nested/auth.ts', 'export function login() {}\n', 'Add nested login.'),
      action('reply', '', '', '', 'The file is ready.'),
    ]
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-goog-api-key')).toBe(credential)
      const body = await request.text()
      expect(body).not.toContain(credential)
      expect(body).not.toContain('"tools"')
      return envelope(script.shift())
    })
    const harness = createService(send)
    harness.writeFailures.add('src/feature/nested/auth.ts')
    harness.directories.add('notes')
    const session = harness.service.session()
    await expect(harness.service.turn(owner, {
      projectId: session.projectId,
      generation: session.generation,
      message: 'Add nested login.',
      history: [],
    })).rejects.toMatchObject({ message: 'The file could not be written.' })
    expect(send).toHaveBeenCalled()
    await expect(harness.service.apply(owner, {
      projectId: session.projectId,
      generation: session.generation,
      proposalId: '00000000-0000-4000-8000-000000000099',
      confirmed: false as never,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(harness.creates).toEqual(['src/feature/nested/auth.ts'])
    expect(harness.deleted).toEqual(['src/feature/nested/auth.ts'])
    expect(harness.directoriesCreated).toEqual(['src/feature', 'src/feature/nested'])
    expect(harness.directoriesRemoved).toEqual(['src/feature/nested', 'src/feature'])
    expect(harness.directoriesRemoved.every((path) => path !== 'src' && path !== 'notes' && !path.startsWith('..'))).toBe(true)
    expect(harness.directories.has('src')).toBe(true)
    expect(harness.directories.has('notes')).toBe(true)
    expect(harness.directories.has('src/feature')).toBe(false)
    expect(harness.files.has('src/feature/nested/auth.ts')).toBe(false)
    expect(harness.files.get('src/main.ts')).toBe('const value = 1\n')
    expect(harness.writes).toEqual([])
  })
})

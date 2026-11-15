/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectAgentApi, ProjectId, StudentIdeApi } from '../../src/shared/contracts'
import { AiChatPanel } from '../../src/renderer/src/features/ai/AiChatPanel'

const refreshAppliedFile = vi.hoisted(() => vi.fn(() => 'reloaded' as const))
const closeDeletedFile = vi.hoisted(() => vi.fn(() => 'absent' as const))
const renameAppliedFile = vi.hoisted(() => vi.fn((): 'renamed' | 'retargeted' | 'closed' | 'conflict' | 'blocked' => 'renamed'))
const sourceRenameBlocked = vi.hoisted(() => vi.fn(() => false))
const DIRTY_SOURCE_RENAME_MESSAGE = 'Save or discard unsaved edits in the source file before applying. The destination tab also has unsaved edits.'
vi.mock('../../src/renderer/src/features/ai/refresh-applied-file', () => ({
  refreshAppliedFile,
  closeDeletedFile,
  renameAppliedFile,
  sourceRenameBlocked,
  subscribeEditorDocuments: () => () => undefined,
  DIRTY_SOURCE_RENAME_MESSAGE,
}))

const projectId = 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId
const proposalId = '00000000-0000-4000-8000-000000000001'
const session = vi.fn<ProjectAgentApi['session']>()
const turn = vi.fn<ProjectAgentApi['turn']>()
const apply = vi.fn<ProjectAgentApi['apply']>()
const cancel = vi.fn<ProjectAgentApi['cancel']>()

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  refreshAppliedFile.mockReset()
  refreshAppliedFile.mockReturnValue('reloaded')
  closeDeletedFile.mockReset()
  closeDeletedFile.mockReturnValue('absent')
  renameAppliedFile.mockReset()
  renameAppliedFile.mockReturnValue('renamed')
  sourceRenameBlocked.mockReset()
  sourceRenameBlocked.mockReturnValue(false)
})

describe('Project chat confirmation', () => {
  it('shows a file diff after an edit and does not ask to apply it', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'I updated the greeting.',
        proposals: [],
        applied: [{
          kind: 'edit',
          relativePath: 'src/main.ts',
          summary: 'Rename the greeting.',
          updated: 'hello there\n',
          lines: [
            { id: 'l0', type: 'removed', content: 'hello', oldLine: 1 },
            { id: 'l1', type: 'added', content: 'hello there', newLine: 1 },
          ],
        }],
      },
    })
    cancel.mockResolvedValue({ ok: true, value: null })
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Please edit the greeting.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Updated src/main.ts')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'CHAT' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add file' })).toBeTruthy()
    expect(screen.getAllByText('gemini-3.1-flash-lite').length).toBeGreaterThan(0)
    expect(screen.getByText('Ran 1 tool')).toBeTruthy()
    expect(screen.getByText('Edit')).toBeTruthy()
    expect(screen.getAllByText('src/main.ts').length).toBeGreaterThan(1)
    expect(screen.getByText('hello there')).toBeTruthy()
    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apply edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create file' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Proposed edit' })).toBeNull()
    expect(screen.queryByText('hello there\n')).toBeNull()
    expect(apply).not.toHaveBeenCalled()
    await waitFor(() => expect(refreshAppliedFile).toHaveBeenCalledWith(projectId, 'src/main.ts', 'hello there\n'))
  })

  it('shows agent activity while a project turn is running', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    let finish: (value: Awaited<ReturnType<typeof turn>>) => void = () => undefined
    turn.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    cancel.mockResolvedValue({ ok: true, value: null })
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Look around.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Working through it…')).toBeTruthy()
    finish({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'Nothing to change.',
        proposals: [],
        applied: [],
      },
    })
    expect(await screen.findByText('Nothing to change.')).toBeTruthy()
    expect(screen.getAllByText('Answered').length).toBeGreaterThan(0)
    expect(screen.queryByText('Working through it…')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Message the project' })).toBeTruthy()
  })

  it('keeps a long diff line intact and scrollable inside the chat', async () => {
    const longLine = `const greeting = "${'hello-there-'.repeat(12)}end";`
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'Updated.',
        proposals: [],
        applied: [{
          kind: 'edit',
          relativePath: 'Program.cs',
          summary: 'Lengthen the greeting.',
          updated: `${longLine}\n`,
          lines: [{ id: 'l0', type: 'added', content: longLine, newLine: 1 }],
        }],
      },
    })
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Lengthen the greeting.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const status = await screen.findByText('Updated Program.cs')
    const line = screen.getByText(longLine)
    const viewport = document.querySelector('[data-slot="file-diff-viewport"]')
    expect(line.textContent).toBe(longLine)
    expect(line.className).toContain('whitespace-pre')
    expect(line.className).not.toContain('truncate')
    expect(line.className).not.toContain('min-w-0')
    expect(viewport?.className).toContain('overflow-x-auto')
    expect(viewport?.className).toContain('overflow-y-auto')
    expect(viewport?.className).toContain('min-w-0')
    expect(viewport?.className).toContain('max-w-full')
    const scroller = document.querySelector('#project-chat-panel [data-slot="message-scroller"]')
    expect(scroller?.className).toContain('min-w-0')
    expect(status.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(apply).not.toHaveBeenCalled()
  })

  it('says the open tab kept unsaved edits when the edited file is dirty', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'Updated.',
        proposals: [],
        applied: [{
          kind: 'edit',
          relativePath: 'src/main.ts',
          summary: 'Rename the greeting.',
          updated: 'hello there\n',
          lines: [{ id: 'l0', type: 'added', content: 'hello there', newLine: 1 }],
        }],
      },
    })
    refreshAppliedFile.mockReturnValue('conflict')
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Please edit the greeting.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Updated src/main.ts. The open tab kept its unsaved edits.')).toBeTruthy()
    expect(apply).not.toHaveBeenCalled()
  })

  it('keeps a delete proposal when the user discards it', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'Ready.',
        proposals: [{
          proposalId,
          projectId,
          generation: 2,
          kind: 'delete' as const,
          relativePath: 'src/auth.ts',
          destinationPath: '',
          summary: 'Remove the helper.',
          original: '',
          updated: '',
        }],
        applied: [],
      },
    })
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'xóa helper' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('This file will be deleted.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('region', { name: 'Proposed delete' })).toBeNull()
    expect(apply).not.toHaveBeenCalled()
    expect(refreshAppliedFile).not.toHaveBeenCalled()
  })

  it('shows diffs for a new file and an edit without confirmation', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'Two files are ready.',
        proposals: [],
        applied: [
          {
            kind: 'create',
            relativePath: 'src/auth.ts',
            summary: 'Add login.',
            updated: 'export function login() {}\n',
            lines: [{ id: 'l0', type: 'added', content: 'export function login() {}', newLine: 1 }],
          },
          {
            kind: 'edit',
            relativePath: 'src/main.ts',
            summary: 'Call login.',
            updated: 'login()\n',
            lines: [{ id: 'l0', type: 'added', content: 'login()', newLine: 1 }],
          },
        ],
      },
    })
    refreshAppliedFile.mockReturnValue('closed')
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Add login and call it.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Created src/auth.ts. Open it from the explorer to view the new file.')).toBeTruthy()
    expect(screen.getByText('Updated src/main.ts')).toBeTruthy()
    expect(screen.getByText('export function login() {}')).toBeTruthy()
    expect(screen.getByText('login()')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create file' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply edit' })).toBeNull()
    expect(apply).not.toHaveBeenCalled()
    expect(refreshAppliedFile).toHaveBeenCalledWith(projectId, 'src/auth.ts', 'export function login() {}\n')
    expect(refreshAppliedFile).toHaveBeenCalledWith(projectId, 'src/main.ts', 'login()\n')
  })

  it('confirms a delete and a move before updating the open tab', async () => {
    const moveId = '00000000-0000-4000-8000-000000000002'
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'The file changes are ready.',
        proposals: [
          {
            proposalId,
            projectId,
            generation: 2,
            kind: 'delete' as const,
            relativePath: 'src/old.ts',
            destinationPath: '',
            summary: 'Remove the old helper.',
            original: '',
            updated: '',
          },
          {
            proposalId: moveId,
            projectId,
            generation: 2,
            kind: 'rename' as const,
            relativePath: 'src/main.ts',
            destinationPath: 'lib/app.ts',
            summary: 'Move main into lib.',
            original: '',
            updated: '',
          },
        ],
        applied: [],
      },
    })
    apply
      .mockResolvedValueOnce({ ok: true, value: { projectId, generation: 2, relativePath: 'src/old.ts', destinationPath: '' } })
      .mockResolvedValueOnce({ ok: true, value: { projectId, generation: 2, relativePath: 'src/main.ts', destinationPath: 'lib/app.ts' } })
    closeDeletedFile.mockReturnValue('closed')
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Delete the helper and move main.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('This file will be deleted.')).toBeTruthy()
    expect(screen.getAllByText('src/main.ts → lib/app.ts').length).toBeGreaterThan(0)
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }))
    await screen.findByText('Deleted src/old.ts.')
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ proposalId, confirmed: true })
    expect(closeDeletedFile).toHaveBeenCalledWith(projectId, 'src/old.ts')
    expect(refreshAppliedFile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Move file' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Move file' }))
    await screen.findByText('Moved src/main.ts to lib/app.ts.')
    expect(renameAppliedFile).toHaveBeenCalledWith(projectId, 'src/main.ts', 'lib/app.ts')
    expect(apply).toHaveBeenCalledTimes(2)
  })

  it('confirms deletion of one empty folder', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'The empty folder can be removed.',
        proposals: [{
          proposalId,
          projectId,
          generation: 2,
          kind: 'delete-directory' as const,
          relativePath: 'notes',
          destinationPath: '',
          summary: 'Remove the empty notes folder.',
          original: '',
          updated: '',
        }],
        applied: [],
      },
    })
    apply.mockResolvedValue({ ok: true, value: { projectId, generation: 2, relativePath: 'notes', destinationPath: '' } })
    cancel.mockResolvedValue({ ok: true, value: null })
    closeDeletedFile.mockReturnValue('absent')
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Delete the empty notes folder.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('This empty folder will be deleted.')).toBeTruthy()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete folder' }))
    await screen.findByText('Deleted notes.')
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ proposalId, confirmed: true })
    expect(closeDeletedFile).toHaveBeenCalledWith(projectId, 'notes')
    expect(refreshAppliedFile).not.toHaveBeenCalled()
  })

  it('says the old tab was closed when the destination tab kept unsaved edits', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'The rename is ready.',
        proposals: [{
          proposalId,
          projectId,
          generation: 2,
          kind: 'rename' as const,
          relativePath: 'src/from.ts',
          destinationPath: 'src/app.ts',
          summary: 'Rename the file.',
          original: '',
          updated: '',
        }],
        applied: [],
      },
    })
    apply.mockResolvedValue({
      ok: true,
      value: { projectId, generation: 2, relativePath: 'src/from.ts', destinationPath: 'src/app.ts' },
    })
    renameAppliedFile.mockReturnValue('conflict')
    cancel.mockResolvedValue({ ok: true, value: null })
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Rename the open file.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: 'Rename file' }))
    await screen.findByText('Renamed src/from.ts to src/app.ts. The old tab was closed. The open tab kept its unsaved edits.')
    expect(renameAppliedFile).toHaveBeenCalledWith(projectId, 'src/from.ts', 'src/app.ts')
  })

  it('blocks a rename before any write when the source and destination tabs are both dirty', async () => {
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'The rename is ready.',
        proposals: [{
          proposalId,
          projectId,
          generation: 2,
          kind: 'rename' as const,
          relativePath: 'src/from.ts',
          destinationPath: 'src/app.ts',
          summary: 'Rename the file.',
          original: '',
          updated: '',
        }],
        applied: [],
      },
    })
    sourceRenameBlocked.mockReturnValue(true)
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    fireEvent.change(input, { target: { value: 'Rename the open file.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(DIRTY_SOURCE_RENAME_MESSAGE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rename file' }))
    expect((await screen.findByRole('alert')).textContent).toBe(DIRTY_SOURCE_RENAME_MESSAGE)
    expect(apply).not.toHaveBeenCalled()
    expect(renameAppliedFile).not.toHaveBeenCalled()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Rename file' }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('shows a failed edit in the chat and keeps delete and rename behind confirmation', async () => {
    const failures = [
      {
        proposalId: '00000000-0000-4000-8000-000000000013',
        kind: 'delete' as const,
        relativePath: 'src/old.ts',
        destinationPath: '',
        button: 'Delete file',
        message: 'The file could not be deleted.',
      },
      {
        proposalId: '00000000-0000-4000-8000-000000000014',
        kind: 'rename' as const,
        relativePath: 'src/from.ts',
        destinationPath: 'src/feature/app.ts',
        button: 'Move file',
        message: 'The file could not be moved. Created folders could not be removed: src/feature: That folder is not empty.',
      },
    ]
    const writeFailures = [
      'The file could not be written. Created file could not be removed: src/new.ts: The file could not be removed.',
      'The edit could not be saved.',
    ]
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    let index = 0
    turn.mockImplementation(async () => ({
      ok: false as const,
      error: {
        code: 'PROCESS_FAILED' as const,
        message: writeFailures[index] ?? '',
        retryable: false,
      },
    }))
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    for (const message of writeFailures) {
      fireEvent.change(input, { target: { value: 'Write the file.' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message))
      index += 1
      await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    }
    expect(screen.queryByRole('button', { name: 'Create file' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Apply edit' })).toBeNull()
    expect(refreshAppliedFile).not.toHaveBeenCalled()
    turn.mockResolvedValue({
      ok: true,
      value: {
        turnId: proposalId,
        projectId,
        generation: 2,
        text: 'Delete and move still need confirmation.',
        proposals: failures.map((item) => ({
          proposalId: item.proposalId,
          projectId,
          generation: 2,
          kind: item.kind,
          relativePath: item.relativePath,
          destinationPath: item.destinationPath,
          summary: 'Review this change.',
          original: '',
          updated: '',
        })),
        applied: [],
      },
    })
    apply.mockImplementation(async (request) => ({
      ok: false as const,
      error: {
        code: 'PROCESS_FAILED' as const,
        message: failures.find((item) => item.proposalId === request.proposalId)?.message ?? '',
        retryable: false,
      },
    }))
    fireEvent.change(input, { target: { value: 'Prepare the changes.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    for (const item of failures) {
      fireEvent.click(await screen.findByRole('button', { name: item.button }))
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(item.message))
      await waitFor(() => expect((screen.getByRole('button', { name: item.button }) as HTMLButtonElement).disabled).toBe(false))
      expect(screen.getAllByText(item.relativePath === 'src/from.ts' ? 'src/from.ts → src/feature/app.ts' : item.relativePath).length).toBeGreaterThan(0)
    }
    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply.mock.calls.every((call) => call[0]?.confirmed === true)).toBe(true)
    expect(closeDeletedFile).not.toHaveBeenCalled()
    expect(renameAppliedFile).not.toHaveBeenCalled()
  })

  it('shows Gemini failures in the chat and stays quiet when the turn is cancelled', async () => {
    const failures = [
      'Gemini is not configured. Enable the existing Gemini key in Settings.',
      'The Gemini key was rejected. Check the key in Settings.',
      'Gemini could not complete the request because its quota or rate limit was reached.',
      'The project agent could not reach Gemini.',
      'The project agent model returned an invalid response.',
    ]
    session.mockResolvedValue({ ok: true, value: { projectId, generation: 2 } })
    let index = 0
    turn.mockImplementation(async () => ({
      ok: false,
      error: {
        code: 'PROCESS_FAILED' as const,
        message: failures[index] ?? '',
        retryable: false,
      },
    }))
    cancel.mockResolvedValue({ ok: true, value: null })
    window.studentIde = { agent: { session, turn, apply, cancel } } as StudentIdeApi
    render(<AiChatPanel mode="project" projectId={projectId} onClose={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Message the project' })
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    for (const message of failures) {
      fireEvent.change(input, { target: { value: 'Ask about this project.' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(message))
      index += 1
      await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
    }
    turn.mockResolvedValue({
      ok: false,
      error: {
        code: 'PROCESS_CANCELLED',
        message: 'The project agent turn was cancelled.',
        retryable: false,
      },
    })
    fireEvent.change(input, { target: { value: 'Stop this one.' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText('Stop this one.')).toBeTruthy()
    await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false))
  })
})

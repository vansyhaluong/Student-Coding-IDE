/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ProjectId } from '../../src/shared/contracts'
import { CSHARP_LS_CAPABILITIES, type LanguageStatus } from '../../src/shared/contracts/language'
import { CsharpStatus } from '../../src/renderer/src/features/language/csharp/CsharpStatus'
import { csharpStatusStore } from '../../src/renderer/src/features/language/csharp/csharp-status-store'

afterEach(() => { cleanup(); csharpStatusStore.set(null, null) })
it('5.5G exposes separate safe status details, removes old-project status and adds no repair controls', () => {
  const projectId = 'project_1234567890abcdef12345678' as ProjectId
  const status: LanguageStatus = { providerId: 'csharp-ls', capabilities: CSHARP_LS_CAPABILITIES,
    effectiveCapabilities: [], completionResolve: false, completionTriggers: [], signatureTriggers: [], signatureRetriggers: [],
    dependency: { state: 'AVAILABLE', reason: null, warnings: [] }, workspace: { state: 'READY', mode: 'project' },
    service: { state: 'STARTING', reason: null } }
  csharpStatusStore.set(projectId, status)
  const view = render(<CsharpStatus projectId={projectId} />)
  expect(screen.getAllByText('C# language service starting')[0]).not.toBeNull()
  expect(screen.getByRole('status').getAttribute('title')).toContain('C# workspace preflight passed')
  act(() => csharpStatusStore.set(projectId, { ...status, service: { state: 'CRASHED', reason: null } }))
  expect(screen.getAllByText('C# language service crashed')[0]).not.toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  view.rerender(<CsharpStatus projectId={'project_abcdef1234567890abcdef12' as ProjectId} />)
  expect(screen.queryByRole('status')).toBeNull()
})

const project = 'project_1234567890abcdef12345678' as ProjectId
const selection: LanguageStatus = { providerId: 'csharp-ls', capabilities: CSHARP_LS_CAPABILITIES,
  effectiveCapabilities: [], completionResolve: false, completionTriggers: [], signatureTriggers: [], signatureRetriggers: [],
  dependency: { state: 'AVAILABLE', reason: null, warnings: [] }, service: { state: 'STOPPED', reason: null },
  workspace: { state: 'SELECTION_REQUIRED', candidates: [{ kind: 'solution', relativePath: 'App.sln' }, { kind: 'solution', relativePath: 'Other.slnx' }] } }
function showSelection(api: Parameters<typeof CsharpStatus>[0]['api']) {
  csharpStatusStore.set(project, selection)
  const view = render(<CsharpStatus projectId={project} api={api} />)
  fireEvent.click(view.container.querySelector('summary')!)
  return view
}
it('selects only a supplied solution, disables during loading and displays the resulting state', async () => {
  let resolve!: (result: Awaited<ReturnType<NonNullable<Parameters<typeof CsharpStatus>[0]['api']>['selectWorkspace']>>) => void
  const api = { selectWorkspace: vi.fn(() => new Promise<Parameters<typeof resolve>[0]>(done => { resolve = done })) }
  const view = showSelection(api)
  fireEvent.change(screen.getByLabelText('C# solution'), { target: { value: 'Other.slnx' } })
  expect(api.selectWorkspace).toHaveBeenCalledWith({ projectId: project, candidate: { kind: 'solution', relativePath: 'Other.slnx' } })
  expect((screen.getByLabelText('C# solution') as HTMLSelectElement).disabled).toBe(true)
  expect(screen.getByText('Loading C# solution…')).not.toBeNull()
  await act(async () => resolve({ ok: true, value: { ...selection, workspace: { state: 'READY', mode: 'solution', selected: { kind: 'solution', relativePath: 'Other.slnx' } }, service: { state: 'RUNNING', reason: null } } }))
  expect(screen.queryByLabelText('C# solution')).toBeNull()
  expect(screen.getAllByText('C# language service running')).toHaveLength(2)
  fireEvent.keyDown(view.container.querySelector('details')!, { key: 'Escape' })
  expect(view.container.querySelector('details')!.open).toBe(false)
})
it('keeps a bounded selection error visible and allows retry', async () => {
  const api = { selectWorkspace: vi.fn(async () => { throw Error('private provider log') }) }
  showSelection(api)
  fireEvent.change(screen.getByLabelText('C# solution'), { target: { value: 'App.sln' } })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Choose it again to retry'))
  expect(screen.queryByText('private provider log')).toBeNull()
  expect((screen.getByLabelText('C# solution') as HTMLSelectElement).disabled).toBe(false)
})
it('does not restore stale status when selection resolves after a project change', async () => {
  let resolve!: (result: { ok: true; value: LanguageStatus }) => void
  const api = { selectWorkspace: vi.fn(() => new Promise<{ ok: true; value: LanguageStatus }>(done => { resolve = done })) }
  showSelection(api)
  fireEvent.change(screen.getByLabelText('C# solution'), { target: { value: 'App.sln' } })
  act(() => csharpStatusStore.set(null, null))
  await act(async () => resolve({ ok: true, value: selection }))
  expect(csharpStatusStore.getSnapshot()).toBeNull()
})

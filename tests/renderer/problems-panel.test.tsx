/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createProviderDiagnosticBatch } from '../../src/renderer/src/features/language/diagnostic-identity'
import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'
import { ProblemsPanel } from '../../src/renderer/src/features/problems/ProblemsPanel'
import { ProblemsStore } from '../../src/renderer/src/features/problems/problems-store'
import type { ProjectIdentity } from '../../src/shared/contracts'

const project = {
  id: 'project_1234567890abcdef12345678',
  name: 'Demo',
} as ProjectIdentity

afterEach(cleanup)

describe('Phase 3E Problems panel', () => {
  it('shows the neutral empty state without claiming unsupported languages are clean', () => {
    const store = new ProblemsStore()
    store.activateProject(project.id)
    renderPanel(store)
    expect(screen.getByText('No reported problems')).not.toBeNull()
    expect(screen.queryByText(/error-free/i)).toBeNull()
  })

  it('renders grouped files, severity/source/location, counts, and forwards navigation', () => {
    const store = new ProblemsStore()
    store.activateProject(project.id)
    add(store, 'src/app.ts', 'error', 'Type mismatch', 12, 4)
    add(store, 'styles.css', 'warning', 'Property value expected', 8, 2, 'monaco-css')
    const onNavigate = vi.fn()
    renderPanel(store, onNavigate)

    expect(screen.getByText('src/app.ts')).not.toBeNull()
    expect(screen.getAllByText('styles.css').length).toBe(2)
    expect(screen.getByLabelText('Error')).not.toBeNull()
    expect(screen.getByLabelText('Warning')).not.toBeNull()
    expect(screen.getByText('Ln 12, Col 4')).not.toBeNull()
    expect(screen.getAllByText('test-provider').length).toBe(2)
    fireEvent.click(screen.getByText('Type mismatch'))
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({
      projectId: project.id,
      relativePath: 'src/app.ts',
      range: expect.objectContaining({ startLineNumber: 12, startColumn: 4 }),
    }))
  })

  it('updates after diagnostic removal and exposes the existing Bottom Panel switch', () => {
    const store = new ProblemsStore()
    store.activateProject(project.id)
    add(store, 'main.js', 'info', 'Information', 1, 1)
    const onSelectTerminal = vi.fn()
    const view = renderPanel(store, vi.fn(), onSelectTerminal)
    expect(screen.getByText('Information')).not.toBeNull()

    const uri = projectDocumentUri(project.id, 'main.js')
    const identity = store.captureIdentity('monaco-typescript', uri, 2)!
    store.replace('main.js', createProviderDiagnosticBatch(identity, []))
    view.rerender(panel(store, vi.fn(), onSelectTerminal))
    expect(screen.getByText('No reported problems')).not.toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    expect(onSelectTerminal).toHaveBeenCalledOnce()
  })
})

function renderPanel(
  store: ProblemsStore,
  onNavigate = vi.fn(),
  onSelectTerminal = vi.fn(),
) {
  return render(panel(store, onNavigate, onSelectTerminal))
}

function panel(store: ProblemsStore, onNavigate: (problem: never) => void, onSelectTerminal: () => void) {
  return <ProblemsPanel
    store={store}
    project={project}
    height={260}
    onHeightChange={vi.fn()}
    onSelectTerminal={onSelectTerminal}
    onClosePanel={vi.fn()}
    onNavigate={onNavigate}
    interactionLocked={false}
  />
}

function add(
  store: ProblemsStore,
  relativePath: string,
  severity: 'error' | 'warning' | 'info',
  message: string,
  line: number,
  column: number,
  providerId: 'monaco-typescript' | 'monaco-css' = 'monaco-typescript',
): void {
  const uri = projectDocumentUri(project.id, relativePath)
  const identity = store.captureIdentity(providerId, uri, 1)!
  store.replace(relativePath, createProviderDiagnosticBatch(identity, [{
    severity,
    message,
    source: 'test-provider',
    range: {
      startLineNumber: line,
      startColumn: column,
      endLineNumber: line,
      endColumn: column + 2,
    },
  }]))
}

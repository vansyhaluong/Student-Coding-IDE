import { Folder, FolderOpen, FolderPlus, Search, SquareTerminal, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import type { ProjectIdentity } from '../../shared/contracts'
import { SidebarResizer } from './components/SidebarResizer'
import { Button } from './components/ui/Button'
import { Dialog, PromptDialog } from './components/ui/Dialog'
import { EditorTabs } from './features/editor/EditorTabs'
import { EditorWorkbench } from './features/editor/EditorWorkbench'
import { editorModelManager } from './features/editor/editor-session'
import {
  useEditorWorkspace,
  type TerminalTransitionDialogState,
  type UnsavedChoice,
} from './features/editor/use-editor-workspace'
import { ProjectExplorer } from './features/explorer/ProjectExplorer'
import { SearchPanel } from './features/search/SearchPanel'
import { TerminalPanel } from './features/terminal/TerminalPanel'
import { terminalController } from './features/terminal/terminal-session'

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 220
const MAX_LEFT_SIDEBAR_WIDTH = 500
const MIN_EDITOR_WIDTH = 360
const DEFAULT_TERMINAL_HEIGHT = 260

export default function App() {
  const [project, setProject] = useState<ProjectIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'explorer' | 'search'>('explorer')
  const [leftWidth, setLeftWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [rightWidth, setRightWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalOpenRequest, setTerminalOpenRequest] = useState(0)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const projectGeneration = useRef(0)
  const sidebarWidths = useRef({ left: leftWidth, right: rightWidth })
  sidebarWidths.current = { left: leftWidth, right: rightWidth }
  const editor = useEditorWorkspace(project, editorModelManager)

  useEffect(() => {
    let active = true
    const initialGeneration = projectGeneration.current
    void window.studentIde.project.getActive().then((result) => {
      if (!active || initialGeneration !== projectGeneration.current) return
      if (result.ok) setProject(result.value)
      else setError(result.error.message)
      setLoading(false)
    })
    const unsubscribe = window.studentIde.project.onChanged(({ activeProject }) => {
      projectGeneration.current += 1
      terminalController.reconcileProject(activeProject?.id ?? null)
      setProject(activeProject)
      setError(null)
      setLoading(false)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const fitSidebarsToWindow = (): void => {
      const availableForSidebars = Math.max(
        MIN_SIDEBAR_WIDTH * 2,
        window.innerWidth - MIN_EDITOR_WIDTH,
      )
      let nextLeft = Math.min(MAX_LEFT_SIDEBAR_WIDTH, sidebarWidths.current.left)
      let nextRight = Math.min(
        sidebarWidths.current.right,
        Math.max(MIN_SIDEBAR_WIDTH, availableForSidebars - nextLeft),
      )
      nextLeft = Math.min(
        nextLeft,
        Math.max(MIN_SIDEBAR_WIDTH, availableForSidebars - nextRight),
      )
      nextRight = Math.min(nextRight, availableForSidebars - nextLeft)
      setLeftWidth(nextLeft)
      setRightWidth(nextRight)
    }
    fitSidebarsToWindow()
    window.addEventListener('resize', fitSidebarsToWindow)
    return () => window.removeEventListener('resize', fitSidebarsToWindow)
  }, [])

  const openProject = async (): Promise<void> => {
    const requestGeneration = projectGeneration.current
    setLoading(true)
    setError(null)
    const result = await window.studentIde.project.open()
    if (requestGeneration !== projectGeneration.current) return
    if (!result.ok) setError(result.error.message)
    else if (result.value) setProject(result.value)
    setLoading(false)
  }

  const createProject = async (name: string): Promise<void> => {
    setCreateDialogOpen(false)
    const requestGeneration = projectGeneration.current
    setLoading(true)
    setError(null)
    const result = await window.studentIde.project.create(name)
    if (requestGeneration !== projectGeneration.current) return
    if (!result.ok) setError(result.error.message)
    else if (result.value) setProject(result.value)
    setLoading(false)
  }

  const closeProject = async (): Promise<void> => {
    const requestGeneration = projectGeneration.current
    setLoading(true)
    setError(null)
    const result = await window.studentIde.project.close()
    if (requestGeneration !== projectGeneration.current) return
    if (!result.ok) setError(result.error.message)
    else setProject(null)
    setLoading(false)
  }

  const leftMaximum = useCallback(() => Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_LEFT_SIDEBAR_WIDTH, window.innerWidth - rightWidth - MIN_EDITOR_WIDTH),
  ), [rightWidth])
  const rightMaximum = useCallback(() => Math.max(
    MIN_SIDEBAR_WIDTH,
    window.innerWidth - leftWidth - MIN_EDITOR_WIDTH,
  ), [leftWidth])
  const shellStyle = {
    '--projects-width': `${leftWidth}px`,
    '--tools-width': `${rightWidth}px`,
  } as CSSProperties
  const selectSidebarTab = (tab: 'explorer' | 'search'): void => {
    setSidebarTab(tab)
    requestAnimationFrame(() => document.getElementById(`${tab}-sidebar-tab`)?.focus())
  }
  const toggleTerminal = (): void => {
    setTerminalOpen((currentlyOpen) => {
      if (!currentlyOpen) setTerminalOpenRequest((request) => request + 1)
      return !currentlyOpen
    })
  }

  return (
    <main className="ide-shell" style={shellStyle}>
      <header className="app-chrome">
        <div className="chrome-left">
          <div className="app-identity">
            <span className="app-mark" aria-hidden="true">S</span>
            <span>Student Coding IDE</span>
          </div>
        </div>
        <div className="chrome-center">
          {project
            ? <EditorTabs manager={editor.manager} onClose={editor.closeDocument} />
            : <span className="chrome-context">Student Coding IDE</span>}
        </div>
        <div className="chrome-right">
          <span className="chrome-tool-label" title="Project tools">
            <Folder />
            <span>{project?.name ?? 'Project tools'}</span>
          </span>
        </div>
      </header>

      <div className="workbench">
        <aside className="project-sidebar" aria-label="Project">
          <header className="panel-header">
            <h1>Projects</h1>
            <div className="panel-header-actions" aria-label="Project actions">
              <Button
                variant="ghost"
                size="iconSmall"
                onClick={() => void openProject()}
                disabled={loading}
                title={project ? 'Switch project' : 'Open project'}
                aria-label={project ? 'Switch project' : 'Open project'}
              ><FolderOpen /></Button>
              <Button
                variant="ghost"
                size="iconSmall"
                onClick={() => setCreateDialogOpen(true)}
                disabled={loading}
                title="Create project"
                aria-label="Create project"
              ><FolderPlus /></Button>
            </div>
          </header>

          {loading && <p className="project-status">Loading project…</p>}
          {error && <p className="project-error" role="alert">{error}</p>}

          {project ? (
            <div className="active-project-row" data-current="true">
              <span className="project-status-dot active" aria-hidden="true" />
              <Folder className="project-icon" />
              <span className="active-project-copy" title={project.name}>
                <strong>{project.name}</strong>
                <small>Active workspace</small>
              </span>
              <Button
                variant="ghost"
                size="iconSmall"
                onClick={() => void closeProject()}
                disabled={loading}
                title="Close project"
                aria-label="Close project"
              ><X /></Button>
            </div>
          ) : !loading && (
            <p className="project-empty">No folder is currently open.</p>
          )}
          <SidebarResizer side="left" width={leftWidth} onResize={setLeftWidth} getMaximum={leftMaximum} />
        </aside>

        <section className="preview-surface" aria-label="Editor area">
          <div className="editor-region">
            {project ? (
              <EditorWorkbench
                manager={editor.manager}
                onSave={editor.save}
                navigation={editor.navigation}
              />
            ) : (
              <div className="preview-empty">
                <FolderOpen className="workspace-empty-icon" />
                <p>Open a project to start coding</p>
                <span>Your files and editor tabs will appear here.</span>
                <div className="workspace-empty-actions">
                  <Button variant="primary" size="small" onClick={() => void openProject()} disabled={loading}>
                    Open project
                  </Button>
                  <Button size="small" onClick={() => setCreateDialogOpen(true)} disabled={loading}>
                    Create project
                  </Button>
                </div>
              </div>
            )}
          </div>
          <TerminalPanel
            controller={terminalController}
            project={project}
            open={terminalOpen}
            openRequest={terminalOpenRequest}
            height={terminalHeight}
            onHeightChange={setTerminalHeight}
            onClosePanel={() => setTerminalOpen(false)}
          />
        </section>

        <aside className="explorer-sidebar" aria-label="Project tools">
          <SidebarResizer side="right" width={rightWidth} onResize={setRightWidth} getMaximum={rightMaximum} />
          <div className="sidebar-tabs" role="tablist" aria-label="Project tools">
            <button
              type="button"
              id="explorer-sidebar-tab"
              role="tab"
              aria-selected={sidebarTab === 'explorer'}
              aria-controls="explorer-sidebar-panel"
              onClick={() => setSidebarTab('explorer')}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') selectSidebarTab('search')
              }}
            ><Folder /><span>Explorer</span></button>
            <button
              type="button"
              id="search-sidebar-tab"
              role="tab"
              aria-selected={sidebarTab === 'search'}
              aria-controls="search-sidebar-panel"
              onClick={() => setSidebarTab('search')}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') selectSidebarTab('explorer')
              }}
            ><Search /><span>Search</span></button>
          </div>
          <div
            id="explorer-sidebar-panel"
            className="sidebar-panel"
            role="tabpanel"
            aria-labelledby="explorer-sidebar-tab"
            hidden={sidebarTab !== 'explorer'}
          >
            {project ? (
              <ProjectExplorer
                key={project.id}
                project={project}
                onOpenFile={(path) => void editor.openFile(path)}
                onRenamed={editor.renamed}
                onRequestDelete={editor.requestDelete}
              />
            ) : (
              <section className="explorer-panel" aria-label="Project Explorer">
                <div className="explorer-toolbar">
                  <div className="explorer-project-name muted">
                    <Folder className="tree-entry-icon folder" />
                    <span>No project</span>
                  </div>
                </div>
                <div className="explorer-empty">Open a project to browse files.</div>
              </section>
            )}
          </div>
          <div
            id="search-sidebar-panel"
            className="sidebar-panel"
            role="tabpanel"
            aria-labelledby="search-sidebar-tab"
            hidden={sidebarTab !== 'search'}
          >
            <SearchPanel
              project={project}
              onNavigate={(match) => void editor.navigateToSearchMatch(match)}
            />
          </div>
        </aside>
      </div>

      <footer className="status-bar">
        <span className="status-primary">
          <span className={`status-dot${project ? ' active' : ''}`} aria-hidden="true" />
          {loading ? 'Loading…' : project ? project.name : 'No project open'}
        </span>
        <span className="status-actions">
          <span>{error || editor.error ? 'Action failed' : 'Ready'}</span>
          <button
            type="button"
            className="status-terminal-toggle"
            aria-label={terminalOpen ? 'Hide Terminal' : 'Open Terminal'}
            aria-expanded={terminalOpen}
            onClick={toggleTerminal}
          ><SquareTerminal /><span>Terminal</span></button>
        </span>
      </footer>

      {createDialogOpen && (
        <PromptDialog
          title="Create project"
          description="Create a new folder and open it as the active project."
          label="Project name"
          submitLabel="Create project"
          onSubmit={(name) => void createProject(name)}
          onCancel={() => setCreateDialogOpen(false)}
        />
      )}
      {editor.dialog && <UnsavedDialog state={editor.dialog} onChoose={editor.choose} />}
      {editor.terminalTransitionDialog && (
        <TerminalTransitionDialog
          state={editor.terminalTransitionDialog}
          onChoose={editor.chooseTerminalTransition}
        />
      )}
      {editor.error && <div className="editor-error" role="alert">{editor.error}</div>}
    </main>
  )
}

function TerminalTransitionDialog({
  state,
  onChoose,
}: {
  state: TerminalTransitionDialogState
  onChoose(proceed: boolean): void
}) {
  const cancel = useCallback(() => onChoose(false), [onChoose])
  return (
    <Dialog
      title="Close running terminals?"
      label="Close running terminals?"
      description={state.reason === 'project-close'
        ? 'This project has running terminal sessions. They must be closed before closing the project.'
        : 'This project has running terminal sessions. They must be closed before switching projects.'}
      onCancel={cancel}
      actions={(
        <>
          <Button data-dialog-primary="true" onClick={cancel}>Cancel</Button>
          <Button variant="destructive" onClick={() => onChoose(true)}>
            Close Terminals &amp; Continue
          </Button>
        </>
      )}
    />
  )
}

function UnsavedDialog({
  state,
  onChoose,
}: {
  state: NonNullable<ReturnType<typeof useEditorWorkspace>['dialog']>
  onChoose(choice: UnsavedChoice): void
}) {
  const multiple = state.mode === 'multiple'
  const cancel = useCallback(() => onChoose('cancel'), [onChoose])
  return (
    <Dialog
      title="Unsaved changes"
      label="Unsaved changes"
      description={multiple
        ? 'Save all affected files before continuing?'
        : 'Save this file before continuing?'}
      onCancel={cancel}
      actions={(
        <>
          <Button variant="ghost" onClick={cancel}>Cancel</Button>
          <Button variant="destructive" onClick={() => onChoose('discard')}>
            {multiple ? "Don't Save All" : "Don't Save"}
          </Button>
          <Button variant="primary" data-dialog-primary="true" onClick={() => onChoose('save')}>
            {multiple ? 'Save All' : 'Save'}
          </Button>
        </>
      )}
    >
      <ul className="dialog-file-list">
        {state.documents.map((document) => (
          <li key={document.key}>{document.relativePath}</li>
        ))}
      </ul>
    </Dialog>
  )
}
// test fast refresh

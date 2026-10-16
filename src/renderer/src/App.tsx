import { useSettings, useTheme } from './features/settings/use-settings'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { RecentProjects } from './features/settings/RecentProjects'
import { shellShortcut } from './features/settings/shortcuts'
import { AutoSave } from './features/editor/auto-save'
import { registerCsharpNavigation } from './features/language/csharp/csharp-navigation'
import { CsharpStatus } from './features/language/csharp/CsharpStatus'
import { Files, Folder, FolderOpen, FolderPlus, GitBranch, ListChecks, Settings, Sparkles, SquareTerminal, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import type { AppResult, GitStatus, ProjectIdentity, ProjectId } from '../../shared/contracts'
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
import { AiChatPanel } from './features/ai/AiChatPanel'
import { useProjectLanguage } from './features/language/use-project-language'
import { ProblemsPanel } from './features/problems/ProblemsPanel'
import { problemsStore } from './features/problems/problems-session'
import { useProjectProblems } from './features/problems/use-project-problems'
import { SearchPanel } from './features/search/SearchPanel'
import { SourceControl } from './features/git/SourceControl'
import { TerminalPanel } from './features/terminal/TerminalPanel'
import { terminalController } from './features/terminal/terminal-session'
import { EditorRunAction } from './features/output/EditorRunAction'
import { OutputPanel } from './features/output/OutputPanel'
import { useProjectRun } from './features/output/use-project-run'

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 220
const MAX_LEFT_SIDEBAR_WIDTH = 500
const MIN_EDITOR_WIDTH = 360
const DEFAULT_TERMINAL_HEIGHT = 260

export default function App() {
  const preferences = useSettings()
  const dark = useTheme(preferences.settings.theme)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const [project, setProject] = useState<ProjectIdentity | null>(null)
  const [gitDecorationSnapshot, setGitDecorationSnapshot] = useState<{ project: ProjectIdentity; status: GitStatus | null } | null>(null)
  const publishGitSnapshot = useCallback((owner: ProjectIdentity, status: GitStatus | null) => {
    setGitDecorationSnapshot({ project: owner, status })
  }, [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'explorer' | 'git'>('explorer')
  const [leftWidth, setLeftWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [rightWidth, setRightWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [bottomPanel, setBottomPanel] = useState<'terminal' | 'problems' | 'output' | null>(null)
  const [terminalOpenRequest, setTerminalOpenRequest] = useState(0)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const projectGeneration = useRef(0)
  const sidebarWidths = useRef({ left: leftWidth, right: rightWidth })
  sidebarWidths.current = { left: leftWidth, right: rightWidth }
  const editor = useEditorWorkspace(project, editorModelManager)
  const saveContext = useRef(editor)
  saveContext.current = editor
  useEffect(() => {
    if (!preferences.settings.autoSave) return
    const scheduler = new AutoSave(editorModelManager, key => saveContext.current.save(key, true),
      () => !saveContext.current.interactionLocked && !saveContext.current.fileSystemUnavailable,
      () => saveContext.current.reportAutoSaveError())
    return () => scheduler.dispose()
  }, [preferences.settings.autoSave, project?.id])
  const run = useProjectRun(project, editor.fileSystemUnavailable)
  useProjectLanguage(project, editorModelManager)
  useProjectProblems(project)
  useEffect(() => registerCsharpNavigation(editor.navigateToLocation), [editor.navigateToLocation])

  useEffect(() => {
    let active = true
    const initialGeneration = projectGeneration.current
    void window.studentIde.project.getActive().then((result) => {
      if (!active || initialGeneration !== projectGeneration.current) return
      if (result.ok) setProject(result.value)
      else setError(result.error.message)
      setLoading(false)
    }).catch(() => {
      if (!active || initialGeneration !== projectGeneration.current) return
      setError('The application request could not be completed.')
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

  const openProject = async (recentId?: ProjectId): Promise<void> => {
    if (editor.interactionLocked) return
    const requestGeneration = projectGeneration.current
    setLoading(true)
    setError(null)
    let completedAuthoritatively = false
    try {
      const result = await (recentId ? window.studentIde.project.openRecent(recentId) : window.studentIde.project.open())
      completedAuthoritatively = !isAmbiguousBoundaryFailure(result)
      if (requestGeneration !== projectGeneration.current) return
      if (!result.ok) {
        if (!isExpectedProjectTransitionCancellation(result)) setError(result.error.message)
      } else if (result.value) setProject(result.value)
    } catch {
      if (requestGeneration === projectGeneration.current) {
        setError('The application request could not be completed.')
      }
    } finally {
      if (completedAuthoritatively) editor.releaseProjectTransitionLock()
      if (requestGeneration === projectGeneration.current) setLoading(false)
    }
  }

  const createProject = async (name: string): Promise<void> => {
    if (editor.interactionLocked) return
    setCreateDialogOpen(false)
    const requestGeneration = projectGeneration.current
    setLoading(true)
    setError(null)
    let completedAuthoritatively = false
    try {
      const result = await window.studentIde.project.create(name)
      completedAuthoritatively = !isAmbiguousBoundaryFailure(result)
      if (requestGeneration !== projectGeneration.current) return
      if (!result.ok) {
        if (!isExpectedProjectTransitionCancellation(result)) setError(result.error.message)
      } else if (result.value) setProject(result.value)
    } catch {
      if (requestGeneration === projectGeneration.current) {
        setError('The application request could not be completed.')
      }
    } finally {
      if (completedAuthoritatively) editor.releaseProjectTransitionLock()
      if (requestGeneration === projectGeneration.current) setLoading(false)
    }
  }

  const closeProject = async (): Promise<void> => {
    if (editor.interactionLocked) return
    const requestGeneration = projectGeneration.current
    setLoading(true)
    setError(null)
    let completedAuthoritatively = false
    try {
      const result = await window.studentIde.project.close()
      completedAuthoritatively = !isAmbiguousBoundaryFailure(result)
      if (requestGeneration !== projectGeneration.current) return
      if (!result.ok) {
        if (!isExpectedProjectTransitionCancellation(result)) setError(result.error.message)
      } else setProject(null)
    } catch {
      if (requestGeneration === projectGeneration.current) {
        setError('The application request could not be completed.')
      }
    } finally {
      if (completedAuthoritatively) editor.releaseProjectTransitionLock()
      if (requestGeneration === projectGeneration.current) setLoading(false)
    }
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
  const selectSidebarTab = (tab: 'explorer' | 'git'): void => {
    setSidebarTab(tab)
    requestAnimationFrame(() => document.getElementById(`${tab}-sidebar-tab`)?.focus())
  }
  const toggleTerminal = (): void => {
    setBottomPanel((current) => {
      if (current !== 'terminal') setTerminalOpenRequest((request) => request + 1)
      return current === 'terminal' ? null : 'terminal'
    })
  }
  const toggleProblems = (): void => {
    setBottomPanel((current) => current === 'problems' ? null : 'problems')
  }

  useEffect(() => {
    const receive = (event: KeyboardEvent) => {
      const action = shellShortcut(event, !!document.querySelector('[role="dialog"][aria-modal="true"]'))
      if (!action || loading || editor.interactionLocked) return
      if (action === 'terminal') { event.preventDefault(); event.stopPropagation(); toggleTerminal(); return }
      if (action === 'open') { event.preventDefault(); void openProject(); return }
      if (!project || editor.fileSystemUnavailable) return
      event.preventDefault()
      setSidebarTab('explorer')
      requestAnimationFrame(() => {
        if (action === 'new') document.querySelector<HTMLButtonElement>('[aria-label="New file"]')?.click()
        else {
          document.getElementById('search-mode-contents')?.click()
          document.getElementById('project-search-input')?.focus()
        }
      })
    }
    window.addEventListener('keydown', receive, true)
    return () => window.removeEventListener('keydown', receive, true)
  })

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
            ? <><EditorTabs manager={editor.manager} onClose={editor.closeDocument} />
              <EditorRunAction manager={editor.manager} controller={run} locked={editor.interactionLocked}
                onShowOutput={() => setBottomPanel('output')} /></>
            : <span className="chrome-context">Student Coding IDE</span>}
        </div>
        <div className="chrome-right">
          <Button className="local-ai-toggle" variant="ghost" size="iconSmall"
            aria-label={aiOpen ? 'Close Local AI' : 'Open Local AI'}
            title={aiOpen ? 'Close Local AI' : 'Open Local AI'}
            aria-expanded={aiOpen} aria-controls="local-ai-panel"
            onClick={() => setAiOpen(open => !open)}><Sparkles /></Button>
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
                disabled={loading || editor.interactionLocked}
                title={project ? 'Switch project' : 'Open project'}
                aria-label={project ? 'Switch project' : 'Open project'}
              ><FolderOpen /></Button>
              <Button
                variant="ghost"
                size="iconSmall"
                onClick={() => {
                  if (!editor.interactionLocked) setCreateDialogOpen(true)
                }}
                disabled={loading || editor.interactionLocked}
                title="Create project"
                aria-label="Create project"
              ><FolderPlus /></Button>
            </div>
          </header>

          <div className="project-sidebar-content">
            {loading && <p className="project-status">Loading project…</p>}
            {error && <p className="project-error" role="alert">{error}</p>}

            {project ? (
              <div className="active-project-row" data-current="true">
                <span className="project-status-dot active" aria-hidden="true" />
                <Folder className="project-icon" />
                <span className="active-project-copy" title={project.name}>
                  <strong>{project.name}</strong>
                  <small>{editor.fileSystemUnavailable ? 'Project unavailable' : 'Active workspace'}</small>
                </span>
                <Button
                  variant="ghost"
                  size="iconSmall"
                  onClick={() => void closeProject()}
                  disabled={loading || editor.interactionLocked}
                  title="Close project"
                  aria-label="Close project"
                ><X /></Button>
              </div>
            ) : !loading && (
              <p className="project-empty">No folder is currently open.</p>
            )}
            <RecentProjects revision={project} disabled={loading || editor.interactionLocked} onOpen={openProject} />
          </div>
          <footer className="project-sidebar-footer">
            <Button
              className="sidebar-settings"
              variant="ghost"
              size="iconSmall"
              onClick={() => setSettingsOpen(true)}
              disabled={preferences.loading || editor.interactionLocked}
              title="Settings"
              aria-label="Settings"
            >
              <Settings aria-hidden="true" />
            </Button>
          </footer>
          <SidebarResizer side="left" width={leftWidth} onResize={setLeftWidth} getMaximum={leftMaximum} />
        </aside>

        <section className="preview-surface" aria-label="Editor area">
          <div className="editor-region">
            {project ? (
              <EditorWorkbench
                manager={editor.manager}
                settings={preferences.settings}
                dark={dark}
                onSave={editor.save}
                navigation={editor.navigation}
                readOnly={editor.interactionLocked || editor.fileSystemUnavailable}
              />
            ) : (
              <div className="preview-empty">
                <FolderOpen className="workspace-empty-icon" />
                <p>Open a project to start coding</p>
                <span>Your files and editor tabs will appear here.</span>
                <div className="workspace-empty-actions">
                  <Button variant="primary" size="small" onClick={() => void openProject()} disabled={loading || editor.interactionLocked}>
                    Open project
                  </Button>
                  <Button size="small" onClick={() => setCreateDialogOpen(true)} disabled={loading || editor.interactionLocked}>
                    Create project
                  </Button>
                </div>
              </div>
            )}
          </div>
          {bottomPanel === 'output' ? (
            <OutputPanel controller={run} height={terminalHeight} onHeightChange={setTerminalHeight}
              onSelectTerminal={() => {
                setTerminalOpenRequest((request) => request + 1)
                setBottomPanel('terminal')
              }}
              onSelectProblems={() => setBottomPanel('problems')}
              onClosePanel={() => setBottomPanel(null)} />
          ) : bottomPanel === 'problems' ? (
            <ProblemsPanel
              store={problemsStore}
              project={project}
              height={terminalHeight}
              onHeightChange={setTerminalHeight}
              onSelectTerminal={() => {
                setTerminalOpenRequest((request) => request + 1)
                setBottomPanel('terminal')
              }}
              onClosePanel={() => setBottomPanel(null)}
              onSelectOutput={() => setBottomPanel('output')}
              interactionLocked={editor.interactionLocked}
              onNavigate={(problem) => void editor.navigateToLocation({
                projectId: problem.projectId,
                relativePath: problem.relativePath,
                ...problem.range,
              })}
            />
          ) : (
            <TerminalPanel
              controller={terminalController}
              project={project}
              open={bottomPanel === 'terminal'}
              openRequest={terminalOpenRequest}
              height={terminalHeight}
              onHeightChange={setTerminalHeight}
              onSelectProblems={() => setBottomPanel('problems')}
              onSelectOutput={() => setBottomPanel('output')}
              onClosePanel={() => setBottomPanel(null)}
              interactionLocked={editor.interactionLocked}
            />
          )}
        </section>

        <aside className="explorer-sidebar" aria-label="Project tools">
          <SidebarResizer side="right" width={rightWidth} onResize={setRightWidth} getMaximum={rightMaximum} />
          <div className="project-tools-content" inert={aiOpen} aria-hidden={aiOpen || undefined}>
          <div className="sidebar-tabs" role="tablist" aria-label="Project tools">
            <button
              type="button"
              id="explorer-sidebar-tab"
              role="tab"
              aria-selected={sidebarTab === 'explorer'}
              aria-controls="explorer-sidebar-panel"
              aria-label="Explorer" title="Explorer"
              onClick={() => setSidebarTab('explorer')}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') selectSidebarTab('git')
              }}
            ><Files aria-hidden="true" /></button>
            <button
              type="button"
              id="git-sidebar-tab"
              role="tab"
              aria-selected={sidebarTab === 'git'}
              aria-controls="git-sidebar-panel"
              aria-label="Source Control" title="Source Control"
              onClick={() => setSidebarTab('git')}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') selectSidebarTab('explorer')
              }}
            ><GitBranch aria-hidden="true" /></button>
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
                interactionLocked={editor.interactionLocked || editor.fileSystemUnavailable}
                unavailable={editor.fileSystemUnavailable}
                gitStatus={gitDecorationSnapshot?.project === project && !editor.interactionLocked && !editor.fileSystemUnavailable
                  ? gitDecorationSnapshot.status : null}
                search={(tree) => <SearchPanel project={project} tree={tree} showProjectName={false}
                  onOpenFile={(path) => void editor.openFile(path)}
                  onNavigate={(match) => void editor.navigateToSearchMatch(match)}
                  interactionLocked={editor.interactionLocked || editor.fileSystemUnavailable} />}
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
            id="git-sidebar-panel"
            className="sidebar-panel"
            role="tabpanel"
            aria-labelledby="git-sidebar-tab"
            hidden={sidebarTab !== 'git'}
          >
            {project ? <SourceControl key={project.id} project={project} locked={editor.interactionLocked}
              unavailable={editor.fileSystemUnavailable} onSnapshot={publishGitSnapshot} /> : <p className="git-empty">Open a project to use Source Control.</p>}
          </div>
          </div>
          {aiOpen && <AiChatPanel onClose={() => setAiOpen(false)} />}
        </aside>
      </div>

      <footer className="status-bar">
        <span className="status-primary">
          <span className={`status-dot${project ? ' active' : ''}`} aria-hidden="true" />
          {editor.applicationState === 'STOPPING'
            ? 'Stopping…'
            : loading
              ? 'Loading…'
              : project
                ? editor.fileSystemUnavailable ? `${project.name} — unavailable` : project.name
                : 'No project open'}
        </span>
        <span className="status-actions">
          <CsharpStatus key={project?.id ?? 'none'} projectId={project?.id ?? null} />
          <span>{error || editor.error ? 'Action failed' : 'Ready'}</span>
          <button
            type="button"
            className="status-terminal-toggle"
            aria-label={bottomPanel === 'problems' ? 'Hide Problems' : 'Open Problems'}
            aria-expanded={bottomPanel === 'problems'}
            onClick={toggleProblems}
          ><ListChecks /><span>Problems</span></button>
          <button
            type="button"
            className="status-terminal-toggle"
            aria-label={bottomPanel === 'terminal' ? 'Hide Terminal' : 'Open Terminal'}
            aria-expanded={bottomPanel === 'terminal'}
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
          submitDisabled={editor.interactionLocked}
        />
      )}
      {editor.dialog && <UnsavedDialog state={editor.dialog} onChoose={editor.choose} />}
      {editor.terminalTransitionDialog && (
        <TerminalTransitionDialog
          state={editor.terminalTransitionDialog}
          onChoose={editor.chooseTerminalTransition}
        />
      )}
      {settingsOpen && <SettingsDialog value={preferences.settings} recovered={preferences.recovered} error={preferences.error} onSave={preferences.update} onClose={closeSettings} />}
      {!settingsOpen && preferences.recovered && <div className="editor-error" role="status">Application preferences were recovered. Open Settings to review them. Project files were not changed.</div>}
      {!settingsOpen && preferences.error && <div className="editor-error" role="alert">{preferences.error}</div>}
      {editor.error && <div className="editor-error" role="alert">{editor.error}</div>}
    </main>
  )
}

function isAmbiguousBoundaryFailure<T>(result: AppResult<T>): boolean {
  return !result.ok && (
    result.error.details?.boundaryFailure === 'transport'
    || result.error.details?.boundaryFailure === 'response-validation'
  )
}

function isExpectedProjectTransitionCancellation<T>(result: AppResult<T>): boolean {
  return !result.ok
    && result.error.code === 'PROCESS_CANCELLED'
    && result.error.message === 'The project transition was cancelled.'
    && (result.error.operation === 'project:close' || result.error.operation === 'project:switch')
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

import { useEffect, useRef, useState } from 'react'

import type { ProjectIdentity } from '../../shared/contracts'
import { ProjectExplorer } from './features/explorer/ProjectExplorer'

interface PreviewState {
  path: string
  content: string
}

interface IconProps {
  className?: string
}

function FolderIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.75 3.5h4l1.25 1.4h7.25v7.6H1.75z" />
    </svg>
  )
}

function FolderOpenIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.75 4V2.75h4l1.3 1.5h7.2V6" />
      <path d="m2.25 6.25 12-.02-1.55 6.02H.9z" />
    </svg>
  )
}

function FolderAddIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.75 3.5h4l1.25 1.4h7.25v7.6H1.75z" />
      <path d="M8 7v3.5M6.25 8.75h3.5" />
    </svg>
  )
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

export default function App() {
  const [project, setProject] = useState<ProjectIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const projectGeneration = useRef(0)

  useEffect(() => {
    let active = true
    const initialGeneration = projectGeneration.current
    void window.studentIde.project.getActive().then((result) => {
      if (
        !active
        || initialGeneration !== projectGeneration.current
      ) return
      if (result.ok) setProject(result.value)
      else setError(result.error.message)
      setLoading(false)
    })
    const unsubscribe = window.studentIde.project.onChanged(({ activeProject }) => {
      projectGeneration.current += 1
      setProject(activeProject)
      setPreview(null)
      setError(null)
      setLoading(false)
    })
    return () => {
      active = false
      unsubscribe()
    }
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

  const createProject = async (): Promise<void> => {
    const name = window.prompt('Project name')
    if (!name) return
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

  return (
    <main className="ide-shell">
      <header className="app-chrome">
        <div className="chrome-left">
          <div className="app-identity">
            <span>Student Coding IDE</span>
          </div>
        </div>
        <div className="chrome-center">
          {project && <span className="chrome-context">{project.name}</span>}
        </div>
        <div className="chrome-right">
          <span className="chrome-tool-label" title="Files" aria-label="Files">
            <FolderIcon className="chrome-tool-icon" />
          </span>
        </div>
      </header>

      <div className="workbench">
        <aside className="project-sidebar" aria-label="Project">
          <header className="panel-header">
            <h1>Projects</h1>
            <div className="panel-header-actions" aria-label="Project actions">
              <button
                onClick={() => void openProject()}
                disabled={loading}
                title={project ? 'Switch project' : 'Open project'}
                aria-label={project ? 'Switch project' : 'Open project'}
              >
                <FolderOpenIcon />
              </button>
              <button
                onClick={() => void createProject()}
                disabled={loading}
                title="Create project"
                aria-label="Create project"
              >
                <FolderAddIcon />
              </button>
            </div>
          </header>

          {loading && <p className="project-status">Loading project…</p>}
          {error && <p className="project-error" role="alert">{error}</p>}

          {project ? (
            <div className="active-project-row">
              <FolderIcon className="project-icon" />
              <span title={project.name}>{project.name}</span>
              <button
                className="icon-button"
                onClick={() => void closeProject()}
                disabled={loading}
                title="Close project"
                aria-label="Close project"
              >
                <CloseIcon />
              </button>
            </div>
          ) : !loading && (
            <p className="project-empty">No folder is currently open.</p>
          )}
        </aside>

        <section className="preview-surface" aria-label="File preview">
          {preview ? (
            <>
              <header className="preview-header">
                <span className="preview-label">Read-only preview</span>
                <h1 title={preview.path}>{preview.path}</h1>
              </header>
              <pre className="file-preview"><code>{preview.content}</code></pre>
            </>
          ) : (
            <div className="preview-empty">
              {project ? (
                <p>Select a file to preview</p>
              ) : (
                <>
                  <FolderOpenIcon className="workspace-empty-icon" />
                  <p>Open a project to get started</p>
                  <div className="workspace-empty-actions">
                    <button onClick={() => void openProject()} disabled={loading}>Open project</button>
                    <button onClick={() => void createProject()} disabled={loading}>Create project</button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <aside className="explorer-sidebar">
          {project ? (
            <ProjectExplorer
              key={project.id}
              project={project}
              onPreview={(path, content) => setPreview({ path, content })}
              onClearPreview={() => setPreview(null)}
            />
          ) : (
            <section className="explorer-panel" aria-label="Project Explorer">
              <div className="explorer-toolbar">
                <div className="explorer-project-name muted">
                  <FolderIcon className="tree-entry-icon folder" />
                  <span>No project</span>
                </div>
              </div>
              <div className="explorer-empty">No folder opened</div>
            </section>
          )}
        </aside>
      </div>

      <footer className="status-bar">
        <span className="status-primary">
          <span className={`status-dot${project ? ' active' : ''}`} aria-hidden="true" />
          {loading ? 'Loading…' : project ? project.name : 'No project open'}
        </span>
        <span>{error ? 'Project action failed' : 'Ready'}</span>
      </footer>
    </main>
  )
}

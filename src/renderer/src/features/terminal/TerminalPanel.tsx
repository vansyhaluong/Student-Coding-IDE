import { Plus, SquareTerminal, X } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import type { ProjectIdentity, TerminalSessionId } from '../../../../shared/contracts'
import { PanelResizer } from '../../components/PanelResizer'
import { Button } from '../../components/ui/Button'
import type { TerminalController } from './terminal-controller'

const MINIMUM_PANEL_HEIGHT = 160
const MINIMUM_EDITOR_HEIGHT = 180

interface TerminalPanelProps {
  controller: TerminalController
  project: ProjectIdentity | null
  open: boolean
  openRequest: number
  height: number
  onHeightChange(height: number): void
  onClosePanel(): void
  onSelectProblems?(): void
  onSelectOutput?(): void
  interactionLocked: boolean
}

export function TerminalPanel({
  controller,
  project,
  open,
  openRequest,
  height,
  onHeightChange,
  onClosePanel,
  onSelectProblems,
  onSelectOutput,
  interactionLocked,
}: TerminalPanelProps) {
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )
  const [activeId, setActiveId] = useState<TerminalSessionId | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const handledOpenRequest = useRef(0)
  const pendingFocus = useRef<TerminalSessionId | null>(null)
  const sessions = snapshot.sessions
  const active = sessions.find((session) => session.sessionId === activeId) ?? null

  useLayoutEffect(() => {
    controller.setInteractionLocked(interactionLocked)
  }, [controller, interactionLocked])

  useEffect(() => {
    if (active && sessions.some((session) => session.sessionId === active.sessionId)) return
    setActiveId(sessions.at(-1)?.sessionId ?? null)
  }, [active, sessions])

  useEffect(() => {
    if (!open || openRequest === handledOpenRequest.current) return
    handledOpenRequest.current = openRequest
    const surface = surfaceRef.current
    if (!surface) return
    const existingSessionId = activeId ?? sessions.at(-1)?.sessionId ?? null
    if (existingSessionId) {
      pendingFocus.current = existingSessionId
      if (!activeId) setActiveId(existingSessionId)
      return
    }
    if (interactionLocked || !project || snapshot.creating) return
    void controller.createSession(project.id, surface).then((sessionId) => {
      if (sessionId) {
        pendingFocus.current = sessionId
        setActiveId(sessionId)
      }
    })
  }, [activeId, controller, interactionLocked, open, openRequest, project, sessions, snapshot.creating])

  useLayoutEffect(() => {
    if (!open || !activeId || !surfaceRef.current) return
    const host = controller.getHost(activeId)
    if (!host) return
    surfaceRef.current.replaceChildren(host)
    controller.setSessionVisible(activeId, true)
    if (pendingFocus.current === activeId) {
      pendingFocus.current = null
      controller.focus(activeId)
    }
    return () => controller.setSessionVisible(activeId, false)
  }, [activeId, controller, open])

  const createTerminal = (): void => {
    if (interactionLocked) return
    const surface = surfaceRef.current
    if (!project || !surface || snapshot.creating) return
    void controller.createSession(project.id, surface).then((sessionId) => {
      if (sessionId) {
        pendingFocus.current = sessionId
        setActiveId(sessionId)
      }
    })
  }
  const selectTerminal = (sessionId: TerminalSessionId): void => {
    pendingFocus.current = sessionId
    setActiveId(sessionId)
  }
  const closeTerminal = async (sessionId: TerminalSessionId): Promise<void> => {
    if (interactionLocked) return
    const index = sessions.findIndex((session) => session.sessionId === sessionId)
    const closed = await controller.closeSession(sessionId)
    if (!closed || activeId !== sessionId) return
    const remaining = controller.getSnapshot().sessions
    const nextId = remaining[Math.min(index, remaining.length - 1)]?.sessionId ?? null
    pendingFocus.current = nextId
    setActiveId(nextId)
  }
  const maximumHeight = (): number => {
    const workbenchHeight = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight
    return Math.max(MINIMUM_PANEL_HEIGHT, workbenchHeight - MINIMUM_EDITOR_HEIGHT)
  }

  return (
    <section
      ref={panelRef}
      className="terminal-panel terminal-panel-compact"
      aria-label="Terminal panel"
      hidden={!open}
      style={{ height }}
    >
      <PanelResizer
        height={height}
        minimum={MINIMUM_PANEL_HEIGHT}
        getMaximum={maximumHeight}
        onResize={onHeightChange}
      />
      <header className="terminal-panel-header">
        <div className="bottom-panel-tabs" role="tablist" aria-label="Bottom panel">
          <button type="button" role="tab" aria-selected="true">
            <SquareTerminal aria-hidden="true" /><span>Terminal</span>
          </button>
          {onSelectProblems && (
            <button type="button" role="tab" aria-selected="false" onClick={onSelectProblems}>
              <span>Problems</span>
            </button>
          )}
          {onSelectOutput && <button type="button" role="tab" aria-selected="false" onClick={onSelectOutput}><span>Output</span></button>}
        </div>
        <div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="terminal-tab"
              data-state={session.state.toLowerCase()}
              data-active={session.sessionId === activeId ? 'true' : 'false'}
            >
              <button
                type="button"
                role="tab"
                aria-selected={session.sessionId === activeId}
                onClick={() => selectTerminal(session.sessionId)}
              >
                <span>{session.label}</span>
                {session.state !== 'RUNNING' && (
                  <small>{session.state === 'EXITED' ? 'exited' : session.state.toLowerCase()}</small>
                )}
              </button>
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`Close ${session.label}`}
                title={`Close ${session.label}`}
                disabled={interactionLocked || session.state === 'CLOSING'}
                onClick={() => void closeTerminal(session.sessionId)}
              ><X /></button>
            </div>
          ))}
        </div>
        <div className="terminal-panel-actions" aria-label="Terminal actions">
          <Button
            variant="ghost"
            size="iconSmall"
            onClick={createTerminal}
            disabled={interactionLocked || !project || snapshot.creating}
            title="New Terminal"
            aria-label="New Terminal"
          ><Plus /></Button>
          <Button
            variant="ghost"
            size="iconSmall"
            onClick={onClosePanel}
            title="Hide Terminal"
            aria-label="Hide Terminal"
          ><X /></Button>
        </div>
      </header>

      <div className="terminal-surface" ref={surfaceRef} />
      {!active && !snapshot.creating && (
        <div className="terminal-empty">
          <SquareTerminal aria-hidden="true" />
          <p>{project ? 'No terminal is open.' : 'Open a project to start a terminal.'}</p>
          {project && (
            <Button size="small" onClick={createTerminal} disabled={interactionLocked}>New Terminal</Button>
          )}
        </div>
      )}
      {snapshot.creating && !active && (
        <div className="terminal-empty"><p>Starting terminal…</p></div>
      )}

      {(snapshot.createError || active?.error || active?.state === 'EXITED') && (
        <div
          className={`terminal-state-line${active?.error || snapshot.createError ? ' error' : ''}`}
          role={active?.error || snapshot.createError ? 'alert' : 'status'}
        >
          {snapshot.createError
            ?? active?.error
            ?? (active?.exitCode === null
              ? 'Terminal exited.'
              : `Terminal exited with code ${active?.exitCode}.`)}
        </div>
      )}
    </section>
  )
}

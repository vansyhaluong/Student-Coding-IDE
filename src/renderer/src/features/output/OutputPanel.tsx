import { ListChecks, SquareTerminal, Text, X } from 'lucide-react'
import { useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { PanelResizer } from '../../components/PanelResizer'
import { Button } from '../../components/ui/Button'
import { trailingLineBreakLength, type OutputChunk, type RunController, type RunView } from './run-controller'

export function OutputPanel({ controller, height, onHeightChange, onSelectTerminal, onSelectProblems, onClosePanel }: {
  controller: RunController; height: number; onHeightChange(height: number): void
  onSelectTerminal(): void; onSelectProblems(): void; onClosePanel(): void
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const panel = useRef<HTMLElement>(null), log = useRef<HTMLDivElement>(null), inputField = useRef<HTMLTextAreaElement>(null)
  const following = useRef(true)
  const pinUntil = useRef(0)
  const view = snapshot.selected ? snapshot.views.get(snapshot.selected) : undefined
  const consoleInput = snapshot.consoleInput && snapshot.selected === snapshot.consoleInput.key ? snapshot.consoleInput : undefined
  const holdPromptBreak = !!consoleInput && consoleInput.status.gate === 'OPEN'
  const promptChunk = dockPromptChunk(view?.chunks, holdPromptBreak)
  useLayoutEffect(() => {
    const element = log.current
    if (!element || (!following.current && !holdPromptBreak)) return
    if (holdPromptBreak) following.current = true
    let frames = 0
    let frame = 0
    // Keep pinning across the scroll event. Clearing it in the same turn lets
    // that event mark the log as no longer following, so the caret stays off screen.
    const pin = (): void => {
      pinUntil.current = performance.now() + 200
      element.scrollTop = element.scrollHeight
      if (frames++ < 8) frame = requestAnimationFrame(pin)
    }
    pin()
    return () => cancelAnimationFrame(frame)
  }, [view, snapshot.consoleInput, holdPromptBreak])
  return <section ref={panel} className="terminal-panel terminal-panel-compact output-panel" aria-label="Output panel" style={{ height }}>
    <PanelResizer height={height} minimum={160}
      getMaximum={() => Math.max(160, (panel.current?.parentElement?.clientHeight ?? window.innerHeight) - 180)}
      onResize={onHeightChange} label="Resize Output panel" />
    <header className="terminal-panel-header">
      <div className="bottom-panel-tabs" role="tablist" aria-label="Bottom panel">
        <button type="button" role="tab" aria-selected="false" onClick={onSelectTerminal}><SquareTerminal aria-hidden="true" /><span>Terminal</span></button>
        <button type="button" role="tab" aria-selected="false" onClick={onSelectProblems}><ListChecks aria-hidden="true" /><span>Problems</span></button>
        <button type="button" role="tab" aria-selected="true"><Text aria-hidden="true" /><span>Output</span></button>
      </div>
      <div className="terminal-panel-actions">
        <Button variant="ghost" size="iconSmall" onClick={onClosePanel} title="Hide Output" aria-label="Hide Output"><X /></Button>
      </div>
    </header>
    {!snapshot.projectId ? <div className="problems-empty"><p>Open a project to view Run output.</p></div>
      : !snapshot.available ? <div className="problems-empty"><p>Run unavailable while the project is unavailable or closing.</p></div>
        : !view ? <div className="problems-empty"><Text aria-hidden="true" /><p>Run a saved JavaScript file or Console project to view its output.</p></div>
          : <>
            <div className="output-context"><span title={view.relativePath}>{view.relativePath}</span><span role="status">{runResult(view)}</span></div>
            {view.error && <p className="project-error" role="alert">{view.error}</p>}
            <div className="output-log" ref={log} tabIndex={0} aria-label={`Run output for ${view.relativePath}`}
              onMouseDown={event => focusPromptLine(event, inputField.current)}
              onScroll={() => {
                if (performance.now() < pinUntil.current) return
                const element = log.current!
                following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
              }}>
              {view.chunks.map((chunk, index) => {
                const last = index === view.chunks.length - 1
                if (last && promptChunk) return null
                const data = shownChunkData(chunk, last, holdPromptBreak)
                if (data === undefined) return null
                return <span key={index} className={`output-chunk output-${chunk.stream}`}>
                  {chunk.stream !== 'input' && <span className="output-stream">[{chunk.stream}] </span>}{data}
                </span>
              })}
            </div>
            {consoleInput && <div className="output-prompt-dock" onMouseDown={event => focusPromptLine(event, inputField.current)}>
              {promptChunk && <span className={`output-chunk output-${promptChunk.stream}`}>
                <span className="output-stream">[{promptChunk.stream}] </span>{shownChunkData(promptChunk, true, true)}
              </span>}
              <ConsoleLineInput controller={controller} input={consoleInput} field={inputField} focusKey={promptFocusKey(view.chunks)} />
            </div>}
          </>}
  </section>
}

function ConsoleLineInput({ controller, input, field, focusKey }: {
  controller: RunController
  input: NonNullable<ReturnType<RunController['getSnapshot']>['consoleInput']>
  field: RefObject<HTMLTextAreaElement | null>
  focusKey: string
}) {
  const writable = input.status.gate === 'OPEN' && !input.busy
  const lines = Math.max(1, input.draft.split('\n').length)
  const draftRef = useRef(input.draft)
  draftRef.current = input.draft
  useLayoutEffect(() => {
    if (!writable) return
    const node = field.current
    // The editor takes focus after layout. Keep this listener in place first,
    // then take the caret back so ReadLine receives the name.
    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof Element) || !node) return
      if (target === node || node.contains(target)) return
      if (target.closest('button, [role="dialog"], .xterm')) return
      node.focus()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (!node) return
      const target = event.target
      if (target instanceof Node && node.contains(target)) return
      if (event.isComposing || event.key === 'Process' || event.keyCode === 229) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (target instanceof Element && target.closest('button, [role="dialog"], .xterm')) return
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        controller.setInputDraft(`${draftRef.current}\n`)
        node.focus()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        void controller.submitInput()
        node.focus()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        controller.setInputDraft(draftRef.current.slice(0, -1))
        node.focus()
        return
      }
      if (event.key.length !== 1) return
      event.preventDefault()
      event.stopPropagation()
      controller.setInputDraft(draftRef.current + event.key)
      node.focus()
    }
    document.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('keydown', onKeyDown, true)
    node?.focus()
    const frame = requestAnimationFrame(() => node?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', onFocusIn, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [writable, input.sessionId, focusKey, field, controller])
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key === 'Process' || event.keyCode === 229) return
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void controller.submitInput()
  }
  return <textarea ref={field} className="output-inline-input" aria-label="Console input" rows={lines}
    value={input.draft} disabled={!writable} spellCheck={false}
    style={lines > 1 ? { minHeight: `${lines * 1.6}em` } : undefined}
    onChange={event => controller.setInputDraft(event.target.value)} onKeyDown={onKeyDown} />
}

/** The open WriteLine prompt is pinned below the log, not inside the scrolled text. */
function dockPromptChunk(chunks: readonly OutputChunk[] | undefined, holdPromptBreak: boolean): OutputChunk | undefined {
  if (!holdPromptBreak || !chunks) return undefined
  const last = chunks.at(-1)
  if (!last || (last.stream !== 'stdout' && last.stream !== 'stderr')) return undefined
  return shownChunkData(last, true, true) === undefined ? undefined : last
}

/** While ReadLine is open, a WriteLine prompt keeps its caret on that same line. */
function shownChunkData(chunk: OutputChunk, last: boolean, holdPromptBreak: boolean): string | undefined {
  if (!holdPromptBreak || !last || (chunk.stream !== 'stdout' && chunk.stream !== 'stderr')) return chunk.data
  const breakLength = trailingLineBreakLength(chunk.data)
  if (breakLength === 0) return chunk.data
  const data = chunk.data.slice(0, -breakLength)
  return data.length === 0 ? undefined : data
}

function promptFocusKey(chunks: readonly OutputChunk[]): string {
  const last = chunks.at(-1)
  return `${chunks.length}:${last?.stream ?? ''}:${last?.data.length ?? 0}`
}

/** Any click in the output log while ReadLine is open focuses the prompt field. */
function focusPromptLine(event: ReactMouseEvent<HTMLDivElement>, field: HTMLTextAreaElement | null): void {
  if (!field || field.disabled || event.button !== 0) return
  const target = event.target
  if (!(target instanceof Node) || field.contains(target)) return
  event.preventDefault()
  field.focus()
}

export function runResult(view: RunView): string {
  const state = view.session?.state
  if (state === 'STOPPING') return 'Stopping…'
  if (view.failure) return view.error ?? 'Run failed'
  if (view.phase && !['EXITED', 'FAILED', 'CANCELLED'].includes(state ?? '')) {
    return view.phase === 'PREPARING' ? 'Preparing…' : view.phase === 'BUILD_RESTORE' ? 'Building…' : 'Running'
  }
  if (state === 'STARTING') return 'Starting…'
  if (state === 'RUNNING') return 'Running'
  if (state === 'CANCELLED') return 'Stopped'
  if (state === 'EXITED') return 'Exited successfully (0)'
  if (state === 'FAILED') return view.exitCode != null ? `Exited with code ${view.exitCode}` : 'Run failed'
  if (view.error) return 'Run failed'
  return view.pending ? 'Requesting Run…' : 'Ready'
}

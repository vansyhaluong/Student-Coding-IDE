import { ChevronRight, File, Folder, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import type {
  ProjectIdentity,
  SearchCompleteEvent,
  SearchMatch,
  NamesMatch,
} from '../../../../shared/contracts'

interface SearchPanelProps {
  project: ProjectIdentity | null
  onNavigate(match: SearchMatch): void
  interactionLocked?: boolean
  tree?: ReactNode
  onOpenFile?(path: string): void
  showProjectName?: boolean
}

type SearchStatus = 'idle' | 'debouncing' | 'searching' | 'complete' | 'cancelled' | 'error'

const SEARCH_DEBOUNCE_MS = 180
const LOADING_INDICATOR_DELAY_MS = 200

let operationSequence = 0

export function SearchPanel({
  project,
  onNavigate,
  interactionLocked = false,
  tree,
  onOpenFile,
  showProjectName = true,
}: SearchPanelProps) {
  const [mode, setMode] = useState<'names' | 'contents'>('names')
  const modeRef = useRef(mode)
  const [names, setNames] = useState<NamesMatch[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SearchCompleteEvent | null>(null)
  const [loadingVisible, setLoadingVisible] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null)
  const queryRef = useRef('')
  const activeOperation = useRef<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectRef = useRef(project)
  const interactionLockedRef = useRef(interactionLocked)
  projectRef.current = project
  interactionLockedRef.current = interactionLocked

  const clearDebounceTimer = (): void => clearTimer(debounceTimer)
  const clearLoadingTimer = (): void => clearTimer(loadingTimer)

  useEffect(() => window.studentIde.search.onEvent((event) => {
    if (
      modeRef.current !== 'contents' || event.operationId !== activeOperation.current
      || event.projectId !== projectRef.current?.id
    ) return
    if (event.type === 'batch') {
      setMatches((current) => [...current, ...event.matches])
    } else if (event.type === 'complete') {
      clearLoadingTimer()
      setLoadingVisible(false)
      setSummary(event)
      setStatus(event.status === 'cancelled' ? 'cancelled' : 'complete')
      activeOperation.current = null
    } else {
      clearLoadingTimer()
      setLoadingVisible(false)
      setError(event.error.message)
      setStatus('error')
      activeOperation.current = null
    }
  }), [])

  useEffect(() => window.studentIde.search.onNamesEvent((event) => {
    if (modeRef.current !== 'names' || event.operationId !== activeOperation.current
      || event.projectId !== projectRef.current?.id) return
    if (event.type === 'batch') setNames((current) => [...current, ...event.matches])
    else {
      clearLoadingTimer()
      setLoadingVisible(false)
      activeOperation.current = null
      if (event.type === 'complete') {
        setSummary(event)
        setStatus(event.status === 'cancelled' ? 'cancelled' : 'complete')
      } else { setError(event.error.message); setStatus('error') }
    }
  }), [])

  useLayoutEffect(() => {
    clearDebounceTimer()
    clearLoadingTimer()
    const operationId = activeOperation.current
    activeOperation.current = null
    if (operationId) {
      void window.studentIde.search.cancel(operationId).catch(() => undefined)
    }
    queryRef.current = ''
    modeRef.current = 'names'
    setMode('names')
    setNames([])
    setQuery('')
    setMatches([])
    setSummary(null)
    setError(null)
    setStatus('idle')
    setLoadingVisible(false)
    setCollapsedGroups(new Set())
    setSelectedMatch(null)
  }, [project?.id])

  useEffect(() => () => {
    clearDebounceTimer()
    clearLoadingTimer()
    const operationId = activeOperation.current
    activeOperation.current = null
    if (operationId) {
      void window.studentIde.search.cancel(operationId).catch(() => undefined)
    }
  }, [])

  const groups = useMemo(() => {
    const grouped = new Map<string, SearchMatch[]>()
    for (const match of matches) {
      const group = grouped.get(match.relativePath)
      if (group) group.push(match)
      else grouped.set(match.relativePath, [match])
    }
    return [...grouped.entries()]
  }, [matches])

  const runSearch = async (nextQuery: string): Promise<void> => {
    if (interactionLockedRef.current) return
    if (!project || nextQuery.trim().length === 0) {
      cancelActive()
      setMatches([])
      setSummary(null)
      setError(null)
      setStatus('idle')
      setLoadingVisible(false)
      return
    }

    const previous = activeOperation.current
    const operationId = createOperationId()
    activeOperation.current = operationId
    setNames([])
    if (previous) {
      void window.studentIde.search.cancel(previous).catch(() => undefined)
    }
    setMatches([])
    setSummary(null)
    setError(null)
    setStatus('searching')
    setLoadingVisible(false)
    clearLoadingTimer()
    loadingTimer.current = setTimeout(() => {
      if (activeOperation.current === operationId) setLoadingVisible(true)
    }, LOADING_INDICATOR_DELAY_MS)
    setCollapsedGroups(new Set())
    setSelectedMatch(null)
    try {
      const start = modeRef.current === 'names' ? window.studentIde.search.startNames : window.studentIde.search.start
      const result = await start(
        project.id,
        operationId,
        nextQuery,
      )
      if (result.ok || activeOperation.current !== operationId) return
      clearLoadingTimer()
      setLoadingVisible(false)
      activeOperation.current = null
      setError(result.error.message)
      setStatus('error')
    } catch {
      if (activeOperation.current !== operationId) return
      clearLoadingTimer()
      setLoadingVisible(false)
      activeOperation.current = null
      setError('The application request could not be completed.')
      setStatus('error')
    }
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (interactionLockedRef.current) return
    clearDebounceTimer()
    await runSearch(queryRef.current)
  }

  const changeQuery = (nextQuery: string): void => {
    if (interactionLockedRef.current) return
    queryRef.current = nextQuery
    setQuery(nextQuery)
    clearDebounceTimer()
    cancelActive()
    clearLoadingTimer()
    setLoadingVisible(false)
    setMatches([])
    setNames([])
    setSummary(null)
    setError(null)
    setCollapsedGroups(new Set())
    setSelectedMatch(null)
    if (!project || nextQuery.trim().length === 0) {
      setStatus('idle')
      return
    }
    setStatus('debouncing')
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void runSearch(nextQuery)
    }, SEARCH_DEBOUNCE_MS)
  }

  const cancelActive = (): void => {
    const operationId = activeOperation.current
    activeOperation.current = null
    if (operationId) {
      void window.studentIde.search.cancel(operationId).catch(() => undefined)
    }
  }

  const clear = (): void => {
    clearDebounceTimer()
    clearLoadingTimer()
    cancelActive()
    queryRef.current = ''
    setQuery('')
    setMatches([])
    setNames([])
    setSummary(null)
    setError(null)
    setStatus('idle')
    setLoadingVisible(false)
    setCollapsedGroups(new Set())
    setSelectedMatch(null)
  }

  const switchMode = (next: 'names' | 'contents'): void => {
    if (next === modeRef.current || interactionLockedRef.current) return
    clearDebounceTimer(); clearLoadingTimer(); cancelActive()
    modeRef.current = next
    setMode(next); setNames([]); setMatches([]); setSummary(null); setError(null)
    setStatus('idle'); setLoadingVisible(false)
    if (queryRef.current.trim()) void runSearch(queryRef.current)
  }

  const toggleGroup = (relativePath: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }

  return (
    <section className="search-panel" aria-label="Project Search">
      {showProjectName && <div className="search-project-toolbar" title={project?.name}>
        <Folder />
        <span>{project?.name ?? 'No project'}</span>
      </div>}
      <form className="search-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="project-search-input">Search project</label>
        <div className="search-input-shell">
          <Search />
          <input
            id="project-search-input"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) clear()
            }}
            disabled={!project || interactionLocked}
            maxLength={256}
            placeholder="Find files..."
            autoComplete="off"
            spellCheck={false}
          />
          {status === 'searching' && loadingVisible && <LoaderCircle className="search-loading-icon" />}
          {query.length > 0 && !(status === 'searching' && loadingVisible) && (
            <button type="button" className="search-clear" onClick={clear} aria-label="Clear search">
              <X />
            </button>
          )}
        </div>
      </form>

      <div className="search-mode-tabs" role="tablist" aria-label="Search mode">
        {(['names', 'contents'] as const).map((item) => <button key={item} type="button"
          id={`search-mode-${item}`} role="tab" aria-selected={mode === item}
          aria-controls="search-mode-results" disabled={interactionLocked}
          onClick={() => switchMode(item)} onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              const next = item === 'names' ? 'contents' : 'names'
              switchMode(next); document.getElementById(`search-mode-${next}`)?.focus()
            }
          }}>{item === 'names' ? 'Names' : 'Contents'}</button>)}
      </div>
      <div id="search-mode-results" role="tabpanel" aria-labelledby={`search-mode-${mode}`} className="search-mode-results">
      <div hidden={mode !== 'names' || query.length > 0}>{tree}</div>
      {mode === 'names' && query.length > 0 && <>
        <div className="search-status" aria-live="polite" aria-busy={status === 'debouncing' || status === 'searching'}>
          {status === 'debouncing' && <span className="sr-only">Search queued</span>}
          {status === 'searching' && loadingVisible && 'Searching…'}
          {status === 'error' && <span role="alert">{error}</span>}
          {status === 'complete' && `${names.length} files${summary?.limitReached ? ' — result limit reached' : ''}`}
          {status === 'cancelled' && 'Search cancelled.'}
        </div>
        <ul className="names-results" aria-label="Matching file paths">
          {names.map(({ relativePath }) => <li key={relativePath}><button type="button"
            disabled={interactionLocked} title={relativePath} onClick={() => onOpenFile?.(relativePath)}>
            <File aria-hidden="true" /><span>{relativePath}</span>
          </button></li>)}
        </ul>
      </>}
      {mode === 'contents' && <>

      <div
        className={`search-status ${groups.length > 0 ? 'summary' : 'empty'}`}
        aria-live="polite"
        aria-busy={status === 'debouncing' || status === 'searching'}
      >
        {!project && 'Select a workspace to search'}
        {project && status === 'idle' && 'Type to search in files'}
        {status === 'debouncing' && <span className="sr-only">Search queued</span>}
        {status === 'searching' && loadingVisible && `Searching${matches.length > 0 ? ` — ${matches.length} matches` : '…'}`}
        {status === 'searching' && !loadingVisible && matches.length > 0 && `${matches.length} matches`}
        {status === 'cancelled' && 'Search cancelled.'}
        {status === 'error' && <span role="alert">{error}</span>}
        {status === 'complete' && matches.length === 0 && 'No results found.'}
        {status === 'complete' && matches.length > 0 && (
          `${matches.length} matches in ${groups.length} files${summary?.limitReached ? ' — result limit reached' : ''}`
        )}
      </div>

      {groups.length > 0 && (
        <div className="search-results" aria-label="Search results">
          {groups.map(([relativePath, fileMatches]) => (
            <section className="search-file-group" key={relativePath}>
              <button
                type="button"
                className="search-file-header"
                title={relativePath}
                aria-expanded={!collapsedGroups.has(relativePath)}
                onClick={() => toggleGroup(relativePath)}
              >
                <ChevronRight className={`search-file-chevron${!collapsedGroups.has(relativePath) ? ' expanded' : ''}`} />
                <File className="search-file-icon" />
                <span className="search-file-name">{fileName(relativePath)}</span>
                <span className="search-file-path">{parentPath(relativePath)}</span>
                <span className="search-file-count">{fileMatches.length}</span>
              </button>
              <ul hidden={collapsedGroups.has(relativePath)}>
                {fileMatches.map((match, index) => (
                  <li key={`${match.lineNumber}:${match.columnStart}:${index}`}>
                    <button
                      type="button"
                      className={selectedMatch === matchKey(match, index) ? 'current' : undefined}
                      aria-current={selectedMatch === matchKey(match, index) ? 'true' : undefined}
                      disabled={interactionLocked}
                      onClick={() => {
                        setSelectedMatch(matchKey(match, index))
                        onNavigate(match)
                      }}
                      aria-label={`${relativePath} line ${match.lineNumber}`}
                    >
                      <span className="search-line">{match.lineNumber}</span>
                      <span className="search-preview">{highlightPreview(match.preview || ' ', query)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </>}
      </div>
    </section>
  )
}

function clearTimer(timer: { current: ReturnType<typeof setTimeout> | null }): void {
  if (timer.current) clearTimeout(timer.current)
  timer.current = null
}

function highlightPreview(preview: string, query: string): ReactNode {
  const needle = query.toLocaleLowerCase()
  if (!needle) return preview
  const lowerPreview = preview.toLocaleLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let matchIndex = lowerPreview.indexOf(needle)
  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(preview.slice(cursor, matchIndex))
    const end = matchIndex + needle.length
    parts.push(<mark key={`${matchIndex}:${end}`}>{preview.slice(matchIndex, end)}</mark>)
    cursor = end
    matchIndex = lowerPreview.indexOf(needle, cursor)
  }
  if (cursor < preview.length) parts.push(preview.slice(cursor))
  return parts.length > 0 ? parts : preview
}

function createOperationId(): string {
  operationSequence += 1
  return `search_${Date.now().toString(36)}_${operationSequence.toString(36)}`
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

function parentPath(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

function matchKey(match: SearchMatch, index: number): string {
  return `${match.relativePath}:${match.lineNumber}:${match.columnStart}:${index}`
}

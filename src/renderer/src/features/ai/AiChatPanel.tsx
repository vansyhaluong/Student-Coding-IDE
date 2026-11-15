import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiChatEvent, AiMessage } from '../../../../shared/contracts/ai'
import type { ProjectAgentAppliedChange, ProjectAgentDiffLine, ProjectAgentHistoryMessage, ProjectAgentProposal, ProjectId } from '../../../../shared/contracts'
import { AgentActivity, type AgentActivityItem } from '../../components/ai/agent-activity'
import { FileDiff } from '../../components/ai/file-diff'
import { Paperclip, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Message, MessageContent, MessageGroup } from '../../components/ai/message'
import { MessageBubble, MessageBubbleContent } from '../../components/ai/message-bubble'
import { MessageScroller } from '../../components/ai/message-scroller'
import { PromptInput } from '../../components/ai/prompt-input'
import { StreamingResponse } from '../../components/ai/streaming-response'

const PROJECT_CHAT_MODEL = 'gemini-3.1-flash-lite'

function GeminiMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
      <path
        fill="currentColor"
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.76-3.99 1.8-1.8 3.99-2.76Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.99-2.76 12.3 12.3 0 0 1-2.76-3.99Q12 2.49 12 0q0 2.49-.93 4.68-.96 2.19-2.76 3.99a12.3 12.3 0 0 1-3.99 2.76Q2.49 12 0 12q2.49 0 4.68.93a12.3 12.3 0 0 1 3.99 2.76 12.3 12.3 0 0 1 2.37 4.63"
      />
    </svg>
  )
}

interface ActiveChat { requestId?: string; early: AiChatEvent[]; index: number; stopping: boolean }
type ChatMessage = { role: 'user'; content: string } | {
  role: 'assistant'; content: string; state: 'streaming' | 'complete' | 'stopped' | 'error'
}

function LocalAiChatPanel({ onClose }: { onClose(): void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeChat = useRef<ActiveChat | null>(null)
  const [hasContent, setHasContent] = useState(false)
  const mounted = useRef(false)
  const submitted = useRef(false)
  const panelRef = useRef<HTMLElement>(null)
  const receive = useCallback((event: AiChatEvent) => {
    const active = activeChat.current
    if (!active || !mounted.current) return
    if (!active.requestId) { active.early.push(event); return }
    if (event.requestId !== active.requestId) return
    if (event.type === 'chunk') {
      if (active.stopping) return
      setHasContent(true)
      setMessages(current => {
        const next = [...current]
        next[active.index] = { role: 'assistant', content: (next[active.index]?.content ?? '') + event.content, state: 'streaming' }
        return next
      })
    } else {
      activeChat.current = null
      setPending(false)
      setMessages(current => current.map((message, index) => index === active.index && message.role === 'assistant'
        ? { ...message, state: active.stopping ? 'stopped' : event.type } : message))
      if (event.type === 'error') setError(event.error.message)
    }
  }, [])

  async function cancel(active: ActiveChat): Promise<void> {
    active.stopping = true
    if (!active.requestId) return
    try {
      const result = await window.studentIde.ai.stopChat(active.requestId)
      if (activeChat.current !== active || !mounted.current) return
      if (result.ok) receive({ type: 'stopped', requestId: active.requestId })
      else { active.stopping = false; setError(result.error.message) }
    } catch {
      if (activeChat.current === active && mounted.current) {
        active.stopping = false
        setError('Could not stop the response. Please try Stop again.')
      }
    }
  }

  useEffect(() => {
    mounted.current = true
    let active = true
    const unsubscribe = window.studentIde.ai.onChatEvent(receive)
    void window.studentIde.ai.getStatus().then(result => {
      if (!active || submitted.current) return
      if (!result.ok) setError(result.error.message)
      else if (result.value === 'ollama-unavailable') setError('Ollama is unavailable. Start Ollama to chat.')
      else if (result.value === 'model-unavailable') setError('The qwen3:1.7b model is not installed in Ollama.')
    }).catch(() => {
      if (active && !submitted.current) setError('Could not check Ollama availability.')
    })
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.querySelector('textarea')?.focus()
    return () => {
      active = false
      mounted.current = false
      unsubscribe()
      const request = activeChat.current
      activeChat.current = null
      if (request?.requestId) void window.studentIde.ai.stopChat(request.requestId).catch(() => undefined)
      previous?.focus()
    }
  }, [receive])

  async function submit(content: string): Promise<void> {
    if (activeChat.current || !content.trim()) return
    submitted.current = true
    const transcript: ChatMessage[] = [...messages, { role: 'user', content }]
    const history: AiMessage[] = transcript
      .filter(message => message.role === 'user' || message.state === 'complete')
      .map(({ role, content }) => ({ role, content }))
    const active: ActiveChat = { early: [], index: transcript.length, stopping: false }
    activeChat.current = active
    setMessages(transcript)
    setPending(true)
    setHasContent(false)
    setError(null)
    try {
      const result = await window.studentIde.ai.startChat({ messages: history })
      if (activeChat.current !== active || !mounted.current) {
        if (result.ok) await window.studentIde.ai.stopChat(result.value.requestId)
        return
      }
      if (result.ok) {
        active.requestId = result.value.requestId
        for (const event of active.early.splice(0)) receive(event)
        if (active.stopping && activeChat.current === active) await cancel(active)
      } else {
        activeChat.current = null
        setPending(false)
        setError(result.error.message)
      }
    } catch {
      if (mounted.current && activeChat.current === active) {
        activeChat.current = null
        setPending(false)
        setError('The Ollama chat request failed. Please try again.')
      }
    }
  }

  return <section ref={panelRef} id="local-ai-panel" className="ai-chat-panel" aria-label="Local AI chat">
    <header className="ai-chat-header">
      <div className="ai-chat-heading"><h2><Sparkles aria-hidden="true" />LOCAL AI</h2><span>qwen3:1.7b</span></div>
      <Button variant="ghost" size="iconSmall" onClick={onClose} aria-label="Close Local AI chat"><X /></Button>
    </header>
    <MessageScroller label="Local AI conversation" className="flex-1" viewportClassName="p-3">
      <MessageGroup spacing="compact">
      {messages.map((message, index) => <Message key={index} from={message.role}>
        <MessageContent>
        <MessageBubble variant={message.role === 'user' ? 'soft' : 'ghost'}>
          <MessageBubbleContent style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message.role === 'assistant' ? <StreamingResponse status={message.state === 'stopped' ? 'error' : message.state} showActions={false} announce={false}>{message.content}</StreamingResponse> : message.content}
          </MessageBubbleContent>
        </MessageBubble>
        </MessageContent>
      </Message>)}
      {pending && !hasContent && <p role="status" className="m-0 text-xs text-muted-foreground">Thinking...</p>}
      </MessageGroup>
    </MessageScroller>
    <footer className="ai-chat-composer">
      {error && <p className="project-error" role="alert">{error}</p>}
      <PromptInput className="bg-[var(--sidebar-accent)]" placeholder="Ask Qwen..." aria-label="Ask Qwen" minRows={1} maxRows={5} loading={pending} onStop={() => { if (activeChat.current) void cancel(activeChat.current) }} onSubmit={submit} />
    </footer>
  </section>
}

interface ShownChange {
  kind: 'edit' | 'create'
  relativePath: string
  message: string
  lines: ProjectAgentDiffLine[]
}

interface ProjectChatMessage {
  role: 'user' | 'assistant'
  text: string
  changes?: ShownChange[]
  activity?: AgentActivityItem[]
}

function appliedChangeMessage(
  change: ProjectAgentAppliedChange,
  refresh: 'reloaded' | 'conflict' | 'closed',
): string {
  const path = change.relativePath
  if (change.kind === 'create') {
    if (refresh === 'conflict') return `Created ${path}. The open tab kept its unsaved edits.`
    if (refresh === 'closed') return `Created ${path}. Open it from the explorer to view the new file.`
    return `Created ${path}`
  }
  if (refresh === 'conflict') return `Updated ${path}. The open tab kept its unsaved edits.`
  return `Updated ${path}`
}

async function shownChanges(
  projectId: ProjectId,
  applied: readonly ProjectAgentAppliedChange[],
): Promise<ShownChange[] | undefined> {
  if (applied.length === 0) return undefined
  const appliedFiles = await import('./refresh-applied-file')
  return applied.map((change) => ({
    kind: change.kind,
    relativePath: change.relativePath,
    lines: change.lines,
    message: appliedChangeMessage(
      change,
      appliedFiles.refreshAppliedFile(projectId, change.relativePath, change.updated),
    ),
  }))
}

function deletedMessage(path: string, refresh: 'closed' | 'kept' | 'absent'): string {
  if (refresh === 'kept') return `Deleted ${path}. The open tab kept its unsaved edits.`
  return `Deleted ${path}.`
}

function renamedMessage(
  path: string,
  destination: string,
  refresh: 'renamed' | 'retargeted' | 'closed' | 'conflict' | 'blocked',
): string {
  const verb = parentOf(path) === parentOf(destination) ? 'Renamed' : 'Moved'
  if (refresh === 'blocked') {
    return `${verb} ${path} to ${destination}. The source tab kept its unsaved edits.`
  }
  if (refresh === 'conflict') {
    return `${verb} ${path} to ${destination}. The old tab was closed. The open tab kept its unsaved edits.`
  }
  return `${verb} ${path} to ${destination}.`
}

function parentOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? '' : relativePath.slice(0, slash)
}

function isConfirmable(proposal: ProjectAgentProposal): boolean {
  return proposal.kind === 'delete' || proposal.kind === 'delete-directory' || proposal.kind === 'rename'
}

function proposalLabel(proposal: ProjectAgentProposal): string {
  if (proposal.kind === 'delete' || proposal.kind === 'delete-directory') return 'Proposed delete'
  if (proposal.kind === 'rename') {
    return parentOf(proposal.relativePath) === parentOf(proposal.destinationPath)
      ? 'Proposed rename'
      : 'Proposed move'
  }
  return 'Proposed change'
}

function proposalAction(proposal: ProjectAgentProposal): string {
  if (proposal.kind === 'delete') return 'Delete file'
  if (proposal.kind === 'delete-directory') return 'Delete folder'
  if (proposal.kind === 'rename') {
    return parentOf(proposal.relativePath) === parentOf(proposal.destinationPath)
      ? 'Rename file'
      : 'Move file'
  }
  return 'Confirm'
}

function activityForReply(
  changes: readonly ShownChange[] | undefined,
  proposals: readonly ProjectAgentProposal[],
): AgentActivityItem[] {
  const items: AgentActivityItem[] = []
  for (const [index, change] of (changes ?? []).entries()) {
    const additions = change.lines.filter((line) => line.type === 'added').length
    const deletions = change.lines.filter((line) => line.type === 'removed').length
    items.push({
      id: `change-${index}`,
      type: 'tool',
      action: change.kind === 'create' ? 'write' : 'edit',
      target: change.relativePath,
      additions,
      deletions,
    })
  }
  for (const proposal of proposals) {
    if (proposal.kind === 'delete' || proposal.kind === 'delete-directory') {
      items.push({
        id: proposal.proposalId,
        type: 'tool',
        action: 'delete',
        target: proposal.relativePath,
      })
    } else if (proposal.kind === 'rename') {
      items.push({
        id: proposal.proposalId,
        type: 'tool',
        action: 'rename',
        target: `${proposal.relativePath} → ${proposal.destinationPath}`,
      })
    }
  }
  if (items.length > 0) return items
  return [{ id: 'answered', type: 'step', label: 'Answered', status: 'complete' }]
}

function pairedHistory(messages: ProjectChatMessage[]): ProjectAgentHistoryMessage[] {
  const even = messages.length % 2 === 0 ? messages : messages.slice(0, -1)
  return even.slice(-8).map((message) => ({ role: message.role, text: message.text }))
}

function ProjectChatPanel({
  projectId,
  onClose,
}: {
  projectId: ProjectId | null
  onClose(): void
}) {
  const [messages, setMessages] = useState<ProjectChatMessage[]>([])
  const [generation, setGeneration] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<ProjectAgentProposal[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const applyingRef = useRef<string | null>(null)
  const [applied, setApplied] = useState<string[]>([])
  const [blockedRenameIds, setBlockedRenameIds] = useState<ReadonlySet<string>>(new Set())
  const panelRef = useRef<HTMLElement>(null)
  const mounted = useRef(true)
  const generationRef = useRef<number | null>(null)
  generationRef.current = generation

  useEffect(() => {
    mounted.current = true
    let active = true
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (projectId) {
      void window.studentIde.agent.session().then((result) => {
        if (!active) return
        if (!result.ok) setError(result.error.message)
        else if (result.value.projectId !== projectId) setError('Open this project before chatting.')
        else setGeneration(result.value.generation)
      }).catch(() => {
        if (active) setError('The project chat is unavailable.')
      })
    }
    panelRef.current?.querySelector('textarea')?.focus()
    return () => {
      active = false
      mounted.current = false
      const current = generationRef.current
      if (projectId && current !== null) {
        void window.studentIde.agent.cancel({ projectId, generation: current }).catch(() => undefined)
      }
      previous?.focus()
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}
    const renames = proposals.filter((proposal) => proposal.kind === 'rename')
    if (renames.length === 0) {
      setBlockedRenameIds(new Set())
      return
    }
    void import('./refresh-applied-file').then((appliedFiles) => {
      if (cancelled) return
      const refresh = () => {
        setBlockedRenameIds(new Set(
          renames
            .filter((proposal) => appliedFiles.sourceRenameBlocked(
              proposal.projectId,
              proposal.relativePath,
              proposal.destinationPath,
            ))
            .map((proposal) => proposal.proposalId),
        ))
      }
      refresh()
      unsubscribe = appliedFiles.subscribeEditorDocuments(refresh)
    }).catch(() => {
      if (!cancelled) setBlockedRenameIds(new Set())
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [proposals])

  async function submit(content: string): Promise<void> {
    if (pending || applyingId !== null || !projectId || generation === null || content.trim().length === 0) return
    const history = pairedHistory(messages)
    const next = [...messages, { role: 'user' as const, text: content }]
    setMessages(next)
    setPending(true)
    setError(null)
    setProposals([])
    setApplied([])
    try {
      const result = await window.studentIde.agent.turn({
        projectId,
        generation,
        message: content,
        history,
      })
      if (!mounted.current) return
      if (!result.ok) {
        if (result.error.code !== 'PROCESS_CANCELLED') setError(result.error.message)
        return
      }
      if (result.value.projectId !== projectId || result.value.generation !== generation) {
        setError('The project changed. Start the request again.')
        return
      }
      const changes = await shownChanges(result.value.projectId, result.value.applied)
      if (!mounted.current) return
      const proposals = result.value.proposals.filter(isConfirmable)
      setMessages((current) => [...current, {
        role: 'assistant',
        text: result.value.text,
        changes,
        activity: activityForReply(changes, proposals),
      }])
      setProposals(proposals)
    } catch {
      if (mounted.current) setError('The project chat request failed.')
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  async function apply(proposal: ProjectAgentProposal): Promise<void> {
    if (applyingRef.current !== null || generation === null || !isConfirmable(proposal)) return
    applyingRef.current = proposal.proposalId
    setApplyingId(proposal.proposalId)
    setError(null)
    try {
      const appliedFiles = await import('./refresh-applied-file')
      if (
        proposal.kind === 'rename'
        && appliedFiles.sourceRenameBlocked(
          proposal.projectId,
          proposal.relativePath,
          proposal.destinationPath,
        )
      ) {
        setError(appliedFiles.DIRTY_SOURCE_RENAME_MESSAGE)
        return
      }
      const result = await window.studentIde.agent.apply({
        projectId: proposal.projectId,
        generation: proposal.generation,
        proposalId: proposal.proposalId,
        confirmed: true,
      })
      if (!mounted.current) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const line = proposal.kind === 'delete' || proposal.kind === 'delete-directory'
        ? deletedMessage(
          result.value.relativePath,
          appliedFiles.closeDeletedFile(proposal.projectId, result.value.relativePath),
        )
        : renamedMessage(
          result.value.relativePath,
          result.value.destinationPath,
          appliedFiles.renameAppliedFile(
            proposal.projectId,
            result.value.relativePath,
            result.value.destinationPath,
          ),
        )
      setApplied((current) => [...current, line])
      setProposals((current) => current.filter((item) => item.proposalId !== proposal.proposalId))
    } catch {
      if (mounted.current) setError('The change could not be applied.')
    } finally {
      applyingRef.current = null
      if (mounted.current) setApplyingId(null)
    }
  }

  const waiting = projectId === null || generation === null
  return (
    <section ref={panelRef} id="project-chat-panel" className="ai-chat-panel" aria-label="Project chat">
      <header className="ai-chat-header">
        <div className="ai-chat-heading">
          <h2>CHAT</h2>
        </div>
        <Button variant="ghost" size="iconSmall" onClick={onClose} aria-label="Close Project chat panel"><X /></Button>
      </header>
      <MessageScroller label="Project chat conversation" className="min-w-0 flex-1" viewportClassName="min-w-0 p-3">
        <MessageGroup spacing="compact">
          {messages.map((message, index) => (
            <Message key={`${message.role}-${index}`} from={message.role}>
              <MessageContent>
                {message.activity ? (
                  <AgentActivity
                    items={message.activity}
                    status="complete"
                    defaultOpen
                    summary={message.activity.length === 1 && message.activity[0]?.id === 'answered' ? 'Answered' : undefined}
                  />
                ) : null}
                <MessageBubble variant={message.role === 'user' ? 'soft' : 'ghost'}>
                  <MessageBubbleContent style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {message.text}
                  </MessageBubbleContent>
                </MessageBubble>
                {message.changes?.map((change) => (
                  <div key={change.relativePath} className="w-full min-w-0 max-w-full">
                    <p role="status">{change.message}</p>
                    <FileDiff
                      file={change.relativePath}
                      lines={change.lines}
                      status="complete"
                      defaultOpen
                      collapseOnComplete={false}
                    />
                  </div>
                ))}
              </MessageContent>
            </Message>
          ))}
          {pending && (
            <Message from="assistant">
              <MessageContent>
                <AgentActivity items={[]} contentType="mixed" status="working" maxHeight={0} />
              </MessageContent>
            </Message>
          )}
        </MessageGroup>
        {projectId === null && <p role="status">Open a project before chatting.</p>}
        {proposals.map((proposal) => (
          <section key={proposal.proposalId} className="project-agent-proposal" aria-label={proposalLabel(proposal)}>
            <strong>{proposal.kind === 'rename' ? `${proposal.relativePath} → ${proposal.destinationPath}` : proposal.relativePath}</strong>
            <p>{proposal.summary}</p>
            {proposal.kind === 'delete'
              ? <p>This file will be deleted.</p>
              : proposal.kind === 'delete-directory'
                ? <p>This empty folder will be deleted.</p>
                : blockedRenameIds.has(proposal.proposalId)
                  ? <p>Save or discard unsaved edits in the source file before applying. The destination tab also has unsaved edits.</p>
                  : null}
            <div className="project-agent-actions">
              <Button type="button" onClick={() => void apply(proposal)} disabled={applyingId !== null}>
                {proposalAction(proposal)}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setProposals((current) => current.filter((item) => item.proposalId !== proposal.proposalId))} disabled={applyingId !== null}>Discard</Button>
            </div>
          </section>
        ))}
        {applied.map((line, index) => <p key={`${index}:${line}`} role="status">{line}</p>)}
      </MessageScroller>
      <footer className="ai-chat-composer">
        {error && <p className="project-error" role="alert">{error}</p>}
        <PromptInput
          className="bg-[var(--sidebar-accent)]"
          placeholder={projectId === null ? 'Open a project first...' : waiting ? 'Waiting for the project...' : 'Ask about this project...'}
          aria-label="Message the project"
          minRows={1}
          maxRows={5}
          loading={pending}
          disabled={waiting || applyingId !== null}
          leadingAction={(
            <button
              type="button"
              aria-label="Add file"
              disabled={waiting || pending || applyingId !== null}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <Paperclip className="size-4" aria-hidden="true" />
            </button>
          )}
          models={[{ value: PROJECT_CHAT_MODEL, label: PROJECT_CHAT_MODEL, icon: <GeminiMark /> }]}
          model={PROJECT_CHAT_MODEL}
          onStop={() => {
            if (projectId && generation !== null) void window.studentIde.agent.cancel({ projectId, generation })
          }}
          onSubmit={submit}
        />
      </footer>
    </section>
  )
}

export function AiChatPanel({
  onClose,
  mode = 'learning',
  projectId = null,
}: {
  onClose(): void
  mode?: 'learning' | 'project'
  projectId?: ProjectId | null
}) {
  if (mode === 'project') return <ProjectChatPanel projectId={projectId} onClose={onClose} />
  return <LocalAiChatPanel onClose={onClose} />
}

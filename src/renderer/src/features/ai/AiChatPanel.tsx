import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiChatEvent, AiMessage } from '../../../../shared/contracts/ai'
import { Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Message, MessageContent, MessageGroup } from '../../components/ai/message'
import { MessageBubble, MessageBubbleContent } from '../../components/ai/message-bubble'
import { MessageScroller } from '../../components/ai/message-scroller'
import { PromptInput } from '../../components/ai/prompt-input'
import { StreamingResponse } from '../../components/ai/streaming-response'

interface ActiveChat { requestId?: string; early: AiChatEvent[]; index: number; stopping: boolean }
type ChatMessage = { role: 'user'; content: string } | {
  role: 'assistant'; content: string; state: 'streaming' | 'complete' | 'stopped' | 'error'
}

export function AiChatPanel({ onClose }: { onClose(): void }) {
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

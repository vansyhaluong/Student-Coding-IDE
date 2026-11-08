import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CHAT_POLICY as P, type ChatPrepared } from '../../src/shared/contracts/learning-chat'
import { isChatSession, isChatStatus } from '../../src/shared/contracts/learning-chat-validation'
import { smartBytes } from '../../src/shared/contracts/smart-hints-validation'
import { CHAT_RETIRE_REASONS } from '../../src/main/services/learning/chat/conversation-manager'
import { chatTextHash } from '../../src/main/services/learning/chat/context-builder'
import { chatFixture, defaultSource, ref, send, secret, selection } from '../fixtures/learning/chat'

const owned: ReturnType<typeof chatFixture>[] = []
const fixture = (...args: Parameters<typeof chatFixture>) => { const f = chatFixture(...args); owned.push(f); return f }
beforeEach(() => { vi.stubGlobal('fetch', () => { throw Error('NETWORK_FORBIDDEN') }) })
afterEach(() => { for (const f of owned.splice(0)) f.manager.stop(); vi.useRealTimers(); vi.unstubAllGlobals() })
function active(f: ReturnType<typeof fixture>, p = f.manager.prepare(f.owner, f.request())) { return { p, execution: f.manager.start(f.owner, send(p)) } }

describe('Main-owned RAM conversation lifecycle and atomic complete pairs', () => {
  it('is idempotent for the same context, isolates owners/scopes and cannot accept a forged execution', () => {
    const f = fixture(), s = f.snapshot(), { p, execution } = active(f)
    expect(f.manager.open(f.owner, s.context, 1, () => {})).toEqual(s)
    for (const owner of [{ id: 2, scope: f.owner.scope }, { id: 1, scope: randomUUID() }]) {
      expect(() => f.manager.snapshot(owner, s.sessionId)).toThrow()
      expect(() => f.manager.status(owner, ref(p))).toThrow()
    }
    expect(() => f.manager.complete({ ...execution }, { kind: 'CHAT_REPLY', text: 'forged' })).toThrow()
    const otherOwner = { id: 2, scope: randomUUID() }, other = f.manager.open(otherOwner, s.context, 1, () => {})
    expect(other.sessionId).not.toBe(s.sessionId); expect(other.messages).toEqual([])
    expect(() => f.manager.start(otherOwner, send(p))).toThrow()
  })
  it('commits only validated replies atomically, preserves text and makes the lease single-use', () => {
    const f = fixture(), q = f.request('QUESTION_ONLY', 'Unicode 🐟 é\r\nquestion'), p = f.manager.prepare(f.owner, q)
    expect(f.snapshot().messages).toEqual([])
    const execution = f.manager.start(f.owner, send(p))
    expect(f.snapshot().messages).toEqual([])
    expect(f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'Advice 🐟\r\nsecond line' }).state).toBe('COMPLETE')
    expect(f.snapshot().messages.map(m => m.text)).toEqual([q.question, 'Advice 🐟\r\nsecond line'])
    expect(f.snapshot().revision).toBe(1); expect(isChatSession(f.snapshot())).toBe(true)
    expect(execution.signal.aborted).toBe(true); expect(() => execution.capture()).toThrow()
    expect(() => f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'duplicate' })).toThrow()
    const copy = f.snapshot(); copy.messages[0].text = 'MUTATED'
    expect(f.snapshot().messages[0].text).toBe(q.question)
  })
  it.each(['invalid', 'partial', 'failed', 'cancelled'])('%s response cannot be committed or replayed', mode => {
    const f = fixture(), { p, execution } = active(f)
    if (mode === 'failed') f.manager.fail(execution, 'NETWORK')
    else if (mode === 'cancelled') f.manager.cancel(f.owner, ref(p))
    else expect(f.manager.complete(execution, mode === 'partial' ? { kind: 'PARTIAL', text: 'not final' }
        : { kind: 'CHAT_REPLY', text: 'x', proposalId: randomUUID() }).state).toBe('FAILED')
    expect(f.snapshot().messages).toEqual([])
    expect(() => f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'late' })).toThrow()
    const next = active(f)
    expect(next.execution.capture().input.history).toEqual([])
  })
  it.each(CHAT_RETIRE_REASONS)('%s purges history and active snapshots', reason => {
    const f = fixture(); f.commit()
    const { execution } = active(f)
    f.manager.retire(f.owner, reason)
    expect(execution.signal.aborted).toBe(true); expect(() => execution.capture()).toThrow()
    expect(() => f.snapshot()).toThrow()
    const fresh = f.manager.open(f.owner, f.initial.context, 1, () => {})
    expect(fresh.messages).toEqual([]); expect(fresh.sessionId).not.toBe(f.initial.sessionId)
  })
  it('provider generation and exercise/language/document switches never retain another conversation', () => {
    for (const mode of ['provider', 'exercise', 'language', 'document']) {
      const f = fixture(); f.commit()
      const context = f.snapshot().context
      if (context.kind !== 'PRACTICE') throw Error()
      const owner = mode === 'document' ? { ...f.owner, scope: randomUUID() } : f.owner
      const next = f.manager.open(owner, mode === 'exercise' ? { ...context, exerciseId: 'different' }
        : mode === 'language' ? { ...context, language: 'csharp' } : context, mode === 'provider' ? 2 : 1, () => {})
      expect(next.messages).toEqual([]); expect(next.sessionId).not.toBe(f.initial.sessionId)
      expect(() => f.snapshot()).toThrow()
    }
  })
  it('source/model revision update retains timeline, cancels prepared target and excludes old context from replay', () => {
    const f = fixture(); f.commit('QUESTION_WITH_SOURCE')
    const p = f.manager.prepare(f.owner, f.request('QUESTION_WITH_SELECTION'))
    f.update(defaultSource.replace('return n;', 'return n + 1;'))
    expect(f.snapshot().messages).toHaveLength(2)
    expect(f.manager.status(f.owner, ref(p)).state).toBe('CANCELLED')
    expect(() => f.manager.start(f.owner, send(p))).toThrow()
    const { execution } = active(f)
    expect(execution.capture().input.history).toEqual([])
    expect(() => f.manager.updateContext(f.owner, f.initial.sessionId, f.snapshot().revision - 1, f.snapshot().context, () => {})).toThrow()
  })
  it('source changes during RUNNING abort and reject late completion, even after restoring identical bytes', () => {
    const f = fixture(), { execution } = active(f)
    f.update(defaultSource + '\r\n// edit'); f.update(defaultSource)
    expect(execution.signal.aborted).toBe(true)
    expect(() => f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'late' })).toThrow()
    expect(f.snapshot().messages).toEqual([])
  })
  it('learning context supports question-only and never attaches an editor implicitly', () => {
    const f = fixture(), s = f.manager.open(f.owner, { kind: 'LEARNING', courseId: 'course', chapter: 4 }, 1, () => {})
    const q = { sessionId: s.sessionId, revision: s.revision, requestId: randomUUID(), question: 'What is a loop?', scope: 'QUESTION_ONLY', attachment: null }
    const p = f.manager.prepare(f.owner, q), execution = f.manager.start(f.owner, send(p))
    expect(execution.capture().input).toEqual({ question: q.question, history: [], attachment: null })
    f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'A repeated operation.' })
    expect(() => f.manager.prepare(f.owner, { ...q, requestId: randomUUID(), revision: 1, scope: 'QUESTION_WITH_SOURCE', attachment: { source: defaultSource } })).toThrow()
  })
  it('absolute 30-minute TTL does not extend on activity and purges capture/history', () => {
    const f = fixture(); f.commit(); const { execution } = active(f)
    f.advance(P.sessionMs)
    expect(() => f.snapshot()).toThrow(expect.objectContaining({ reason: 'SESSION_EXPIRED' }))
    expect(execution.signal.aborted).toBe(true); expect(() => execution.capture()).toThrow()
    const next = f.manager.open(f.owner, f.initial.context, 1, () => {})
    expect(next.messages).toEqual([])
  })
  it('timers purge idle sessions/prepared captures, and shutdown clears every owner', async () => {
    vi.useFakeTimers()
    const f = fixture(), p = f.manager.prepare(f.owner, f.request())
    f.advance(P.prepareMs); await vi.advanceTimersByTimeAsync(P.prepareMs)
    expect(f.manager.status(f.owner, ref(p)).state).toBe('EXPIRED')
    f.advance(P.sessionMs - P.prepareMs); await vi.advanceTimersByTimeAsync(P.sessionMs - P.prepareMs)
    expect(() => f.snapshot()).toThrow()
    f.manager.open(f.owner, f.initial.context, 1, () => {})
    f.manager.open({ id: 2, scope: randomUUID() }, f.initial.context, 1, () => {})
    f.manager.stop(); expect(vi.getTimerCount()).toBe(0)
    expect(() => f.manager.open(f.owner, f.initial.context, 1, () => {})).toThrow()
  })
  it('revoked owner guard purges source/history without propagating unsafe errors', () => {
    const f = fixture(); let live = true
    const s = f.manager.open({ id: 3, scope: f.owner.scope }, f.initial.context, 1, () => { if (!live) throw Error(secret) })
    live = false
    let error: unknown
    try { f.manager.snapshot({ id: 3, scope: f.owner.scope }, s.sessionId) } catch (e) { error = e }
    expect(error).toMatchObject({ reason: 'CONTEXT_STALE' }); expect(String(error)).not.toContain(secret)
  })
  it('provider/key retirement purges all owners and a terminal cancel never relabels a committed reply', () => {
    const f = fixture(), completed = f.commit()
    expect(f.manager.cancel(f.owner, ref(completed))).toEqual(completed)
    const otherOwner = { id: 2, scope: randomUUID() }, other = f.manager.open(otherOwner, f.initial.context, 1, () => {})
    f.manager.retireAll('KEY_CHANGED')
    expect(() => f.snapshot()).toThrow()
    expect(() => f.manager.snapshot(otherOwner, other.sessionId)).toThrow()
    const fresh = f.manager.open(f.owner, f.initial.context, 2, () => {})
    expect(fresh.messages).toEqual([])
  })
  it('abort/cleanup callbacks cannot publish COMPLETE after retiring the session', () => {
    const f = fixture(), { execution } = active(f)
    execution.signal.addEventListener('abort', () => f.manager.retire(f.owner, 'PANEL_CLOSED'), { once: true })
    const result = f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'validated but retired during cleanup' })
    expect(result.state).toBe('CANCELLED'); expect(() => f.snapshot()).toThrow()
    expect(f.manager.open(f.owner, f.initial.context, 1, () => {}).messages).toEqual([])
  })
})

describe('consent binding, replay provenance and deterministic bounds', () => {
  it('pins immutable source/selection and digest, rejecting mismatched context or consent', () => {
    const f = fixture(), q = f.request('QUESTION_WITH_SELECTION'), p = f.manager.prepare(f.owner, q)
    expect(f.manager.prepare(f.owner, q)).toEqual(p)
    for (const patch of [{ digest: '0'.repeat(64) }, { consentToken: randomUUID() }, { consentGranted: false }, { operationId: randomUUID() }])
      expect(() => f.manager.start(f.owner, { ...send(p), ...patch })).toThrow()
    if (q.scope !== 'QUESTION_WITH_SELECTION') throw Error()
    q.attachment.selection.text = 'MUTATED'; q.attachment.source = 'MUTATED'
    const execution = f.manager.start(f.owner, send(p)), capture = execution.capture()
    expect(capture.input.attachment).toMatchObject({ kind: 'SELECTION', text: 'return n;', eol: 'CRLF' })
    expect(Object.isFrozen(capture.input.attachment)).toBe(true)
    expect(capture.manifest).toMatchObject({ tokenCount: null, publicRun: false, digest: p.binding.digest })
    expect(() => f.manager.start(f.owner, send(p))).toThrow()
  })
  it('digest binds question, eligible history, context, scope and provider generation', () => {
    const f = fixture(); f.commit()
    const s = f.snapshot(), q = f.request(), original = f.builder.build(s, q, () => {})
    const variants = [f.builder.build(s, { ...q, question: 'Different question.' }, () => {}),
      f.builder.build({ ...s, providerGeneration: 2, messages: [] }, q, () => {}),
      f.builder.build({ ...s, messages: [] }, q, () => {}),
      f.builder.build(s, { ...f.request('QUESTION_WITH_SOURCE'), requestId: q.requestId }, () => {})]
    for (const capture of variants) expect(capture.binding.digest).not.toBe(original.binding.digest)
    const reordered = Object.fromEntries(Object.entries(q).reverse())
    expect(f.builder.build(s, reordered, () => {}).binding.digest).toBe(original.binding.digest)
  })
  it('a revision changed during preparation or reply validation cannot commit stale snapshots', () => {
    const f = fixture(), q = f.request()
    vi.spyOn(f.builder, 'assertSafe').mockImplementationOnce(() => { f.update(defaultSource + '\r\n// changed') })
    expect(() => f.manager.prepare(f.owner, q)).toThrow(expect.objectContaining({ reason: 'HISTORY_STALE' }))
    const { execution } = active(f)
    vi.spyOn(f.builder, 'assertSafe').mockImplementationOnce(() => { f.update(defaultSource + '\r\n// changed again') })
    expect(f.manager.complete(execution, { kind: 'CHAT_REPLY', text: 'late' }).state).not.toBe('COMPLETE')
    expect(f.snapshot().messages).toEqual([])
    vi.restoreAllMocks()
  })
  it('broader scopes never replay into narrower consent and selection identity must match', () => {
    const f = fixture()
    f.commit('QUESTION_ONLY', 'Q-only', 'A-only')
    f.commit('QUESTION_WITH_SOURCE', 'Q-source', 'A-source')
    f.commit('QUESTION_WITH_SELECTION', 'Q-selected', 'A-selected')
    const get = (scope: Parameters<typeof f.request>[0], selected?: string) => {
      const p = f.manager.prepare(f.owner, f.request(scope, 'next', selected)), execution = f.manager.start(f.owner, send(p))
      const capture = execution.capture(); f.manager.cancel(f.owner, ref(p)); return capture
    }
    expect(get('QUESTION_ONLY').input.history.map(m => m.text)).toEqual(['Q-only', 'A-only'])
    expect(get('QUESTION_WITH_SELECTION').input.history.map(m => m.text)).toEqual(['Q-only', 'A-only', 'Q-selected', 'A-selected'])
    expect(get('QUESTION_WITH_SELECTION', 'const tail = 1;').input.history.map(m => m.text)).toEqual(['Q-only', 'A-only'])
    expect(get('QUESTION_WITH_SOURCE').input.history.map(m => m.text)).toEqual(['Q-only', 'A-only', 'Q-source', 'A-source', 'Q-selected', 'A-selected'])
  })
  it('evicts whole oldest pairs at 32 messages and replays only eight latest eligible pairs', () => {
    const f = fixture()
    for (let i = 0; i < 20; i++) f.commit('QUESTION_ONLY', `question-${i}`, `reply-${i}`)
    const s = f.snapshot(); expect(s.messages).toHaveLength(32); expect(s.messages[0].text).toBe('question-4')
    const { execution } = active(f), capture = execution.capture()
    expect(capture.input.history).toHaveLength(16)
    expect(capture.input.history[0].text).toBe('question-12')
    expect(capture.manifest.historyMessageIds).toEqual(s.messages.slice(-16).map(m => m.messageId))
    expect(capture.manifest.historyBytes).toBe(smartBytes(capture.input.history))
    expect(isChatSession(s)).toBe(true)
  })
  it('48KiB history cap evicts deterministically; request budget drops pairs and never truncates current data', () => {
    const f = fixture()
    for (let i = 0; i < 8; i++) f.commit('QUESTION_ONLY', `q${i}`, `${i}:` + 'x'.repeat(10000))
    const s = f.snapshot()
    expect(smartBytes(s.messages)).toBeLessThanOrEqual(P.historyBytes)
    expect(s.messages[0].text).toBe('q4'); expect(s.messages).toHaveLength(8)
    const small = fixture(defaultSource, 150)
    small.commit('QUESTION_ONLY', 'q', 'r'.repeat(100))
    const p = small.manager.prepare(small.owner, small.request()), execution = small.manager.start(small.owner, send(p))
    expect(execution.capture().input.history).toEqual([])
    expect(execution.capture().manifest.requestBytes).toBeLessThanOrEqual(150)
    small.manager.cancel(small.owner, ref(p))
    expect(() => small.manager.prepare(small.owner, { ...small.request(), question: 'x'.repeat(200) })).toThrow(expect.objectContaining({ reason: 'CONTEXT_TOO_LARGE' }))
    const noRoom = fixture(defaultSource, 40)
    expect(() => noRoom.manager.prepare(noRoom.owner, noRoom.request())).toThrow(expect.objectContaining({ reason: 'CONTEXT_TOO_LARGE' }))
  })
  it('known secrets cannot enter prepared context or committed history, including encoded forms', () => {
    const f = fixture()
    for (const value of [secret, Buffer.from(secret).toString('base64')]) {
      expect(() => f.manager.prepare(f.owner, f.request('QUESTION_ONLY', value))).toThrow()
      const { execution } = active(f)
      expect(f.manager.complete(execution, { kind: 'CHAT_REPLY', text: value })).toMatchObject({ state: 'FAILED', code: 'INVALID_RESPONSE' })
    }
    expect(f.snapshot().messages).toEqual([])
    const withSecret = fixture(defaultSource + `\r\n// ${secret}`)
    expect(() => withSecret.manager.prepare(withSecret.owner, withSecret.request('QUESTION_WITH_SOURCE'))).toThrow()
    const p = withSecret.manager.prepare(withSecret.owner, withSecret.request('QUESTION_WITH_SELECTION'))
    const execution = withSecret.manager.start(withSecret.owner, send(p))
    expect(JSON.stringify(execution.capture())).not.toContain(secret)
    expect(JSON.stringify(p)).not.toContain(secret)
  })
  it('source fingerprints/EOL/range are checked without normalizing or repairing input', () => {
    const f = fixture(), q = f.request('QUESTION_WITH_SOURCE')
    expect(() => f.manager.prepare(f.owner, { ...q, attachment: { source: defaultSource.replace(/\r\n/g, '\n') } })).toThrow()
    const bad = f.request('QUESTION_WITH_SELECTION')
    if (bad.scope !== 'QUESTION_WITH_SELECTION') throw Error()
    bad.attachment.selection = selection(defaultSource, '🐟'); bad.attachment.selection.startOffset++
    bad.attachment.selection.text = defaultSource.slice(bad.attachment.selection.startOffset, bad.attachment.selection.endOffset)
    expect(() => f.manager.prepare(f.owner, bad)).toThrow()
    expect(chatTextHash('é')).not.toBe(chatTextHash('é'))
  })
  it('chat text can mention code/proposals but cannot grant editor authority or smuggle structured actions', () => {
    const f = fixture(), result = f.commit('QUESTION_ONLY', 'Explain this text.', '{"proposalId":"fake","edits":[],"action":"APPLY"}')
    expect(isChatStatus(result)).toBe(true)
    expect(result).not.toHaveProperty('proposalId'); expect(result.messages[1]).not.toHaveProperty('edits')
    const { execution } = active(f)
    expect(execution.capture().input.history.every(m => Object.keys(m).sort().join() === 'role,text')).toBe(true)
    expect(execution.capture()).not.toHaveProperty('consume')
    expect(f.manager.complete(execution, { kind: 'EDIT_PROPOSAL', edits: [] }).state).toBe('FAILED')
  })
  it('caps operation IDs without resetting quota/provider state or replaying old requests', () => {
    const f = fixture(); let first: ChatPrepared | undefined
    for (let i = 0; i < P.operations; i++) {
      const p = f.manager.prepare(f.owner, f.request()); first ??= p; f.manager.cancel(f.owner, ref(p))
    }
    expect(() => f.manager.start(f.owner, send(first!))).toThrow()
    expect(() => f.manager.prepare(f.owner, f.request())).toThrow(expect.objectContaining({ reason: 'LIMIT_EXCEEDED' }))
    expect(f.snapshot().messages).toEqual([])
  })
})

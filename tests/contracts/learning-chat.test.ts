import { afterEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as V from '../../src/shared/contracts/learning-chat-validation'
import { CHAT_POLICY as P } from '../../src/shared/contracts/learning-chat'
import { smartBytes } from '../../src/shared/contracts/smart-hints-validation'
import { chatFixture, send } from '../fixtures/learning/chat'

const owned: ReturnType<typeof chatFixture>[] = []
const fixture = () => { const f = chatFixture(); owned.push(f); return f }
afterEach(() => { for (const f of owned.splice(0)) f.manager.stop() })

describe('Learning Chat strict public contracts with no authority inputs', () => {
  it.each(['QUESTION_ONLY', 'QUESTION_WITH_SELECTION', 'QUESTION_WITH_SOURCE'] as const)('%s prepare/session/prepared/binding/manifest validates detached data', scope => {
    const f = fixture(), q = f.request(scope), p = f.manager.prepare(f.owner, q)
    expect(V.validateChatPrepare(q)).toMatchObject({ ok: true, value: q })
    expect(V.validateChatSession(f.snapshot()).ok).toBe(true)
    expect(V.validateChatPrepared(p).ok).toBe(true)
    expect(V.validateChatBinding(p.binding).ok).toBe(true)
    expect(V.validateChatConsentManifest(p.manifest).ok).toBe(true)
    expect(V.validateChatSend(send(p)).ok).toBe(true)
    const checked = V.validateChatPrepare(q)
    if (!checked.ok) throw Error()
    q.question = 'MUTATED'
    expect(checked.value.question).not.toBe('MUTATED')
  })
  it.each(['history', 'systemPrompt', 'systemInstruction', 'owner', 'providerGeneration', 'provenance', 'hiddenTests', 'run', 'sampleSolution', 'lockedHints', 'applyGrant', 'proposalId'])(
    'rejects renderer-provided %s', field => {
      const f = fixture(), q = { ...f.request(), [field]: 'UNTRUSTED' }
      expect(V.validateChatPrepare(q).ok).toBe(false)
      expect(() => f.manager.prepare(f.owner, q)).toThrow()
    })
  it.each([null, [], {}, { kind: 'LEARNING', courseId: '../escape', chapter: 1 }, { kind: 'LEARNING', courseId: 'course', chapter: -0 }])('malformed context %# is rejected', value => {
    expect(V.validateChatContext(value).ok).toBe(false)
  })
  it.each(['question', 'sessionId', 'revision', 'requestId', 'attachment'])('malformed %s is rejected', field => {
    const f = fixture(), q = { ...f.request(), [field]: field === 'revision' ? -1 : null }
    if (field === 'attachment') q.attachment = { source: 'unrequested' } as never
    expect(V.validateChatPrepare(q).ok).toBe(false)
  })
  it('rejects accessors, symbols, prototype objects, sparse arrays and unpaired transcript data', () => {
    const f = fixture(), q = f.request()
    const getter = Object.defineProperty({ ...q }, 'question', { get() { throw Error('MUST_NOT_READ') }, enumerable: true })
    expect(V.validateChatPrepare(getter).ok).toBe(false)
    expect(V.validateChatPrepare({ ...q, [Symbol('authority')]: true }).ok).toBe(false)
    expect(V.validateChatPrepare(Object.assign(Object.create({ inherited: true }), q)).ok).toBe(false)
    f.commit(); const s = f.snapshot()
    expect(V.validateChatSession({ ...s, messages: [s.messages[0]] }).ok).toBe(false)
    expect(V.validateChatSession({ ...s, messages: new Array(2) }).ok).toBe(false)
    expect(V.validateChatSession({ ...s, messages: [s.messages[1], s.messages[0]] }).ok).toBe(false)
  })
  it('checks UTF-8 byte limits, malformed Unicode, CRLF/surrogate boundaries and exact selection text', () => {
    const f = fixture()
    for (const question of ['x'.repeat(P.questionBytes + 1), '🐟'.repeat(1025), '\ud800', '\0', '   '])
      expect(V.validateChatPrepare({ ...f.request(), question }).ok).toBe(false)
    const q = f.request('QUESTION_WITH_SELECTION')
    if (q.scope !== 'QUESTION_WITH_SELECTION') throw Error()
    for (const patch of [{ text: 'wrong' }, { endOffset: 999999 }, { startLine: 999 }, { startOffset: -0 }])
      expect(V.validateChatPrepare({ ...q, attachment: { ...q.attachment, selection: { ...q.attachment.selection, ...patch } } }).ok).toBe(false)
    const source = 'x'.repeat(P.sourceBytes + 1)
    expect(V.validateChatPrepare({ ...f.request('QUESTION_WITH_SOURCE'), attachment: { source } }).ok).toBe(false)
    const result = V.validateChatPrepare({ ...f.request('QUESTION_WITH_SOURCE'), attachment: { source: 'bare\rCR' } })
    expect(result.ok).toBe(false)
  })
  it('validates COMPLETE and rejects forged messages/provenance/editor capability fields', () => {
    const f = fixture(), status = f.commit()
    expect(V.validateChatStatus(status).ok).toBe(true)
    const s = f.snapshot()
    expect(V.validateChatMessage(s.messages[1]).ok).toBe(true)
    expect(V.validateChatProvenance(s.messages[1].provenance).ok).toBe(true)
    expect(V.validateChatMessage({ ...s.messages[1], proposalId: randomUUID() }).ok).toBe(false)
    expect(V.validateChatMessage({ ...s.messages[1], state: 'PARTIAL' }).ok).toBe(false)
    expect(V.validateChatSession({ ...s, messages: [...s.messages, ...s.messages] }).ok).toBe(false)
    const other = structuredClone(s); other.messages[0].provenance.providerGeneration++
    other.messages[1].provenance.providerGeneration++
    expect(V.validateChatSession(other).ok).toBe(false)
    expect(V.validateChatStatus({ ...status, proposalId: null }).ok).toBe(false)
    expect(V.validateChatStatus({ ...status, binding: { ...status.binding, sessionId: randomUUID() } }).ok).toBe(false)
  })
  it('checks consent token/digest/manifest and response JSON byte bounds', () => {
    const f = fixture(), p = f.manager.prepare(f.owner, f.request())
    expect(V.validateChatPrepared({ ...p, manifest: { ...p.manifest, digest: '0'.repeat(64) } }).ok).toBe(false)
    expect(V.validateChatPrepared({ ...p, manifest: { ...p.manifest, tokenCount: 123 } }).ok).toBe(false)
    expect(V.validateChatPrepared({ ...p, manifest: { ...p.manifest, publicRun: true } }).ok).toBe(false)
    expect(V.validateChatSend({ ...send(p), consentGranted: false }).ok).toBe(false)
    expect(V.validateChatReply({ kind: 'CHAT_REPLY', text: 'x'.repeat(P.replyBytes) }).ok).toBe(false)
    expect(V.validateChatReply({ kind: 'CHAT_REPLY', text: 'x', edits: [] }).ok).toBe(false)
    expect(smartBytes(p)).toBeLessThan(P.requestBytes)
  })
  it('rejects a selection splitting CRLF and forged cross-exercise transcript provenance', () => {
    const f = fixture(), q = f.request('QUESTION_WITH_SELECTION')
    if (q.scope !== 'QUESTION_WITH_SELECTION') throw Error()
    const source = q.attachment.source, startOffset = source.indexOf('\n'), endOffset = source.indexOf('return n;')
    q.attachment.selection = { startOffset, endOffset, text: source.slice(startOffset, endOffset), startLine: 1, startColumn: 10, endLine: 2, endColumn: 1 }
    expect(V.validateChatPrepare(q).ok).toBe(false)
    f.commit(); const s = f.snapshot()
    for (const message of s.messages) if (message.provenance.context.kind === 'PRACTICE') message.provenance.context.exerciseId = 'different'
    expect(V.validateChatSession(s).ok).toBe(false)
  })
})

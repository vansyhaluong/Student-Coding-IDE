import { describe, expect, it } from 'vitest'
import {
  RUN_EXECUTION_PHASES, RUN_INPUT_CHANNELS, RUN_INPUT_GATE_REASONS, RUN_INPUT_LIMITS,
  RUN_INPUT_REJECTION_REASONS, RUN_STDIN_MODES,
  prepareRunInputText, runInputCapability,
  validateCloseRunInputRequest, validateRunEvent, validateRunInputAcknowledgement,
  validateRunInputCapability, validateRunInputStatus, validateRunInputStatusRequest,
  validateSendRunInputRequest,
  validateStartRunRequest,
  type ProjectId, type RunSessionId,
} from '../../src/shared/contracts'

const projectId = 'project_123456789012345678901234' as ProjectId
const sessionId = 'run_12345678-1234-1234-1234-123456789abc' as RunSessionId
const send = { projectId, sessionId, sequence: 1, text: 'hello' }
const close = { projectId, sessionId, sequence: 1 }
const openCapability = { mode: 'line-input' as const, acceptsInput: true as const }
const closedCapability = { mode: 'closed' as const, acceptsInput: false as const }
const forbidden = ['executable', 'args', 'command', 'cwd', 'environment', 'shell', 'pid',
  'stdin', 'stdinHandle', 'pipe', 'nativeHandle', 'canonicalRoot']

describe('M2-01 input capability', () => {
  it('opens line input only for a C# execute step', () => {
    expect(RUN_STDIN_MODES).toEqual(['closed', 'line-input'])
    expect(runInputCapability('csharp-project', 'EXECUTING')).toEqual(openCapability)
    for (const phase of RUN_EXECUTION_PHASES) {
      expect(runInputCapability('javascript-file', phase)).toEqual(closedCapability)
      if (phase !== 'EXECUTING') expect(runInputCapability('csharp-project', phase)).toEqual(closedCapability)
    }
    expect(validateRunInputCapability(openCapability)).toEqual({ ok: true, value: openCapability })
    expect(validateRunInputCapability(closedCapability)).toEqual({ ok: true, value: closedCapability })
  })

  it.each([
    { mode: 'closed', acceptsInput: true },
    { mode: 'line-input', acceptsInput: false },
    { mode: 'pty', acceptsInput: true },
    { mode: 'closed' },
  ])('rejects contradictory capability %j', capability => {
    expect(validateRunInputCapability(capability).ok).toBe(false)
  })
})

describe('M2-01 sendInput and closeInput validation', () => {
  it('accepts a sequenced line and an EOF barrier without process fields', () => {
    expect(RUN_INPUT_CHANNELS).toEqual({ send: 'run:send-input', close: 'run:close-input', status: 'run:input-status' })
    expect(validateSendRunInputRequest(send)).toEqual({ ok: true, value: send })
    expect(validateCloseRunInputRequest(close)).toEqual({ ok: true, value: close })
    expect(validateRunInputStatusRequest({ projectId, sessionId })).toEqual({ ok: true, value: { projectId, sessionId } })
    expect(validateRunInputStatusRequest({ projectId, sessionId, sequence: 1 }).ok).toBe(false)
    expect(validateSendRunInputRequest({ ...send, sequence: Number.MAX_SAFE_INTEGER, text: '' }).ok).toBe(true)
    expect(validateCloseRunInputRequest({ ...close, text: '' }).ok).toBe(false)
  })

  it('normalizes newlines and bounds the UTF-8 payload that would be written', () => {
    expect(prepareRunInputText('')).toEqual({ ok: true, value: '\n' })
    expect(prepareRunInputText('hello')).toEqual({ ok: true, value: 'hello\n' })
    expect(prepareRunInputText('hello\n')).toEqual({ ok: true, value: 'hello\n' })
    expect(prepareRunInputText('a\r\nb\rc')).toEqual({ ok: true, value: 'a\nb\nc\n' })
    expect(prepareRunInputText('xin chào 😀')).toEqual({ ok: true, value: 'xin chào 😀\n' })
    const fitted = 'a'.repeat(RUN_INPUT_LIMITS.maximumRequestUtf8Bytes - 1)
    expect(prepareRunInputText(fitted).ok).toBe(true)
    expect(prepareRunInputText(`${fitted}\n`).ok).toBe(true)
    expect(prepareRunInputText('a'.repeat(RUN_INPUT_LIMITS.maximumRequestUtf8Bytes)).ok).toBe(false)
    expect(prepareRunInputText('\n'.repeat(RUN_INPUT_LIMITS.maximumRequestUtf8Bytes)).ok).toBe(true)
    expect(prepareRunInputText('\n'.repeat(RUN_INPUT_LIMITS.maximumRequestUtf8Bytes + 1)).ok).toBe(false)
    expect(validateSendRunInputRequest({ ...send, text: 'a'.repeat(RUN_INPUT_LIMITS.maximumRequestUtf8Bytes) }).ok).toBe(false)
  })

  it.each(['\0', 'a\0b', '\uD800', '\uDC00', '\uD800\uD800', '\uD800a'])('rejects NUL or unpaired surrogate %s', text => {
    expect(prepareRunInputText(text).ok).toBe(false)
    expect(validateSendRunInputRequest({ ...send, text }).ok).toBe(false)
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])('rejects sequence %s', sequence => {
    expect(validateSendRunInputRequest({ ...send, sequence }).ok).toBe(false)
    expect(validateCloseRunInputRequest({ ...close, sequence }).ok).toBe(false)
  })

  it('rejects missing identity, malformed text and command or process fields', () => {
    expect(validateSendRunInputRequest({ sessionId, sequence: 1, text: 'x' }).ok).toBe(false)
    expect(validateSendRunInputRequest({ ...send, projectId: 'project_wrong' }).ok).toBe(false)
    expect(validateSendRunInputRequest({ ...send, sessionId: 'run_wrong' }).ok).toBe(false)
    expect(validateSendRunInputRequest({ ...send, text: 1 }).ok).toBe(false)
    expect(validateCloseRunInputRequest({ projectId, sequence: 1 }).ok).toBe(false)
    for (const field of forbidden) {
      expect(validateSendRunInputRequest({ ...send, [field]: 'injected' }).ok).toBe(false)
      expect(validateCloseRunInputRequest({ ...close, [field]: 1 }).ok).toBe(false)
    }
    expect(validateStartRunRequest(send).ok).toBe(false)
    expect(validateRunEvent({ type: 'input', session: { projectId, relativePath: 'main.js', sessionId, state: 'RUNNING' }, data: 'x' }).ok).toBe(false)
  })
})

describe('M2-01 acknowledgements and status', () => {
  it('accepts delivery and allows retry only for a busy queue', () => {
    const delivered = { ...close, state: 'DELIVERED' as const }
    expect(validateRunInputAcknowledgement(delivered)).toEqual({ ok: true, value: delivered })
    for (const reason of RUN_INPUT_REJECTION_REASONS) {
      const rejected = { ...close, state: 'REJECTED' as const, reason, retryable: reason === 'INPUT_BUSY' }
      expect(validateRunInputAcknowledgement(rejected)).toEqual({ ok: true, value: rejected })
    }
    expect(validateRunInputAcknowledgement({ ...close, state: 'REJECTED', reason: 'INPUT_BUSY', retryable: false }).ok).toBe(false)
    expect(validateRunInputAcknowledgement({ ...close, state: 'REJECTED', reason: 'WRITE_TIMEOUT', retryable: true }).ok).toBe(false)
    expect(validateRunInputAcknowledgement({ ...delivered, reason: 'INPUT_BUSY' }).ok).toBe(false)
    expect(validateRunInputAcknowledgement({ ...close, state: 'QUEUED' }).ok).toBe(false)
  })

  it('reports an open composer only while line input is accepted', () => {
    const open = {
      projectId, sessionId, capability: openCapability, nextSequence: 2,
      queuedSubmissions: RUN_INPUT_LIMITS.maximumQueuedSubmissions,
      queuedUtf8Bytes: RUN_INPUT_LIMITS.maximumQueuedUtf8Bytes, gate: 'OPEN' as const,
    }
    expect(validateRunInputStatus(open)).toEqual({ ok: true, value: open })
    expect(validateRunInputStatus({ ...open, capability: closedCapability }).ok).toBe(false)
    expect(validateRunInputStatus({ ...open, queuedSubmissions: RUN_INPUT_LIMITS.maximumQueuedSubmissions + 1 }).ok).toBe(false)
    expect(validateRunInputStatus({ ...open, queuedUtf8Bytes: RUN_INPUT_LIMITS.maximumQueuedUtf8Bytes + 1 }).ok).toBe(false)
    for (const reason of RUN_INPUT_GATE_REASONS) {
      const closed = { projectId, sessionId, capability: closedCapability, nextSequence: 1, queuedSubmissions: 0, queuedUtf8Bytes: 0, gate: 'CLOSED' as const, reason }
      expect(validateRunInputStatus(closed)).toEqual({ ok: true, value: closed })
      expect(validateRunInputStatus({ ...closed, capability: openCapability }).ok).toBe(true)
    }
    expect(validateRunInputStatus({ ...open, gate: 'CLOSED' }).ok).toBe(false)
    expect(validateRunInputStatus({ ...open, command: 'dotnet' }).ok).toBe(false)
    expect(RUN_INPUT_LIMITS.writeDeadlineMilliseconds).toBe(10_000)
  })
})

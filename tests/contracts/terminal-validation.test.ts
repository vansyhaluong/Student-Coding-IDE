import { describe, expect, it } from 'vitest'

import {
  TERMINAL_LIMITS,
  canTransitionTerminalSession,
  isProjectId,
  isTerminalSessionId,
  isTerminalSessionState,
  validateCloseTerminalRequest,
  validateCloseTerminalResponse,
  validateCreateTerminalRequest,
  validateCreateTerminalResponse,
  validateResizeTerminalRequest,
  validateTerminalEvent,
  validateTerminalInputRequest,
  validateTerminalSessionId,
  type TerminalSessionState,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678'
const sessionId = 'terminal-session_123'

describe('Phase 2E-C terminal identities and states', () => {
  it('accepts bounded opaque session IDs and reuses ProjectId validation', () => {
    expect(isTerminalSessionId(sessionId)).toBe(true)
    expect(validateTerminalSessionId(sessionId)).toEqual({
      ok: true,
      value: sessionId,
    })
    expect(isProjectId(projectId)).toBe(true)
  })

  it('rejects empty, oversized, control, whitespace, and path-like session IDs', () => {
    expect(isTerminalSessionId('')).toBe(false)
    expect(isTerminalSessionId('x'.repeat(TERMINAL_LIMITS.maximumSessionIdLength + 1)))
      .toBe(false)
    expect(isTerminalSessionId('terminal\n1')).toBe(false)
    expect(isTerminalSessionId('terminal 1')).toBe(false)
    expect(isTerminalSessionId('C:\\shell\\session')).toBe(false)
  })

  it('accepts only the five documented states and allowed transitions', () => {
    const allowed: Array<[TerminalSessionState, TerminalSessionState]> = [
      ['CREATING', 'RUNNING'],
      ['CREATING', 'FAILED'],
      ['RUNNING', 'CLOSING'],
      ['RUNNING', 'EXITED'],
      ['RUNNING', 'FAILED'],
      ['CLOSING', 'EXITED'],
      ['CLOSING', 'FAILED'],
    ]
    for (const [from, to] of allowed) {
      expect(canTransitionTerminalSession(from, to), `${from} -> ${to}`).toBe(true)
    }
    expect(isTerminalSessionState('RUNNING')).toBe(true)
    expect(isTerminalSessionState('CANCELLED')).toBe(false)
  })

  it('rejects terminal, self, backward, and nonsensical transitions', () => {
    const rejected: Array<[TerminalSessionState, TerminalSessionState]> = [
      ['CREATING', 'CLOSING'],
      ['RUNNING', 'CREATING'],
      ['CLOSING', 'RUNNING'],
      ['EXITED', 'RUNNING'],
      ['FAILED', 'CREATING'],
      ['RUNNING', 'RUNNING'],
    ]
    for (const [from, to] of rejected) {
      expect(canTransitionTerminalSession(from, to), `${from} -> ${to}`).toBe(false)
    }
  })
})

describe('Phase 2E-C terminal request and response validation', () => {
  it('accepts exact create requests and RUNNING responses', () => {
    expect(validateCreateTerminalRequest({ projectId, cols: 80, rows: 24 }))
      .toEqual({ ok: true, value: { projectId, cols: 80, rows: 24 } })
    expect(validateCreateTerminalResponse({
      sessionId,
      projectId,
      state: 'RUNNING',
      cols: 80,
      rows: 24,
      shellLabel: 'Windows PowerShell',
    }).ok).toBe(true)
  })

  it('rejects missing create fields, foreign projects, and non-running responses', () => {
    expect(validateCreateTerminalRequest({ projectId, cols: 80 }).ok).toBe(false)
    expect(validateCreateTerminalRequest({
      projectId: 'project_foreign',
      cols: 80,
      rows: 24,
    }).ok).toBe(false)
    expect(validateCreateTerminalResponse({
      sessionId,
      projectId,
      state: 'CREATING',
      cols: 80,
      rows: 24,
      shellLabel: 'PowerShell',
    }).ok).toBe(false)
  })

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    TERMINAL_LIMITS.maximumDimension + 1,
  ])('rejects invalid terminal dimension %s', (dimension) => {
    expect(validateCreateTerminalRequest({
      projectId,
      cols: dimension,
      rows: 24,
    }).ok).toBe(false)
    expect(validateResizeTerminalRequest({
      sessionId,
      cols: 80,
      rows: dimension,
    }).ok).toBe(false)
  })

  it('accepts dimension boundaries and exact resize/close contracts', () => {
    expect(validateResizeTerminalRequest({
      sessionId,
      cols: TERMINAL_LIMITS.minimumDimension,
      rows: TERMINAL_LIMITS.maximumDimension,
    }).ok).toBe(true)
    expect(validateCloseTerminalRequest({ sessionId }).ok).toBe(true)
    expect(validateCloseTerminalResponse({ status: 'closed' }).ok).toBe(true)
    expect(validateCloseTerminalResponse({ status: 'already-closed' }).ok).toBe(true)
  })

  it('rejects expanded create authority and extra resize/close fields', () => {
    const forbidden = {
      executable: 'cmd.exe',
      args: ['/K'],
      cwd: 'C:\\',
      env: { SECRET: 'value' },
      pid: 123,
      shellPath: 'C:\\Windows\\System32\\cmd.exe',
      processOptions: { shell: true },
    }
    for (const [field, fieldValue] of Object.entries(forbidden)) {
      expect(validateCreateTerminalRequest({
        projectId,
        cols: 80,
        rows: 24,
        [field]: fieldValue,
      }).ok, field).toBe(false)
    }
    expect(validateResizeTerminalRequest({
      sessionId,
      cols: 80,
      rows: 24,
      force: true,
    }).ok).toBe(false)
    expect(validateCloseTerminalRequest({ sessionId, signal: 9 }).ok).toBe(false)
  })

  it('accepts ASCII, Unicode, and control-byte input while rejecting empty input', () => {
    expect(validateTerminalInputRequest({ sessionId, data: 'dir\r' }).ok).toBe(true)
    expect(validateTerminalInputRequest({ sessionId, data: 'xin chào 🌏\r' }).ok)
      .toBe(true)
    expect(validateTerminalInputRequest({ sessionId, data: '\x03' }).ok).toBe(true)
    expect(validateTerminalInputRequest({ sessionId, data: '' }).ok).toBe(false)
    expect(validateTerminalInputRequest({
      sessionId,
      data: 'dir\r',
      encoding: 'utf16',
    }).ok).toBe(false)
  })

  it('enforces the input limit in UTF-8 bytes, including multi-byte boundaries', () => {
    expect(validateTerminalInputRequest({
      sessionId,
      data: 'a'.repeat(TERMINAL_LIMITS.maximumInputBytes),
    }).ok).toBe(true)
    expect(validateTerminalInputRequest({
      sessionId,
      data: 'a'.repeat(TERMINAL_LIMITS.maximumInputBytes + 1),
    }).ok).toBe(false)
    const exactMultiByte = 'é'.repeat(TERMINAL_LIMITS.maximumInputBytes / 2)
    expect(validateTerminalInputRequest({ sessionId, data: exactMultiByte }).ok)
      .toBe(true)
    expect(validateTerminalInputRequest({ sessionId, data: `${exactMultiByte}a` }).ok)
      .toBe(false)
  })
})

describe('Phase 2E-C terminal event validation', () => {
  it('accepts exact data, exit, and serialized error events', () => {
    expect(validateTerminalEvent({
      type: 'data',
      sessionId,
      projectId,
      sequence: 0,
      data: '\u001b[32mready\u001b[0m',
    }).ok).toBe(true)
    expect(validateTerminalEvent({
      type: 'exit',
      sessionId,
      projectId,
      exitCode: 0,
      signal: null,
    }).ok).toBe(true)
    expect(validateTerminalEvent({
      type: 'exit',
      sessionId,
      projectId,
      exitCode: null,
      signal: 2,
    }).ok).toBe(true)
    expect(validateTerminalEvent({
      type: 'error',
      sessionId,
      projectId,
      error: {
        code: 'PROCESS_FAILED',
        message: 'The terminal process failed.',
        operation: 'terminal:input',
        details: { retryCount: 0, nativeErrorIncluded: false },
        retryable: false,
      },
    }).ok).toBe(true)
  })

  it('rejects ready as redundant and rejects invalid discriminants', () => {
    expect(validateTerminalEvent({
      type: 'ready',
      sessionId,
      projectId,
      cols: 80,
      rows: 24,
    }).ok).toBe(false)
    expect(validateTerminalEvent({ type: 'output' }).ok).toBe(false)
  })

  it('rejects missing identities, invalid sequences, and unexpected fields', () => {
    expect(validateTerminalEvent({
      type: 'data',
      projectId,
      sequence: 0,
      data: 'x',
    }).ok).toBe(false)
    expect(validateTerminalEvent({
      type: 'data',
      sessionId,
      sequence: 0,
      data: 'x',
    }).ok).toBe(false)
    for (const sequence of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateTerminalEvent({
        type: 'data',
        sessionId,
        projectId,
        sequence,
        data: 'x',
      }).ok).toBe(false)
    }
    expect(validateTerminalEvent({
      type: 'exit',
      sessionId,
      projectId,
      exitCode: 0,
      signal: null,
      nativeSignal: 'SIGTERM',
    }).ok).toBe(false)
  })

  it('rejects raw Error objects and malformed serializable errors', () => {
    expect(validateTerminalEvent({
      type: 'error',
      sessionId,
      projectId,
      error: new Error('native stack must not cross IPC'),
    }).ok).toBe(false)
    expect(validateTerminalEvent({
      type: 'error',
      sessionId,
      projectId,
      error: {
        code: 'TERMINAL_FAILED',
        message: 'bad',
        retryable: false,
        stack: 'secret stack',
      },
    }).ok).toBe(false)
  })
})

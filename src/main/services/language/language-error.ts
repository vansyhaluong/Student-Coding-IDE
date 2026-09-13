import { DomainError } from '../../errors/app-error'

export type LanguageFailure = 'cancelled' | 'stale-session' | 'closed' | 'protocol-error'
  | 'timeout' | 'capability-mismatch' | 'invalid-response' | 'startup-failed'
  | 'cleanup-failed' | 'not-running' | 'busy' | 'invalid-context' | 'invalid-handle'
  | 'persistence-failed' | 'preflight-failed' | 'invalid-version' | 'stale-document'

/** No provider messages, paths, JSON-RPC IDs, or process details in domain errors. */
export class LanguageError extends DomainError {
  constructor(readonly reason: LanguageFailure) {
    super({ code: 'PROCESS_FAILED', message: 'The C# language operation could not complete.',
      operation: 'language', details: { reason }, retryable: false })
  }
}

export function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new LanguageError('timeout')), milliseconds)
    work.then((value) => { clearTimeout(timer); resolve(value) },
      (error: unknown) => { clearTimeout(timer); reject(error) })
  })
}

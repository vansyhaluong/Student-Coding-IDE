import { PROJECT_AGENT_LIMITS as LIMITS } from '../../../shared/contracts/project-agent'
import { DomainError } from '../../errors/app-error'
import type { ProviderTransport } from '../learning/analysis/contracts'
import {
  GEMINI_GENERATE_URL,
  GEMINI_MODEL,
} from '../learning/smart-hints/gemini-transport'
import type { AgentModel, AgentModelStep } from './project-agent-service'

export interface ProjectAgentGeminiCredential {
  ready(): boolean
  generation(): number
  value(): string
}

const CALL_TIMEOUT_MS = 30_000
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'text', 'relativePath', 'destinationPath', 'content', 'summary'],
  properties: {
    action: { type: 'string', enum: ['reply', 'read', 'list', 'propose', 'create', 'delete', 'rename'] },
    text: { type: 'string' },
    relativePath: { type: 'string' },
    destinationPath: { type: 'string' },
    content: { type: 'string' },
    summary: { type: 'string' },
  },
} as const

/**
 * Separate Gemini caller for the Project Agent. It uses the same model and
 * endpoint style as Learning Mode and does not change Learning's transport.
 */
export class GeminiProjectAgentModel implements AgentModel {
  constructor(
    private readonly transport: ProviderTransport,
    private readonly credential: ProjectAgentGeminiCredential,
  ) {}

  ready(): boolean {
    return this.credential.ready()
  }

  providerGeneration(): number {
    return this.credential.generation()
  }

  async complete(step: AgentModelStep, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw cancelled()
    if (!this.credential.ready()) throw geminiUnavailable()
    const key = this.credential.value()
    if (!key) throw geminiUnavailable()
    const started = this.credential.generation()
    const body = {
      systemInstruction: { parts: [{ text: step.system }] },
      contents: step.contents.map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      })),
      generationConfig: {
        responseMimeType: 'application/json' as const,
        responseJsonSchema: schema,
        candidateCount: 1 as const,
        maxOutputTokens: LIMITS.maxOutputTokens,
      },
    }
    if ('tools' in body || Buffer.byteLength(JSON.stringify(body)) > LIMITS.wireBytes) {
      throw invalidResponse()
    }
    const forms = [key, Buffer.from(key).toString('base64')]
    if (forms.some((secret) => secret.length > 0 && JSON.stringify(body).includes(secret))) {
      throw invalidResponse()
    }
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS)
    try {
      const request = new Request(GEMINI_GENERATE_URL, {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
      const response = await this.transport.send(request)
      if (signal.aborted) throw cancelled()
      if (response.status === 401 || response.status === 403) {
        discard(response)
        throw rejectedKey()
      }
      if (response.status === 429) {
        discard(response)
        throw quotaReached()
      }
      if (!response.ok) {
        discard(response)
        throw requestFailed()
      }
      const raw = await readJson(response)
      if (forms.some((secret) => raw.includes(secret))) throw invalidResponse()
      if (this.credential.generation() !== started) throw stale()
      return parseAction(raw)
    } catch (error) {
      if (signal.aborted) throw cancelled()
      if (error instanceof DomainError) throw error
      if (controller.signal.aborted) {
        throw new DomainError({
          code: 'PROCESS_FAILED',
          message: 'The project agent model timed out.',
          operation: 'project-agent:turn',
          retryable: true,
        })
      }
      throw unreachable()
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function parseAction(raw: string): unknown {
  let envelope: unknown
  try {
    envelope = JSON.parse(raw) as unknown
  } catch {
    throw invalidResponse()
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw invalidResponse()
  const record = envelope as Record<string, unknown>
  const candidates = record.candidates
  if (!Array.isArray(candidates) || candidates.length !== 1) throw invalidResponse()
  const candidate = candidates[0]
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw invalidResponse()
  const fields = candidate as Record<string, unknown>
  if (fields.finishReason !== 'STOP') throw invalidResponse()
  const content = fields.content
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw invalidResponse()
  const parts = (content as Record<string, unknown>).parts
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 8) throw invalidResponse()
  let text = ''
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw invalidResponse()
    const item = part as Record<string, unknown>
    if (item.thought === true) continue
    if (typeof item.text !== 'string') throw invalidResponse()
    text += item.text
  }
  if (text.length === 0 || text.length > LIMITS.wireBytes) throw invalidResponse()
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw invalidResponse()
  }
}

async function readJson(response: Response): Promise<string> {
  const type = response.headers.get('content-type')
  if (!type?.toLowerCase().startsWith('application/json') || !response.body) throw invalidResponse()
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > LIMITS.wireBytes)) throw invalidResponse()
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let raw = ''
  let bytes = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > LIMITS.wireBytes) throw invalidResponse()
      raw += decoder.decode(part.value, { stream: true })
    }
    raw += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  return raw
}

function cancelled(): DomainError {
  return new DomainError({
    code: 'PROCESS_CANCELLED',
    message: 'The project agent turn was cancelled.',
    operation: 'project-agent:turn',
    retryable: false,
  })
}

function stale(): DomainError {
  return new DomainError({
    code: 'PERMISSION_DENIED',
    message: 'The project agent request is stale.',
    operation: 'project-agent:authorize',
    retryable: false,
  })
}

function geminiUnavailable(): DomainError {
  return new DomainError({
    code: 'DEPENDENCY_MISSING',
    message: 'Gemini is not configured. Enable the existing Gemini key in Settings.',
    operation: 'project-agent:turn',
    retryable: false,
  })
}

function rejectedKey(): DomainError {
  return new DomainError({
    code: 'PERMISSION_DENIED',
    message: 'The Gemini key was rejected. Check the key in Settings.',
    operation: 'project-agent:turn',
    retryable: false,
  })
}

function quotaReached(): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED',
    message: 'Gemini could not complete the request because its quota or rate limit was reached.',
    operation: 'project-agent:turn',
    retryable: true,
  })
}

function requestFailed(): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED',
    message: 'Gemini could not complete the request.',
    operation: 'project-agent:turn',
    retryable: true,
  })
}

function unreachable(): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED',
    message: 'The project agent could not reach Gemini.',
    operation: 'project-agent:turn',
    retryable: true,
  })
}

function discard(response: Response): void {
  void response.body?.cancel().then(() => undefined, () => undefined)
}

function invalidResponse(): DomainError {
  return new DomainError({
    code: 'INVALID_INPUT',
    message: 'The project agent model returned an invalid response.',
    operation: 'project-agent:turn',
    retryable: false,
  })
}

export const PROJECT_AGENT_GEMINI_MODEL = GEMINI_MODEL

import { describe, expect, it, vi } from 'vitest'
import { GEMINI_GENERATE_URL, GEMINI_MODEL } from '../../src/main/services/learning/smart-hints/gemini-transport'
import { GeminiProjectAgentModel, type ProjectAgentGeminiCredential } from '../../src/main/services/ai/project-agent-gemini'

const KEY = 'test-key'
const step = { system: 'Be careful.', contents: [{ role: 'user' as const, text: 'Hello' }] }

function credential(overrides: Partial<ProjectAgentGeminiCredential> = {}): ProjectAgentGeminiCredential {
  return {
    ready: () => true,
    generation: () => 4,
    value: () => KEY,
    ...overrides,
  }
}

function replyResponse(): Response {
  return new Response(JSON.stringify({
    candidates: [{
      finishReason: 'STOP',
      content: { role: 'model', parts: [{ text: JSON.stringify({
        action: 'reply', text: 'Hello', relativePath: '', destinationPath: '', content: '', summary: '',
      }) }] },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('project agent Gemini caller', () => {
  it('calls the Learning Mode model without tool authority', async () => {
    let body = ''
    let redirect = ''
    const model = new GeminiProjectAgentModel({
      send: async (request) => {
        redirect = request.redirect
        body = await request.text()
        expect(request.url).toBe(GEMINI_GENERATE_URL)
        expect(request.url).toContain(GEMINI_MODEL)
        expect(request.headers.get('x-goog-api-key')).toBe('test-key')
        return new Response(JSON.stringify({
          candidates: [{
            finishReason: 'STOP',
            content: { role: 'model', parts: [{ text: JSON.stringify({
              action: 'reply', text: 'Hello', relativePath: '', destinationPath: '', content: '', summary: '',
            }) }] },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      },
    }, credential())
    await expect(model.complete({
      system: 'Be careful.',
      contents: [{ role: 'user', text: 'Hello' }],
    }, new AbortController().signal)).resolves.toMatchObject({ action: 'reply', text: 'Hello' })
    const parsed = JSON.parse(body) as {
      tools?: unknown
      generationConfig: { candidateCount: number; responseJsonSchema: { properties: { action: { enum: string[] } } } }
    }
    expect(parsed.tools).toBeUndefined()
    expect(parsed.generationConfig.candidateCount).toBe(1)
    expect(parsed.generationConfig.responseJsonSchema.properties.action.enum).toEqual(
      expect.arrayContaining(['create', 'delete', 'rename']),
    )
    expect(redirect).toBe('error')
  })

  it('reads the Settings credential on every call and does not send when the key is missing', async () => {
    const send = vi.fn(async () => replyResponse())
    const missing = new GeminiProjectAgentModel({ send }, credential({ ready: () => false }))
    await expect(missing.complete(step, new AbortController().signal)).rejects.toMatchObject({
      code: 'DEPENDENCY_MISSING',
      message: 'Gemini is not configured. Enable the existing Gemini key in Settings.',
    })
    const empty = new GeminiProjectAgentModel({ send }, credential({ value: () => '' }))
    await expect(empty.complete(step, new AbortController().signal)).rejects.toMatchObject({
      code: 'DEPENDENCY_MISSING',
      message: 'Gemini is not configured. Enable the existing Gemini key in Settings.',
    })
    expect(send).not.toHaveBeenCalled()

    const keys = ['key-one', 'key-two']
    let reads = 0
    const headers: string[] = []
    const rotating = new GeminiProjectAgentModel({
      send: async (request) => {
        headers.push(request.headers.get('x-goog-api-key') ?? '')
        const body = await request.text()
        expect(body).not.toContain('key-one')
        expect(body).not.toContain('key-two')
        return replyResponse()
      },
    }, credential({
      value: () => {
        const key = keys[reads] ?? ''
        reads += 1
        return key
      },
    }))
    await rotating.complete(step, new AbortController().signal)
    await rotating.complete(step, new AbortController().signal)
    expect(headers).toEqual(keys)
    expect(reads).toBe(2)
  })

  it('maps a rejected key, quota, network failure, and invalid response without revealing the key', async () => {
    const cases = [
      {
        send: async () => new Response(JSON.stringify({ error: KEY }), { status: 401 }),
        error: { code: 'PERMISSION_DENIED', message: 'The Gemini key was rejected. Check the key in Settings.' },
      },
      {
        send: async () => new Response(null, { status: 403 }),
        error: { code: 'PERMISSION_DENIED', message: 'The Gemini key was rejected. Check the key in Settings.' },
      },
      {
        send: async () => new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429 }),
        error: {
          code: 'PROCESS_FAILED',
          message: 'Gemini could not complete the request because its quota or rate limit was reached.',
          retryable: true,
        },
      },
      {
        send: async () => {
          throw new TypeError(`network down ${KEY}`)
        },
        error: { code: 'PROCESS_FAILED', message: 'The project agent could not reach Gemini.', retryable: true },
      },
      {
        send: async () => new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } }),
        error: { code: 'INVALID_INPUT', message: 'The project agent model returned an invalid response.' },
      },
      {
        send: async () => new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
        error: { code: 'INVALID_INPUT', message: 'The project agent model returned an invalid response.' },
      },
    ]
    for (const item of cases) {
      const model = new GeminiProjectAgentModel({ send: item.send }, credential())
      const error = await model.complete(step, new AbortController().signal).then(() => {
        throw new Error('expected the Gemini call to fail')
      }, (caught: unknown) => caught)
      expect(error).toMatchObject(item.error)
      expect(JSON.stringify(error)).not.toContain(KEY)
    }

    const send = vi.fn(async () => replyResponse())
    const aborted = new AbortController()
    aborted.abort()
    const model = new GeminiProjectAgentModel({ send }, credential())
    await expect(model.complete(step, aborted.signal)).rejects.toMatchObject({
      code: 'PROCESS_CANCELLED',
      message: 'The project agent turn was cancelled.',
    })
    expect(send).not.toHaveBeenCalled()
  })
})

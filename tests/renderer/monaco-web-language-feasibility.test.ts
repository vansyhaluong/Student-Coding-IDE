import { describe, expect, it, vi } from 'vitest'
import { CSSWorker } from 'monaco-editor/languages/features/css/cssWorker'
import { HTMLWorker } from 'monaco-editor/languages/features/html/htmlWorker'
import { JSONWorker } from 'monaco-editor/languages/features/json/jsonWorker'

import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId

class MutableMirrorModel implements MonacoWebMirrorModel {
  version = 1

  constructor(
    readonly uri: MonacoWebWorkerUri,
    private content: string,
  ) {}

  getValue(): string { return this.content }

  update(content: string): void {
    this.content = content
    this.version += 1
  }
}

function model(relativePath: string, content: string) {
  const uri = projectDocumentUri(projectId, relativePath)
  const mirror = new MutableMirrorModel({ toString: () => uri }, content)
  let attached = true
  return {
    uri,
    mirror,
    context: {
      getMirrorModels: () => attached ? [mirror] : [],
    },
    dispose: () => { attached = false },
  }
}

function labels(completion: MonacoWebCompletionList | null): string[] {
  return completion?.items.map(({ label }) => label) ?? []
}

function hoverText(hover: MonacoWebHover | null): string {
  return JSON.stringify(hover?.contents ?? '')
}

describe('Monaco HTML worker', () => {
  it('provides standard tag completion and hover from current dirty content', async () => {
    const source = model('index.html', '<di')
    const worker = new HTMLWorker(source.context, {
      languageId: 'html',
      languageSettings: {
        suggest: {},
        data: { useDefaultDataProvider: true },
      },
    })

    expect(labels(await worker.doComplete(source.uri, { line: 0, character: 3 })))
      .toContain('div')

    source.mirror.update('<button d')
    expect(labels(await worker.doComplete(source.uri, { line: 0, character: 9 })))
      .toContain('disabled')

    source.mirror.update('<button disabled>Save</button>')
    const hover = await worker.doHover(source.uri, { line: 0, character: 2 })
    expect(hoverText(hover).toLowerCase()).toContain('button')
  })

  it('has no custom or built-in validation method and releases disposed models', async () => {
    const source = model('index.html', '<di')
    const worker = new HTMLWorker(source.context, {
      languageId: 'html',
      languageSettings: { data: { useDefaultDataProvider: true } },
    })
    expect('doValidation' in worker).toBe(false)

    source.dispose()
    await expect(worker.doComplete(source.uri, { line: 0, character: 3 }))
      .resolves.toBeNull()
  })
})

describe('Monaco CSS worker', () => {
  it('provides property completion and useful hover', async () => {
    const source = model('styles.css', '.card { dis }')
    const worker = new CSSWorker(source.context, {
      languageId: 'css',
      options: {
        validate: true,
        data: { useDefaultDataProvider: true },
      },
    })

    expect(labels(await worker.doComplete(source.uri, { line: 0, character: 11 })))
      .toContain('display')
    source.mirror.update('.card { display: f }')
    expect(labels(await worker.doComplete(source.uri, { line: 0, character: 18 })))
      .toContain('flex')
    source.mirror.update('.card { display: flex; }')
    const hover = await worker.doHover(source.uri, { line: 0, character: 10 })
    expect(hoverText(hover).toLowerCase()).toContain('display')
  })

  it('updates diagnostics from the current buffer, clears fixes, and cleans disposal', async () => {
    const source = model('styles.css', '.card { color: #12; }')
    const worker = new CSSWorker(source.context, {
      languageId: 'css',
      options: { validate: true },
    })

    const invalid = await worker.doValidation(source.uri)
    expect(invalid).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 1,
        source: 'css',
        range: {
          start: { line: 0, character: 15 },
          end: { line: 0, character: 18 },
        },
      }),
    ]))

    source.mirror.update('.card { color: #123; }')
    await expect(worker.doValidation(source.uri)).resolves.toEqual([])
    source.dispose()
    await expect(worker.doValidation(source.uri)).resolves.toEqual([])
  })
})

describe('Monaco JSON worker', () => {
  it('provides schema-less local completion without remote data', async () => {
    const source = model('data.json', '[{"name":"Ada"},{"na"}]')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const worker = new JSONWorker(source.context, {
      languageId: 'json',
      languageSettings: {
        validate: true,
        schemas: [],
        enableSchemaRequest: false,
      },
      enableSchemaRequest: false,
    })

    const completion = await worker.doComplete(source.uri, {
      line: 0,
      character: 21,
    })
    expect(labels(completion)).toContain('name')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('updates syntax diagnostics, clears fixes, and cleans disposal without fetching', async () => {
    const source = model('data.json', '{"name": }')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const worker = new JSONWorker(source.context, {
      languageId: 'json',
      languageSettings: {
        validate: true,
        schemas: [],
        enableSchemaRequest: false,
      },
      enableSchemaRequest: false,
    })

    const invalid = await worker.doValidation(source.uri)
    expect(invalid[0]).toMatchObject({
      severity: 1,
      source: 'json',
      range: {
        start: { line: 0 },
        end: { line: 0 },
      },
    })
    source.mirror.update('{"name": "Ada"}')
    await expect(worker.doValidation(source.uri)).resolves.toEqual([])
    await expect(worker.doHover(source.uri, { line: 0, character: 10 }))
      .resolves.toBeNull()
    source.dispose()
    await expect(worker.doValidation(source.uri)).resolves.toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not fetch an explicitly remote schema URI', async () => {
    const source = model(
      'data.json',
      '{"$schema":"https://example.invalid/schema.json","name":"Ada"}',
    )
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const worker = new JSONWorker(source.context, {
      languageId: 'json',
      languageSettings: {
        validate: true,
        schemas: [],
        enableSchemaRequest: false,
      },
      enableSchemaRequest: false,
    })

    await worker.doValidation(source.uri)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

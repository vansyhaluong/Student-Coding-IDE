import { describe, expect, it, vi } from 'vitest'
import type { CancellationToken, editor, languages, Position } from 'monaco-editor'

import type { AppResult, ProjectId } from '../../src/shared/contracts'
import { CSHARP_LS_CAPABILITIES, type CompletionRequest, type DocumentVersion,
  type LanguageApi, type LanguageStatus, type SemanticRequestId } from '../../src/shared/contracts/language'
import type { EditorDocumentLifecycleEvent, EditorModelManager } from '../../src/renderer/src/features/editor/models/editor-model-manager'
import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'
import { CsharpClient, incrementalChange } from '../../src/renderer/src/features/language/csharp/csharp-client'
import { CsharpMonacoProviders } from '../../src/renderer/src/features/language/csharp/csharp-monaco-providers'

const projectId = 'project_1234567890abcdef12345678' as ProjectId
const version = (value: number) => value as DocumentVersion
const requestId = 'language_renderer_request' as SemanticRequestId
const request: CompletionRequest = {
  requestId,
  document: { projectId, relativePath: 'Program.cs' },
  documentVersion: version(4),
  position: { line: 0, character: 2 },
}
const runningStatus: LanguageStatus = {
  providerId: 'csharp-ls',
  capabilities: CSHARP_LS_CAPABILITIES,
  effectiveCapabilities: CSHARP_LS_CAPABILITIES,
  completionResolve: true,
  completionTriggers: ['.'],
  signatureTriggers: ['(', ','],
  signatureRetriggers: [')'],
  dependency: { state: 'AVAILABLE', reason: null, warnings: [] },
  service: { state: 'RUNNING', reason: null },
  workspace: { state: 'READY', mode: 'project' },
}
const token = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose() {} }),
} as unknown as CancellationToken
const success = <T>(value: T): AppResult<T> => ({ ok: true, value })

function providerFixture() {
  let statusListener: ((status: LanguageStatus | null) => void) | undefined
  const providers: {
    completion?: languages.CompletionItemProvider
    hover?: languages.HoverProvider
    signature?: languages.SignatureHelpProvider
    definition?: languages.DefinitionProvider
  } = {}
  const disposals: Array<ReturnType<typeof vi.fn>> = []
  const disposable = () => {
    const dispose = vi.fn()
    disposals.push(dispose)
    return { dispose }
  }
  const languageApi = {
    CompletionItemKind: new Proxy({}, { get: (_target, property) => String(property) }),
    registerCompletionItemProvider: vi.fn((_id: string, provider: languages.CompletionItemProvider) => {
      providers.completion = provider
      return disposable()
    }),
    registerHoverProvider: vi.fn((_id: string, provider: languages.HoverProvider) => {
      providers.hover = provider
      return disposable()
    }),
    registerSignatureHelpProvider: vi.fn((_id: string, provider: languages.SignatureHelpProvider) => {
      providers.signature = provider
      return disposable()
    }),
    registerDefinitionProvider: vi.fn((_id: string, provider: languages.DefinitionProvider) => {
      providers.definition = provider
      return disposable()
    }),
  }
  const api = {
    getCompletion: vi.fn(async () => success({
      requestId, documentVersion: version(4), isIncomplete: true,
      items: [{ label: 'Method', kind: 'method', detail: 'detail', documentation: '**docs**',
        insertText: 'Method()', replacementRange: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } },
        handle: 'completion_abcdefghijklmnop' }],
    })),
    resolveCompletion: vi.fn(async () => success({
      label: 'Method', kind: 'method', detail: 'resolved', documentation: null, insertText: 'Method()',
      replacementRange: null, handle: 'completion_abcdefghijklmnop',
    })),
    getHover: vi.fn(async () => success({
      requestId, documentVersion: version(4), contents: '**hover**',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2 } },
    })),
    getSignatureHelp: vi.fn(async () => success({
      requestId, documentVersion: version(4), activeSignature: 0, activeParameter: 0,
      signatures: [{ label: 'Method(value)', documentation: null,
        parameters: [{ label: 'value', documentation: '**parameter**' }] }],
    })),
    getDefinition: vi.fn(async () => success({
      requestId, documentVersion: version(4),
      targets: [
        { document: { projectId, relativePath: 'Target.cs' },
          range: { start: { line: 2, character: 3 }, end: { line: 2, character: 7 } } },
        { document: { projectId: 'project_aaaaaaaaaaaaaaaaaaaaaaaa' as ProjectId, relativePath: 'Outside.cs' },
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
      ],
    })),
  }
  const client = {
    project: projectId,
    api,
    subscribe(listener: (status: LanguageStatus | null) => void) {
      statusListener = listener
      listener(null)
      return () => { statusListener = undefined }
    },
    request: vi.fn(async (_model: editor.ITextModel, _position: unknown, _token: CancellationToken,
      call: (semanticRequest: CompletionRequest) => Promise<AppResult<unknown>>) => {
      const result = await call(request)
      return result.ok ? result.value : null
    }),
  }
  const monaco = {
    languages: languageApi,
    Uri: { parse: vi.fn((value: string) => ({ toString: () => value })) },
  }
  const owner = new CsharpMonacoProviders(
    monaco as unknown as ConstructorParameters<typeof CsharpMonacoProviders>[0],
    client as unknown as CsharpClient,
  )
  return { api, client, disposals, languageApi, monaco, owner, providers,
    publish: (status: LanguageStatus | null) => statusListener?.(status) }
}

describe('Phase 5.5F C# Monaco providers', () => {
  it('registers each effective capability and maps semantic results explicitly', async () => {
    const fixture = providerFixture()
    fixture.publish(runningStatus)
    expect(fixture.languageApi.registerCompletionItemProvider).toHaveBeenCalledWith('csharp', expect.any(Object))
    expect(fixture.languageApi.registerHoverProvider).toHaveBeenCalledWith('csharp', expect.any(Object))
    expect(fixture.languageApi.registerSignatureHelpProvider).toHaveBeenCalledWith('csharp', expect.any(Object))
    expect(fixture.languageApi.registerDefinitionProvider).toHaveBeenCalledWith('csharp', expect.any(Object))

    const model = {
      uri: { toString: () => projectDocumentUri(projectId, 'Program.cs') },
      getVersionId: () => 4,
      getWordUntilPosition: () => ({ word: 'Me', startColumn: 1, endColumn: 3 }),
      isDisposed: () => false,
    } as unknown as editor.ITextModel
    const position = { lineNumber: 1, column: 3 } as unknown as Position
    const completion = await fixture.providers.completion!.provideCompletionItems(
      model, position, { triggerKind: 0 }, token,
    )
    expect(completion).toMatchObject({
      incomplete: true,
      suggestions: [{
        label: 'Method', kind: 'Method', insertText: 'Method()',
        range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 3 },
        documentation: { value: '**docs**', isTrusted: false, supportHtml: false },
      }],
    })
    const resolved = await fixture.providers.completion!.resolveCompletionItem!(
      completion!.suggestions[0], token,
    )
    expect(resolved).toMatchObject({ detail: 'resolved', kind: 'Method' })

    expect(await fixture.providers.hover!.provideHover(model, position, token)).toMatchObject({
      contents: [{ value: '**hover**', isTrusted: false, supportHtml: false }],
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 },
    })
    expect(await fixture.providers.signature!.provideSignatureHelp(
      model, position, token, {} as languages.SignatureHelpContext,
    )).toMatchObject({
      value: { signatures: [{ label: 'Method(value)', parameters: [{ label: 'value' }] }],
        activeSignature: 0, activeParameter: 0 },
    })
    expect(await fixture.providers.definition!.provideDefinition(model, position, token)).toMatchObject([{
      range: { startLineNumber: 3, startColumn: 4, endLineNumber: 3, endColumn: 8 },
    }])
    expect(fixture.monaco.Uri.parse).toHaveBeenCalledWith(projectDocumentUri(projectId, 'Target.cs'))

    fixture.owner.dispose()
    expect(fixture.disposals).toHaveLength(4)
    expect(fixture.disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
  })

  it('registers only effective capabilities and ignores a late result after disposal', async () => {
    const fixture = providerFixture()
    fixture.publish({ ...runningStatus, effectiveCapabilities: ['hover'], completionResolve: false })
    expect(fixture.languageApi.registerCompletionItemProvider).not.toHaveBeenCalled()
    expect(fixture.languageApi.registerHoverProvider).toHaveBeenCalledOnce()

    let resolve!: (value: { contents: string; range: null }) => void
    fixture.client.request.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const model = { uri: { toString: () => projectDocumentUri(projectId, 'Program.cs') },
      getVersionId: () => 4, isDisposed: () => false } as unknown as editor.ITextModel
    const pending = fixture.providers.hover!.provideHover(
      model, { lineNumber: 1, column: 1 } as unknown as Position, token,
    )
    fixture.owner.dispose()
    resolve({ contents: 'late', range: null })
    expect(await pending).toBeNull()
  })
})

describe('Phase 5.5F renderer request lifetime', () => {
  it('rejects replies after an edit or disposal and cancels sent work', async () => {
    let lifecycle: ((event: EditorDocumentLifecycleEvent) => void) | undefined
    let modelVersion = 1
    let modelText = 'A😀\r\nB'
    const uri = projectDocumentUri(projectId, 'Program.cs')
    const model = {
      uri: { toString: () => uri },
      getVersionId: () => modelVersion,
      getValue: () => modelText,
      isDisposed: () => false,
    } as unknown as editor.ITextModel
    const document = { projectId, relativePath: 'Program.cs', languageId: 'csharp',
      dirty: false, model }
    const api = {
      onStatus: vi.fn(() => () => {}),
      openDocument: vi.fn(async () => success(runningStatus)),
      changeDocument: vi.fn(async () => success(null)),
      saveDocument: vi.fn(async () => success(null)),
      closeDocument: vi.fn(async () => success(null)),
      cancel: vi.fn(async () => success(null)),
    } as unknown as LanguageApi
    const editorManager = {
      subscribeDocumentLifecycle(listener: (event: EditorDocumentLifecycleEvent) => void) {
        lifecycle = listener
        return () => { lifecycle = undefined }
      },
      getOpenDocuments: () => [document],
      findDocument: () => document,
    } as unknown as EditorModelManager
    const client = new CsharpClient(api, editorManager)
    client.setProject(projectId)
    await vi.waitFor(() => expect(api.openDocument).toHaveBeenCalledOnce())

    let firstRequest: CompletionRequest | undefined
    let firstResolve!: (value: AppResult<{ requestId: SemanticRequestId; documentVersion: DocumentVersion }>) => void
    type Reply = { requestId: SemanticRequestId; documentVersion: DocumentVersion }
    const first = client.request(model, { lineNumber: 1, column: 2 }, token, (semanticRequest): Promise<AppResult<Reply>> => {
      firstRequest = semanticRequest
      return new Promise<AppResult<Reply>>(done => { firstResolve = done })
    })
    await vi.waitFor(() => expect(firstRequest).toBeDefined())
    modelVersion = 2
    modelText = 'A😎\r\nB'
    lifecycle?.({ type: 'content-changed', projectId, relativePath: 'Program.cs', content: modelText, dirty: true })
    firstResolve(success({ requestId: firstRequest!.requestId, documentVersion: version(1) }))
    expect(await first).toBeNull()

    let secondRequest: CompletionRequest | undefined
    let secondResolve!: (value: AppResult<{ requestId: SemanticRequestId; documentVersion: DocumentVersion }>) => void
    const second = client.request(model, { lineNumber: 1, column: 2 }, token, (semanticRequest): Promise<AppResult<Reply>> => {
      secondRequest = semanticRequest
      return new Promise<AppResult<Reply>>(done => { secondResolve = done })
    })
    await vi.waitFor(() => expect(secondRequest).toBeDefined())
    client.dispose()
    secondResolve(success({ requestId: secondRequest!.requestId, documentVersion: version(2) }))
    expect(await second).toBeNull()
    expect(api.cancel).toHaveBeenCalledWith(secondRequest!.requestId)
    expect(incrementalChange('A😀\r\nB', 'A😎\r\nB')).toEqual({
      range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } },
      text: '😎',
    })
  })
})

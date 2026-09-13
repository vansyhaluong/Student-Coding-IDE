import type { editor, languages, IRange, Position } from 'monaco-editor'
import type { CompletionItem, CompletionItemKind, LanguageRange, LanguageStatus } from '../../../../../shared/contracts/language'
import { projectDocumentUri } from '../project-uri'
import type { CsharpClient } from './csharp-client'

type Monaco = Pick<typeof import('monaco-editor'), 'languages' | 'Uri'>
export const safeMarkdown = (value: string) => ({ value, isTrusted: false as const, supportHtml: false })
export const monacoRange = (range: LanguageRange): IRange => ({ startLineNumber: range.start.line + 1,
  startColumn: range.start.character + 1, endLineNumber: range.end.line + 1, endColumn: range.end.character + 1 })
export function completionKind(kind: CompletionItemKind | null, kinds: typeof languages.CompletionItemKind): languages.CompletionItemKind {
  const mapping: Record<CompletionItemKind, languages.CompletionItemKind> = {
    text: kinds.Text, method: kinds.Method, function: kinds.Function, constructor: kinds.Constructor, field: kinds.Field,
    variable: kinds.Variable, class: kinds.Class, interface: kinds.Interface, module: kinds.Module, property: kinds.Property,
    unit: kinds.Unit, value: kinds.Value, enum: kinds.Enum, keyword: kinds.Keyword, snippet: kinds.Snippet, color: kinds.Color,
    file: kinds.File, reference: kinds.Reference, folder: kinds.Folder, enumMember: kinds.EnumMember, constant: kinds.Constant,
    struct: kinds.Struct, event: kinds.Event, operator: kinds.Operator, typeParameter: kinds.TypeParameter,
  }
  return kind === null ? kinds.Text : mapping[kind]
}
export function mapCompletion(item: CompletionItem, fallback: IRange, kinds: typeof languages.CompletionItemKind): languages.CompletionItem {
  return { label: item.label, kind: completionKind(item.kind, kinds), insertText: item.insertText ?? item.label,
    range: item.replacementRange ? monacoRange(item.replacementRange) : fallback,
    ...(item.detail === null ? {} : { detail: item.detail }),
    ...(item.documentation === null ? {} : { documentation: safeMarkdown(item.documentation) }) }
}
/** Capability-specific registrations; no syntax, markers, Problems or status UI. */
export class CsharpMonacoProviders {
  private fingerprint = ''
  private epoch = 0
  private registrations: Array<{ dispose(): void }> = []
  private remove: () => void
  constructor(private readonly monaco: Monaco, private readonly client: CsharpClient) {
    this.remove = client.subscribe(status => this.configure(status))
  }
  private configure(status: LanguageStatus | null): void {
    const next = JSON.stringify([this.client.project, status?.service.state, status?.capabilities, status?.effectiveCapabilities,
      status?.completionResolve, status?.completionTriggers, status?.signatureTriggers, status?.signatureRetriggers])
    if (next === this.fingerprint) return
    this.fingerprint = next; this.clear()
    if (status?.service.state !== 'RUNNING') return
    const epoch = this.epoch, active = () => epoch === this.epoch
    const supports = (capability: 'completion' | 'hover' | 'signatureHelp' | 'definition') => status.capabilities.includes(capability) && status.effectiveCapabilities.includes(capability)
    const { languages: api } = this.monaco, client = this.client
    if (supports('completion')) {
      const handles = new WeakMap<languages.CompletionItem, { model: editor.ITextModel; position: Position; version: number; source: CompletionItem }>()
      const provider: languages.CompletionItemProvider = {
        triggerCharacters: [...status.completionTriggers],
        provideCompletionItems: async (model, position, _context, token) => {
          const version = model.getVersionId(), word = model.getWordUntilPosition(position)
          const fallback = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
            startColumn: word.startColumn, endColumn: position.column }
          const result = await client.request(model, position, token, request => client.api.getCompletion(request))
          if (!active() || !result) return { suggestions: [] }
          const suggestions = result.items.map(source => {
            const item = mapCompletion(source, fallback, api.CompletionItemKind)
            if (source.handle) handles.set(item, { model, position, version, source })
            return item
          })
          return { suggestions, incomplete: result.isIncomplete }
        },
      }
      if (status.completionResolve) provider.resolveCompletionItem = async (item, token) => {
        const cached = handles.get(item)
        if (!active() || !cached || !cached.source.handle || cached.model.isDisposed() || cached.model.getVersionId() !== cached.version) return item
        const handle = cached.source.handle
        const result = await client.request(cached.model, cached.position, token,
          request => client.api.resolveCompletion({ requestId: request.requestId, handle }))
        if (!active() || !result) return item
        return mapCompletion(result, 'startLineNumber' in item.range ? item.range : item.range.replace, api.CompletionItemKind)
      }
      this.registrations.push(api.registerCompletionItemProvider('csharp', provider))
    }
    if (supports('hover')) this.registrations.push(api.registerHoverProvider('csharp', {
      provideHover: async (model, position, token) => {
        const result = await client.request(model, position, token, request => client.api.getHover(request))
        return !active() || !result ? null : { contents: [safeMarkdown(result.contents)], ...(result.range ? { range: monacoRange(result.range) } : {}) }
      },
    }))
    if (supports('signatureHelp')) this.registrations.push(api.registerSignatureHelpProvider('csharp', {
      signatureHelpTriggerCharacters: [...status.signatureTriggers], signatureHelpRetriggerCharacters: [...status.signatureRetriggers],
      provideSignatureHelp: async (model, position, token) => {
        const result = await client.request(model, position, token, request => client.api.getSignatureHelp(request))
        if (!active() || !result) return null
        return { value: { signatures: result.signatures.map(signature => ({ label: signature.label,
          ...(signature.documentation === null ? {} : { documentation: safeMarkdown(signature.documentation) }),
          parameters: signature.parameters.map(parameter => ({ label: parameter.label,
            ...(parameter.documentation === null ? {} : { documentation: safeMarkdown(parameter.documentation) }) })),
        })), activeSignature: result.activeSignature ?? 0, activeParameter: result.activeParameter ?? 0 }, dispose() {} }
      },
    }))
    if (supports('definition')) this.registrations.push(api.registerDefinitionProvider('csharp', {
      provideDefinition: async (model, position, token) => {
        const result = await client.request(model, position, token, request => client.api.getDefinition(request))
        if (!active() || !result) return null
        return result.targets.filter(target => target.document.projectId === client.project).map(target => ({
          uri: this.monaco.Uri.parse(projectDocumentUri(target.document.projectId, target.document.relativePath)), range: monacoRange(target.range),
        }))
      },
    }))
  }
  private clear(): void { ++this.epoch; for (const registration of this.registrations.splice(0)) registration.dispose() }
  dispose(): void { this.remove(); this.clear() }
}

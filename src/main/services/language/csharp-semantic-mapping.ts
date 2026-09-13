import type * as Lsp from 'vscode-languageserver-protocol'
import type { CompletionItem, CompletionItemKind, LanguageRange, SignatureHelpResult, SemanticRequestId, DocumentVersion } from '../../../shared/contracts/language'
import { LANGUAGE_LIMITS } from '../../../shared/contracts/language'
import { LanguageError } from './language-error'

const kinds: readonly CompletionItemKind[] = ['text', 'method', 'function', 'constructor', 'field', 'variable', 'class',
  'interface', 'module', 'property', 'unit', 'value', 'enum', 'keyword', 'snippet', 'color', 'file', 'reference',
  'folder', 'enumMember', 'constant', 'struct', 'event', 'operator', 'typeParameter']
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export function safeRange(value: unknown): LanguageRange | null {
  if (!object(value) || !object(value.start) || !object(value.end)) return null
  const { start, end } = value
  if ([start.line, start.character, end.line, end.character].some(v => !Number.isSafeInteger(v) || Number(v) < 0)
    || Number(end.line) < Number(start.line) || end.line === start.line && Number(end.character) < Number(start.character)) return null
  return { start: { line: Number(start.line), character: Number(start.character) }, end: { line: Number(end.line), character: Number(end.character) } }
}
function plain(value: string): string { return value.replace(/[\\`*_{}[\]()#+.!<>|~-]/g, '\\$&') }
const boundedText = (value: string): string => value.slice(0, LANGUAGE_LIMITS.maximumTextLength)
/** Only semantic presentation text, never trusted HTML or command links. */
export function markdown(value: unknown): string | null {
  if (value === undefined || value === null) return null
  let text: string
  if (typeof value === 'string') text = plain(value)
  else if (Array.isArray(value)) text = value.map(markdown).filter(Boolean).join('\n\n')
  else if (object(value) && typeof value.value === 'string') {
    text = value.kind === 'markdown' ? value.value.replace(/<[^>]*>/g, '').replace(/!?\[([^\]]*)\]\(\s*(?:command|javascript|data):[^)]*\)/gi, '$1') : plain(value.value)
  } else throw new LanguageError('invalid-response')
  return boundedText(text)
}
const nullableText = (v: unknown): string | null => typeof v === 'string' ? boundedText(v) : null
export function completionItem(item: Omit<Lsp.CompletionItem, 'data'>, handle: CompletionItem['handle']): CompletionItem | null {
  // The client advertises no snippet support. Never insert unsupported snippet syntax.
  if (item.insertTextFormat === 2) return null
  let insertText = nullableText(item.insertText), replacementRange: LanguageRange | null = null
  if (item.textEdit !== undefined) {
    const edit: unknown = item.textEdit
    if (!object(edit) || typeof edit.newText !== 'string') throw new LanguageError('invalid-response')
    replacementRange = safeRange('range' in edit ? edit.range : edit.replace)
    if (!replacementRange) throw new LanguageError('invalid-response')
    insertText = boundedText(edit.newText)
  }
  return { label: boundedText(item.label),
    kind: typeof item.kind === 'number' ? kinds[item.kind - 1] ?? null : null,
    detail: nullableText(item.detail), documentation: markdown(item.documentation), insertText, replacementRange, handle }
}
export function signatureResult(result: Lsp.SignatureHelp | null, requestId: SemanticRequestId,
  documentVersion: DocumentVersion): SignatureHelpResult | null {
  if (result === null) return null
  const signatures = result.signatures.slice(0, LANGUAGE_LIMITS.maximumSignatures).map(signature => {
    if (typeof signature.label !== 'string' || !Array.isArray(signature.parameters ?? [])) {
      throw new LanguageError('invalid-response')
    }
    return {
      label: boundedText(signature.label), documentation: markdown(signature.documentation),
      parameters: (signature.parameters ?? []).slice(0, LANGUAGE_LIMITS.maximumParameters).map(parameter => {
        if (!object(parameter)) throw new LanguageError('invalid-response')
        let label: string
        if (typeof parameter.label === 'string') label = parameter.label
        else if (Array.isArray(parameter.label) && parameter.label.length === 2
          && parameter.label.every(Number.isSafeInteger) && parameter.label[0] >= 0
          && parameter.label[1] >= parameter.label[0] && parameter.label[1] <= signature.label.length) {
          label = signature.label.slice(parameter.label[0], parameter.label[1])
        } else throw new LanguageError('invalid-response')
        return { label: boundedText(label), documentation: markdown(parameter.documentation) }
      }),
    }
  })
  const index = (value: unknown, count: number): number | null => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < count ? Number(value) : null
  const activeSignature = index(result.activeSignature, signatures.length)
  const selected = result.signatures[activeSignature ?? 0]
  const activeParameter = index(selected?.activeParameter ?? result.activeParameter, selected?.parameters?.length ?? 0)
  return { requestId, documentVersion, signatures, activeSignature, activeParameter }
}
export function triggers(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'
    && [...v].length === 1 && isVisibleCharacter(v)))] : []
}

function isVisibleCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0)
  return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f
}

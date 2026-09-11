import type { AppResult } from '../../shared/contracts/app-error'
import { validateAppError } from '../../shared/contracts/app-error'
import { LANGUAGE_CHANNELS, LANGUAGE_LIMITS, type LanguageApi, type LanguageStatusEvent } from '../../shared/contracts/language'
import { validateLanguageProject, validateLanguageDocument, validateLanguageCancel, validateLanguageStatus,
  validateLanguageWorkspaceStatus, validateSelectLanguageWorkspaceRequest, validateCompletionRequest,
  validateCompletionResolveRequest, validateHoverRequest, validateSignatureHelpRequest, validateDefinitionRequest,
  isCompletionHandle, isLanguageRelativePath, isSemanticRequestId, isDocumentVersion } from '../../shared/contracts/language-validation'
import { isProjectId } from '../../shared/contracts/project'
import { validateExactObject, type ValidationResult } from '../../shared/contracts/validation'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'

const invalid = (): AppResult<never> => ({ ok: false, error: { code: 'INVALID_INPUT', message: 'Invalid language message.', retryable: false } })
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => validateExactObject(v, keys).ok
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= LANGUAGE_LIMITS.maximumTextLength
const nullableText = (v: unknown) => v === null || text(v)
const position = (v: unknown) => exact(v, ['line', 'character']) && Number.isSafeInteger(v.line) && Number(v.line) >= 0 && Number.isSafeInteger(v.character) && Number(v.character) >= 0
const range = (v: unknown): boolean => exact(v, ['start', 'end']) && position(v.start) && position(v.end)
const itemKinds = ['text', 'method', 'function', 'constructor', 'field', 'variable', 'class', 'interface', 'module', 'property', 'unit', 'value', 'enum', 'keyword', 'snippet', 'color', 'file', 'reference', 'folder', 'enumMember', 'constant', 'struct', 'event', 'operator', 'typeParameter']
function item(v: unknown): boolean {
  return exact(v, ['label', 'kind', 'detail', 'documentation', 'insertText', 'replacementRange', 'handle']) && text(v.label)
    && (v.kind === null || itemKinds.includes(String(v.kind))) && nullableText(v.detail) && nullableText(v.documentation)
    && nullableText(v.insertText) && (v.replacementRange === null || range(v.replacementRange)) && (v.handle === null || isCompletionHandle(v.handle))
}
function reply(method: keyof typeof LANGUAGE_CHANNELS, v: unknown): boolean {
  if (['getStatus', 'selectWorkspace', 'openDocument'].includes(method)) return validateLanguageStatus(v).ok
  if (method === 'getWorkspaceState') return validateLanguageWorkspaceStatus(v).ok
  if (['changeDocument', 'saveDocument', 'closeDocument', 'cancel'].includes(method)) return v === null
  if (method === 'resolveCompletion') return item(v)
  if (v === null && (method === 'getHover' || method === 'getSignatureHelp')) return true
  const fields = method === 'getCompletion' ? ['isIncomplete', 'items'] : method === 'getHover' ? ['contents', 'range']
    : method === 'getSignatureHelp' ? ['signatures', 'activeSignature', 'activeParameter'] : ['targets']
  if (!exact(v, ['requestId', 'documentVersion', ...fields]) || !isSemanticRequestId(v.requestId) || !isDocumentVersion(v.documentVersion)) return false
  if (method === 'getCompletion') return typeof v.isIncomplete === 'boolean' && Array.isArray(v.items) && v.items.length <= LANGUAGE_LIMITS.maximumCompletionItems && v.items.every(item)
  if (method === 'getHover') return text(v.contents) && (v.range === null || range(v.range))
  if (method === 'getSignatureHelp') return Array.isArray(v.signatures) && v.signatures.length <= LANGUAGE_LIMITS.maximumSignatures
    && [v.activeSignature, v.activeParameter].every(i => i === null || Number.isSafeInteger(i) && Number(i) >= 0)
    && v.signatures.every(s => exact(s, ['label', 'documentation', 'parameters']) && text(s.label) && nullableText(s.documentation)
      && Array.isArray(s.parameters) && s.parameters.length <= LANGUAGE_LIMITS.maximumParameters
      && s.parameters.every(p => exact(p, ['label', 'documentation']) && text(p.label) && nullableText(p.documentation)))
  return Array.isArray(v.targets) && v.targets.length <= LANGUAGE_LIMITS.maximumDefinitions && v.targets.every(t => exact(t, ['document', 'range'])
    && exact(t.document, ['projectId', 'relativePath']) && isProjectId(t.document.projectId) && isLanguageRelativePath(t.document.relativePath) && range(t.range))
}
export function createLanguageBridge(ipc: IpcRendererLike): LanguageApi {
  async function call<T>(method: keyof typeof LANGUAGE_CHANNELS, validation: ValidationResult<unknown>): Promise<AppResult<T>> {
    if (!validation.ok) return invalid()
    const result = await invokeSafely(ipc, LANGUAGE_CHANNELS[method], validation.value)
    if (exact(result, ['ok', 'value']) && result.ok === true && reply(method, result.value)) return { ok: true, value: result.value as T }
    if (exact(result, ['ok', 'error']) && result.ok === false) {
      const error = validateAppError(result.error)
      if (error.ok) return { ok: false, error: error.value }
    }
    return invalid()
  }
  return {
    getStatus: projectId => call('getStatus', validateLanguageProject({ projectId })),
    getWorkspaceState: projectId => call('getWorkspaceState', validateLanguageProject({ projectId })),
    selectWorkspace: request => call('selectWorkspace', validateSelectLanguageWorkspaceRequest(request)),
    openDocument: request => call('openDocument', validateLanguageDocument(request, 'open')),
    changeDocument: request => call('changeDocument', validateLanguageDocument(request, 'change')),
    saveDocument: request => call('saveDocument', validateLanguageDocument(request, 'identity')),
    closeDocument: request => call('closeDocument', validateLanguageDocument(request, 'identity')),
    getCompletion: request => call('getCompletion', validateCompletionRequest(request)),
    resolveCompletion: request => call('resolveCompletion', validateCompletionResolveRequest(request)),
    getHover: request => call('getHover', validateHoverRequest(request)),
    getSignatureHelp: request => call('getSignatureHelp', validateSignatureHelpRequest(request)),
    getDefinition: request => call('getDefinition', validateDefinitionRequest(request)),
    cancel: requestId => call('cancel', validateLanguageCancel({ requestId })),
    onStatus(listener) {
      const receive = (_event: unknown, payload: unknown) => {
        if (exact(payload, ['projectId', 'status']) && isProjectId(payload.projectId) && validateLanguageStatus(payload.status).ok) listener(payload as unknown as LanguageStatusEvent)
      }
      ipc.on(LANGUAGE_CHANNELS.status, receive)
      return () => { ipc.removeListener(LANGUAGE_CHANNELS.status, receive) }
    },
  }
}

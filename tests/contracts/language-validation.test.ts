import { describe, expect, it } from 'vitest'
import {
  CSHARP_CAPABILITY_PROVIDERS,
  CSHARP_LS_CAPABILITIES,
  LANGUAGE_DEPENDENCY_STATES,
  LANGUAGE_LIMITS,
  LANGUAGE_REASON_CODES,
  LANGUAGE_SERVICE_STATES,
  validateCompletionRequest,
  validateCompletionResolveRequest,
  validateLanguageStatus,
  validateSelectLanguageWorkspaceRequest,
} from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678'
const request = {
  requestId: 'language_request_1',
  document: { projectId, relativePath: 'src/Program.cs' },
  documentVersion: 4,
  position: { line: 10, character: 7 },
}
const status = {
  providerId: 'csharp-ls',
  capabilities: CSHARP_LS_CAPABILITIES,
  dependency: { state: 'AVAILABLE', reason: null, warnings: [] },
  service: { state: 'RUNNING', reason: null },
  workspace: { state: 'READY', selected: { kind: 'solution', relativePath: 'Student.slnx' } },
}

describe('Phase 5.5C language contracts', () => {
  it('keeps provider-per-capability ownership explicit', () => {
    expect(CSHARP_CAPABILITY_PROVIDERS.syntax).toBe('monaco-tokenization')
    for (const capability of CSHARP_LS_CAPABILITIES) {
      expect(CSHARP_CAPABILITY_PROVIDERS[capability]).toBe('csharp-ls')
    }
  })

  it('preserves independent dependency and lifecycle vocabularies', () => {
    expect(LANGUAGE_DEPENDENCY_STATES).toEqual([
      'NOT_CONFIGURED', 'MISSING', 'AVAILABLE', 'INVALID_CONFIGURATION',
    ])
    expect(LANGUAGE_SERVICE_STATES).toEqual([
      'STOPPED', 'STARTING', 'RUNNING', 'CRASHED', 'MISSING', 'INVALID_CONFIGURATION',
    ])
    expect(LANGUAGE_REASON_CODES).toContain('DOTNET_SDK_TOO_OLD')
    expect(LANGUAGE_REASON_CODES).toContain('CSHARP_LS_VERSION_MISMATCH')
  })

  it('exact-validates project-relative semantic requests', () => {
    expect(validateCompletionRequest(request)).toEqual({ ok: true, value: request })
    for (const invalid of [
      { ...request, document: { ...request.document, relativePath: 'C:/secret/Program.cs' } },
      { ...request, document: { ...request.document, relativePath: '../Program.cs' } },
      { ...request, documentVersion: 0 },
      { ...request, position: { line: -1, character: 0 } },
      { ...request, requestId: `language_${'x'.repeat(LANGUAGE_LIMITS.maximumRequestIdLength)}` },
      { ...request, cwd: 'C:/private' },
    ]) expect(validateCompletionRequest(invalid).ok).toBe(false)
  })

  it('accepts only opaque bounded completion handles', () => {
    const valid = { requestId: request.requestId, handle: `completion_${'a'.repeat(16)}` }
    expect(validateCompletionResolveRequest(valid)).toEqual({ ok: true, value: valid })
    expect(validateCompletionResolveRequest({ ...valid, handle: 'raw-provider-data' }).ok).toBe(false)
    expect(validateCompletionResolveRequest({ ...valid, handle: `completion_${'a'.repeat(150)}` }).ok).toBe(false)
    expect(validateCompletionResolveRequest({ ...valid, data: { protocol: true } }).ok).toBe(false)
  })

  it('validates workspace candidates without running preflight', () => {
    expect(validateSelectLanguageWorkspaceRequest({
      projectId, candidate: { kind: 'solution', relativePath: 'src/App.sln' },
    }).ok).toBe(true)
    expect(validateSelectLanguageWorkspaceRequest({
      projectId, candidate: { kind: 'project', relativePath: 'src/App.sln' },
    }).ok).toBe(false)
  })

  it('serializes safe coherent status and rejects privileged fields', () => {
    expect(validateLanguageStatus(status)).toEqual({ ok: true, value: status })
    for (const field of ['executable', 'canonicalRoot', 'pid', 'cwd', 'spawnArgs', 'jsonRpcId', 'method']) {
      expect(validateLanguageStatus({ ...status, [field]: 'private' }).ok).toBe(false)
    }
    expect(validateLanguageStatus({
      ...status, dependency: { state: 'AVAILABLE', reason: 'DOTNET_HOST_MISSING', warnings: [] },
    }).ok).toBe(false)
    expect(validateLanguageStatus({
      ...status, capabilities: ['syntax', 'hover', 'signatureHelp', 'definition', 'diagnostics'],
    }).ok).toBe(false)
    expect(validateLanguageStatus({
      ...status, dependency: { state: 'NOT_CONFIGURED', reason: null, warnings: [] },
    }).ok).toBe(true)
    expect(validateLanguageStatus({
      ...status, workspace: { state: 'SELECTION_REQUIRED', candidates: Array(257).fill({ kind: 'project', relativePath: 'App.csproj' }) },
    }).ok).toBe(false)
  })
})

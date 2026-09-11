import { LANGUAGE_CHANNELS } from '../../shared/contracts/language'
import { validateLanguageProject, validateLanguageDocument, validateLanguageCancel,
  validateSelectLanguageWorkspaceRequest, validateCompletionRequest, validateCompletionResolveRequest,
  validateHoverRequest, validateSignatureHelpRequest, validateDefinitionRequest } from '../../shared/contracts/language-validation'
import type { CsharpSemanticService } from '../services/language/csharp-semantic-service'
import type { IpcHandlerRegistry } from './ipc-handler-registry'

export class LanguageIpcService {
  readonly name = 'LanguageIpcService'
  private removers: Array<() => void> = []
  constructor(private readonly registry: IpcHandlerRegistry, private readonly service: CsharpSemanticService) {}
  start(): void {
    const r = this.registry, s = this.service, c = LANGUAGE_CHANNELS
    this.removers.push(
      r.register({ channel: c.getStatus, validate: validateLanguageProject, handle: (v, ctx) => s.getStatus(v.projectId, ctx) }),
      r.register({ channel: c.getWorkspaceState, validate: validateLanguageProject, handle: async (v, ctx) => (await s.getStatus(v.projectId, ctx)).workspace }),
      r.register({ channel: c.selectWorkspace, validate: validateSelectLanguageWorkspaceRequest, handle: (v, ctx) => s.select(v, ctx) }),
      r.register({ channel: c.openDocument, validate: v => validateLanguageDocument(v, 'open'), handle: (v, ctx) => s.open(v, ctx) }),
      r.register({ channel: c.changeDocument, validate: v => validateLanguageDocument(v, 'change'), handle: (v, ctx) => s.change(v, ctx) }),
      r.register({ channel: c.saveDocument, validate: v => validateLanguageDocument(v, 'identity'), handle: (v, ctx) => s.save(v, ctx) }),
      r.register({ channel: c.closeDocument, validate: v => validateLanguageDocument(v, 'identity'), handle: (v, ctx) => s.close(v, ctx) }),
      r.register({ channel: c.getCompletion, validate: validateCompletionRequest, handle: (v, ctx) => s.semantic('completion', v, ctx) }),
      r.register({ channel: c.resolveCompletion, validate: validateCompletionResolveRequest, handle: (v, ctx) => s.resolve(v, ctx) }),
      r.register({ channel: c.getHover, validate: validateHoverRequest, handle: (v, ctx) => s.semantic('hover', v, ctx) }),
      r.register({ channel: c.getSignatureHelp, validate: validateSignatureHelpRequest, handle: (v, ctx) => s.semantic('signature', v, ctx) }),
      r.register({ channel: c.getDefinition, validate: validateDefinitionRequest, handle: (v, ctx) => s.semantic('definition', v, ctx) }),
      r.register({ channel: c.cancel, validate: validateLanguageCancel, handle: (v, ctx) => s.cancel(v.requestId, ctx) }),
    )
  }
  stop(): void { for (const remove of this.removers.splice(0)) remove(); this.service.stop() }
}

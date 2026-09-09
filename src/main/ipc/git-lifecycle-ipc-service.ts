import { GIT_CONTEXT_CHANNEL, validateGitIdentity } from '../../shared/contracts/git-lifecycle'
import { validateGetGitStateRequest } from '../../shared/contracts/git'
import { validateExactObject } from '../../shared/contracts/validation'
import { serializeAppError } from '../errors/app-error'
import type { GitOperationLifecycle } from '../services/git/git-operation-lifecycle'
import { GitIpcService, type GitQueries } from './git-ipc-service'
import { IpcHandlerRegistry, type IpcRequestDefinition, type IpcRequestContext } from './ipc-handler-registry'

/** Adds Git-specific identity around the existing semantic validators/handlers. */
class GitIdentityRegistry extends IpcHandlerRegistry {
  constructor(private readonly target: IpcHandlerRegistry, private readonly lifecycle: GitOperationLifecycle,
    private readonly assertDocument: (context: IpcRequestContext) => void) {
    super({ handle: () => { throw new Error('Unexpected local registration') }, removeHandler: () => {} })
  }
  override register<T, R>(definition: IpcRequestDefinition<T, R>): () => void {
    return this.target.register({
      channel: definition.channel,
      validate: (value) => {
        const object = validateExactObject(value, ['identity', 'payload'])
        if (!object.ok) return object
        const identity = validateGitIdentity(object.value.identity)
        if (!identity.ok) return identity
        const payload = definition.validate(object.value.payload)
        if (!payload.ok) return payload
        if ((payload.value as { projectId?: string }).projectId !== identity.value.projectId) {
          return { ok: false, issues: [{ path: '$.identity.projectId', message: 'Project identity mismatch' }] }
        }
        return { ok: true, value: { identity: identity.value, payload: payload.value } }
      },
      handle: async ({ identity, payload }, context) => {
        try {
          this.assertDocument(context)
          const mutation = ['git:stage', 'git:unstage', 'git:commit', 'git:switch-branch'].includes(definition.channel)
          const value = await this.lifecycle.run(identity, context.senderId, definition.channel, mutation,
            async () => definition.handle(payload, context))
          return { identity, result: { ok: true as const, value } }
        } catch (error) {
          return { identity, result: { ok: false as const, error: serializeAppError(error, definition.channel) } }
        }
      },
    })
  }
}

export class GitLifecycleIpcService extends GitIpcService {
  private removeContext?: () => void
  constructor(private readonly target: IpcHandlerRegistry, git: GitQueries,
    private readonly lifecycle: GitOperationLifecycle, private readonly assertDocument: (context: IpcRequestContext) => void) {
    super(new GitIdentityRegistry(target, lifecycle, assertDocument), git)
  }
  override start(): void {
    this.removeContext = this.target.register({ channel: GIT_CONTEXT_CHANNEL, validate: validateGetGitStateRequest,
      handle: ({ projectId }, context) => {
        this.assertDocument(context)
        return { generation: this.lifecycle.getContext(projectId, context.senderId) }
      } })
    super.start()
  }
  override stop(): void { super.stop(); this.removeContext?.(); this.removeContext = undefined }
}

import { RUN_CHANNELS, validateStartRunRequest, validateStopRunRequest,
  type StartRunRequest, type RunSession, type RunSessionId, type RunEvent, type RunExecutionPhase,
  type SemanticStartRunRequest } from '../../shared/contracts/run'
import { RUN_PROJECT_CHANNELS, validateRunProjectRequest, validateCSharpRunTarget,
  validateCSharpStartRunRequest, validateCSharpRunSession, validateProjectRunEvent,
  validateProjectRunFailure, type CSharpRunSession, type ProjectRunEvent } from '../../shared/contracts/run-project'
import type { ProjectId } from '../../shared/contracts/project'
import type { ManagedService } from '../app/desktop-application'
import { IpcHandlerRegistry, type IpcRequestContext } from './ipc-handler-registry'
import type { CsharpRunTargetRequests } from '../services/run/csharp-run-target-requests'
import { DomainError } from '../errors/app-error'

/** Semantic execution port; ownership observation remains Main-only. */
export interface RunCommands {
  startRun(request: StartRunRequest, ownerId: number): Promise<RunSession>
  stopRun(sessionId: RunSessionId, ownerId: number): Promise<void>
}
export interface ProjectRunIpcOptions {
  readonly targets: CsharpRunTargetRequests
  /** Trusted frame + live window; project authorization returns a stable generation identity. */
  authorize(context: IpcRequestContext, projectId?: ProjectId): unknown
  start(request: SemanticStartRunRequest, ownerId: number): Promise<RunSession>
  publish(ownerId: number, event: ProjectRunEvent): void
}
const unavailable = () => new DomainError({ code: 'PERMISSION_DENIED', retryable: false,
  message: 'The C# Run request is no longer authorized.', operation: 'run:project' })
export class RunIpcService implements ManagedService {
  readonly name = 'RunIpcService'
  private readonly cleanup: (() => void)[] = []
  private readonly phases = new Map<RunSessionId, { owner: number; phase: RunExecutionPhase }>()
  private readonly generations = new Map<number, number>()
  private stopped = false
  constructor(private readonly registry: IpcHandlerRegistry, private readonly run: RunCommands,
    private readonly observeOwner: (ownerId: number) => void = () => {},
    private readonly project?: ProjectRunIpcOptions) {}
  start(): void {
    if (this.cleanup.length) return
    this.stopped = false
    this.cleanup.push(this.registry.register({ channel: RUN_CHANNELS.start,
      validate: validateStartRunRequest,
      handle: (request, context) => {
        this.project?.authorize(context, request.projectId)
        this.observeOwner(context.senderId)
        return this.run.startRun(request, context.senderId)
      } }))
    this.cleanup.push(this.registry.register({ channel: RUN_CHANNELS.stop,
      validate: validateStopRunRequest,
      handle: async (request, context) => {
        this.project?.authorize(context)
        await this.run.stopRun(request.sessionId, context.senderId)
        return null
      } }))
    const project = this.project
    if (!project) return
    for (const [channel, kind] of [[RUN_PROJECT_CHANNELS.resolve, 'resolve'], [RUN_PROJECT_CHANNELS.clear, 'clear']] as const) {
      this.cleanup.push(this.registry.register({ channel, validate: validateRunProjectRequest,
        handle: async (request, context) => {
          const check = this.check(context, request.projectId)
          const result = await project.targets.perform(context.senderId, request.projectId, { kind }, check)
          check(); return result
        } }))
    }
    this.cleanup.push(this.registry.register({ channel: RUN_PROJECT_CHANNELS.select, validate: validateCSharpRunTarget,
      handle: async (request, context) => {
        const check = this.check(context, request.projectId)
        const result = await project.targets.perform(context.senderId, request.projectId, { kind: 'select', target: request }, check)
        check(); return result
      } }))
    this.cleanup.push(this.registry.register({ channel: RUN_PROJECT_CHANNELS.cancel, validate: validateRunProjectRequest,
      handle: async (request, context) => {
        const check = this.check(context, request.projectId)
        await project.targets.cancel(context.senderId, request.projectId)
        check(); return null
      } }))
    this.cleanup.push(this.registry.register({ channel: RUN_PROJECT_CHANNELS.start, validate: validateCSharpStartRunRequest,
      handle: async (request, context) => {
        const check = this.check(context, request.projectId)
        const session = await project.start(request, context.senderId)
        check()
        const result = validateCSharpRunSession({ ...session, kind: 'csharp-project',
          phase: this.phases.get(session.sessionId)?.phase ?? 'PREPARING' })
        if (!result.ok || result.value.projectId !== request.projectId || result.value.relativePath !== request.relativePath) throw unavailable()
        return result.value
      } }))
  }
  private check(context: IpcRequestContext, projectId: ProjectId): () => void {
    const authority = this.project!.authorize(context, projectId)
    this.observeOwner(context.senderId)
    const generation = this.generations.get(context.senderId) ?? 0
    const check = () => {
      if (this.stopped || (this.generations.get(context.senderId) ?? 0) !== generation
        || this.project!.authorize(context, projectId) !== authority) throw unavailable()
    }
    check(); return check
  }
  async invalidateOwner(ownerId: number): Promise<void> {
    this.generations.set(ownerId, (this.generations.get(ownerId) ?? 0) + 1)
    for (const [id, record] of this.phases) if (record.owner === ownerId) this.phases.delete(id)
    if (this.project?.targets.ownerId === ownerId) await this.project.targets.cancel(ownerId)
  }
  /** Main-only event adapter; Renderer never receives legacy execution internals. */
  publishPhase(owner: number, session: RunSession, phase: RunExecutionPhase): void {
    if (this.stopped || !this.project || !/\.csproj$/i.test(session.relativePath)) return
    this.phases.set(session.sessionId, { owner, phase })
    this.emit(owner, { type: 'phase', session: { ...session, kind: 'csharp-project', phase } })
  }
  publish(owner: number, event: RunEvent): void {
    if (this.stopped || !this.project) return
    const prior = this.phases.get(event.session.sessionId)
    if (prior && prior.owner !== owner) return
    const session: CSharpRunSession = { ...event.session, kind: 'csharp-project', phase: prior?.phase ?? 'PREPARING' }
    if (!validateCSharpRunSession(session).ok) return
    this.phases.set(session.sessionId, { owner, phase: session.phase })
    if (event.type === 'error') {
      const reason = event.error.details?.reason
      const failure = validateProjectRunFailure({ reason,
        ...(reason === 'BUILD_OR_RESTORE_FAILED' || reason === 'EXECUTION_FAILED' ? { exitCode: event.error.details?.exitCode } : {}) })
      this.emit(owner, { type: 'error', session, failure: failure.ok ? failure.value : { reason: 'PREFLIGHT_FAILED' } })
    } else this.emit(owner, { ...event, session })
    if (event.type === 'exit') this.phases.delete(session.sessionId)
  }
  private emit(owner: number, event: ProjectRunEvent): void {
    const valid = validateProjectRunEvent(event)
    if (valid.ok) this.project?.publish(owner, valid.value)
  }
  async stop(): Promise<void> {
    this.stopped = true
    for (const remove of this.cleanup.splice(0).reverse()) remove()
    await this.project?.targets.stop()
    this.phases.clear(); this.generations.clear()
  }
}

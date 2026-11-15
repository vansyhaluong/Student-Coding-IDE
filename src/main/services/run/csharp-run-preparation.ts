import { randomUUID } from 'node:crypto'
import { DotnetRunRuntimeResolver } from '../dependencies/dotnet-run-runtime'
import type { FileSystemService } from '../filesystem/filesystem-service'
import type { ProcessManager } from '../process/process-manager'
import type { ProjectService } from '../project/project-service'
import { CsharpRunPreflight } from './csharp-run-preflight'
import { CsharpRunProbe } from './csharp-run-probe'
import { CsharpRunTargetResolver } from './csharp-run-target-resolver'
import { CsharpRunTargetStore } from './csharp-run-target-store'
import { csharpPreparationError, evaluatedCsharpRuntime } from './csharp-run-strategy'
import { runTargetIdentity, type RunRuntime, type RunRuntimeContext } from './run-strategy'

export interface CsharpPreparationScope {
  readonly store: Pick<CsharpRunTargetStore, 'resolve'>
  readonly evaluator: Pick<CsharpRunPreflight, 'evaluate'>
  close(): Promise<void>
}

/** Each owned preparation/revalidation reads Main's selection and reevaluates it.
 * A distinct probe owner prevents recursive cleanup of the session's scope lease.
 */
export class CsharpRunPreparation {
  constructor(private readonly createScope: (owner: string) => CsharpPreparationScope) {}

  static production(directory: string, projects: ProjectService, files: FileSystemService,
    processes: ProcessManager, createProbe = (owner: string) => new CsharpRunProbe(processes, owner)): CsharpRunPreparation {
    return new CsharpRunPreparation(owner => {
      const probe = createProbe(owner)
      const evaluator = new CsharpRunPreflight(files, new DotnetRunRuntimeResolver(probe), probe)
      const resolver = new CsharpRunTargetResolver(projects, files, evaluator)
      const store = new CsharpRunTargetStore(directory, projects, files, resolver)
      return { store, evaluator, close: async () => {
        try { await store.stop() } finally { await probe.stop() }
      } }
    })
  }

  async resolve(context: RunRuntimeContext): Promise<RunRuntime> {
    const { preparation, target } = context
    if (context.strategyKind !== 'csharp-project' || !preparation || preparation.signal.aborted) {
      throw csharpPreparationError('OWNED_PLAN_REQUIRED')
    }
    let scope: CsharpPreparationScope | undefined
    const release = preparation.registerResource(async () => { await scope?.close() })
    try {
      scope = this.createScope(`${preparation.resourceOwnerId}:sdk:${randomUUID()}`)
      const selection = await scope.store.resolve(target.projectId, preparation.signal)
      if (preparation.signal.aborted) throw csharpPreparationError('CANCELLED')
      const resolution = selection.resolution
      if (resolution.projectId !== target.projectId) throw csharpPreparationError('INVALID_TARGET')
      if (resolution.state !== 'READY') {
        if (resolution.state === 'DEPENDENCY_FAILED') throw csharpPreparationError(
          resolution.dependency.state === 'MISSING' ? 'DEPENDENCY_MISSING' : 'INVALID_CONFIGURATION',
          resolution.dependency.reason)
        throw csharpPreparationError(selection.issue ?? ('reason' in resolution ? resolution.reason : resolution.state))
      }
      if (resolution.target.projectId !== target.projectId) throw csharpPreparationError('INVALID_TARGET')
      const result = await scope.evaluator.evaluate(resolution.target, preparation.signal)
      if (preparation.signal.aborted) throw csharpPreparationError('CANCELLED')
      if (!result.ok) {
        if ('sdk' in result) throw csharpPreparationError(result.sdk.dependency.state === 'MISSING'
          ? 'DEPENDENCY_MISSING' : 'INVALID_CONFIGURATION', result.sdk.dependency.reason)
        throw csharpPreparationError(result.reason, result.detail)
      }
      if (runTargetIdentity(result.evaluation.target, 'csharp-project') !== runTargetIdentity(target, 'csharp-project')) {
        throw csharpPreparationError('INVALID_TARGET')
      }
      return evaluatedCsharpRuntime(result.evaluation)
    } finally {
      // Failure retains the registered scope so Stop/replacement can retry cleanup.
      await scope?.close()
      release()
    }
  }
}

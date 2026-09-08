import type { IpcRendererLike } from '../../src/preload/bridge/lifecycle'
import { GIT_CONTEXT_CHANNEL } from '../../src/shared/contracts/git-lifecycle'

/** Adds the 5D wire framing to existing semantic payload/DTO regression fixtures. */
export function gitSemanticTransport(ipc: IpcRendererLike): IpcRendererLike {
  return { on: ipc.on.bind(ipc), removeListener: ipc.removeListener.bind(ipc),
    async invoke(channel, request) {
      if (channel === GIT_CONTEXT_CHANNEL) return { ok: true, value: { generation: 'fixture-generation' } }
      const { identity, payload } = request as { identity: unknown; payload: unknown }
      return { ok: true, value: { identity, result: await ipc.invoke(channel, payload) } }
    } }
}

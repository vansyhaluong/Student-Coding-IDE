import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { GIT_CONTEXT_CHANNEL, validateGitIdentity } from '../../shared/contracts/git-lifecycle'
import { PROJECT_CHANNELS } from '../../shared/contracts/project'
import { FILE_CHANNELS } from '../../shared/contracts/file'
import { LIFECYCLE_CHANNELS } from '../../shared/contracts/lifecycle'
import { validateExactObject } from '../../shared/contracts/validation'
import { validateGitMutationOutcome } from '../../shared/contracts/git'

/** Request transport state only; no repository/business state or process authority. */
export function createGitIdentityTransport(ipc: IpcRendererLike): IpcRendererLike {
  let epoch = 0, serial = 0, pending = 0
  const latest = new Map<string, number>()
  const mutations = new Set<string>()
  const changed = () => { epoch++ }
  const unavailable = (_event: unknown, payload: unknown) => {
    if (typeof payload === 'object' && payload !== null && 'state' in payload
      && ['UNAVAILABLE', 'STOPPING', 'STOPPED', 'FAILED'].includes(String(payload.state))) changed()
  }
  return {
    on: ipc.on.bind(ipc), removeListener: ipc.removeListener.bind(ipc),
    async invoke(channel, payload) {
      const request = payload as { projectId: string }
      const mutation = ['git:stage', 'git:unstage', 'git:commit', 'git:switch-branch'].includes(channel)
      if (mutations.has(request.projectId)) return cancelled('busy')
      if (mutation) { epoch++; mutations.add(request.projectId) }
      const startedEpoch = epoch, sequence = ++serial
      const key = `${request.projectId}:${channel}`
      if (!mutation) latest.set(key, sequence)
      if (pending++ === 0) {
        ipc.on(PROJECT_CHANNELS.changed, changed)
        ipc.on(FILE_CHANNELS.statusChanged, unavailable)
        ipc.on(LIFECYCLE_CHANNELS.statusChanged, unavailable)
      }
      const stale = () => epoch !== startedEpoch || !mutation && latest.get(key) !== sequence
      try {
        const context = await invokeSafely(ipc, GIT_CONTEXT_CHANNEL, { projectId: request.projectId })
        if (stale()) return cancelled('stale-request')
        const outer = validateExactObject(context, ['ok', 'value', 'error'])
        if (!outer.ok || outer.value.ok !== true) return context
        const ctx = validateExactObject(outer.value.value, ['generation'])
        if (!ctx.ok) return invalidResponse()
        const identity = { requestId: `git_${crypto.randomUUID()}`, projectId: request.projectId, generation: ctx.value.generation }
        const checked = validateGitIdentity(identity)
        if (!checked.ok) return invalidResponse()
        const response = await invokeSafely(ipc, channel, { identity: checked.value, payload })
        const wrapper = validateExactObject(response, ['ok', 'value', 'error'])
        if (!wrapper.ok) return invalidResponse()
        if (wrapper.value.ok !== true) return stale() && !mutation ? cancelled('stale-request') : response
        const body = validateExactObject(wrapper.value.value, ['identity', 'result'])
        if (!body.ok) return invalidResponse()
        const received = validateGitIdentity(body.value.identity)
        if (!received.ok || received.value.requestId !== identity.requestId
          || received.value.projectId !== identity.projectId || received.value.generation !== identity.generation) return invalidResponse()
        if (stale()) {
          if (!mutation) return cancelled('stale-request')
          const result = validateExactObject(body.value.result, ['ok', 'value', 'error'])
          if (result.ok && result.value.ok === true) {
            const outcome = validateGitMutationOutcome(result.value.value)
            if (!outcome.ok) return invalidResponse()
            return { ok: true, value: { applied: true, status: null, refreshRequired: true } }
          }
        }
        return body.value.result
      } finally {
        if (mutation) mutations.delete(request.projectId)
        if (latest.get(key) === sequence) latest.delete(key)
        if (--pending === 0) {
          ipc.removeListener(PROJECT_CHANNELS.changed, changed)
          ipc.removeListener(FILE_CHANNELS.statusChanged, unavailable)
          ipc.removeListener(LIFECYCLE_CHANNELS.statusChanged, unavailable)
        }
      }
    },
  }
}

function cancelled(reason: string) {
  return { ok: false, error: { code: 'PROCESS_CANCELLED', message: 'The Git request is no longer current.',
    details: { reason }, retryable: false } }
}
function invalidResponse() {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'The application returned an invalid Git identity.', retryable: false } }
}

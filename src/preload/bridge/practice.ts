import { isPlainObject } from '../../shared/contracts/validation'
import { isPracticeLoad, PRACTICE_CHANNELS, type PracticeApi } from '../../shared/contracts/practice'
import type { IpcRendererLike } from './lifecycle'
import { invokeSafely } from './invoke'
import { parseAppResult } from './result'

export function createPracticeBridge(ipc: IpcRendererLike): PracticeApi {
  const subscribe = (channel: string, callback: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => callback(payload)
    ipc.on(channel, wrapped)
    return () => ipc.removeListener(channel, wrapped)
  }
  return {
    load: async () => parseAppResult(await invokeSafely(ipc, PRACTICE_CHANNELS.load, {}), isPracticeLoad, PRACTICE_CHANNELS.load),
    save: async request => parseAppResult(await invokeSafely(ipc, PRACTICE_CHANNELS.save, request), (v): v is null => v === null, PRACTICE_CHANNELS.save),
    resolveClose: async (token, saved) => parseAppResult(await invokeSafely(ipc, PRACTICE_CHANNELS.resolveClose, { token, saved }), (v): v is null => v === null, PRACTICE_CHANNELS.resolveClose),
    onPrepareClose: listener => subscribe(PRACTICE_CHANNELS.prepareClose, p => {
      if (isPlainObject(p) && typeof p.token === 'string' && /^[a-f0-9-]{36}$/.test(p.token)) listener(p.token)
    }),
    onResume: listener => subscribe(PRACTICE_CHANNELS.resume, p => { if (isPlainObject(p) && Object.keys(p).length === 0) listener() }),
  }
}

import type { AppResult } from '../../shared/contracts'
import type { IpcRendererLike } from './lifecycle'

export async function invokeSafely(
  ipcRenderer: IpcRendererLike,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  try {
    return await ipcRenderer.invoke(channel, payload)
  } catch {
    return transportFailure()
  }
}

function transportFailure(): AppResult<never> {
  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'The application request could not be completed.',
      details: { boundaryFailure: 'transport' },
      retryable: true,
    },
  }
}

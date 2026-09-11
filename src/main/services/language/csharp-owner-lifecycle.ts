import type { WebContents } from 'electron'
import type { IpcRequestContext, IpcSenderFrame } from '../../ipc/ipc-handler-registry'
import type { CsharpWorkspaceSession } from './csharp-workspace-session'
import { LanguageError } from './language-error'

interface Owner {
  id: number
  mainFrame?: WebContents['mainFrame']
  isDestroyed?(): boolean
  on(event: 'did-start-navigation', listener: (event: unknown, url: string, inPlace: boolean, mainFrame: boolean) => void): unknown
  on(event: 'did-frame-navigate', listener: (event: unknown, url: string, code: number, text: string, mainFrame: boolean, processId: number, routingId: number) => void): unknown
  on(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown
  removeListener(event: 'did-start-navigation', listener: (event: unknown, url: string, inPlace: boolean, mainFrame: boolean) => void): unknown
  removeListener(event: 'did-frame-navigate', listener: (event: unknown, url: string, code: number, text: string, mainFrame: boolean, processId: number, routingId: number) => void): unknown
  removeListener(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown
}
/** Main-owned committed-frame authority, registered before window load. */
export class CsharpOwnerLifecycle {
  readonly name = 'CsharpOwnerLifecycle'
  private owners = new Map<number, { owner: Owner; key?: string; remove(): void }>()
  constructor(private readonly session: Pick<CsharpWorkspaceSession, 'invalidate'>,
    private readonly report: (error: unknown) => void) {}

  observe(owner: Owner): void {
    if (this.owners.has(owner.id)) return
    const retired = new Set<string>()
    const entry = { owner, key: undefined as string | undefined, remove: () => {
      owner.removeListener('did-start-navigation', navigation)
      owner.removeListener('did-frame-navigate', committed)
      owner.removeListener('render-process-gone', lost)
      owner.removeListener('destroyed', destroyed)
      this.owners.delete(owner.id)
    } }
    const lost = () => {
      if (entry.key) retired.add(entry.key)
      entry.key = undefined
      void this.session.invalidate().catch(this.report)
    }
    const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) lost()
    }
    const committed = (_event: unknown, _url: string, _code: number, _text: string,
      mainFrame: boolean, processId: number, routingId: number) => {
      const frame = owner.mainFrame, key = frameKey(frame)
      if (!mainFrame || owner.isDestroyed?.() || !key || retired.has(key)
        || frame?.processId !== processId || frame.routingId !== routingId || entry.key === key) return
      lost(); entry.key = key
    }
    const destroyed = () => { lost(); entry.remove() }
    this.owners.set(owner.id, entry)
    owner.on('did-start-navigation', navigation)
    owner.on('did-frame-navigate', committed)
    owner.on('render-process-gone', lost)
    owner.on('destroyed', destroyed)
  }
  assertCurrent(context: IpcRequestContext): string {
    const entry = this.owners.get(context.senderId), key = frameKey(context.senderFrame)
    if (!entry || entry.owner.isDestroyed?.() || !key || key !== entry.key || key !== frameKey(entry.owner.mainFrame)) {
      throw new LanguageError('stale-session')
    }
    return context.senderId + ':' + key
  }
  stop(): void { for (const entry of [...this.owners.values()]) entry.remove() }
}
function frameKey(frame: IpcSenderFrame | null | undefined): string | undefined {
  try {
    if (frame && !frame.isDestroyed() && !frame.detached && frame.frameToken && Number.isSafeInteger(frame.processId)) {
      return frame.processId + ':' + frame.frameToken
    }
  } catch { /* Disposed Electron frame is never authorized. */ }
  return undefined
}

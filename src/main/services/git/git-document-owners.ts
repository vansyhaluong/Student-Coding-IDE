import type { WebContents } from 'electron'
import type { ManagedService } from '../../app/desktop-application'
import type { IpcRequestContext, IpcSenderFrame } from '../../ipc/ipc-handler-registry'
import { DomainError } from '../../errors/app-error'
import type { GitOperationLifecycle } from './git-operation-lifecycle'

type Owner = Pick<WebContents, 'id' | 'mainFrame' | 'isDestroyed' | 'on' | 'removeListener'>

/** Registered at window creation, before load. IPC can check but cannot restore. */
export class GitDocumentOwners implements ManagedService {
  readonly name = 'GitDocumentOwners'
  private readonly owners = new Map<number, { owner: Owner; current?: string; remove(): void }>()

  constructor(private readonly lifecycle: Pick<GitOperationLifecycle, 'loseOwner' | 'restoreOwner'>) {}

  observe(owner: Owner): void {
    if (this.owners.has(owner.id)) return
    const retired = new Set<string>()
    const entry = { owner, current: undefined as string | undefined, remove: () => {
      owner.removeListener('did-start-navigation', navigating)
      owner.removeListener('did-frame-navigate', committed)
      owner.removeListener('render-process-gone', lost)
      owner.removeListener('destroyed', destroyed)
      this.owners.delete(owner.id)
    } }
    const lost = () => {
      if (entry.current) retired.add(entry.current)
      entry.current = undefined
      this.lifecycle.loseOwner(owner.id)
    }
    const navigating = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) lost()
    }
    const committed = (_event: unknown, _url: string, _code: number, _text: string,
      mainFrame: boolean, processId: number, routingId: number) => {
      if (!mainFrame || owner.isDestroyed()) return
      const frame = owner.mainFrame
      const key = frameKey(frame)
      // Match the committed event to the current main frame, never the unloading frame.
      if (!key || frame.processId !== processId || frame.routingId !== routingId || retired.has(key)) return
      if (entry.current === key) return
      lost()
      entry.current = key
      this.lifecycle.restoreOwner(owner.id)
    }
    const destroyed = () => { lost(); entry.remove() }
    this.owners.set(owner.id, entry)
    lost()
    owner.on('did-start-navigation', navigating)
    owner.on('did-frame-navigate', committed)
    owner.on('render-process-gone', lost)
    owner.on('destroyed', destroyed)
  }

  assertCurrent({ senderId, senderFrame }: IpcRequestContext): void {
    const entry = this.owners.get(senderId)
    const caller = frameKey(senderFrame)
    if (!entry || entry.owner.isDestroyed() || !caller || caller !== entry.current
      || caller !== frameKey(entry.owner.mainFrame)) {
      throw new DomainError({ code: 'PERMISSION_DENIED', message: 'The Git document is no longer available.',
        details: { reason: 'stale-document' }, retryable: false })
    }
  }

  stop(): void {
    for (const [id, entry] of this.owners) { this.lifecycle.loseOwner(id); entry.remove() }
  }
}

function frameKey(frame: IpcSenderFrame | null | undefined): string | undefined {
  try {
    if (frame && !frame.isDestroyed() && !frame.detached && frame.frameToken
      && Number.isSafeInteger(frame.processId)) return `${frame.processId}:${frame.frameToken}`
  } catch { /* Electron may dispose a frame between delivery and dispatch; reject it. */ }
  return undefined
}

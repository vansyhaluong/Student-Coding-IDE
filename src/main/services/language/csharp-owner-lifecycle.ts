import type { CsharpWorkspaceSession } from './csharp-workspace-session'

interface Owner {
  id: number
  on(event: 'did-start-navigation', listener: (event: unknown, url: string, inPlace: boolean, mainFrame: boolean) => void): unknown
  on(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown
  removeListener(event: 'did-start-navigation', listener: (event: unknown, url: string, inPlace: boolean, mainFrame: boolean) => void): unknown
  removeListener(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown
}

/** Main-frame lifetime, independent of React component lifetimes. */
export class CsharpOwnerLifecycle {
  readonly name = 'CsharpOwnerLifecycle'
  private removers = new Map<number, () => void>()
  constructor(private readonly session: Pick<CsharpWorkspaceSession, 'invalidate'>,
    private readonly report: (error: unknown) => void) {}

  observe(owner: Owner): void {
    if (this.removers.has(owner.id)) return
    const lost = () => { void this.session.invalidate().catch(this.report) }
    const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) lost()
    }
    const remove = () => {
      owner.removeListener('did-start-navigation', navigation)
      owner.removeListener('render-process-gone', lost)
      owner.removeListener('destroyed', destroyed)
      this.removers.delete(owner.id)
    }
    const destroyed = () => { lost(); remove() }
    this.removers.set(owner.id, remove)
    owner.on('did-start-navigation', navigation)
    owner.on('render-process-gone', lost)
    owner.on('destroyed', destroyed)
  }
  stop(): void { for (const remove of [...this.removers.values()]) remove() }
}

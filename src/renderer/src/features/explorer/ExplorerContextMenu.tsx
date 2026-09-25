import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Copy, File, FilePlus2, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { FileEntry } from '../../../../shared/contracts'

export type ExplorerContextMenuState =
  | { kind: 'entry'; entry: FileEntry; x: number; y: number }
  | { kind: 'background'; x: number; y: number }

interface Props {
  state: ExplorerContextMenuState
  interactionLocked: boolean
  onClose(): void
  onOpen(entry: FileEntry): void
  onCreate(kind: 'file' | 'directory', directory: string): void
  onRename(entry: FileEntry): void
  onDelete(entry: FileEntry): void
  onCopyPath(entry: FileEntry): void
  onRefresh(): void
}

export function ExplorerContextMenu({ state, interactionLocked, onClose, onOpen, onCreate, onRename, onDelete, onCopyPath, onRefresh }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const menu = menuRef.current!
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const position = () => {
      const bounds = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(4, Math.min(state.x, window.innerWidth - bounds.width - 4))}px`
      menu.style.top = `${Math.max(4, Math.min(state.y, window.innerHeight - bounds.height - 4))}px`
    }
    position()
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: MouseEvent) => {
      if (!menu.contains(event.target as Node)) onClose()
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        returnFocus.current?.focus()
        onClose()
      } else if (event.key === 'Tab') {
        returnFocus.current?.focus()
        onClose()
      }
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('contextmenu', outside, true)
    document.addEventListener('keydown', keydown)
    window.addEventListener('resize', position)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('contextmenu', outside, true)
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('resize', position)
    }
  }, [state, onClose])

  const item = (label: string, icon: ReactNode, action: () => void, disabled = false, destructive = false) => (
    <button type="button" role="menuitem" className={`explorer-context-menu-item${destructive ? ' destructive' : ''}`}
      disabled={disabled} onClick={(event) => {
        if (event.button !== 0 || disabled) return
        returnFocus.current?.focus()
        onClose()
        action()
      }}>{icon}<span>{label}</span></button>
  )
  const entry = state.kind === 'entry' ? state.entry : null
  const separator = <div role="separator" className="explorer-context-menu-separator" />
  return createPortal(
    <div ref={menuRef} role="menu" aria-label="Explorer context menu" className="explorer-context-menu"
      style={{ left: state.x, top: state.y }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
      onPointerUpCapture={(event) => {
        if (event.button === 2) { event.preventDefault(); event.stopPropagation() }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
      }}>
      {entry?.kind === 'file'
        ? item('Open', <File />, () => onOpen(entry), interactionLocked)
        : <>
          {item('New File', <FilePlus2 />, () => onCreate('file', entry?.relativePath ?? ''), interactionLocked)}
          {item('New Folder', <FolderPlus />, () => onCreate('directory', entry?.relativePath ?? ''), interactionLocked)}
        </>}
      {separator}
      {entry ? <>
        {item('Rename', <Pencil />, () => onRename(entry), interactionLocked)}
        {item('Delete', <Trash2 />, () => onDelete(entry), interactionLocked, true)}
        {separator}
        {item('Copy Path', <Copy />, () => onCopyPath(entry))}
      </> : item('Refresh', <RefreshCw />, onRefresh, interactionLocked)}
    </div>, document.body,
  )
}

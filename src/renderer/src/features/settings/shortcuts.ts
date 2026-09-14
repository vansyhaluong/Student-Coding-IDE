export type ShellShortcut = 'terminal' | 'open' | 'new' | 'search'
export function shellShortcut(event: KeyboardEvent, modal: boolean): ShellShortcut | null {
  if (modal || event.defaultPrevented || event.repeat || event.isComposing || !event.ctrlKey || event.metaKey || event.altKey) return null
  const key = event.key.toLowerCase()
  if (event.code === 'Backquote' && !event.shiftKey) return 'terminal'
  const target = event.target
  if (target instanceof Element && target.closest('.terminal-panel')) return null
  if (key === 'o' && !event.shiftKey) return 'open'
  if (key === 'n' && !event.shiftKey) return 'new'
  if (key === 'f' && event.shiftKey) return 'search'
  return null
}

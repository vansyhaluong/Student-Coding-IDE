import type { PointerEvent as ReactPointerEvent } from 'react'

interface PanelResizerProps {
  height: number
  minimum: number
  getMaximum(): number
  onResize(height: number): void
}

export function PanelResizer({
  height,
  minimum,
  getMaximum,
  onResize,
}: PanelResizerProps) {
  const clamp = (value: number): number => (
    Math.min(getMaximum(), Math.max(minimum, value))
  )
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const panel = event.currentTarget.parentElement
    if (!panel) return
    const bottom = panel.getBoundingClientRect().bottom
    const resize = (pointerEvent: PointerEvent): void => {
      onResize(clamp(bottom - pointerEvent.clientY))
    }
    const stop = (): void => {
      document.body.classList.remove('is-resizing-panel')
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    document.body.classList.add('is-resizing-panel')
    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-label="Resize Terminal panel"
      aria-orientation="horizontal"
      aria-valuemin={minimum}
      aria-valuemax={getMaximum()}
      aria-valuenow={height}
      tabIndex={0}
      onPointerDown={startResize}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        onResize(clamp(height + (event.key === 'ArrowUp' ? 10 : -10)))
      }}
    />
  )
}

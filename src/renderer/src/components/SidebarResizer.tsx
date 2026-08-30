import type { PointerEvent as ReactPointerEvent } from 'react'

interface SidebarResizerProps {
  side: 'left' | 'right'
  width: number
  onResize(width: number): void
  getMaximum(): number
}

export function SidebarResizer({ side, width, onResize, getMaximum }: SidebarResizerProps) {
  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const resize = (pointerEvent: PointerEvent): void => {
      const requested = side === 'left'
        ? pointerEvent.clientX
        : window.innerWidth - pointerEvent.clientX
      onResize(Math.min(getMaximum(), Math.max(220, requested)))
    }
    const stop = (): void => {
      document.body.classList.remove('is-resizing-sidebar')
      window.removeEventListener('pointermove', resize)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    document.body.classList.add('is-resizing-sidebar')
    window.addEventListener('pointermove', resize)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <div
      className={`sidebar-resizer sidebar-resizer-${side}`}
      role="separator"
      aria-label={`Resize ${side} sidebar`}
      aria-orientation="vertical"
      aria-valuemin={220}
      aria-valuemax={getMaximum()}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={startResize}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const physicalDelta = event.key === 'ArrowRight' ? 10 : -10
        const widthDelta = side === 'left' ? physicalDelta : -physicalDelta
        onResize(Math.min(getMaximum(), Math.max(220, width + widthDelta)))
      }}
    />
  )
}

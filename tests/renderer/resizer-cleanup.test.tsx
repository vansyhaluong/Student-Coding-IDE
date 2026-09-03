/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PanelResizer } from '../../src/renderer/src/components/PanelResizer'
import { SidebarResizer } from '../../src/renderer/src/components/SidebarResizer'

afterEach(() => {
  cleanup()
  document.body.classList.remove('is-resizing-panel', 'is-resizing-sidebar')
  vi.restoreAllMocks()
})

describe('Phase 2F-C resizer cleanup', () => {
  it('removes active sidebar pointer listeners and body state on unmount', () => {
    const onResize = vi.fn()
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const view = render(
      <SidebarResizer
        side="left"
        width={280}
        onResize={onResize}
        getMaximum={() => 500}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('separator'), { clientX: 280 })
    expect(document.body.classList.contains('is-resizing-sidebar')).toBe(true)

    view.unmount()
    expect(document.body.classList.contains('is-resizing-sidebar')).toBe(false)
    expect(removedPointerEventTypes(removeListener)).toEqual([
      'pointermove',
      'pointerup',
      'pointercancel',
    ])

    fireEvent.pointerMove(window, { clientX: 350 })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('removes active bottom-panel pointer listeners and body state on unmount', () => {
    const onResize = vi.fn()
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const view = render(
      <div>
        <PanelResizer
          height={260}
          minimum={160}
          getMaximum={() => 400}
          onResize={onResize}
        />
      </div>,
    )
    vi.spyOn(view.container.firstElementChild!, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
    } as DOMRect)

    fireEvent.pointerDown(screen.getByRole('separator'), { clientY: 340 })
    expect(document.body.classList.contains('is-resizing-panel')).toBe(true)

    view.unmount()
    expect(document.body.classList.contains('is-resizing-panel')).toBe(false)
    expect(removedPointerEventTypes(removeListener)).toEqual([
      'pointermove',
      'pointerup',
      'pointercancel',
    ])

    fireEvent.pointerMove(window, { clientY: 300 })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('keeps normal pointer-up cleanup idempotent', () => {
    const onResize = vi.fn()
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const view = render(
      <SidebarResizer
        side="right"
        width={280}
        onResize={onResize}
        getMaximum={() => 500}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('separator'), { clientX: 700 })
    fireEvent.pointerMove(window, { clientX: 650 })
    expect(onResize).toHaveBeenCalledOnce()
    fireEvent.pointerUp(window)
    expect(document.body.classList.contains('is-resizing-sidebar')).toBe(false)
    expect(removedPointerEventTypes(removeListener)).toEqual([
      'pointermove',
      'pointerup',
      'pointercancel',
    ])

    view.unmount()
    fireEvent.pointerCancel(window)
    expect(removedPointerEventTypes(removeListener)).toEqual([
      'pointermove',
      'pointerup',
      'pointercancel',
    ])
  })
})

function removedPointerEventTypes(
  spy: ReturnType<typeof vi.spyOn<typeof window, 'removeEventListener'>>,
): string[] {
  return spy.mock.calls
    .map(([type]) => type)
    .filter((type) => type.startsWith('pointer'))
}

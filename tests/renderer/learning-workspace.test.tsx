/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { learningChapters, type ChapterId } from '../../src/renderer/src/features/learning/chapters'

afterEach(cleanup)
function Workspace() {
  const [chapter, select] = useState<ChapterId>(1)
  const [collapsed, collapse] = useState(false)
  return <LearningWorkspace selectedChapterId={chapter} onSelectChapter={select}
    sidebarCollapsed={collapsed} onToggleSidebar={() => collapse(value => !value)} />
}

it('exposes the approved eight chapters in order, retaining selection while collapsing', () => {
  render(<Workspace />)
  const navigation = screen.getByRole('navigation')
  const buttons = within(navigation).getAllByRole('button')
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
    'Chương 1: Giới thiệu môn Kỹ thuật lập trình', 'Chương 2: Kiến thức lập trình cơ bản',
    'Chương 3: Cấu trúc rẽ nhánh', 'Chương 4: Cấu trúc lặp', 'Chương 5: Kỹ thuật xử lý chuỗi',
    'Chương 6: Hàm', 'Chương 7: Kỹ thuật xử lý mảng một chiều', 'Chương 8: Kỹ thuật xử lý mảng hai chiều',
  ])
  fireEvent.click(buttons[5])
  expect(buttons[5].getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hàm')
  fireEvent.click(screen.getByRole('button', { name: 'Thu gọn lộ trình' }))
  expect(within(navigation).getAllByRole('button')).toHaveLength(8)
  expect(buttons[5].getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: 'Mở rộng lộ trình' }))
  expect(buttons[5].textContent).toContain('Hàm')
})

it('keeps course introduction and Chapter 1 in the same scroll region', () => {
  render(<Workspace />)
  const page = screen.getByRole('region', { name: 'Nội dung chương 1' })
  expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe('Kỹ thuậtlập trình.')
  const chapter = within(page).getByRole('heading', { name: 'Bắt đầu từ cách tư duy.' })
  const scroll = vi.fn()
  chapter.parentElement!.scrollIntoView = scroll
  fireEvent.click(screen.getByRole('button', { name: 'Tìm hiểu môn học' }))
  expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  page.scrollTop = 360
  fireEvent.click(screen.getByRole('button', { name: `Chương 2: ${learningChapters[1].title}` }))
  fireEvent.click(screen.getByRole('button', { name: `Chương 1: ${learningChapters[0].title}` }))
  expect(screen.getByRole('region', { name: 'Nội dung chương 1' })).toBe(page)
  expect(page.scrollTop).toBe(360)
})

it.each(learningChapters.slice(1))('renders chapter $id as a shell without exercise actions', chapter => {
  render(<Workspace />)
  fireEvent.click(screen.getByRole('button', { name: `Chương ${chapter.id}: ${chapter.title}` }))
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(chapter.title)
  expect(screen.getByRole('heading', { name: 'Nội dung đang được chuẩn bị' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Run|Submit/ })).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
})

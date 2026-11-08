/** @vitest-environment jsdom */
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getBundledCourse } from '../../src/main/services/learning/content/course'
import type { StudentIdeApi } from '../../src/shared/contracts'
import { LearningWorkspace } from '../../src/renderer/src/features/learning/LearningWorkspace'
import { LearningSidebarHeader } from '../../src/renderer/src/features/learning/LearningSidebarHeader'
import { learningChapters, type ChapterId } from '../../src/renderer/src/features/learning/chapters'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
vi.mock('../../src/renderer/src/features/learning/highlight-csharp', () => ({
  highlightCsharp: async (code: string) => code.split('\n').map(() => [{ offset: 0, type: 'keyword.cs' }]),
}))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn() })
  window.studentIde = { learning: { getCourse: vi.fn(async () => ({ ok: true as const, value: getBundledCourse() })) } } as unknown as StudentIdeApi
})
function Workspace() {
  const [chapter, select] = useState<ChapterId>(1)
  const [collapsed, collapse] = useState(false)
  return <>
    <header><LearningSidebarHeader collapsed={collapsed} onToggle={() => collapse(value => !value)} /></header>
    <LearningWorkspace selectedChapterId={chapter} onSelectChapter={select} sidebarCollapsed={collapsed} onCollapseSidebar={() => collapse(true)} />
  </>
}

it('keeps Learning Assistant out of course introduction and theory pages', async () => {
  const view = render(<Workspace />)
  await within(view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!).findByRole('heading', { name: /Chương 1 —/ })
  expect(view.container.querySelector('.learning-assistant-trigger, .learning-assistant')).toBeNull()
  fireEvent.click(within(view.container.querySelector<HTMLElement>('.learning-sidebar')!).getByRole('button', { name: 'Chương 2: Kiến thức lập trình cơ bản' }))
  expect(within(view.container.querySelector<HTMLElement>('.learning-section-nav')!).getByRole('tab', { name: 'Tài liệu' }).getAttribute('aria-selected')).toBe('true')
  expect(view.container.querySelector('.learning-assistant-trigger, .learning-assistant')).toBeNull()
  expect(view.container.querySelector('.learning-layout')?.getAttribute('data-collapsed')).toBe('false')
})

it('exposes the approved eight chapters in order, retaining selection while collapsing', async () => {
  const view = render(<Workspace />)
  // Scope accessibility queries to the feature under test; eight full theory pages stay mounted.
  await within(view.container.querySelector<HTMLElement>('#learning-chapter-one')!).findByRole('heading', { name: /Chương 1 —/ })
  const navigation = within(view.container.querySelector<HTMLElement>('.learning-sidebar')!).getByRole('navigation')
  const header = within(view.container.querySelector<HTMLElement>('header')!)
  const collapseButton = header.getByRole('button', { name: 'Thu gọn lộ trình' })
  expect(collapseButton.closest('header')).not.toBeNull()
  expect(collapseButton.getAttribute('aria-controls')).toBe(navigation.id)
  expect(navigation.closest('aside')!.querySelector('.learning-sidebar-toggle')).toBeNull()
  const buttons = within(navigation).getAllByRole('button')
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
    'Chương 1: Giới thiệu môn Kỹ thuật lập trình', 'Chương 2: Kiến thức lập trình cơ bản',
    'Chương 3: Cấu trúc rẽ nhánh', 'Chương 4: Cấu trúc lặp', 'Chương 5: Kỹ thuật xử lý chuỗi',
    'Chương 6: Hàm', 'Chương 7: Kỹ thuật xử lý mảng một chiều', 'Chương 8: Kỹ thuật xử lý mảng hai chiều',
  ])
  fireEvent.click(buttons[5])
  expect(buttons[5].getAttribute('aria-current')).toBe('page')
  expect(within(view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!).getByRole('heading', { level: 1 }).textContent).toBe('Chương 6 — Hàm')
  fireEvent.click(header.getByRole('button', { name: 'Thu gọn lộ trình' }))
  expect(within(navigation).getAllByRole('button')).toHaveLength(8)
  expect(buttons[5].getAttribute('aria-current')).toBe('page')
  fireEvent.click(header.getByRole('button', { name: 'Mở rộng lộ trình' }))
  expect(buttons[5].textContent).toContain('Hàm')
})

it('keeps course introduction and Chapter 1 in the same scroll region', async () => {
  const view = render(<Workspace />)
  const page = view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!
  const navigation = within(view.container.querySelector<HTMLElement>('.learning-sidebar')!)
  await within(page).findByRole('heading', { name: /Chương 1 —/ })
  expect(page.getAttribute('aria-label')).toBe('Nội dung chương 1')
  expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe('Kỹ thuật lập trình')
  const objectives = within(page).getByRole('region', { name: 'Mục tiêu của Chương 1' })
  expect(within(objectives).getAllByRole('listitem')).toHaveLength(3)
  expect(within(page).getByRole('heading', { name: 'Thông tin học phần' })).toBeTruthy()
  const chapter = within(page).getByRole('heading', { name: /Chương 1 —/ })
  const scroll = vi.fn()
  chapter.closest('section')!.scrollIntoView = scroll
  const read = page.querySelector<HTMLButtonElement>('.learning-intro-link')!
  expect(read.textContent).toContain('Đọc nội dung chương 1'); fireEvent.click(read)
  expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  page.scrollTop = 360
  fireEvent.click(navigation.getByRole('button', { name: `Chương 2: ${learningChapters[1].title}` }))
  fireEvent.click(navigation.getByRole('button', { name: `Chương 1: ${learningChapters[0].title}` }))
  expect(view.container.querySelector('.learning-page:not([hidden])')).toBe(page)
  expect(page.scrollTop).toBe(360)
})

it('retains Chapter 1 overview, material and reading position through both sidebar states', async () => {
  const view = render(<Workspace />)
  const page = view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!
  const header = within(view.container.querySelector<HTMLElement>('header')!)
  await within(page).findByRole('heading', { name: /Chương 1 —/ })
  expect(page.getAttribute('aria-label')).toBe('Nội dung chương 1')
  const overview = within(page).getByRole('complementary', { name: 'Tổng quan môn học' })
  expect(overview.textContent).toContain('8 chương')
  expect(overview.textContent).toContain('C#')
  const material = page.querySelector('.learning-material')
  const code = [...page.querySelectorAll('code.language-csharp')].map(block => block.textContent)
  page.scrollTop = 480
  for (const name of ['Thu gọn lộ trình', 'Mở rộng lộ trình']) {
    fireEvent.click(header.getByRole('button', { name }))
    expect(view.container.querySelector('.learning-page:not([hidden])')).toBe(page)
    expect(page.querySelector('.learning-material')).toBe(material)
    expect(page.scrollTop).toBe(480)
    expect([...page.querySelectorAll('code.language-csharp')].map(block => block.textContent)).toEqual(code)
    expect([...page.querySelectorAll('button')].some(button => /Run|Submit/.test(button.getAttribute('aria-label') ?? button.textContent ?? ''))).toBe(false)
  }
})

it('C4-C measures equivalent global/scoped queries over the real rendered course DOM', async () => {
  const start = performance.now(), view = render(<Workspace />)
  const page = view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!
  await within(page).findByRole('heading', { name: /Chương 1 —/ })
  const ready = performance.now(), measure = <T,>(query: () => T) => {
    const t = performance.now(), value = query(); return { value, ms: Math.round(performance.now() - t) }
  }
  const globalHeading = measure(() => screen.getByRole('heading', { name: /Chương 1 —/ }))
  const scopedHeading = measure(() => within(page).getByRole('heading', { name: /Chương 1 —/ }))
  const label = `Chương 2: ${learningChapters[1].title}`
  const globalNav = measure(() => screen.getByRole('button', { name: label }))
  const scopedNav = measure(() => within(view.container.querySelector<HTMLElement>('.learning-sidebar')!).getByRole('button', { name: label }))
  const negativeRole = measure(() => within(page).queryByRole('button', { name: /Run|Submit/ }))
  const negativeDOM = measure(() => [...page.querySelectorAll('button')].some(button => /Run|Submit/.test(button.getAttribute('aria-label') ?? button.textContent ?? '')))
  expect(globalHeading.value).toBe(scopedHeading.value); expect(globalNav.value).toBe(scopedNav.value)
  expect(negativeRole.value).toBeNull(); expect(negativeDOM.value).toBe(false)
  console.info('C4C_COURSE_QUERY_TIMING', JSON.stringify({ readyMs: Math.round(ready - start), nodes: view.container.querySelectorAll('*').length,
    globalHeadingMs: globalHeading.ms, scopedHeadingMs: scopedHeading.ms, globalNavMs: globalNav.ms, scopedNavMs: scopedNav.ms,
    negativeRoleMs: negativeRole.ms, negativeDOMMs: negativeDOM.ms }))
}, 20000)

it.each(learningChapters.slice(1))('renders real chapter $id without exercise actions', async chapter => {
  const view = render(<Workspace />)
  await within(view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!).findByRole('heading', { name: /Chương 1 —/ })
  fireEvent.click(within(view.container.querySelector<HTMLElement>('.learning-sidebar')!).getByRole('button', { name: `Chương ${chapter.id}: ${chapter.title}` }))
  const page = view.container.querySelector<HTMLElement>('.learning-page:not([hidden])')!
  expect(page.getAttribute('aria-label')).toBe(`Nội dung chương ${chapter.id}`)
  expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe(`Chương ${chapter.id} — ${chapter.title}`)
  // Exact counts for the currently authored chapters; content itself is unchanged by 9D.
  expect(page.querySelectorAll('.learning-material > h2').length).toBe(({ 2: 14, 3: 14, 4: 15, 5: 15, 6: 15, 7: 15, 8: 16 } as Record<number, number>)[chapter.id])
  expect(page.querySelectorAll('code.language-csharp').length).toBeGreaterThan(0)
  expect(within(page).queryByRole('button', { name: /Run|Submit/ })).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
})

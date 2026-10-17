/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getBundledCourse } from '../../src/main/services/learning/content/course'
import { ChapterMaterial } from '../../src/renderer/src/features/learning/ChapterMaterial'

vi.mock('../../src/renderer/src/features/learning/highlight-csharp', () => ({
  highlightCsharp: async (code: string) => code.split('\n').map(() => [{ offset: 0, type: 'keyword.cs' }]),
}))
afterEach(cleanup)
it('renders authored tables and code without changing text, preserving inspectable provenance', async () => {
  const course = getBundledCourse()
  const view = render(<ChapterMaterial chapter={course.manifest.chapters[1]} markdown={course.materials[1].markdown}
    policy={course.manifest.sourceUsePolicy} />)
  expect(screen.getByRole('table')).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Chương 2 — Kiến thức lập trình cơ bản')
  await waitFor(() => expect(view.container.querySelector('code.language-csharp')?.getAttribute('data-highlighted')).toBe('true'))
  const fences = [...course.materials[1].markdown.matchAll(/```csharp\n([\s\S]*?)```/g)].map(match => match[1])
  expect([...view.container.querySelectorAll('code.language-csharp')].map(code => code.textContent)).toEqual(fences)
  fireEvent.click(screen.getByText('Nguồn tham khảo & quyền sử dụng'))
  expect(screen.getByText(course.manifest.sourceUsePolicy.authoredContent)).toBeTruthy()
  expect(view.container.textContent).toContain(course.manifest.chapters[1].references[0].sourceLicenseStatus)
  expect(view.container.querySelectorAll('a[href]')).toHaveLength(0)
})
it('does not render HTML, remote media, executable links or interactive code', () => {
  const course = getBundledCourse()
  const view = render(<ChapterMaterial chapter={course.manifest.chapters[1]} policy={course.manifest.sourceUsePolicy}
    markdown={'# Safe\n\n<script>alert(1)</script>\n\n![image](https://remote.example/a.png)\n\n[bad](javascript:alert(1))\n\n<iframe src="https://remote.example"></iframe>\n\n[external](https://learn.microsoft.com/en-us/dotnet/)'} />)
  expect(view.container.querySelector('script, iframe, img, a[href]')).toBeNull()
  expect(screen.queryByRole('button', { name: /Run|Submit/ })).toBeNull()
})

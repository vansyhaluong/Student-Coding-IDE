/** @vitest-environment jsdom */
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ProblemDescriptionContent } from '../../src/renderer/src/features/learning/practice/ProblemDescriptionContent'
import { descriptionExercise as exercise } from '../fixtures/learning/problem-description'

afterEach(cleanup)

it('renders the original title, sections, examples and source without mutating exercise data', () => {
  const original = JSON.stringify(exercise)
  const { container } = render(<ProblemDescriptionContent exercise={exercise} />)
  const article = within(container.querySelector('article')!)
  expect(article.getAllByRole('heading').map(h => h.textContent)).toEqual([
    exercise.title, 'Cách đọc đề', 'Input', 'Output', 'Ví dụ Input / Output', 'Constraints',
  ])
  expect(container.querySelectorAll('.practice-description-example').length).toBe(2)
  exercise.samples.forEach((sample, i) => expect(container.querySelectorAll('.practice-description-example')[i].textContent)
    .toBe(`Input: ${JSON.stringify(sample.args)}\nOutput: ${JSON.stringify(sample.expected)}`))
  expect(container.querySelector('details')?.textContent).toContain(exercise.source.url)
  expect(container.querySelector('details')?.textContent).toContain(exercise.source.usage)
  expect(JSON.stringify(exercise)).toBe(original)
})

it('renders Vietnamese Markdown, bold, inline code, fenced code, lists, tables and constraints', () => {
  const { container } = render(<ProblemDescriptionContent exercise={exercise} />)
  expect(container.querySelector('strong')?.textContent).toBe('mảng số nguyên')
  expect(container.querySelector('.practice-description-prose p code')?.textContent).toBe('nums')
  expect(container.querySelector('pre code.language-javascript')?.textContent).toContain('const tổng = nums.reduce')
  expect(container.querySelector('ol')?.children.length).toBe(2)
  expect(container.querySelector('.practice-description-table table')?.textContent).toContain('Mảng đầu vào')
  expect(container.textContent).toContain('ă â đ ê ô ơ ư Á Ề Ỹ')
  expect(container.textContent).toContain('1 <= nums.length <= 100000')
  expect(container.textContent).toContain('Giới hạn: số nguyên có dấu.')
})

it('keeps references readable without executable HTML, navigation or remote images', () => {
  const { container } = render(<ProblemDescriptionContent exercise={exercise} />)
  expect(container.querySelector('a, img, script, iframe')).toBeNull()
  expect(container.textContent).toContain('Tham khảo')
  expect(container.textContent).toContain('Minh họa tiếng Việt')
  expect(container.textContent).toContain('<script>window.unexpected = true</script>')
})

it('renders plain Vietnamese descriptions and switches exercises without retaining old content', () => {
  const { container, rerender } = render(<ProblemDescriptionContent exercise={exercise} />)
  rerender(<ProblemDescriptionContent exercise={{ ...exercise, title: 'Bài tiếp theo', description: 'Tính tổng hai số nguyên.', constraints: ['a ≤ b'], samples: [exercise.samples[0]] }} />)
  expect(container.querySelector('h1')?.textContent).toBe('Bài tiếp theo')
  expect(container.querySelector('.practice-description-prose')?.textContent).toBe('Tính tổng hai số nguyên.')
  expect(container.textContent).not.toContain('Cách đọc đề')
  expect(container.querySelectorAll('.practice-description-example').length).toBe(1)
})

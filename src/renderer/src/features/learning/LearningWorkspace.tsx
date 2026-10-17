import { ArrowDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useRef } from 'react'
import { learningChapters, type ChapterId } from './chapters'
import { ChapterMaterial } from './ChapterMaterial'
import { useLearningCourse } from './use-learning-course'

interface Props {
  selectedChapterId: ChapterId
  sidebarCollapsed: boolean
  onSelectChapter(id: ChapterId): void
  onToggleSidebar(): void
}

export function LearningWorkspace({ selectedChapterId, sidebarCollapsed, onSelectChapter, onToggleSidebar }: Props) {
  const introduction = useRef<HTMLElement>(null)
  const { course, error, retry } = useLearningCourse()
  const chapters = course ? course.manifest.chapters.map(chapter => ({ id: chapter.order, title: chapter.title })) : learningChapters
  return (
    <div className="learning-layout" data-collapsed={sidebarCollapsed}>
      <aside className="learning-sidebar" aria-label="Learning Roadmap">
        <div className="learning-sidebar-heading">
          {!sidebarCollapsed && <span>Lộ trình học</span>}
          <button type="button" className="learning-sidebar-toggle" onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? 'Mở rộng lộ trình' : 'Thu gọn lộ trình'}
            title={sidebarCollapsed ? 'Mở rộng lộ trình' : 'Thu gọn lộ trình'}
            aria-expanded={!sidebarCollapsed} aria-controls="learning-chapters">
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        <nav id="learning-chapters" aria-label="8 chương Kỹ thuật lập trình">
          {chapters.map(chapter => (
            <button type="button" key={chapter.id} aria-current={selectedChapterId === chapter.id ? 'page' : undefined}
              aria-label={`Chương ${chapter.id}: ${chapter.title}`} title={chapter.title}
              onClick={() => onSelectChapter(chapter.id)}>
              <span className="learning-chapter-number">{String(chapter.id).padStart(2, '0')}</span>
              {!sidebarCollapsed && <span>{chapter.title}</span>}
            </button>
          ))}
        </nav>
        {!sidebarCollapsed && <p className="learning-sidebar-note">Kỹ thuật lập trình<br /><span>8 chương · Một hành trình</span></p>}
      </aside>
      <div className="learning-pages">
        {chapters.map(chapter => (
          <section key={chapter.id} className="learning-page" hidden={selectedChapterId !== chapter.id}
            aria-label={`Nội dung chương ${chapter.id}`} tabIndex={0}>
            {chapter.id === 1 ? <>
              <div className="learning-intro">
                <p className="learning-eyebrow">Student Coding IDE / Learning</p>
                <h1>Kỹ thuật<br />lập trình.</h1>
                <p className="learning-lead">Từ cách hiểu một bài toán đến cách viết một chương trình rõ ràng.</p>
                <p>Khám phá những nền tảng của lập trình: điều kiện, vòng lặp, chuỗi, hàm và mảng. Từng chương giúp bạn xây dựng cách suy nghĩ có hệ thống khi làm việc với code.</p>
                <button type="button" className="learning-intro-link" onClick={() => introduction.current?.scrollIntoView({ block: 'start' })}>
                  Tìm hiểu môn học <ArrowDown aria-hidden="true" />
                </button>
                <div className="learning-intro-caption"><span>Nền tảng vững vàng.</span><span>Tư duy có cấu trúc.</span></div>
              </div>
              <section ref={introduction} id="learning-chapter-one" className="learning-chapter-intro" aria-label="Lý thuyết chương 1">
                {course && <ChapterMaterial chapter={course.manifest.chapters[0]} markdown={course.materials[0].markdown} policy={course.manifest.sourceUsePolicy} />}
                {!course && (error ? <p role="alert">{error} <button type="button" onClick={retry}>Thử lại</button></p> : <p role="status">Đang tải nội dung…</p>)}
              </section>
            </> : <div className="learning-chapter-shell">
              {course && <ChapterMaterial chapter={course.manifest.chapters[chapter.id - 1]} markdown={course.materials[chapter.id - 1].markdown} policy={course.manifest.sourceUsePolicy} />}
              {!course && (error ? <p role="alert">{error} <button type="button" onClick={retry}>Thử lại</button></p> : <p role="status">Đang tải nội dung…</p>)}
            </div>}
          </section>
        ))}
      </div>
    </div>
  )
}

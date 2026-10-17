import { ArrowDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useRef } from 'react'
import { learningChapters, type ChapterId } from './chapters'

interface Props {
  selectedChapterId: ChapterId
  sidebarCollapsed: boolean
  onSelectChapter(id: ChapterId): void
  onToggleSidebar(): void
}

export function LearningWorkspace({ selectedChapterId, sidebarCollapsed, onSelectChapter, onToggleSidebar }: Props) {
  const introduction = useRef<HTMLElement>(null)
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
          {learningChapters.map(chapter => (
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
        {learningChapters.map(chapter => (
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
              <section ref={introduction} className="learning-chapter-intro" aria-labelledby="learning-chapter-one">
                <p className="learning-eyebrow">Chương 01 / Giới thiệu</p>
                <h2 id="learning-chapter-one">Bắt đầu từ cách tư duy.</h2>
                <p>Môn Kỹ thuật lập trình tập trung vào cách phân tích yêu cầu, tổ chức lời giải và diễn đạt lời giải bằng code dễ hiểu.</p>
                <dl className="learning-intro-details">
                  <div><dt>Mục tiêu</dt><dd>Nhận diện dữ liệu đầu vào, kết quả cần đạt và các bước xử lý của một bài toán.</dd></div>
                  <div><dt>Kiến thức & kỹ năng</dt><dd>Làm quen với cấu trúc điều khiển, cách tách hàm và kỹ thuật xử lý chuỗi, mảng.</dd></div>
                  <div><dt>Cách học</dt><dd>Đọc kỹ yêu cầu, tự diễn đạt hướng giải quyết và đối chiếu kết quả với điều bạn mong đợi.</dd></div>
                  <div><dt>Không gian học tập</dt><dd>Chọn chương trong lộ trình bên trái. Dùng nút Learning trên Header để trở lại project; khi quay lại, chương đang chọn vẫn được giữ.</dd></div>
                </dl>
                <p className="learning-content-note">Nội dung bài học đang được chuẩn bị. Chương giới thiệu không yêu cầu bài tập hoặc trắc nghiệm.</p>
              </section>
            </> : <div className="learning-chapter-shell">
              <p className="learning-eyebrow">Kỹ thuật lập trình / Chương {String(chapter.id).padStart(2, '0')}</p>
              <h1>{chapter.title}</h1>
              <p className="learning-lead">{chapter.summary}</p>
              <div className="learning-content-placeholder"><h2>Nội dung đang được chuẩn bị</h2>
                <p>Bài học, luyện tập và trắc nghiệm của chương sẽ xuất hiện tại đây khi được bổ sung.</p>
              </div>
            </div>}
          </section>
        ))}
      </div>
    </div>
  )
}

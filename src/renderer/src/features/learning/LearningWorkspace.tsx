import { ArrowDown } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '../../components/motion/tabs'
import { learningChapters, type ChapterId } from './chapters'
import { ChapterMaterial } from './ChapterMaterial'
import { useLearningCourse } from './use-learning-course'
import { usePractice } from './practice/use-practice'
import { PracticeWorkspace } from './practice/PracticeWorkspace'

interface Props {
  selectedChapterId: ChapterId
  sidebarCollapsed: boolean
  onSelectChapter(id: ChapterId): void
  active?: boolean
  exitGuard?: { current: () => Promise<boolean> }
}

export function LearningWorkspace({ selectedChapterId, sidebarCollapsed, onSelectChapter, active = true, exitGuard }: Props) {
  const introduction = useRef<HTMLElement>(null)
  const sectionId = useId()
  const { course, error, retry } = useLearningCourse()
  const practice = usePractice(active)
  if (exitGuard) exitGuard.current = practice.flush
  const [practiceChapters, setPracticeChapters] = useState<Record<number, boolean>>({})
  const [selectedExercises, setSelectedExercises] = useState<Record<number, string | undefined>>({})
  const practicing = selectedChapterId !== 1 && !!practiceChapters[selectedChapterId]
  const exercise = practice.exercises.find(e => e.id === selectedExercises[selectedChapterId])
  const language = exercise ? practice.languageFor(exercise.id) : 'csharp'
  const navigate = (action: () => void) => {
    if (practice.closing) return
    if (!practice.hasPending()) action()
    else void practice.flush().then(saved => { if (saved) action() })
  }
  const chapters = course ? course.manifest.chapters.map(chapter => ({ id: chapter.order, title: chapter.title })) : learningChapters
  return (
    <div className="learning-layout" data-collapsed={sidebarCollapsed}>
      <aside className="learning-sidebar" aria-label="Learning Roadmap">
        <nav id="learning-chapters" aria-label="8 chương Kỹ thuật lập trình">
          {chapters.map(chapter => (
            <button type="button" key={chapter.id} aria-current={selectedChapterId === chapter.id ? 'page' : undefined}
              aria-label={`Chương ${chapter.id}: ${chapter.title}`} title={chapter.title}
              onClick={() => navigate(() => onSelectChapter(chapter.id))}>
              <span className="learning-chapter-number">{String(chapter.id).padStart(2, '0')}</span>
              {!sidebarCollapsed && <span>{chapter.title}</span>}
            </button>
          ))}
        </nav>
        {!sidebarCollapsed && <p className="learning-sidebar-note">Kỹ thuật lập trình<br /><span>8 chương · Một hành trình</span></p>}
      </aside>
      <div className="learning-center">
        {selectedChapterId !== 1 && <nav className="learning-section-nav" aria-label="Nội dung học tập">
          <Tabs value={practicing ? 'practice' : 'theory'} variant="pill"
            onValueChange={value => navigate(() => setPracticeChapters(s => ({ ...s, [selectedChapterId]: value === 'practice' })))}>
            <TabsList aria-label="Nội dung học tập">
              <TabsTrigger value="theory" id={`${sectionId}-theory-tab`} aria-controls={`${sectionId}-theory-panel`}
                disabled={practice.closing}>Tài liệu</TabsTrigger>
              <TabsTrigger value="practice" id={`${sectionId}-practice-tab`} aria-controls={`${sectionId}-practice-panel`}
                disabled={practice.closing}>Luyện tập</TabsTrigger>
            </TabsList>
          </Tabs>
        </nav>}
        {practice.error && <div className="practice-error" role="alert">{practice.error} <button type="button" onClick={practice.retry}>Thử lại lưu / tải</button></div>}
        {practice.recovered && <p className="practice-notice" role="status">Dữ liệu Draft đã được khôi phục hoặc đặt lại sau lỗi dữ liệu cục bộ. Hãy kiểm tra code trước khi tiếp tục.</p>}
        {practice.closing && <p className="practice-notice" role="status">Đang lưu Draft trước khi đóng ứng dụng…</p>}
      <div className="learning-pages" hidden={practicing} id={`${sectionId}-theory-panel`}
        role={selectedChapterId !== 1 ? 'tabpanel' : undefined}
        aria-labelledby={selectedChapterId !== 1 ? `${sectionId}-theory-tab` : undefined}>
        {chapters.map(chapter => (
          <section key={chapter.id} className="learning-page" hidden={selectedChapterId !== chapter.id}
            aria-label={`Nội dung chương ${chapter.id}`} tabIndex={0}>
            {chapter.id === 1 ? <>
              <div className="learning-intro">
                <div className="learning-intro-copy">
                  <p className="learning-eyebrow">Chương 01 / Giới thiệu học phần</p>
                  <h1>Kỹ thuật lập trình</h1>
                  <p className="learning-lead">Nền tảng tư duy thuật toán và phương pháp giải quyết bài toán bằng lập trình.</p>
                  <p>Học phần được tổ chức thành 8 chương, từ các khái niệm lập trình cơ bản đến điều kiện, vòng lặp, chuỗi, hàm và mảng. Các ví dụ C# giúp làm rõ mối liên hệ giữa yêu cầu bài toán, thuật toán và chương trình.</p>
                  <section className="learning-intro-objectives" aria-labelledby="learning-intro-objectives-title">
                    <h2 id="learning-intro-objectives-title">Mục tiêu của Chương 1</h2>
                    <ul>
                      <li><strong>Phân tích bài toán:</strong> xác định dữ liệu vào, kết quả ra và các ràng buộc.</li>
                      <li><strong>Mô tả thuật toán:</strong> tổ chức các bước xử lý thành một quy trình rõ ràng, có điểm kết thúc.</li>
                      <li><strong>Đọc và kiểm tra chương trình:</strong> theo dõi giá trị biến, đối chiếu kết quả và nhận diện lỗi.</li>
                    </ul>
                  </section>
                </div>
                <aside className="learning-intro-overview" aria-label="Tổng quan môn học">
                  <h2>Thông tin học phần</h2>
                  <dl>
                    <div><dt>Cấu trúc tài liệu</dt><dd>8 chương theo trình tự kiến thức.</dd></div>
                    <div><dt>Ngôn ngữ minh họa</dt><dd>C#</dd></div>
                    <div><dt>Phạm vi kiến thức</dt><dd>Thuật toán, điều kiện, vòng lặp, chuỗi, hàm và mảng.</dd></div>
                    <div><dt>Phương pháp học</dt><dd>Đọc, phân tích và kiểm chứng bằng ví dụ.</dd></div>
                  </dl>
                </aside>
                <div className="learning-intro-reading">
                  <div><h2>Hướng dẫn đọc tài liệu</h2>
                    <p>Đọc các mục theo thứ tự. Với mỗi ví dụ, hãy dự đoán kết quả trước khi xem phần giải thích và tự lập bảng vết khi cần.</p>
                  </div>
                  <button type="button" className="learning-intro-link" onClick={() => introduction.current?.scrollIntoView({ block: 'start' })}>
                    Đọc nội dung chương 1 <ArrowDown aria-hidden="true" />
                  </button>
                </div>
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
      <div className="learning-practice-panel" hidden={!practicing} id={`${sectionId}-practice-panel`}
        role={selectedChapterId !== 1 ? 'tabpanel' : undefined}
        aria-labelledby={selectedChapterId !== 1 ? `${sectionId}-practice-tab` : undefined}>
      {practicing && <PracticeWorkspace key={selectedChapterId} chapter={selectedChapterId} exercises={practice.exercises}
        exercise={exercise} drafts={practice.state.drafts} language={language} code={exercise ? practice.codeFor(exercise, language) : ''}
        ready={practice.ready} locked={practice.closing} onOpen={e => navigate(() => {
          setSelectedExercises(s => ({ ...s, [selectedChapterId]: e?.id }))
          if (e) { const l = practice.languageFor(e.id); practice.edit(e, l, practice.codeFor(e, l)) }
        })} onLanguage={l => { if (exercise) void practice.selectLanguage(exercise, l) }}
        onEdit={code => { if (exercise) practice.edit(exercise, language, code) }} />}
      </div>
      </div>
    </div>
  )
}

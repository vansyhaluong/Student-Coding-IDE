import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Exercise } from '../../../../../shared/contracts/practice'

const components: Components = {
  h1: ({ children }) => <h2>{children}</h2>,
  // References remain readable offline without adding navigation/network authority.
  a: ({ children, href }) => <span className="practice-description-reference" title={href}>{children}</span>,
  img: ({ alt }) => <span>{alt}</span>,
  table: ({ children }) => <div className="practice-description-table" tabIndex={0}><table>{children}</table></div>,
}
function DescriptionMarkdown({ children }: { children: string }) {
  // No raw-HTML plugin: HTML is escaped text, not executable markup.
  return <Markdown remarkPlugins={[remarkGfm]} components={components}>{children}</Markdown>
}

/** Read-only presentation of the original exercise fields; no editor/runtime hooks. */
export function ProblemDescriptionContent({ exercise }: { exercise: Exercise }) {
  return <article className="practice-description" aria-label="Description" lang="vi">
    <h1>{exercise.title}</h1>
    <div className="practice-description-prose"><DescriptionMarkdown>{exercise.description}</DescriptionMarkdown></div>
    <h2>Input</h2>
    <ul>{exercise.parameters.map(p => <li key={p.name}><code>{p.name}: {p.type}</code></li>)}</ul>
    <h2>Output</h2><p>Trả về <code>{exercise.returnType}</code>.</p>
    <h2>Ví dụ Input / Output</h2>
    {exercise.samples.map((sample, i) => <pre className="practice-description-example" key={i}><code>Input: {JSON.stringify(sample.args)}{'\n'}Output: {JSON.stringify(sample.expected)}</code></pre>)}
    <h2>Constraints</h2>
    <ul>{exercise.constraints.map(c => <li key={c}><DescriptionMarkdown>{c}</DescriptionMarkdown></li>)}</ul>
    <details className="practice-description-source"><summary>Nguồn tham khảo · {exercise.source.publisher}</summary>
      <p className="practice-source">{exercise.source.url}</p><p>{exercise.source.usage}</p>
    </details>
  </article>
}

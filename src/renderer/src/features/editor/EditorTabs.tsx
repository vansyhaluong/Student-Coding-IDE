import { FileCode2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { EditorModelManager } from './models/editor-model-manager'

interface EditorTabsProps {
  manager: EditorModelManager
  onClose(key: string): Promise<void>
}

export function EditorTabs({ manager, onClose }: EditorTabsProps) {
  const [, setRevision] = useState(0)
  useEffect(() => manager.subscribe(() => {
    setRevision((revision) => revision + 1)
  }), [manager])

  const documents = manager.getOpenDocuments()
  const active = manager.getActiveDocument()

  if (documents.length === 0) return <div className="editor-tabs-empty" />

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open editors">
      {documents.map((document) => (
        <div
          className={`editor-tab${active?.key === document.key ? ' active' : ''}`}
          key={document.key}
          role="tab"
          aria-selected={active?.key === document.key}
          data-current={active?.key === document.key ? 'true' : undefined}
          data-document-key={document.key}
        >
          <button
            className="editor-tab-label"
            onClick={() => manager.activate(document.key)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const index = documents.findIndex((candidate) => candidate.key === document.key)
              const direction = event.key === 'ArrowRight' ? 1 : -1
              const next = documents[(index + direction + documents.length) % documents.length]
              if (!next) return
              manager.activate(next.key)
              requestAnimationFrame(() => globalThis.document.querySelector<HTMLElement>(
                `.editor-tab[data-document-key="${CSS.escape(next.key)}"] .editor-tab-label`,
              )?.focus())
            }}
            title={document.relativePath}
          >
            <FileCode2 className="editor-tab-icon" />
            <span>{fileName(document.relativePath)}</span>
            {document.dirty && <span className="dirty-dot" aria-label="Unsaved changes" />}
          </button>
          <button
            className="editor-tab-close"
            aria-label={`Close ${fileName(document.relativePath)}`}
            onClick={() => void onClose(document.key)}
          >
            <X />
          </button>
        </div>
      ))}
    </div>
  )
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'

import { monaco } from './monaco'
import type { EditorModelManager } from './models/editor-model-manager'

interface EditorWorkbenchProps {
  manager: EditorModelManager
  onSave(key: string): Promise<boolean>
  onClose(key: string): Promise<void>
}

export function EditorWorkbench({
  manager,
  onSave,
  onClose,
}: EditorWorkbenchProps) {
  const [, setRevision] = useState(0)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const mountedKey = useRef<string | null>(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  useEffect(() => manager.subscribe(() => {
    setRevision((revision) => revision + 1)
  }), [manager])

  const documents = manager.getOpenDocuments()
  const active = manager.getActiveDocument()

  const attachActiveModel = useCallback(() => {
    const editorInstance = editorRef.current
    if (!editorInstance) return
    const previousKey = mountedKey.current
    if (previousKey && previousKey !== active?.key) {
      manager.setViewState(previousKey, editorInstance.saveViewState())
    }
    if (!active) {
      editorInstance.setModel(null)
      mountedKey.current = null
      return
    }
    editorInstance.setModel(active.model as editor.ITextModel)
    mountedKey.current = active.key
    const viewState = manager.getViewState(active.key)
    if (viewState) editorInstance.restoreViewState(viewState)
    editorInstance.focus()
  }, [active, manager])

  useEffect(() => {
    attachActiveModel()
  }, [attachActiveModel])

  const onMount: OnMount = (editorInstance) => {
    editorRef.current = editorInstance
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        const key = mountedKey.current
        if (key) void saveRef.current(key)
      },
    )
    attachActiveModel()
  }

  useEffect(() => () => {
    const key = mountedKey.current
    if (key && editorRef.current) {
      manager.setViewState(key, editorRef.current.saveViewState())
    }
    editorRef.current = null
  }, [manager])

  return (
    <section className="editor-workbench" aria-label="Code editor">
      {documents.length > 0 && (
        <div className="editor-tabs" role="tablist" aria-label="Open editors">
          {documents.map((document) => (
            <div
              className={`editor-tab${active?.key === document.key ? ' active' : ''}`}
              key={document.key}
              role="tab"
              aria-selected={active?.key === document.key}
            >
              <button
                className="editor-tab-label"
                onClick={() => manager.activate(document.key)}
                title={document.relativePath}
              >
                <span>{fileName(document.relativePath)}</span>
                {document.dirty && <span className="dirty-dot" aria-label="Unsaved changes">●</span>}
              </button>
              <button
                className="editor-tab-close"
                aria-label={`Close ${fileName(document.relativePath)}`}
                onClick={() => void onClose(document.key)}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {active?.externalConflict && (
        <div className="editor-conflict" role="alert">
          This file changed on disk. Your unsaved editor content was preserved.
        </div>
      )}

      <div className="editor-canvas">
        {active ? (
          <Editor
            width="100%"
            height="100%"
            defaultValue=""
            defaultLanguage="plaintext"
            theme="vs-dark"
            saveViewState={false}
            keepCurrentModel
            onMount={onMount}
            options={{
              automaticLayout: true,
              fontSize: 13,
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
            }}
          />
        ) : (
          <div className="editor-empty">Select a file to start editing</div>
        )}
      </div>
    </section>
  )
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path
}

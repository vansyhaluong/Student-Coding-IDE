import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'

import { monaco } from './monaco'
import type { EditorModelManager } from './models/editor-model-manager'
import type { EditorNavigationRequest } from './editor-navigation'

interface EditorWorkbenchProps {
  settings?: { fontSize: number; tabSize: 2 | 4 }
  dark?: boolean
  manager: EditorModelManager
  onSave(key: string): Promise<boolean>
  navigation: EditorNavigationRequest | null
  readOnly: boolean
}

export function EditorWorkbench({
  manager,
  settings = { fontSize: 13, tabSize: 2 },
  dark = true,
  onSave,
  navigation,
  readOnly,
}: EditorWorkbenchProps) {
  const [, setRevision] = useState(0)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const mountedKey = useRef<string | null>(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  useEffect(() => manager.subscribe(() => {
    setRevision((revision) => revision + 1)
  }), [manager])

  useEffect(() => {
    const apply = () => { for (const doc of manager.getOpenDocuments()) (doc.model as editor.ITextModel).updateOptions({ tabSize: settings.tabSize }) }
    apply(); return manager.subscribe(apply)
  }, [manager, settings.tabSize])

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

  useEffect(() => {
    const editorInstance = editorRef.current
    if (
      !editorInstance
      || !active
      || !navigation
      || active.projectId !== navigation.projectId
      || active.relativePath !== navigation.relativePath
    ) return
    const range = {
      startLineNumber: navigation.startLineNumber,
      startColumn: navigation.startColumn,
      endLineNumber: navigation.endLineNumber,
      endColumn: navigation.endColumn,
    }
    editorInstance.setSelection(range)
    editorInstance.revealRangeInCenter(range)
    editorInstance.focus()
  }, [active, navigation])

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
      {active?.diskState === 'missing' ? (
        <div className="editor-conflict" role="alert">
          This file was deleted outside the IDE. Its in-memory content is preserved, but normal
          saving is unavailable. Close the tab or restore the file outside the IDE.
        </div>
      ) : active?.externalConflict && (
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
            theme={dark ? 'vs-dark' : 'vs'}
            saveViewState={false}
            keepCurrentModel
            onMount={onMount}
            options={{
              readOnly,
              automaticLayout: true,
              fontSize: settings.fontSize,
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: settings.tabSize,
            }}
          />
        ) : (
          <div className="editor-empty">Select a file to start editing</div>
        )}
      </div>
    </section>
  )
}

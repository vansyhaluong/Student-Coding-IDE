import { monaco } from '../../editor/monaco'
import { editorModelManager } from '../../editor/editor-session'
import { CsharpClient } from './csharp-client'
import { CsharpMonacoProviders } from './csharp-monaco-providers'
import { parseProjectDocumentUri } from '../project-uri'
import { navigateCsharp } from './csharp-navigation'
import { CsharpDiagnosticsController } from './csharp-diagnostics-controller'
import { problemsStore } from '../../problems/problems-session'
import { csharpStatusStore } from './csharp-status-store'

export function startCsharpSession(): () => void {
  const client = new CsharpClient(window.studentIde.language, editorModelManager,
    message => console.error(message))
  const providers = new CsharpMonacoProviders(monaco, client)
  const diagnostics = new CsharpDiagnosticsController(monaco.editor, client, editorModelManager, problemsStore)
  const removeLanguageStatus = client.subscribe(status => csharpStatusStore.set(client.project, status))
  let projectRevision = 0, stopped = false, navigationId = 0
  const removeProject = window.studentIde.project.onChanged(({ activeProject }) => {
    projectRevision++; client.setProject(activeProject?.id ?? null)
  })
  const revision = projectRevision
  void window.studentIde.project.getActive().then(result => {
    if (!stopped && revision === projectRevision && result.ok) client.setProject(result.value?.id ?? null)
  }).catch(() => {})
  const removeStatus = window.studentIde.file.onStatusChanged(status => {
    if (status.projectId === client.project && status.state === 'UNAVAILABLE') client.setProject(null)
  })
  const opener = monaco.editor.registerEditorOpener({ openCodeEditor: async (_source, uri, selection) => {
    const target = parseProjectDocumentUri(uri.toString())
    if (!target || target.projectId !== client.project) return false
    const range = selection && 'startLineNumber' in selection ? selection : {
      startLineNumber: selection?.lineNumber ?? 1, startColumn: selection?.column ?? 1,
      endLineNumber: selection?.lineNumber ?? 1, endColumn: selection?.column ?? 1,
    }
    return navigateCsharp({ id: ++navigationId, ...target, ...range })
  } })
  return () => { stopped = true; removeProject(); removeStatus(); removeLanguageStatus(); csharpStatusStore.set(null, null); opener.dispose(); diagnostics.dispose(); providers.dispose(); client.dispose() }
}

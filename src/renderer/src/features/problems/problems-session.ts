import { monaco } from '../editor/monaco'
import { MonacoDiagnosticsController } from './monaco-diagnostics-controller'
import { ProblemsStore } from './problems-store'

export const problemsStore = new ProblemsStore()
let controller: MonacoDiagnosticsController | null = null

export function getMonacoDiagnosticsController(): MonacoDiagnosticsController | null {
  if (controller) return controller
  const editorHost = monaco.editor as Partial<typeof monaco.editor> | undefined
  if (
    !editorHost?.onDidChangeMarkers
    || !editorHost.getModel
    || !editorHost.getModels
    || !editorHost.getModelMarkers
  ) return null
  controller = new MonacoDiagnosticsController(editorHost as typeof monaco.editor, problemsStore)
  return controller
}

export function disposeProblemsSession(): void {
  controller?.dispose()
  controller = null
}

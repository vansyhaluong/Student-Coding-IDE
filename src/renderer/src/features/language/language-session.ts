import { editorModelManager } from '../editor/editor-session'
import { monacoModelHost } from '../editor/monaco'
import { TypeScriptProjectController } from './typescript-project-controller'

export const typeScriptProjectController = new TypeScriptProjectController(
  {
    listDirectory: (...args) => window.studentIde.file.listDirectory(...args),
    stat: (...args) => window.studentIde.file.stat(...args),
    read: (...args) => window.studentIde.file.read(...args),
  },
  editorModelManager,
  {
    createModel: monacoModelHost.createModel,
    getModel: (uri) => monacoModelHost.getModel?.(uri) ?? null,
  },
)

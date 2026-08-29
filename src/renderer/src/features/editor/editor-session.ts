import { monacoModelHost } from './monaco'
import { EditorModelManager } from './models/editor-model-manager'

// The editor session outlives React component/effect refreshes. In particular,
// Vite Fast Refresh replays effect cleanup while the renderer is still alive.
export const editorModelManager = new EditorModelManager(monacoModelHost)

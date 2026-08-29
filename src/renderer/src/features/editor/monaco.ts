import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

import type { MonacoModelHost } from './models/editor-model-manager'

globalThis.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') {
      return new Worker(new URL('./workers/json.worker.ts', import.meta.url), { type: 'module' })
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new Worker(new URL('./workers/css.worker.ts', import.meta.url), { type: 'module' })
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new Worker(new URL('./workers/html.worker.ts', import.meta.url), { type: 'module' })
    }
    if (label === 'typescript' || label === 'javascript') {
      return new Worker(new URL('./workers/typescript.worker.ts', import.meta.url), { type: 'module' })
    }
    return new Worker(new URL('./workers/editor.worker.ts', import.meta.url), { type: 'module' })
  },
}

loader.config({ monaco })

export const monacoModelHost: MonacoModelHost = {
  createModel(value, languageId, uri) {
    return monaco.editor.createModel(value, languageId, monaco.Uri.parse(uri))
  },
}

export { monaco }

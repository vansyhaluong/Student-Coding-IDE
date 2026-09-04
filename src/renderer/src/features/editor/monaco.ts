import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import * as monacoTypeScript from 'monaco-editor/languages/features/typescript/register'

import type { MonacoModelHost } from './models/editor-model-manager'
import { configureMonacoTypeScriptDefaults } from '../language/monaco-typescript-defaults'
import { workerKindForLabel } from '../language/worker-routing'

globalThis.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    const workerKind = workerKindForLabel(label)
    if (workerKind === 'json') {
      return new Worker(new URL('./workers/json.worker.ts', import.meta.url), { type: 'module' })
    }
    if (workerKind === 'css') {
      return new Worker(new URL('./workers/css.worker.ts', import.meta.url), { type: 'module' })
    }
    if (workerKind === 'html') {
      return new Worker(new URL('./workers/html.worker.ts', import.meta.url), { type: 'module' })
    }
    if (workerKind === 'typescript') {
      return new Worker(new URL('./workers/typescript.worker.ts', import.meta.url), { type: 'module' })
    }
    return new Worker(new URL('./workers/editor.worker.ts', import.meta.url), { type: 'module' })
  },
}

loader.config({ monaco })
configureMonacoTypeScriptDefaults(monacoTypeScript)

export const monacoModelHost: MonacoModelHost = {
  createModel(value, languageId, uri) {
    return monaco.editor.createModel(value, languageId, monaco.Uri.parse(uri))
  },
}

export { monaco }

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import * as monacoCss from 'monaco-editor/languages/features/css/register'
import * as monacoHtml from 'monaco-editor/languages/features/html/register'
import * as monacoJson from 'monaco-editor/languages/features/json/register'
import * as monacoTypeScript from 'monaco-editor/languages/features/typescript/register'

import type { MonacoModelHost } from './models/editor-model-manager'
import { configureMonacoTypeScriptDefaults } from '../language/monaco-typescript-defaults'
import { configureMonacoWebLanguageDefaults } from '../language/monaco-web-language-defaults'
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
configureMonacoWebLanguageDefaults(monacoHtml, monacoCss, monacoJson)

export const monacoModelHost: MonacoModelHost = {
  createModel(value, languageId, uri) {
    return monaco.editor.createModel(value, languageId, monaco.Uri.parse(uri))
  },
  getModel(uri) {
    return monaco.editor.getModel(monaco.Uri.parse(uri))
  },
}

export { monaco }

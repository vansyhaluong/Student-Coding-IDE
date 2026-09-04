/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { configureMonacoTypeScriptDefaults } from '../../src/renderer/src/features/language/monaco-typescript-defaults'
import { configureMonacoWebLanguageDefaults } from '../../src/renderer/src/features/language/monaco-web-language-defaults'

describe('Monaco language registration and defaults', () => {
  it('registers the exact Tier 2 syntax language IDs', async () => {
    const { monaco } = await loadMonaco()
    const languageIds = monaco.languages.getLanguages().map(({ id }) => id)
    expect(languageIds).toEqual(expect.arrayContaining(['html', 'css', 'json']))
  }, 30_000)

  it('registers and ships tokenizers for C# and PHP without Student IDE providers', async () => {
    const { monaco } = await loadMonaco()
    const languageIds = monaco.languages.getLanguages().map(({ id }) => id)
    expect(languageIds).toEqual(expect.arrayContaining(['csharp', 'php']))

    const [csharp, php] = await Promise.all([
      import('monaco-editor/languages/definitions/csharp/csharp'),
      import('monaco-editor/languages/definitions/php/php'),
    ])
    expect(csharp.language.tokenizer.root).not.toEqual([])
    expect(php.language.tokenizer.root).not.toEqual([])
  }, 30_000)

  it('sets deliberate JS/TS diagnostics, JSX, and module-resolution defaults', async () => {
    const { monacoTypeScript } = await loadMonaco()
    configureMonacoTypeScriptDefaults(monacoTypeScript)

    const typeScript = monacoTypeScript.typescriptDefaults.getCompilerOptions()
    const javaScript = monacoTypeScript.javascriptDefaults.getCompilerOptions()
    expect(typeScript).toMatchObject({
      allowJs: true,
      checkJs: false,
      noEmit: true,
      strict: true,
      jsx: monacoTypeScript.JsxEmit.ReactJSX,
      moduleResolution: monacoTypeScript.ModuleResolutionKind.NodeJs,
    })
    expect(javaScript).toMatchObject({
      allowJs: true,
      checkJs: true,
      noEmit: true,
      strict: true,
    })
    expect(typeScript).not.toHaveProperty('typeRoots')
    expect(typeScript).not.toHaveProperty('types')
    expect(monacoTypeScript.typescriptDefaults.getEagerModelSync()).toBe(false)
    expect(monacoTypeScript.javascriptDefaults.getEagerModelSync()).toBe(false)
  }, 30_000)

  it('keeps Monaco marker updates isolated by provider owner', async () => {
    const { monaco } = await loadMonaco()
    const model = monaco.editor.createModel(
      'const value = 1',
      'plaintext',
      monaco.Uri.parse('student-ide://project/project_1234567890abcdef12345678/a.ts'),
    )
    const marker = {
      severity: monaco.MarkerSeverity.Error,
      message: 'Example diagnostic',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    }

    try {
      monaco.editor.setModelMarkers(model, 'student-ide.language.monaco-typescript', [marker])
      monaco.editor.setModelMarkers(model, 'student-ide.language.monaco-json', [marker])
      monaco.editor.setModelMarkers(model, 'student-ide.language.monaco-typescript', [])

      expect(monaco.editor.getModelMarkers({ resource: model.uri })).toMatchObject([
        { owner: 'student-ide.language.monaco-json' },
      ])
    } finally {
      model.dispose()
    }
  }, 30_000)

  it('configures Tier 2 providers with offline JSON and deferred HTML diagnostics', async () => {
    const { monacoCss, monacoHtml, monacoJson } = await loadMonaco()
    configureMonacoWebLanguageDefaults(monacoHtml, monacoCss, monacoJson)

    expect(monacoHtml.htmlDefaults.modeConfiguration).toMatchObject({
      completionItems: true,
      hovers: true,
      diagnostics: false,
    })
    expect(monacoCss.cssDefaults.options).toMatchObject({
      validate: true,
      data: { useDefaultDataProvider: true },
    })
    expect(monacoCss.cssDefaults.modeConfiguration).toMatchObject({
      completionItems: true,
      hovers: true,
      diagnostics: true,
    })
    expect(monacoJson.jsonDefaults.diagnosticsOptions).toMatchObject({
      validate: true,
      schemas: [],
      enableSchemaRequest: false,
    })
    expect(monacoJson.jsonDefaults.modeConfiguration).toMatchObject({
      completionItems: true,
      hovers: true,
      diagnostics: true,
    })
  }, 30_000)
})

let monacoPromise: ReturnType<typeof importMonaco> | undefined

async function loadMonaco() {
  monacoPromise ??= importMonaco()
  return monacoPromise
}

async function importMonaco() {
  Object.defineProperty(document, 'queryCommandSupported', {
    configurable: true,
    value: () => false,
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
  const [monaco, , monacoTypeScript, monacoHtml, monacoCss, monacoJson] = await Promise.all([
    import('monaco-editor/editor/editor.api'),
    import('monaco-editor/basic-languages/monaco.contribution'),
    import('monaco-editor/languages/features/typescript/register'),
    import('monaco-editor/languages/features/html/register'),
    import('monaco-editor/languages/features/css/register'),
    import('monaco-editor/languages/features/json/register'),
  ])
  return { monaco, monacoTypeScript, monacoHtml, monacoCss, monacoJson }
}

import type * as typescriptLanguage from 'monaco-editor/languages/features/typescript/register'

type MonacoTypeScriptApi = typeof typescriptLanguage

export function configureMonacoTypeScriptDefaults(
  typescript: MonacoTypeScriptApi,
): void {
  const sharedOptions: Parameters<
    MonacoTypeScriptApi['typescriptDefaults']['setCompilerOptions']
  >[0] = {
    target: typescript.ScriptTarget.ES2020,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    jsx: typescript.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    allowJs: true,
    noEmit: true,
    strict: true,
  }

  typescript.typescriptDefaults.setCompilerOptions({
    ...sharedOptions,
    checkJs: false,
  })
  typescript.javascriptDefaults.setCompilerOptions({
    ...sharedOptions,
    checkJs: true,
  })
  for (const defaults of [
    typescript.typescriptDefaults,
    typescript.javascriptDefaults,
  ]) {
    defaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
      onlyVisible: false,
    })
  }
}

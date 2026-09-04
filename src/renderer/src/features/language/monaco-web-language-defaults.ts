import type * as cssLanguage from 'monaco-editor/languages/features/css/register'
import type * as htmlLanguage from 'monaco-editor/languages/features/html/register'
import type * as jsonLanguage from 'monaco-editor/languages/features/json/register'

export function configureMonacoWebLanguageDefaults(
  html: typeof htmlLanguage,
  css: typeof cssLanguage,
  json: typeof jsonLanguage,
): void {
  html.htmlDefaults.setOptions({
    ...html.htmlDefaults.options,
    data: {
      ...html.htmlDefaults.options.data,
      useDefaultDataProvider: true,
    },
  })
  html.htmlDefaults.setModeConfiguration({
    ...html.htmlDefaults.modeConfiguration,
    completionItems: true,
    hovers: true,
    diagnostics: false,
  })

  css.cssDefaults.setOptions({
    ...css.cssDefaults.options,
    validate: true,
    data: {
      ...css.cssDefaults.options.data,
      useDefaultDataProvider: true,
    },
  })
  css.cssDefaults.setModeConfiguration({
    ...css.cssDefaults.modeConfiguration,
    completionItems: true,
    hovers: true,
    diagnostics: true,
  })

  json.jsonDefaults.setDiagnosticsOptions({
    ...json.jsonDefaults.diagnosticsOptions,
    validate: true,
    schemas: [],
    enableSchemaRequest: false,
  })
  json.jsonDefaults.setModeConfiguration({
    ...json.jsonDefaults.modeConfiguration,
    completionItems: true,
    hovers: true,
    diagnostics: true,
  })
}

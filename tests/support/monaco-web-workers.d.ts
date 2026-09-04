interface MonacoWebWorkerUri {
  toString(): string
}

interface MonacoWebMirrorModel {
  readonly uri: MonacoWebWorkerUri
  readonly version: number
  getValue(): string
}

interface MonacoWebWorkerContext {
  getMirrorModels(): readonly MonacoWebMirrorModel[]
}

interface MonacoWebPosition {
  readonly line: number
  readonly character: number
}

interface MonacoWebCompletionItem {
  readonly label: string
}

interface MonacoWebCompletionList {
  readonly items: readonly MonacoWebCompletionItem[]
}

interface MonacoWebHover {
  readonly contents: unknown
}

interface MonacoWebDiagnostic {
  readonly message: string
  readonly severity?: number
  readonly source?: string
  readonly range: {
    readonly start: MonacoWebPosition
    readonly end: MonacoWebPosition
  }
}

declare module 'monaco-editor/languages/features/html/htmlWorker' {
  export class HTMLWorker {
    constructor(
      context: MonacoWebWorkerContext,
      createData: {
        languageSettings: Record<string, unknown>
        languageId: string
      },
    )
    doComplete(uri: string, position: MonacoWebPosition): Promise<MonacoWebCompletionList | null>
    doHover(uri: string, position: MonacoWebPosition): Promise<MonacoWebHover | null>
  }
}

declare module 'monaco-editor/languages/features/css/cssWorker' {
  export class CSSWorker {
    constructor(
      context: MonacoWebWorkerContext,
      createData: {
        options: Record<string, unknown>
        languageId: string
      },
    )
    doComplete(uri: string, position: MonacoWebPosition): Promise<MonacoWebCompletionList | null>
    doHover(uri: string, position: MonacoWebPosition): Promise<MonacoWebHover | null>
    doValidation(uri: string): Promise<readonly MonacoWebDiagnostic[]>
  }
}

declare module 'monaco-editor/languages/features/json/jsonWorker' {
  export class JSONWorker {
    constructor(
      context: MonacoWebWorkerContext,
      createData: {
        languageSettings: Record<string, unknown>
        languageId: string
        enableSchemaRequest: boolean
      },
    )
    doComplete(uri: string, position: MonacoWebPosition): Promise<MonacoWebCompletionList | null>
    doHover(uri: string, position: MonacoWebPosition): Promise<MonacoWebHover | null>
    doValidation(uri: string): Promise<readonly MonacoWebDiagnostic[]>
  }
}

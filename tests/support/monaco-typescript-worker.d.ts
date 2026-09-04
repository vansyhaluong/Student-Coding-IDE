declare module 'monaco-editor/languages/features/typescript/tsWorker' {
  interface MirrorUri {
    readonly path: string
    toString(skipEncoding?: boolean): string
  }

  interface MirrorModel {
    readonly uri: MirrorUri
    readonly version: number
    getValue(): string
  }

  interface WorkerContext {
    getMirrorModels(): readonly MirrorModel[]
  }

  interface WorkerCreateData {
    compilerOptions: Record<string, unknown>
    extraLibs: Record<string, { content: string; version: number }>
    inlayHintsOptions: Record<string, unknown>
  }

  interface CompletionEntry { readonly name: string }
  interface CompletionInfo { readonly entries: readonly CompletionEntry[] }
  interface DefinitionInfo { readonly fileName: string }
  interface Diagnostic { readonly messageText: string | { readonly messageText: string } }
  interface DisplayPart { readonly text: string }
  interface QuickInfo { readonly displayParts?: readonly DisplayPart[] }
  interface SignatureParameter { readonly displayParts: readonly DisplayPart[] }
  interface SignatureItem { readonly parameters: readonly SignatureParameter[] }
  interface SignatureHelpItems { readonly items: readonly SignatureItem[] }

  export class TypeScriptWorker {
    constructor(context: WorkerContext, createData: WorkerCreateData)
    getCompletionsAtPosition(fileName: string, position: number): Promise<CompletionInfo | undefined>
    getDefinitionAtPosition(fileName: string, position: number): Promise<readonly DefinitionInfo[] | undefined>
    getQuickInfoAtPosition(fileName: string, position: number): Promise<QuickInfo | undefined>
    getSignatureHelpItems(fileName: string, position: number, options: unknown): Promise<SignatureHelpItems | undefined>
    getSyntacticDiagnostics(fileName: string): Promise<readonly Diagnostic[]>
    getSemanticDiagnostics(fileName: string): Promise<readonly Diagnostic[]>
  }
}

declare module 'monaco-editor/languages/features/typescript/lib/typescriptServices' {
  export const typescript: {
    ScriptTarget: Record<string, number>
    ModuleKind: Record<string, number>
    ModuleResolutionKind: Record<string, number>
    JsxEmit: Record<string, number>
  }
}

declare module 'monaco-editor/basic-languages/monaco.contribution'

declare module 'monaco-editor/languages/definitions/csharp/csharp' {
  export const language: {
    readonly tokenizer: Record<string, readonly unknown[]>
  }
}

declare module 'monaco-editor/languages/definitions/php/php' {
  export const language: {
    readonly tokenizer: Record<string, readonly unknown[]>
  }
}

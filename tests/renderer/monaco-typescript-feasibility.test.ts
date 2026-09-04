import { describe, expect, it } from 'vitest'
import {
  TypeScriptWorker,
} from 'monaco-editor/languages/features/typescript/tsWorker'
import {
  typescript as ts,
} from 'monaco-editor/languages/features/typescript/lib/typescriptServices'

import { projectDocumentUri } from '../../src/renderer/src/features/language/project-uri'
import type { ProjectId } from '../../src/shared/contracts'

const projectId = 'project_1234567890abcdef12345678' as ProjectId

interface Source {
  readonly uri: string
  readonly content: string
}

function createWorker(sources: readonly Source[]): TypeScriptWorker {
  return new TypeScriptWorker({
    getMirrorModels: () => sources.map((source) => ({
      uri: {
        path: new URL(source.uri).pathname,
        toString: () => source.uri,
      },
      version: 1,
      getValue: () => source.content,
    })),
  }, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      checkJs: true,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: true,
    },
    extraLibs: {},
    inlayHintsOptions: {},
  })
}

function source(relativePath: string, content: string): Source {
  return { uri: projectDocumentUri(projectId, relativePath), content }
}

describe('Monaco TypeScript worker safe-URI feasibility', () => {
  it('provides same-file completion on a project-scoped virtual URI', async () => {
    const model = source('src/main.ts', [
      "const student = { name: 'Ada', score: 10 }",
      'student.',
    ].join('\n'))
    const worker = createWorker([model])
    const completion = await worker.getCompletionsAtPosition(
      model.uri,
      model.content.length,
    )
    expect(completion?.entries.map((entry) => entry.name))
      .toEqual(expect.arrayContaining(['name', 'score']))
  })

  it.each([
    ['TypeScript', 'src/main.ts', 'src/value.ts'],
    ['JavaScript', 'src/main.js', 'src/value.js'],
    ['mixed JS/TS', 'src/main.ts', 'src/value.js'],
  ])('resolves %s relative imports and definitions', async (
    _label,
    consumerPath,
    providerPath,
  ) => {
    const consumer = source(
      consumerPath,
      "import { value } from './value'\nconsole.log(value)",
    )
    const provider = source(providerPath, 'export const value = 42')
    const worker = createWorker([consumer, provider])
    const definitions = await worker.getDefinitionAtPosition(
      consumer.uri,
      consumer.content.lastIndexOf('value'),
    )
    expect(definitions?.[0]?.fileName).toBe(provider.uri)
  })

  it('provides cross-file hover and signature help', async () => {
    const provider = source(
      'src/math.ts',
      'export function add(left: number, right: number): number { return left + right }',
    )
    const consumer = source(
      'src/main.ts',
      "import { add } from './math'\nadd(1, ",
    )
    const worker = createWorker([consumer, provider])
    const quickInfo = await worker.getQuickInfoAtPosition(
      consumer.uri,
      consumer.content.lastIndexOf('add'),
    )
    const signatureHelp = await worker.getSignatureHelpItems(
      consumer.uri,
      consumer.content.length,
      undefined,
    )

    expect(quickInfo?.displayParts?.map(({ text }) => text).join(''))
      .toContain('add(left: number, right: number): number')
    expect(signatureHelp?.items[0]?.parameters.map((parameter) => (
      parameter.displayParts.map(({ text }) => text).join('')
    ))).toEqual(['left: number', 'right: number'])
  })

  it.each([
    ['JSX', 'src/view.jsx'],
    ['TSX', 'src/view.tsx'],
  ])('parses %s through the Monaco TypeScript worker', async (_label, path) => {
    const model = source(path, 'export const View = () => <section>Hello</section>')
    const worker = createWorker([model])
    expect(await worker.getSyntacticDiagnostics(model.uri)).toEqual([])
  })

  it('reports JavaScript and TypeScript diagnostics with deliberate defaults', async () => {
    const javascript = source('src/broken.js', 'const count = 1\ncount = "one"')
    const typescript = source('src/broken.ts', 'const count: number = "one"')
    const worker = createWorker([javascript, typescript])

    expect(await worker.getSemanticDiagnostics(javascript.uri)).not.toEqual([])
    expect(await worker.getSemanticDiagnostics(typescript.uri)).not.toEqual([])
  })

  it('keeps a 256 KiB individual source file feasible', async () => {
    const model = source(
      'src/large.ts',
      `export const value = 1\n// ${'x'.repeat(256 * 1024)}`,
    )
    const before = performance.now()
    const diagnostics = await createWorker([model]).getSyntacticDiagnostics(model.uri)
    const elapsedMilliseconds = performance.now() - before

    expect(diagnostics).toEqual([])
    expect(new TextEncoder().encode(model.content).byteLength)
      .toBeGreaterThanOrEqual(256 * 1024)
    expect(elapsedMilliseconds).toBeLessThan(10_000)
    console.info(JSON.stringify({
      smoke: 'monaco-typescript-individual-source',
      files: 1,
      bytes: new TextEncoder().encode(model.content).byteLength,
      elapsedMilliseconds: Math.round(elapsedMilliseconds),
    }))
  }, 15_000)

  it('keeps a bounded 500-file virtual project query feasible', async () => {
    const sources = Array.from({ length: 500 }, (_, index) => source(
      `src/module-${index}.ts`,
      `export const value${index} = ${index}\n// ${'x'.repeat(8_192)}`,
    ))
    const consumer = source(
      'src/main.ts',
      "import { value499 } from './module-499'\nconsole.log(value499)",
    )
    const before = performance.now()
    const worker = createWorker([...sources, consumer])
    const definitions = await worker.getDefinitionAtPosition(
      consumer.uri,
      consumer.content.lastIndexOf('value499'),
    )
    const elapsedMilliseconds = performance.now() - before

    expect(definitions?.[0]?.fileName).toBe(sources[499]?.uri)
    expect(elapsedMilliseconds).toBeLessThan(10_000)
    console.info(JSON.stringify({
      smoke: 'monaco-typescript-virtual-project',
      files: sources.length + 1,
      bytes: sources.reduce((total, item) => total + item.content.length, 0)
        + consumer.content.length,
      elapsedMilliseconds: Math.round(elapsedMilliseconds),
    }))
  }, 15_000)
})

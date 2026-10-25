import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import Module, { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { DomainError } from '../../../src/main/errors/app-error'
import type { FilesystemCsharpSdkResolver, CsharpSdkFileSystem } from '../../../src/main/services/learning/runtime/csharp-sdk-resolver'
import { prototypeSource } from '../../../scripts/sdk-concurrency-prototype-source.mjs'

declare global {
  var __sdkPrototypeDomainError: typeof DomainError | undefined
  var __sdkPrototypeMetrics: { active: number; peakTasks: number; bytes: number; peakBytes: number; pendingCredits: number; completed: number }[] | undefined
}
let built: { FilesystemCsharpSdkResolver: typeof FilesystemCsharpSdkResolver; disk: CsharpSdkFileSystem } | undefined
async function bundle() {
  if (built) return built
  const file = resolve('src/main/services/learning/runtime/csharp-sdk-resolver.ts')
  let source = prototypeSource(await readFile(file, 'utf8'), resolve('tests/fixtures/learning/sdk-concurrency-pool.ts'))
  source = source.replace("import { DomainError } from '../../../errors/app-error'", 'const DomainError = globalThis.__sdkPrototypeDomainError')
  source += '\nexport { disk }\n'
  globalThis.__sdkPrototypeDomainError = DomainError
  const result = await build({ stdin: { contents: source, sourcefile: file, resolveDir: dirname(file), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false })
  const module = new Module(resolve('out/sdk-prototype-tests.cjs')) as Module & { _compile(text: string, filename: string): void }
  module.filename = resolve('out/sdk-prototype-tests.cjs')
  module.require = createRequire(resolve('package.json'))
  module._compile(result.outputFiles[0].text, module.filename)
  built = module.exports as { FilesystemCsharpSdkResolver: typeof FilesystemCsharpSdkResolver; disk: CsharpSdkFileSystem }
  return built
}
export async function loadPrototype(): Promise<typeof FilesystemCsharpSdkResolver> { return (await bundle()).FilesystemCsharpSdkResolver }
export async function prototypeDisk(): Promise<CsharpSdkFileSystem> { return (await bundle()).disk }

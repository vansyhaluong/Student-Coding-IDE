import { join, resolve, posix } from 'node:path'
import type { Plugin } from 'vite'
import { ExerciseResourceRoot } from './exercise-package-resources'
import { PACKAGE_ASSET_LIMITS } from './exercise-package-policy'

export const PACKAGE_ANCHOR_MODULE = 'virtual:exercise-package-anchor'
const resolvedAnchor = '\0' + PACKAGE_ANCHOR_MODULE
const defaultDeny = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**']
const privateDeny = ['**/resources/learning/exercises/**', '**/scripts/learning-official-tests/**', '**/out/official-tests/**']
function privatePath(input: string): boolean {
  let path = input.split('?')[0]
  try {
    for (let i = 0; i < 4; i++) { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded }
  } catch { return true }
  path = path.replaceAll('\\', '/')
  const denied = (value: string) => /(?:^|\/)(?:resources\/learning\/exercises|scripts\/learning-official-tests|out\/official-tests)(?:\/|$)/i.test(value)
  return denied(path) || denied(posix.normalize(path))
}
/** Keep default Vite7 secret-file denials while closing dev-server /@fs access
 * to both source and emitted private exercise trees. No renderer runtime API. */
export function exercisePackageRendererBoundary(): Plugin {
  return { name: 'learning-private-resource-boundary', config(config) {
    return { server: { fs: { strict: true, deny: [...new Set([...defaultDeny, ...(config.server?.fs?.deny ?? []), ...privateDeny])] } } }
  }, configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (privatePath(request.url ?? '')) { response.statusCode = 403; response.end('Forbidden'); return }
      next()
    })
  }, moduleParsed(info) {
    if (privatePath(info.id)) this.error('PRIVATE_AUTHORING_IMPORT_FORBIDDEN')
  }, generateBundle: { order: 'post', handler(_options, bundle) {
    for (const file of Object.values(bundle)) if (privatePath(file.fileName)) this.error('PRIVATE_AUTHORING_ASSET_FORBIDDEN')
  } } }
}
/** Build-only plugin, never imported by Renderer/runtime. Source is config-relative;
 * Rollup owns output writes. Only exact declared assets are emitted to Main.
 * Build retains bounded release bytes in Rollup; runtime resident budgets are Step3. */
export function exercisePackageAssetsPlugin(configDirectory: string): Plugin {
  let anchorModule: string | undefined
  return {
    name: 'learning-exercise-package-assets',
    enforce: 'pre',
    moduleParsed(info) {
      if (/[/\\](?:scripts[/\\]learning-official-tests|out[/\\]official-tests)[/\\]/i.test(info.id)) this.error('PRIVATE_AUTHORING_IMPORT_FORBIDDEN')
    },
    async buildStart() {
      anchorModule = undefined
      const root = await ExerciseResourceRoot.open(resolve(configDirectory), ['resources', 'learning', 'exercises'])
      this.addWatchFile(join(root.path, 'manifest.json'))
      const { manifest, bytes, anchor } = await root.manifest()
      await root.exactDirectory([], ['manifest.json', ...manifest.packages.map(p => p.exerciseId)])
      const prefix = 'resources/learning/exercises/'
      for (const descriptor of manifest.packages) {
        const id = descriptor.exerciseId
        const publicOnly = 'profile' in descriptor && descriptor.profile === 'public-only'
        const assets = publicOnly ? await root.publicPackage(manifest, id) : await root.package(manifest, id)
        for (const kind of Object.keys(descriptor.assets) as (keyof typeof PACKAGE_ASSET_LIMITS)[]) {
          const asset = (descriptor.assets as Partial<import('./exercise-package-contracts').ExercisePackageDescriptor['assets']>)[kind]!
          this.addWatchFile(join(root.path, id, asset.path))
          this.emitFile({ type: 'asset', fileName: prefix + id + '/' + asset.path, source: (assets.bytes as Partial<import('./exercise-package-contracts').ExercisePackageAssetBytes>)[kind]! })
        }
      }
      // Verify the selected source manifest stayed identical during the build.
      await root.manifest(anchor)
      this.emitFile({ type: 'asset', fileName: prefix + 'manifest.json', source: bytes })
      anchorModule = `export default Object.freeze(${JSON.stringify(anchor)});`
    },
    resolveId(id) { if (id === PACKAGE_ANCHOR_MODULE) return resolvedAnchor },
    load(id) {
      if (id !== resolvedAnchor) return
      if (!anchorModule) throw new Error('PACKAGE_INTEGRITY_FAILED')
      return anchorModule
    },
  }
}

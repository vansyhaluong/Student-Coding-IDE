/* global process, console */
// Explicit E2-S5 offline promotion; no generation, no runtime/IPC entry point.
import { build } from 'vite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
if (process.argv.slice(2).join(' ') !== '--promote-accepted-pilot') throw new Error('EXPLICIT_PROMOTION_REQUIRED')
const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, target: 'node24',
  lib: { entry: resolve('scripts/learning-official-tests/pilot-release.ts'), formats: ['cjs'] }, rollupOptions: { external: id => id.startsWith('node:') } } })
const chunk = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(x => x.output).find(x => x.type === 'chunk' && x.isEntry)
if (!chunk) throw new Error('RELEASE_TOOL_BUILD')
const module = { exports: {} }
new Function('require', 'module', 'exports', chunk.code)(createRequire(import.meta.url), module, module.exports)
const root = await module.exports.preparePilotRelease(process.cwd())
await module.exports.promotePilotRelease(process.cwd(), root)
console.log(JSON.stringify({ status: 'PROMOTED_RUNTIME_UNVERIFIED', evidence: root, anchor: module.exports.PILOT_RELEASE }))

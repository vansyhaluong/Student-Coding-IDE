/* global process */
// Refreshes the isolated Main runtime used by scripts/smoke-csharp-run.mjs.
// That smoke loads production out/renderer, out/preload, and out/main/native.
import { build } from 'electron-vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

await mkdir('out/m1-11-smoke', { recursive: true })
await writeFile('out/m1-11-smoke-entry.ts', `export * from '../src/main/services/run/run-runtime'
export { CsharpRunTargetRequests } from '../src/main/services/run/csharp-run-target-requests'
`)
// electron-vite 5 only reads main/preload/renderer from a config file. An inline
// config with configFile:false returns before emitting, which left this bundle stale.
await writeFile('out/m1-11-smoke/electron.vite.config.mjs', `import { resolve } from 'node:path'
export default {
  main: { build: { outDir: resolve('out/m1-11-smoke/main'), emptyOutDir: true, rollupOptions: { input: { runtime: resolve('out/m1-11-smoke-entry.ts') } } } },
}
`)
await build({ configFile: resolve('out/m1-11-smoke/electron.vite.config.mjs'), ignoreConfigWarning: true })
// Reuse the unchanged compiler recipe with an isolated output directory.
const recipe = await readFile('scripts/build-run-native.mjs', 'utf8')
const rootLine = "const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')"
const outputLine = "const output = join(root, 'out/main/native')"
assert(recipe.includes(rootLine) && recipe.includes(outputLine), 'Native build recipe changed; review smoke output isolation.')
await writeFile('out/m1-11-smoke/build-native.mjs', recipe.replace(rootLine, "const root = resolve('.')")
  .replace(outputLine, "const output = join(root, 'out/m1-11-smoke/native')"))
execFileSync(process.execPath, [resolve('out/m1-11-smoke/build-native.mjs')], { stdio: 'inherit', windowsHide: true })

import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { exercisePackageAssetsPlugin, exercisePackageRendererBoundary } from './src/main/services/learning/content/exercise-package-build'

function smartHintsParserAssetsPlugin(): Plugin {
  let output: string
  return { name: 'smart-hints-parser-assets', configResolved(config) { output = resolve(config.build.outDir, 'smart-hints-parser') },
    closeBundle() {
      execFileSync(process.execPath, [resolve('scripts/build-smart-hints-parser-assets.mjs'), output], { stdio: 'inherit', windowsHide: true })
    } }
}

export default defineConfig({
  main: {
    // Reproducible identity of the diagnostics implementation and its acceptance
    // dependencies. No Git/host/path/credential identity or runtime I/O.
    define: { __SMART_HINTS_BUILD_ID__: JSON.stringify(createHash('sha256').update([
      'package.json', 'electron.vite.config.ts', 'src/shared/contracts/smart-hints.ts', 'src/shared/contracts/smart-hints-validation.ts',
      ...['adapter', 'capture', 'hint-context', 'hint-apply-parser', 'service', 'configuration', 'execution-coordinator', 'gemini-transport', 'gemini-provider', 'gemini-schema', 'response-failure', 'validation-diagnostics',
        'selection-fix', 'selection-fix-diagnostics', 'selection-fix-guard', 'selection-fix-parser-runtime', 'selection-fix-protocol', 'selection-fix-sdk-resolver']
        .map(name => `src/main/services/learning/smart-hints/${name}.ts`),
      'src/main/services/learning/smart-hints/parsers/javascript.ts', 'src/main/services/learning/smart-hints/parsers/hint-context-javascript.ts', 'src/main/services/learning/smart-hints/parsers/SelectionFixGuard.cs',
      'scripts/build-smart-hints-parser-assets.mjs',
      ...['service', 'conversation-manager', 'context-builder', 'gemini-chat-adapter'].map(name => `src/main/services/learning/chat/${name}.ts`),
      'src/main/ipc/learning-chat-ipc-service.ts', 'src/shared/contracts/learning-chat.ts', 'src/shared/contracts/learning-chat-validation.ts',
      'src/preload/bridge/learning-chat.ts',
    ].map(path => readFileSync(resolve(path), 'utf8')).join('\0')).digest('hex')) },
    // Shared Main chunks must retain the entry's native/ relative binding path.
    build: { rollupOptions: { output: { chunkFileNames: '[name]-[hash].js' }, input: {
      index: resolve('src/main/index.ts'),
      'run-runtime': resolve('src/main/services/run/run-runtime.ts'),
      'language-runtime': resolve('src/main/services/language/language-service-manager.ts'),
      'csharp-preflight-runtime': resolve('src/main/services/language/csharp-preflight-process.ts'),
      'exercise-package-resources-runtime': resolve('src/main/services/learning/content/exercise-package-resources-runtime.ts'),
      'selection-fix-runtime': resolve('src/main/services/learning/smart-hints/selection-fix-parser-runtime.ts'),
    } } },
    plugins: [exercisePackageAssetsPlugin(__dirname), smartHintsParserAssetsPlugin(), { name: 'smart-hints-native-key', closeBundle() {
      if (process.platform !== 'win32' || process.arch !== 'x64') return
      execFileSync(process.execPath, [resolve('scripts/build-smart-hints-key-native.mjs')], { stdio: 'inherit', windowsHide: true })
    } }, { name: 'run-native-artifact', closeBundle() {
      // Portable CI still builds JS; unsupported hosts cannot load the adapter.
      if (process.platform !== 'win32' || process.arch !== 'x64') return
      execFileSync(process.execPath, [resolve('scripts/build-run-native.mjs')], {
        stdio: 'inherit', windowsHide: true,
      })
    } }, { name: 'learning-native-artifact', closeBundle() {
      if (process.platform !== 'win32' || process.arch !== 'x64') return
      execFileSync(process.execPath, [resolve('scripts/build-learning-native.mjs')], {
        stdio: 'inherit', windowsHide: true,
      })
    } }],
  },

  preload: {},

  renderer: {
    worker: {
      // TypeScript's binder has required side effects despite upstream pure annotations.
      rollupOptions: { treeshake: { annotations: false } },
    },
    plugins: [
      exercisePackageRendererBoundary(),
      react(),
      tailwindcss(),
    ],
  },
})

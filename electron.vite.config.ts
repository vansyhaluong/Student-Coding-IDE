import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { exercisePackageAssetsPlugin, exercisePackageRendererBoundary } from './src/main/services/learning/content/exercise-package-build'

export default defineConfig({
  main: {
    // Shared Main chunks must retain the entry's native/ relative binding path.
    build: { rollupOptions: { output: { chunkFileNames: '[name]-[hash].js' }, input: {
      index: resolve('src/main/index.ts'),
      'run-runtime': resolve('src/main/services/run/run-runtime.ts'),
      'language-runtime': resolve('src/main/services/language/language-service-manager.ts'),
      'csharp-preflight-runtime': resolve('src/main/services/language/csharp-preflight-process.ts'),
      'exercise-package-resources-runtime': resolve('src/main/services/learning/content/exercise-package-resources-runtime.ts'),
    } } },
    plugins: [exercisePackageAssetsPlugin(__dirname), { name: 'run-native-artifact', closeBundle() {
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

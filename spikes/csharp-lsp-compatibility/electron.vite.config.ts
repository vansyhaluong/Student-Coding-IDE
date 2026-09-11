import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      outDir: 'artifacts/electron-vite',
      rollupOptions: {
        input: resolve('src/bundle-probe.ts')
      }
    }
  }
})

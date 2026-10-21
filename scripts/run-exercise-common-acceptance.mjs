/* global process */
// Test-only build: never imported by production config or application composition.
import { build } from 'vite'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const directory = resolve('out', `learning-common-step7-${Date.now()}`)
await build({ configFile: false, logLevel: 'error', build: {
  ssr: resolve('tests/fixtures/learning/common-acceptance.ts'), outDir: directory,
  emptyOutDir: false, rollupOptions: { external: ['electron', 'node-pty'],
    output: { format: 'cjs', entryFileNames: 'acceptance.cjs' } },
} })
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(resolve('node_modules/electron/dist/electron.exe'), [resolve(directory, 'acceptance.cjs'), directory, ...process.argv.slice(2)], {
  env: environment, stdio: 'inherit', windowsHide: true,
})
// No watchdog or outer process timeout is a successful cleanup oracle.
child.once('error', error => { throw error })
child.once('exit', code => { process.exitCode = code ?? 1 })

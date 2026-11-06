/* global process, console */
// No inference here. Main provisions only after strict argv and native attestation.
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
async function launch() {
  if (process.versions.electron) {
    const { app } = await import('electron')
    if (app.isPackaged || process.argv.some(arg => /^--(?:inspect|remote-debugging)/.test(arg))) { app.exit(1); return }
    const { liveUiApproval } = require(resolve(root, 'out/sh4-live-ui-launcher/gate.cjs'))
    const approval = liveUiApproval(process.argv)
    if (!approval) { app.exit(1); return }
    delete process.env.ELECTRON_RENDERER_URL // Always use the local built Learning/Practice UI.
    // Separate drafts/settings/history, reproducible approval ownership across restarts.
    const userData = resolve(root, 'out/sh4-ui-live', approval.id, 'user-data')
    await mkdir(userData, { recursive: true }); app.setPath('userData', userData)
    require(resolve(root, 'out/main/index.js'))
    return
  }
  const args = process.argv.slice(2), prepareOnly = args.length === 1 && args[0] === '--prepare-only'
  if (!prepareOnly && args[0] !== '--sh4-live-ui') throw Error('SH4_UI_GATE_INVALID')
  if (process.env.ELECTRON_RUN_AS_NODE) throw Error('SH4_UI_ENV_INVALID')
  const { build } = await import('vite')
  await build({ configFile: false, root, logLevel: 'silent', build: {
    outDir: resolve(root, 'out/sh4-live-ui-launcher'), emptyOutDir: false, minify: false,
    lib: { entry: resolve(root, 'src/main/services/learning/smart-hints/live-ui-acceptance.ts'), formats: ['cjs'], fileName: () => 'gate.cjs' },
    rollupOptions: { external: [/^node:/] }
  } })
  const { liveUiApproval, LIVE_UI_SAMPLES } = require(resolve(root, 'out/sh4-live-ui-launcher/gate.cjs'))
  if (!prepareOnly && !liveUiApproval(args)) throw Error('SH4_UI_GATE_INVALID')
  const samples = resolve(root, 'out/sh4-live-ui-launcher/samples')
  await mkdir(samples, { recursive: true })
  await writeFile(resolve(samples, 'Sum.cs'), LIVE_UI_SAMPLES.csharp)
  await writeFile(resolve(samples, 'Sum.js'), LIVE_UI_SAMPLES.javascript)
  if (prepareOnly) { console.log('SH4_UI_PREPARED_OFFLINE — no Electron, key access or HTTP.'); return }
  await access(resolve(root, 'out/main/index.js'))
  const { terminateTree } = await import('./run-smart-hints-gemini-live.mjs')
  // No key CLI argument/config/file. Electron Main reads its inherited environment.
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url), ...args], {
    cwd: root, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32' })
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    void terminateTree(child).catch(() => { console.error('SH4_UI_CLEANUP_FAILED'); process.exitCode = 1 })
  }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  child.once('error', () => { console.error('SH4_UI_LAUNCH_FAILED'); process.exitCode = 1 })
  child.once('exit', code => { process.off('SIGINT', stop); process.off('SIGTERM', stop); process.exitCode = code ?? 1 })
}
// Electron ESM must finish evaluation before app.ready.
void launch().catch(() => {
  console.error('SH4_UI_STOP — approval/budget/environment/build unavailable; no automatic retry.')
  if (process.versions.electron) void import('electron').then(({ app }) => app.exit(1))
  else process.exitCode = 1
})

/* global process */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(resolve('node_modules/electron/dist/electron.exe'), [resolve('scripts/smoke-learning-csharp-run.mjs'), ...process.argv.slice(2)], {
  env: environment, stdio: 'inherit', windowsHide: true,
})
child.once('error', error => { throw error })
child.once('exit', code => { process.exitCode = code ?? 1 })

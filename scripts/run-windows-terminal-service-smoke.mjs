/* global process */

import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(tmpdir(), 'student-ide-terminal-service-smoke-build')
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    ssr: join(repositoryRoot, 'scripts', 'smoke-windows-terminal-service.ts'),
    outDir: outputRoot,
    emptyOutDir: true,
    rollupOptions: {
      external: ['node-pty'],
      output: { format: 'cjs', entryFileNames: 'smoke.cjs' },
    },
  },
})

for (const scenario of ['live-root', 'natural-root']) {
  const result = spawnSync(
    join(repositoryRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['-e', `require(${JSON.stringify(join(outputRoot, 'smoke.cjs'))})`],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_PATH: join(repositoryRoot, 'node_modules'),
        STUDENT_IDE_SHUTDOWN_SCENARIO: scenario,
      },
      stdio: 'inherit',
      windowsHide: true,
      timeout: 45_000,
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `TerminalService Windows ${scenario} smoke failed with exit code ${result.status}.`,
    )
  }
}

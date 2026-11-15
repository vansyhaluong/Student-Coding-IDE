import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('M2-02 Run stdin native smoke', () => {
  it('writes UTF-8, repeats, closes EOF, and unblocks a full pipe on Stop', async () => {
    const binding = require(resolve('out/main/native/run-process.node')) as { createRunInput?: unknown }
    expect(typeof binding.createRunInput).toBe('function')
    const { stdout } = await execFileAsync(process.execPath, ['scripts/smoke-run-input.mjs'], {
      cwd: resolve('.'), windowsHide: true, timeout: 30_000,
    })
    expect(stdout).toContain('"repeatedUtf8AndEof":"PASS"')
    expect(stdout).toContain('"brokenPipe":"PASS"')
    expect(stdout).toContain('"closedStdin":"PASS"')
    expect(stdout).toContain('"stopUnblockedFullPipe"')
  }, 30_000)
})

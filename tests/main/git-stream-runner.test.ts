import { spawn, type ChildProcess } from 'node:child_process'
import { getEventListeners } from 'node:events'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { GitCommandRunner, type GitSpawn } from '../../src/main/services/git/git-command-runner'
import { GitStatusParser } from '../../src/main/services/git/git-status-parser'

// Substitute only executable/fixture arguments at the lowest process seam;
// production stdio, environment, timeout, cancellation and cleanup run unchanged.
function fixture(script: string, missing = false) {
  let child: ChildProcess
  let closed = 0
  const launch: GitSpawn = (_executable, _args, options) => {
    expect(options.shell).toBe(false)
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
    expect(options.env).not.toHaveProperty('GIT_INDEX_FILE')
    child = spawn(missing ? 'Z:\\missing-phase5b\\node.exe' : process.execPath, ['-e', script], {
      ...options, cwd: process.cwd(),
    })
    child.once('close', () => { closed++ })
    return child
  }
  onTestFinished(() => { if (child && !closed) child.kill() })
  const runner = new GitCommandRunner(undefined, 1024, { ...process.env, GIT_INDEX_FILE: 'unsafe' }, launch)
  return {
    run: (consume: (chunk: Uint8Array) => boolean, signal: AbortSignal, timeoutMs = 2000) =>
      runner.stream('C:\\Git\\git.exe', [], 'C:\\project', consume, { signal, timeoutMs }),
    cleanup: (signal: AbortSignal) => {
      expect(closed).toBe(1)
      expect(getEventListeners(signal, 'abort')).toHaveLength(0)
      expect(child.stdout?.listenerCount('data')).toBe(0)
      expect(child.stderr?.listenerCount('data')).toBe(0)
      if (child.pid) expect(() => process.kill(child.pid!, 0)).toThrow()
    },
  }
}

describe('Phase 5B real streaming subprocess lifecycle', () => {
  it.each([0, 7])('captures stdout and nonzero exit %s without leaking stderr', async (code) => {
    const processFixture = fixture(`process.stdout.write('hello'); process.stderr.write('safe'); process.exitCode=${code}`)
    const controller = new AbortController()
    const chunks: Buffer[] = []
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout')
    try {
      await expect(processFixture.run((chunk) => { chunks.push(Buffer.from(chunk)); return false }, controller.signal))
        .resolves.toEqual({ exitCode: code, stoppedEarly: false })
      expect(Buffer.concat(chunks).toString()).toBe('hello')
      expect(clearTimer).toHaveBeenCalled()
      processFixture.cleanup(controller.signal)
      controller.abort()
      processFixture.cleanup(controller.signal)
    } finally { clearTimer.mockRestore() }
  })

  it.each(['timeout', 'cancelled', 'stderr', 'token', 'limit'] as const)('cleans real child after %s', async (mode) => {
    const script = mode === 'stderr' ? "process.stderr.write('x'.repeat(65536));"
      : mode === 'token' ? "process.stdout.write('x'.repeat(200000));"
        : "process.stdout.write('ready');"
    const processFixture = fixture(`${script}setTimeout(() => {}, 2000)`)
    const controller = new AbortController()
    const parser = new GitStatusParser()
    let calls = 0
    let settlements = 0
    const operation = processFixture.run((chunk) => {
      calls++
      if (mode === 'cancelled') controller.abort()
      if (mode === 'token') return parser.push(chunk)
      return mode === 'limit'
    }, controller.signal, mode === 'timeout' ? 250 : 2000)
    const tracked = operation.then((value) => { settlements++; return value }, (error: unknown) => { settlements++; throw error })
    if (mode === 'limit') await expect(tracked).resolves.toEqual({ exitCode: 0, stoppedEarly: true })
    else await expect(tracked).rejects.toMatchObject({ code: mode === 'timeout' || mode === 'cancelled' ? 'PROCESS_CANCELLED' : 'PROCESS_FAILED' })
    processFixture.cleanup(controller.signal)
    controller.abort()
    await Promise.resolve()
    expect(settlements).toBe(1)
    if (mode === 'limit') expect(calls).toBe(1)
  })

  it('settles real spawn failure and removes its abort listener', async () => {
    const processFixture = fixture('', true)
    const controller = new AbortController()
    await expect(processFixture.run(() => false, controller.signal)).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
    processFixture.cleanup(controller.signal)
  })
})

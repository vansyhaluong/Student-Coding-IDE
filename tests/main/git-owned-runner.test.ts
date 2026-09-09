import { getEventListeners } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitOwnedCommandRunner, type GitNativeBinding } from '../../src/main/services/git/git-owned-command-runner'

function bindingFixture() {
  let observe!: Parameters<GitNativeBinding['createGit']>[4]
  let count = 1, releaseFailure = false
  const control = vi.fn((_handle: object, action: string) => {
    if (action === 'pid') return 123
    if (action === 'count') return count
    if (action === 'terminate') { count = 0; return }
    if (action === 'release' && releaseFailure) throw new Error('release failed')
  })
  const binding: GitNativeBinding = { capability: 'student-ide-piped-job-v1',
    createGit: vi.fn((_exe, _args, _cwd, _env, callback) => { observe = callback; return {} }), control }
  const runner = new GitOwnedCommandRunner(() => binding, { PATH: 'safe', GIT_DIR: 'evil' })
  return { binding, runner, control, releaseFails: (value: boolean) => { releaseFailure = value },
    output: (text: string) => observe({ type: 'stdout', data: Buffer.from(text) }),
    close: (code = 0) => {
      observe({ type: 'exit', exitCode: code })
      observe({ type: 'stdout-eof' }); observe({ type: 'stderr-eof' }); observe({ type: 'settled' })
    } }
}

afterEach(() => vi.useRealTimers())
describe('Phase 5D owned Git runner', () => {
  it.each(['abort', 'timeout'] as const)('%s terminates the Job, waits for settlement, and removes timer/listener', async (mode) => {
    vi.useFakeTimers()
    const f = bindingFixture(), controller = new AbortController()
    let settlements = 0
    const pending = f.runner.execute('C:\\Git\\git.exe', ['status'], 'C:\\project',
      { signal: controller.signal, timeoutMs: 100 }).then(() => { settlements++ }, (error: unknown) => { settlements++; return error })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1)
    if (mode === 'abort') { controller.abort(); controller.abort() }
    else await vi.advanceTimersByTimeAsync(100)
    expect(f.control).toHaveBeenCalledWith(expect.anything(), 'terminate')
    expect(settlements).toBe(0)
    f.close(1)
    expect(await pending).toMatchObject({ code: 'PROCESS_CANCELLED', details: { reason: mode === 'abort' ? 'cancelled' : 'timeout' } })
    expect(settlements).toBe(1)
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.runner.cleanupPending).toBe(false)
    expect(f.control.mock.calls.filter(([, action]) => action === 'release')).toHaveLength(1)
  })

  it('preserves root result on cleanup failure and retains ownership until explicit cleanup', async () => {
    const f = bindingFixture()
    f.releaseFails(true)
    const pending = f.runner.execute('C:\\Git\\git.exe', ['commit', '-m', 'hello'], 'C:\\project').catch((error: unknown) => error)
    f.close()
    expect(await pending).toMatchObject({ result: { exitCode: 0 }, details: { reason: 'cleanup-failed' } })
    expect(f.runner.cleanupPending).toBe(true)
    await expect(f.runner.stop()).rejects.toMatchObject({ details: { reason: 'cleanup-failed' } })
    f.releaseFails(false)
    await f.runner.stop()
    expect(f.runner.cleanupPending).toBe(false)
  })

  it('bounds output and preserves the native Run entry while using Git argv/environment', async () => {
    const f = bindingFixture()
    const pending = f.runner.execute('C:\\Git\\git.exe', ['commit', '-m', 'Unicode "message"\\'], 'C:\\project').catch((error: unknown) => error)
    expect(f.binding.createGit).toHaveBeenCalledWith('C:\\Git\\git.exe', ['commit', '-m', 'Unicode "message"\\'],
      'C:\\project', expect.not.arrayContaining(['GIT_DIR=evil']), expect.any(Function))
    f.output('x'.repeat(1024 * 1024 + 1)); f.close(1)
    expect(await pending).toMatchObject({ details: { reason: 'output-limit' } })
    expect(f.runner.cleanupPending).toBe(false)
  })

  it('stream semantic stop and pre-abort create no duplicate settlement or leaked listeners', async () => {
    const f = bindingFixture(), controller = new AbortController()
    const pending = f.runner.stream('C:\\Git\\git.exe', ['status'], 'C:\\project', () => true, { signal: controller.signal })
    f.output('record'); f.close(1)
    expect(await pending).toEqual({ exitCode: 0, stoppedEarly: true })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    controller.abort()
    await expect(f.runner.execute('C:\\Git\\git.exe', [], 'C:\\project', { signal: controller.signal })).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(f.binding.createGit).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'

import type { PtySpawnOptions } from '../../src/main/services/terminal/pty-port'
import { FakePtyPort } from '../support/fake-pty'

const spawnOptions: PtySpawnOptions = {
  executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  args: ['-NoLogo', '-NoProfile'],
  cwd: 'D:\\coding-ide',
  env: { TERM: 'xterm-256color' },
  cols: 80,
  rows: 24,
  name: 'xterm-256color',
}

describe('Phase 2E-C fake PTY port', () => {
  it('spawns deterministically and records an isolated options snapshot', () => {
    const port = new FakePtyPort()
    const process = port.spawn(spawnOptions)

    expect(process.pid).toBe(1_000)
    expect(port.spawnCalls).toEqual([spawnOptions])
    expect(port.processes).toEqual([process])
    expect(port.spawnCalls[0]).not.toBe(spawnOptions)
    expect(port.spawnCalls[0]?.args).not.toBe(spawnOptions.args)
    expect(port.spawnCalls[0]?.env).not.toBe(spawnOptions.env)
  })

  it('records writes without altering control bytes and records resize calls', () => {
    const process = new FakePtyPort().spawn(spawnOptions)
    process.write('hello 🌏\r')
    process.write('\x03')
    process.resize(100, 30)

    expect(process.writes).toEqual(['hello 🌏\r', '\x03'])
    expect(process.resizes).toEqual([{ cols: 100, rows: 30 }])
  })

  it('emits data synchronously, supports unsubscription, and permits late data after close', () => {
    const process = new FakePtyPort().spawn(spawnOptions)
    const listener = vi.fn()
    const subscription = process.onData(listener)

    process.emitData('first')
    process.close()
    process.emitData('late-after-close')
    subscription.dispose()
    subscription.dispose()
    process.emitData('ignored-after-unsubscribe')

    expect(listener.mock.calls).toEqual([['first'], ['late-after-close']])
  })

  it('emits an immediate exit once and records duplicate exit attempts', () => {
    const process = new FakePtyPort().spawn(spawnOptions)
    const listener = vi.fn()
    process.onExit(listener)

    expect(process.emitExit({ exitCode: 0, signal: null })).toBe(true)
    expect(process.emitExit({ exitCode: 1, signal: 2 })).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ exitCode: 0, signal: null })
    expect(process.exitAttemptCount).toBe(2)
  })

  it('provides deterministic one-shot spawn failure without creating a process', () => {
    const port = new FakePtyPort()
    const failure = new Error('controlled spawn failure')
    port.failNextSpawn(failure)

    expect(() => port.spawn(spawnOptions)).toThrow(failure)
    expect(port.processes).toHaveLength(0)
    expect(port.spawnCalls).toHaveLength(1)
    expect(() => port.spawn(spawnOptions)).not.toThrow()
    expect(port.processes).toHaveLength(1)
  })

  it('closes and disposes exactly once and disables disposed listeners', () => {
    const process = new FakePtyPort().spawn(spawnOptions)
    const data = vi.fn()
    const exit = vi.fn()
    process.onData(data)
    process.onExit(exit)

    process.close()
    process.close()
    expect(() => process.write('late')).toThrow('closed fake PTY')
    expect(() => process.resize(90, 25)).toThrow('closed fake PTY')
    process.dispose()
    process.dispose()

    expect(process.closeCallCount).toBe(1)
    expect(process.disposeCallCount).toBe(1)
    expect(() => process.emitData('disposed')).toThrow('disposed fake PTY')
    expect(() => process.emitExit({ exitCode: 0, signal: null }))
      .toThrow('disposed fake PTY')
    expect(data).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })
})

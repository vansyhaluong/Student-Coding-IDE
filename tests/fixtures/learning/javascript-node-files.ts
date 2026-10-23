import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { vi } from 'vitest'
import type { JavascriptNodeProbe, JavascriptNodeSelection } from '../../../src/main/services/learning/runtime/javascript-execution-contracts'
import type { ExercisePhaseContext } from '../../../src/main/services/learning/runtime/exercise-runtime-adapter'
import type { LearningJobSample, LearningNativeBinding } from '../../../src/main/services/learning/runtime/windows-exercise-native'

export async function fakeNode(directory: string, machine = 0x8664): Promise<string> {
  await mkdir(directory, { recursive: true })
  const header = Buffer.alloc(128); header.write('MZ'); header.writeUInt32LE(64, 60)
  header.writeUInt32LE(0x4550, 64); header.writeUInt16LE(machine, 68)
  const file = join(directory, 'node.exe'); await writeFile(file, header); return file
}
export function probeContext(): ExercisePhaseContext {
  return { signal: new AbortController().signal, deadline: performance.now() + 10_000, jobMemoryBytes: 512 * 1024 ** 2, output: vi.fn() }
}
export const fakeProbe = (version = 'v24.8.1'): JavascriptNodeProbe => ({ probe: vi.fn(async candidate => ({
  state: 'AVAILABLE' as const, selection: { executablePath: candidate.executablePath, canonicalPath: candidate.canonicalPath,
    identity: candidate.identity, version, architecture: 'x64' },
})) })
export function probeReport(candidate: Pick<JavascriptNodeSelection, 'canonicalPath'>): string {
  return JSON.stringify({ protocolVersion: 1, version: 'v24.8.1', architecture: 'x64', platform: 'win32',
    execPath: candidate.canonicalPath, capabilities: { script: true, context: true, utf8: true } })
}
export function probeNative(output: () => Buffer) {
  const jobs = new Map<object, LearningJobSample>()
  const states = new Map<object, { terminated: boolean; released: boolean; handlesClosed: boolean }>()
  let sequence = 0
  const native: LearningNativeBinding = {
    capability: 'student-ide-learning-job-v1', submitInput: vi.fn(),
    start: vi.fn((_exe, _args, _cwd, quota) => {
      const h = {}, pid = ++sequence
      states.set(h, { terminated: false, released: false, handlesClosed: false })
      jobs.set(h, { stdinSettled: true, stdinFailed: false, stdinBytesWritten: 0, rootPid: pid, members: [pid],
        retained: [{ pid, created: `time-${pid}`, signaled: false }], activeProcesses: 1, totalProcesses: 1,
        coverageComplete: true, observerSettled: false, exitCode: 259, quotaBytes: quota, peakJobCommitBytes: 1,
        reportedJobCommitBytes: 1, events: [], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) })
      return h
    }),
    poll: vi.fn(h => { const s = jobs.get(h)!, out = { ...s, retained: s.retained.map(p => ({ ...p })) }
      s.stdout = Buffer.alloc(0); s.stderr = Buffer.alloc(0); return out }),
    control: vi.fn((h, op) => {
      const state = states.get(h)!, s = jobs.get(h)!
      if (op === 'release') state.released = true
      if (op === 'closeHandles') state.handlesClosed = true
      if (op === 'terminate') state.terminated = true
      if (op === 'resume' || op === 'terminate') {
        s.members = []; s.activeProcesses = 0; s.retained.forEach(p => { p.signaled = true })
        s.observerSettled = true; s.exitCode = 0
        if (op === 'resume') s.stdout = output()
      }
    }),
    state: vi.fn(h => ({ ...states.get(h)! })), acquireLease: vi.fn(() => ({})), watch: vi.fn(() => ({})),
    observation: vi.fn() as unknown as LearningNativeBinding['observation'],
  }
  return { native, jobs, states }
}

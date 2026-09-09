import {
  execFile,
  type ChildProcess,
} from 'node:child_process'
import { createHook } from 'node:async_hooks'
import { getEventListeners, once } from 'node:events'
import { setImmediate as nextTurn } from 'node:timers/promises'
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

import { GitExecutableDetector } from '../../src/main/services/dependencies/git-executable'
import {
  GitCommandRunner,
  type GitExecFile,
} from '../../src/main/services/git/git-command-runner'
import { GitService } from '../../src/main/services/git/git-service'
import { ProjectService } from '../../src/main/services/project/project-service'
import type { ProjectId } from '../../src/shared/contracts'

const detectedGit = process.platform === 'win32'
  ? await new GitExecutableDetector().detect()
  : { state: 'MISSING' as const }
const describeWithGit = detectedGit.state === 'AVAILABLE' ? describe : describe.skip
if (detectedGit.state !== 'AVAILABLE') {
  console.warn('Phase 5A real Git tests SKIPPED: Windows PATH git.exe unavailable; no real-process/repository acceptance evidence.')
}

describeWithGit('Phase 5A real GitCommandRunner process lifecycle', () => {
  it('captures real success output and settles once', async () => {
    const adapter = captureExecFile()
    const controller = new AbortController()
    const result = await new GitCommandRunner(adapter.executeFile).execute(
      gitExecutable(),
      ['--version'],
      process.cwd(),
      { signal: controller.signal, timeoutMs: 2_000 },
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/^git version /)
    expect(result.stderr).toBe('')
    expectProcessGone(adapter.child())
    await adapter.expectCleanup(controller.signal)
    controller.abort()
    await Promise.resolve()
    expect(adapter.callbackCount()).toBe(1)
  })

  it('preserves a real non-zero exit and stderr', async () => {
    await withTemporaryDirectory(async (directory) => {
      await initializeRepository(directory)
      const adapter = captureExecFile()
      const result = await new GitCommandRunner(adapter.executeFile).execute(
        gitExecutable(),
        ['rev-parse', '--verify', 'refs/heads/does-not-exist'],
        directory,
      )

      expect(result.exitCode).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).not.toBe('')
      expectProcessGone(adapter.child())
      await adapter.expectCleanup()
      expect(adapter.callbackCount()).toBe(1)
    })
  })

  it('times out and terminates the real child process', async () => {
    const adapter = captureExecFile()
    const controller = new AbortController()
    const operation = new GitCommandRunner(adapter.executeFile).execute(
      gitExecutable(),
      ['hash-object', '--stdin'],
      process.cwd(),
      { signal: controller.signal, timeoutMs: 250 },
    )
    const child = adapter.child()

    await expect(operation).rejects.toMatchObject({
      code: 'PROCESS_CANCELLED',
      details: { reason: 'timeout' },
    })
    expectProcessGone(child)
    await adapter.expectCleanup(controller.signal)
    expect(adapter.callbackCount()).toBe(1)
  })

  it('cancels and terminates the real child process', async () => {
    const adapter = captureExecFile()
    const controller = new AbortController()
    const operation = new GitCommandRunner(adapter.executeFile).execute(
      gitExecutable(),
      ['hash-object', '--stdin'],
      process.cwd(),
      { signal: controller.signal, timeoutMs: 2_000 },
    )
    const child = adapter.child()
    await once(child, 'spawn')
    controller.abort()
    controller.abort()

    await expect(operation).rejects.toMatchObject({
      code: 'PROCESS_CANCELLED',
      details: { reason: 'cancelled' },
    })
    expectProcessGone(child)
    await adapter.expectCleanup(controller.signal)
    expect(adapter.callbackCount()).toBe(1)
  })

  it('bounds real output and terminates the producing process', async () => {
    await withTemporaryDirectory(async (directory) => {
      await initializeRepository(directory)
      const largeFile = join(directory, 'large-output.txt')
      await writeFile(largeFile, 'x'.repeat(64 * 1024), 'utf8')
      const setupRunner = new GitCommandRunner()
      const hash = await setupRunner.execute(
        gitExecutable(),
        ['hash-object', '-w', largeFile],
        directory,
      )

      const adapter = captureExecFile()
      const controller = new AbortController()
      const operation = new GitCommandRunner(adapter.executeFile, 1024).execute(
        gitExecutable(),
        ['cat-file', '--batch'],
        directory,
        { signal: controller.signal },
      )
      const child = adapter.child()
      // Keep batch stdin open: overflow must terminate a live process, not
      // merely report a large result after an already finite command exits.
      child.stdin!.write(`${hash.stdout.trim()}\n`)

      await expect(operation).rejects.toMatchObject({
        code: 'PROCESS_FAILED',
        details: { reason: 'output-limit' },
      })
      expectProcessGone(child)
      expect(adapter.outputBytes()).toBeLessThanOrEqual(1024)
      await adapter.expectCleanup(controller.signal)
      expect(adapter.callbackCount()).toBe(1)
    })
  })

  it('maps a real spawn failure without hanging or creating a process', async () => {
    await withTemporaryDirectory(async (directory) => {
      const adapter = captureExecFile()
      const missingExecutable = join(directory, 'missing', 'git.exe')

      await expect(new GitCommandRunner(adapter.executeFile).execute(
        missingExecutable,
        ['--version'],
        directory,
      )).rejects.toMatchObject({ code: 'PROCESS_FAILED' })
      expect(adapter.child().pid).toBeUndefined()
      await adapter.expectCleanup()
      expect(adapter.callbackCount()).toBe(1)
    })
  })
})

describeWithGit('Phase 5A real Git repository detection', () => {
  it('accepts an exact repository root with spaces and Unicode', async () => {
    await withTemporaryDirectory(async (directory) => {
      const repository = join(directory, 'Dự án Git có spaces')
      await mkdir(repository)
      await initializeRepository(repository)

      const { project, service } = await createRealService(repository)
      await expect(service.getState(project.id)).resolves.toEqual({
        dependency: 'AVAILABLE',
        repository: 'REPOSITORY',
      })
    })
  })

  it('returns NOT_REPOSITORY for a real normal folder', async () => {
    await withTemporaryDirectory(async (directory) => {
      const folder = join(directory, 'normal folder')
      await mkdir(folder)

      const { project, service } = await createRealService(folder)
      await expect(service.getState(project.id)).resolves.toEqual({
        dependency: 'AVAILABLE',
        repository: 'NOT_REPOSITORY',
      })
    })
  })

  it('rejects a real nested project inside a parent repository', async () => {
    await withTemporaryDirectory(async (directory) => {
      const repository = join(directory, 'parent repository')
      const nestedProject = join(repository, 'nested project')
      await mkdir(repository)
      await initializeRepository(repository)
      await mkdir(nestedProject)

      const { project, service } = await createRealService(nestedProject)
      await expect(service.getState(project.id)).resolves.toEqual({
        dependency: 'AVAILABLE',
        repository: 'NOT_REPOSITORY',
      })
    })
  })
})

function gitExecutable(): string {
  if (detectedGit.state !== 'AVAILABLE') {
    throw new Error('Real Git suite ran without an available Git executable.')
  }
  return detectedGit.git.executable
}

function captureExecFile(): {
  executeFile: GitExecFile
  child(): ChildProcess
  callbackCount(): number
  outputBytes(): number
  expectCleanup(signal?: AbortSignal): Promise<void>
} {
  let child: ChildProcess | undefined
  let callbacks = 0
  let bytes = 0
  let closes = 0
  let creatingProcess = false
  const timers = new Set<number>()
  const destroyedTimers = new Set<number>()
  const hook = createHook({
    init(id, type) {
      if (creatingProcess && type === 'Timeout') timers.add(id)
    },
    destroy(id) {
      if (timers.has(id)) destroyedTimers.add(id)
    },
  }).enable()
  onTestFinished(async () => {
    try {
      if (child?.pid && isProcessAlive(child.pid)) {
        const closed = new Promise<void>((resolve) => child!.once('close', () => resolve()))
        child.kill()
        await closed
      }
    } finally {
      hook.disable()
    }
  })
  const executeFile: GitExecFile = (executable, args, options, callback) => {
    creatingProcess = true
    try {
      child = execFile(executable, [...args], options, (error, stdout, stderr) => {
        callbacks += 1
        bytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr)
        callback(error, stdout, stderr)
      })
      child.once('close', () => { closes += 1 })
    } finally {
      creatingProcess = false
    }
    return child
  }
  return {
    executeFile,
    child() {
      if (!child) throw new Error('Expected a real child process to be created.')
      return child
    },
    callbackCount: () => callbacks,
    outputBytes: () => bytes,
    async expectCleanup(signal) {
      // Node reports async resource destruction on the following event-loop
      // turn; no sleeping until the command timeout is necessary.
      await nextTurn()
      expect(closes).toBe(1)
      expect(callbacks).toBe(1)
      expect(timers.size).toBe(1)
      expect(destroyedTimers).toEqual(timers)
      if (signal) expect(getEventListeners(signal, 'abort')).toHaveLength(0)
    },
  }
}

function expectProcessGone(child: ChildProcess): void {
  expect(child.pid).toBeTypeOf('number')
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  expect(isProcessAlive(child.pid)).toBe(false)
}

function isProcessAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isMissingProcess(error) ? false : true
  }
}

function isMissingProcess(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH'
}

async function initializeRepository(directory: string): Promise<void> {
  const result = await new GitCommandRunner().execute(
    gitExecutable(),
    ['init', '--quiet'],
    directory,
  )
  expect(result.exitCode).toBe(0)
}

async function createRealService(root: string) {
  const projects = new ProjectService()
  const project = await projects.openRoot(root)
  onTestFinished(() => projects.stop())
  const availability = {
    getStatus(projectId: ProjectId) {
      return { projectId, state: 'AVAILABLE' as const }
    },
  }
  return {
    project,
    service: new GitService(
      projects,
      availability,
      new GitExecutableDetector(),
      new GitCommandRunner(),
      { realpath },
      'win32',
    ),
  }
}

async function withTemporaryDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'student-ide-phase5a-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

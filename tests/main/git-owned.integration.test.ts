import { createRequire } from 'node:module'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { getEventListeners } from 'node:events'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitExecutableDetector } from '../../src/main/services/dependencies/git-executable'
import { GitOwnedCommandRunner, type GitNativeBinding } from '../../src/main/services/git/git-owned-command-runner'
import { ProjectService } from '../../src/main/services/project/project-service'
import { GitOperationLifecycle } from '../../src/main/services/git/git-operation-lifecycle'
import { GitService } from '../../src/main/services/git/git-service'
import type { ProjectId } from '../../src/shared/contracts'

const require = createRequire(import.meta.url)
const executable = await new GitExecutableDetector().detect()

// Portable CI cannot establish Windows native acceptance; Windows must run it.
if (process.platform !== 'win32') console.warn('Phase 5D native Git tests SKIPPED: Windows Job ownership requires Windows; no native acceptance evidence.')
describe.skipIf(process.platform !== 'win32')('Phase 5D real Git and Windows Job ownership', () => {
  it('runs normal hooks and terminates a background hook descendant surviving root exit', async () => {
    if (executable.state !== 'AVAILABLE') throw new Error('Windows Git required for process-tree acceptance')
    const directory = await mkdtemp(join(tmpdir(), 'student-ide-git-job-'))
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    const binding: GitNativeBinding = require(resolve('out/main/native/run-process.node'))
    let descendant: number | undefined, observedAliveAfterRoot = false
    const rootProbes: string[] = []
    const runner = new GitOwnedCommandRunner(() => ({ ...binding, capability: binding.capability,
      control: binding.control.bind(binding),
      createGit: (exe, args, cwd, env, observe) => binding.createGit(exe, args, cwd, env, (event) => {
        if (event.type === 'exit' && args[0] === 'commit') {
          try {
            descendant = Number(readFileSync(join(directory, 'child.pid'), 'utf8'))
            process.kill(descendant, 0); observedAliveAfterRoot = true
          } catch (error) { rootProbes.push(error instanceof Error ? error.message : String(error)) }
        }
        observe(event)
      }),
    }))
    const git = async (...args: string[]) => {
      const result = await runner.execute(executable.git.executable, args, directory)
      expect(result.exitCode).toBe(0)
      expect(result.stderr).not.toMatch(/Error:|not found|fatal:/)
      expect(runner.cleanupPending).toBe(false)
      return result.stdout
    }
    try {
      await git('init', '--quiet', '--initial-branch=main')
      await git('config', 'user.name', 'Git Job Test')
      await git('config', 'user.email', 'job@example.invalid')
      await git('config', 'commit.gpgsign', 'false')
      await git('config', 'core.hooksPath', join(directory, '.git', 'hooks'))
      await writeFile(join(directory, 'file.txt'), 'first')
      await git('add', '--', 'file.txt')
      await writeFile(join(directory, '.git/hooks/pre-commit'), '#!/bin/sh\nprintf normal > normal-hook\n')
      await git('commit', '-m', 'Unicode tiếng Việt "quoted" \\')
      expect(await readFile(join(directory, 'normal-hook'), 'utf8')).toBe('normal')
      await writeFile(join(directory, 'hook.cjs'), `const {spawn}=require('node:child_process');
const {writeFileSync}=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000);process.send("ready")'],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,detached:true});
child.once('message',()=>{writeFileSync('child.pid',String(child.pid));child.disconnect();child.unref()});`)
      const node = process.execPath.replace(/\\/g, '/')
      await writeFile(join(directory, '.git/hooks/post-commit'), `#!/bin/sh\n"${node}" hook.cjs\n`)
      await writeFile(join(directory, 'file.txt'), 'second')
      await git('add', '--', 'file.txt')
      await git('commit', '-m', 'descendant')
      expect(await readFile(join(directory, 'child.pid'), 'utf8')).toMatch(/^\d+$/)
      expect(observedAliveAfterRoot, rootProbes.join('\n')).toBe(true)
      expect(descendant).toBeGreaterThan(0)
      expect(() => process.kill(descendant!, 0)).toThrow()
      expect((await git('log', '-1', '--format=%s')).trim()).toBe('descendant')
    } finally {
      await runner.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['index/commit', 'branch/history'])('runs %s through the owned lifecycle', async (scenario) => {
    if (executable.state !== 'AVAILABLE') throw new Error('Windows Git required for process-tree acceptance')
    const directory = await mkdtemp(join(tmpdir(), 'student-ide-git-lifecycle-'))
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    const binding: GitNativeBinding = require(resolve('out/main/native/run-process.node'))
    const runner = new GitOwnedCommandRunner(() => binding)
    const git = async (...args: string[]) => {
      const result = await runner.execute(executable.git.executable, args, directory)
      expect(result.exitCode, result.stderr).toBe(0)
      expect(runner.cleanupPending).toBe(false)
      return result.stdout
    }
    try {
      await git('init', '--quiet', '--initial-branch=main')
      await git('config', 'user.name', 'Git Lifecycle Test')
      await git('config', 'user.email', 'lifecycle@example.invalid')
      await git('config', 'commit.gpgsign', 'false')
      await git('config', 'core.hooksPath', join(directory, '.git', 'hooks'))
      await writeFile(join(directory, 'file.txt'), 'initial')
      await git('add', '--', 'file.txt')
      await git('commit', '-m', 'initial')
      const projects = new ProjectService()
      const project = await projects.openRoot(directory)
      const files = { getStatus: (projectId: ProjectId) => ({ projectId, state: 'AVAILABLE' as const }), subscribeStatus: () => () => {} }
      const lifecycle = new GitOperationLifecycle(projects, files, runner)
      lifecycle.start()
      const service = new GitService(projects, files, { detect: async () => executable }, lifecycle.commands)
      let request = 0
      const run = <T>(api: string, mutation: boolean, work: () => Promise<T>) => lifecycle.run({ requestId: `real_${++request}`,
        projectId: project.id, generation: lifecycle.getContext(project.id, 1) }, 1, api, mutation, work)
      try {
        if (scenario === 'index/commit') {
          await writeFile(join(directory, 'file.txt'), 'third')
          expect((await run('stage', true, () => service.stage(project.id, 'file.txt'))).applied).toBe(true)
          expect((await run('unstage', true, () => service.unstage(project.id, 'file.txt'))).applied).toBe(true)
          await run('stage', true, () => service.stage(project.id, 'file.txt'))
          expect((await run('commit', true, () => service.commit(project.id, 'lifecycle'))).applied).toBe(true)
        } else {
          await git('branch', '@')
          expect((await run('switch', true, () => service.switchBranch(project.id, '@'))).applied).toBe(true)
          expect((await run('branches', false, () => service.getBranches(project.id))).currentBranch).toBe('@')
          expect((await run('history', false, () => service.getHistory(project.id)))[0].subject).toBe('initial')
        }
        await projects.closeProject()
      } finally { await lifecycle.stop(); await projects.stop() }
    } finally {
      await runner.stop()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['abort', 'timeout'] as const)('cleans the real Git Job on %s with a running shell child', async (mode) => {
    if (executable.state !== 'AVAILABLE') throw new Error('Windows Git required for process-tree acceptance')
    const directory = await mkdtemp(join(tmpdir(), 'student-ide-git-stop-'))
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    const binding: GitNativeBinding = require(resolve('out/main/native/run-process.node'))
    const controller = new AbortController()
    let pid: number | undefined
    const runner = new GitOwnedCommandRunner(() => ({ capability: binding.capability,
      control: binding.control.bind(binding),
      createGit: (exe, args, cwd, env, observe) => {
        const handle = binding.createGit(exe, args, cwd, env, (event) => {
          observe(event)
          if (mode === 'abort' && event.type === 'stdout' && event.data.toString().includes('READY')) controller.abort()
        })
        pid = Number(binding.control(handle, 'pid'))
        return handle
      },
    }))
    try {
      await writeFile(join(directory, 'wait.cjs'), 'process.stdout.write("READY\\n");setInterval(()=>{},1000)')
      const node = process.execPath.replace(/\\/g, '/')
      await expect(runner.execute(executable.git.executable, ['-c', `alias.wait=!"${node}" wait.cjs`, 'wait'], directory,
        { signal: controller.signal, timeoutMs: mode === 'timeout' ? 400 : 2000 })).rejects.toMatchObject({
        code: 'PROCESS_CANCELLED', details: { reason: mode === 'abort' ? 'cancelled' : 'timeout' },
      })
      expect(pid).toBeGreaterThan(0)
      expect(() => process.kill(pid!, 0)).toThrow()
      expect(runner.cleanupPending).toBe(false)
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    } finally { await runner.stop(); await rm(directory, { recursive: true, force: true }) }
  })
})

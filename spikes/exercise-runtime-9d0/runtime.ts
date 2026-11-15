// Prototype only. No IPC, renderer, Project RunService or draft-store dependency.
import { randomUUID } from 'node:crypto'
import { access, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ProcessManager } from '../../src/main/services/process/process-manager'
import type { PipedRunProcess } from '../../src/main/services/run/piped-process-adapter'
import { isExercise, matchesExerciseType, type Exercise, type ExerciseLanguage, type ExerciseValue } from '../../src/shared/contracts/practice'
import { WindowsPipedProcessAdapter } from './windows-spike-adapter'

export const LIMITS = { outputBytes: 64 * 1024, resultBytes: 64 * 1024, inputBytes: 64 * 1024,
  executeMs: 1500, compileMs: 30000, probeMs: 10000 } as const
export type Phase = 'prepare' | 'compile' | 'execute'
export class SpikeError extends Error {
  constructor(readonly reason: string) { super(reason) }
}
export interface CommandResult { exitCode: number; stdout: string; stderr: string; ms: number; pid: number }
export interface RunOptions {
  language: ExerciseLanguage; exercise: Exercise; code: string; cases: ExerciseValue[][]
  node: string; dotnet: string; sdk: string; signal?: AbortSignal
  compileTimeoutMs?: number // Fault injection for the prototype's compile deadline.
  onPhase?: (phase: Phase) => void
  onSpawn?: (phase: Phase, pid: number) => void
}
export interface RunEvidence {
  results: { value?: ExerciseValue; error?: string; command: CommandResult }[]
  prepareMs: number; compileMs: number; workspace: string; compileCount: number
  offline?: { sources: string[]; libraries: number }
}

/** Finite, Job-owned command. Main-only spike primitive, never a public executor. */
export async function command(processes: ProcessManager, owner: string, adapter: WindowsPipedProcessAdapter,
  executable: string, args: readonly string[], cwd: string, timeoutMs: number,
  signal?: AbortSignal, onSpawn?: (pid: number) => void): Promise<CommandResult> {
  if (signal?.aborted) throw new SpikeError('STOPPED')
  const start = performance.now()
  return new Promise((resolveResult, reject) => {
    let child: PipedRunProcess | undefined, closing: Promise<void> | undefined
    let finishing = false, failure: string | undefined, exitCode = -1, bytes = 0
    const stdout: string[] = [], stderr: string[] = []
    const cleanup = (): Promise<void> => {
      if (closing) return closing
      closing = (async () => {
        await child?.close()
        if (child && !child.isReleased()) throw new SpikeError('CLEANUP_FAILED')
        unregister()
      })().finally(() => { closing = undefined })
      return closing
    }
    const finish = async () => {
      if (finishing) return
      finishing = true
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      try {
        await cleanup()
        if (failure) throw new SpikeError(failure)
        resolveResult({ exitCode, stdout: stdout.join(''), stderr: stderr.join(''),
          ms: performance.now() - start, pid: child!.ownership.rootPid })
      } catch (error) { reject(error) }
    }
    const fail = (reason: string) => { failure ??= reason; queueMicrotask(() => { void finish() }) }
    const abort = () => fail('STOPPED')
    const timer = setTimeout(() => fail('TIMEOUT'), timeoutMs)
    const unregister = processes.register({ id: `exercise-spike-command:${randomUUID()}`, ownerId: owner,
      close: async () => { fail('STOPPED'); await cleanup() } })
    signal?.addEventListener('abort', abort, { once: true })
    try {
      child = adapter.create({ executable, args, cwd, environmentAdditions: {}, shell: false }, event => {
        if (event.type === 'stdout' || event.type === 'stderr') {
          bytes += Buffer.byteLength(event.data)
          if (bytes > LIMITS.outputBytes) fail('OUTPUT_LIMIT')
          else (event.type === 'stdout' ? stdout : stderr).push(event.data)
        } else if (event.type === 'exit') { exitCode = event.exitCode; queueMicrotask(() => { void finish() }) }
        else if (event.type === 'error') fail('OBSERVATION_FAILED')
      })
      onSpawn?.(child.ownership.rootPid)
      if (signal?.aborted) abort()
    } catch { fail('SPAWN_FAILED') }
  })
}

const csTypes = { int32: 'int', boolean: 'bool', string: 'string', 'int32[]': 'int[]',
  'string[]': 'string[]', 'int32[][]': 'int[][]' } as const
function harness(exercise: Exercise): string {
  const args = exercise.parameters.map((p, i) => `JsonSerializer.Deserialize<${csTypes[p.type]}>(input[${i}].GetRawText())!`).join(', ')
  return `using System;
using System.IO;
using System.Text.Json;
public static class Driver {
  public static void Main() {
    try {
      var input = JsonDocument.Parse(File.ReadAllText("input.json")).RootElement;
      ${csTypes[exercise.returnType]} value = new Solution().${exercise.functionName}(${args});
      File.WriteAllText("result.json", JsonSerializer.Serialize(new { ok = true, value }));
    } catch (Exception error) {
      File.WriteAllText("result.json", JsonSerializer.Serialize(new { ok = false, error = error.GetType().Name }));
      Environment.ExitCode = 1;
    }
  }
}
`
}
function driver(): string {
  return `const fs = require('node:fs');
try {
  const solution = require('../solution.cjs');
  const args = JSON.parse(fs.readFileSync('input.json', 'utf8'));
  const value = solution(...args);
  if (value && typeof value.then === 'function') throw new Error('ASYNC_NOT_SUPPORTED');
  fs.writeFileSync('result.json', JSON.stringify({ok: true, value}));
} catch (error) {
  fs.writeFileSync('result.json', JSON.stringify({ok: false, error: error.name}));
  process.exitCode = 1;
}
`
}

export class ExerciseSpike {
  readonly owner = `exercise-spike:${randomUUID()}`
  readonly commands: CommandResult[] = []
  workspace?: string
  private active = false
  private readonly abort = new AbortController()
  constructor(readonly output: string, readonly nativePath: string,
    readonly processes = new ProcessManager()) {}
  async stop(): Promise<void> {
    this.abort.abort()
    await this.processes.cleanupOwner(this.owner)
  }
  async run(options: RunOptions): Promise<RunEvidence> {
    if (this.active) throw new SpikeError('BUSY')
    this.active = true
    const signal = options.signal ? AbortSignal.any([options.signal, this.abort.signal]) : this.abort.signal
    const check = () => { if (signal.aborted) throw new SpikeError('STOPPED') }
    const environment: NodeJS.ProcessEnv = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_NOLOGO: '1',
      DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true', MSBUILDDISABLENODEREUSE: '1' }
    const adapter = new WindowsPipedProcessAdapter(this.nativePath, environment)
    const execute = async (phase: Phase, exe: string, args: string[], cwd: string, timeout: number) => {
      check()
      const result = await command(this.processes, this.owner, adapter, exe, args, cwd, timeout, signal,
        pid => options.onSpawn?.(phase, pid))
      this.commands.push(result)
      return result
    }
    const started = performance.now()
    let compileMs = 0, compileCount = 0
    let offline: RunEvidence['offline']
    try {
      check(); options.onPhase?.('prepare'); check()
      if (!isExercise(options.exercise) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.exercise.functionName)
        || options.exercise.parameters.some(p => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name))
        || options.cases.some(args => args.length !== options.exercise.parameters.length
          || args.some((value, i) => !matchesExerciseType(value, options.exercise.parameters[i].type)))
        || Buffer.byteLength(JSON.stringify(options.cases)) > LIMITS.inputBytes) throw new SpikeError('INVALID_INPUT')
      await mkdir(this.output, { recursive: true }); check()
      this.workspace = await mkdtemp(join(this.output, 'session-'))
      const workspace = this.workspace
      environment.DOTNET_CLI_HOME = join(workspace, 'cli-home')
      environment.NUGET_PACKAGES = join(workspace, 'packages')
      const exe = options.language === 'csharp' ? options.dotnet : options.node
      if (!isAbsolute(exe) || basename(exe).toLowerCase() !== (options.language === 'csharp' ? 'dotnet.exe' : 'node.exe')) {
        throw new SpikeError('INVALID_RUNTIME')
      }
      try { await access(exe) } catch { throw new SpikeError('MISSING_RUNTIME') }
      let version: CommandResult
      try { version = await execute('prepare', exe, ['--version'], workspace, LIMITS.probeMs) }
      catch (error) {
        if (error instanceof SpikeError && error.reason === 'SPAWN_FAILED') throw new SpikeError('INVALID_RUNTIME')
        throw error
      }
      if (version.exitCode !== 0 || !(options.language === 'csharp' ? /^\d+\.\d+\.\d+/ : /^v\d+\.\d+\.\d+/).test(version.stdout.trim())) {
        throw new SpikeError('INVALID_RUNTIME')
      }
      if (options.language === 'csharp') {
        if (!/^\d+\.\d+\.\d+$/.test(options.sdk)) throw new SpikeError('INVALID_SDK')
        // Fixed developer evidence target only, not a production version decision.
        if (!options.sdk.startsWith('10.')) throw new SpikeError('PROTOTYPE_REQUIRES_SDK10')
        await writeFile(join(workspace, 'global.json'), JSON.stringify({ sdk: { version: options.sdk, rollForward: 'disable' } }))
        await writeFile(join(workspace, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>')
        await writeFile(join(workspace, 'Exercise.csproj'), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><StartupObject>Driver</StartupObject>
<EnableDefaultCompileItems>false</EnableDefaultCompileItems><UseSharedCompilation>false</UseSharedCompilation>
<NuGetAudit>false</NuGetAudit><RestoreSources></RestoreSources><ImportDirectoryBuildProps>false</ImportDirectoryBuildProps>
<ImportDirectoryBuildTargets>false</ImportDirectoryBuildTargets></PropertyGroup>
<ItemGroup><Compile Include="Solution.cs"/><Compile Include="Driver.cs"/></ItemGroup></Project>`)
        await writeFile(join(workspace, 'Solution.cs'), options.code)
        await writeFile(join(workspace, 'Driver.cs'), harness(options.exercise))
      } else {
        await writeFile(join(workspace, 'solution.cjs'), `${options.code}\nmodule.exports = ${options.exercise.functionName};\n`)
      }
      check()
      const prepareMs = performance.now() - started
      if (options.language === 'csharp') {
        options.onPhase?.('compile'); check()
        const compile = await execute('compile', exe, ['build', join(workspace, 'Exercise.csproj'), '--configuration', 'Release',
          '--disable-build-servers', '-nodeReuse:false', '--configfile', join(workspace, 'NuGet.Config'),
          '-p:NuGetAudit=false', '-p:RestoreSources=', '-p:ImportDirectoryBuildProps=false', '-p:ImportDirectoryBuildTargets=false'], workspace, options.compileTimeoutMs ?? LIMITS.compileMs)
        compileMs = compile.ms; compileCount++
        if (compile.exitCode !== 0) throw new SpikeError('COMPILE_ERROR')
        const assets = JSON.parse(await readFile(join(workspace, 'obj/project.assets.json'), 'utf8'))
        offline = { sources: Object.keys(assets.project.restore.sources ?? {}), libraries: Object.keys(assets.libraries).length }
        // SDK 10 injects its installed library-packs folder despite <clear/>.
        // This is local SDK content, not a remote/package-download dependency.
        const sdkPacks = resolve(dirname(exe), 'library-packs').toLowerCase()
        if (offline.sources.some(source => resolve(source).toLowerCase() !== sdkPacks)
          || offline.libraries !== 0) throw new SpikeError('UNEXPECTED_PACKAGE_DEPENDENCY')
      }
      const results: RunEvidence['results'] = []
      for (const [index, args] of options.cases.entries()) {
        options.onPhase?.('execute'); check()
        const directory = join(workspace, `case-${index}`)
        await mkdir(directory); await writeFile(join(directory, 'input.json'), JSON.stringify(args))
        if (options.language === 'javascript') await writeFile(join(directory, 'driver.cjs'), driver())
        const target = options.language === 'csharp' ? join(workspace, 'bin/Release/net10.0/Exercise.dll') : join(directory, 'driver.cjs')
        const result = await execute('execute', exe, [target], directory, LIMITS.executeMs)
        const resultFile = join(directory, 'result.json')
        let parsed: { ok?: unknown; value?: unknown; error?: unknown }
        try {
          if ((await stat(resultFile)).size > LIMITS.resultBytes) throw new SpikeError('RESULT_LIMIT')
          parsed = JSON.parse(await readFile(resultFile, 'utf8'))
        } catch (error) {
          if (error instanceof SpikeError) throw error
          throw new SpikeError('INVALID_RESULT')
        }
        if (parsed?.ok === false && typeof parsed.error === 'string' && result.exitCode !== 0) {
          results.push({ error: parsed.error, command: result })
        } else if (parsed?.ok === true && result.exitCode === 0 && matchesExerciseType(parsed.value, options.exercise.returnType)) {
          results.push({ value: parsed.value as ExerciseValue, command: result })
        } else throw new SpikeError('INVALID_RESULT')
      }
      return { results, prepareMs, compileMs, compileCount, workspace, offline }
    } finally {
      // Never erase a workspace while owned cleanup is incomplete. Retain failures.
      await this.processes.cleanupOwner(this.owner)
      await this.cleanupWorkspace()
      this.active = false
    }
  }
  private async cleanupWorkspace() {
    if (!this.workspace) return
    const root = resolve(this.output), target = resolve(this.workspace)
    if (dirname(target) !== root || relative(root, target).startsWith('..')
      || !(await lstat(target)).isDirectory() || (await lstat(target)).isSymbolicLink()) throw new SpikeError('UNSAFE_CLEANUP')
    await rm(target, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 })
  }
}

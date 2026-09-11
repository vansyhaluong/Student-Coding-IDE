import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

type WorkspaceState = 'READY' | 'PREFLIGHT_FAILED'

type CommandEvidence = {
  operation: 'sdk-probe' | 'solution-parse' | 'project-evaluation'
  exitCode: number | null
  signal: NodeJS.Signals | null
  elapsedMs: number
  timedOut: boolean
  stdoutBytes: number
  stderrBytes: number
}

type ProjectEvaluation = {
  project: string
  command: CommandEvidence
  jsonParsed: boolean
  targetFramework: string | null
  targetFrameworkIdentifier: string | null
  targetFrameworkVersion: string | null
  projectReferences: string[]
}

type PreflightResult = {
  state: WorkspaceState
  reason: string | null
  commands: CommandEvidence[]
  evaluatedProjects: ProjectEvaluation[]
  discoveredProjects: string[]
  missingProjectReferences: string[]
  workspaceMutations: string[]
  targetExecutionMarkerCreated: boolean
  targetingAvailabilityVerified: boolean
}

type ProbeCase = {
  name: string
  source: string
  kind: 'solution' | 'project' | 'project-mode'
  selected?: string
  expectedState: WorkspaceState
  expectedReason?: string
  expectTargetingResidual?: boolean
  expectProjectCount?: number
}

type ProcessResult = CommandEvidence & { stdout: string; stderr: string }

const spikeRoot = path.resolve(__dirname, '..')
const fixturesRoot = path.join(spikeRoot, 'fixtures')
const dotnet = path.join(spikeRoot, '.dotnet', 'dotnet.exe')
const excludedDiscoveryDirectories = new Set(['.git', 'bin', 'build', 'node_modules', 'obj', 'out'])
const maxProjects = 64
const maxDiscoveryDepth = 8

async function runDotnet(
  cwd: string,
  operation: CommandEvidence['operation'],
  args: string[],
  environmentRoot: string
): Promise<ProcessResult> {
  const started = Date.now()
  const child = spawn(dotnet, args, {
    cwd,
    env: {
      ...process.env,
      DOTNET_CLI_HOME: path.join(environmentRoot, 'dotnet-home'),
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_MULTILEVEL_LOOKUP: '0',
      DOTNET_NOLOGO: '1',
      DOTNET_ROOT: path.dirname(dotnet),
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
      MSBUILDDISABLENODEREUSE: '1',
      NUGET_PACKAGES: path.join(environmentRoot, 'nuget-packages')
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, 20_000)
  const outcome = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
  })
  clearTimeout(timer)
  const stdoutText = Buffer.concat(stdout).toString('utf8')
  const stderrText = Buffer.concat(stderr).toString('utf8')
  return {
    operation,
    ...outcome,
    elapsedMs: Date.now() - started,
    timedOut,
    stdoutBytes: Buffer.byteLength(stdoutText),
    stderrBytes: Buffer.byteLength(stderrText),
    stdout: stdoutText,
    stderr: stderrText
  }
}

function commandEvidence(result: ProcessResult): CommandEvidence {
  return {
    operation: result.operation,
    exitCode: result.exitCode,
    signal: result.signal,
    elapsedMs: result.elapsedMs,
    timedOut: result.timedOut,
    stdoutBytes: result.stdoutBytes,
    stderrBytes: result.stderrBytes
  }
}

function relative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/')
}

function isContained(root: string, target: string): boolean {
  const value = path.relative(root, target)
  return value !== '' && value !== '..' && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value)
}

async function discoverProjects(root: string): Promise<string[]> {
  const projects: string[] = []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > maxDiscoveryDepth) return
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && !excludedDiscoveryDirectories.has(entry.name.toLowerCase())) {
        await visit(path.join(directory, entry.name), depth + 1)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csproj')) {
        projects.push(path.join(directory, entry.name))
        assert(projects.length <= maxProjects, `project discovery exceeded ${maxProjects}`)
      }
    }
  }
  await visit(root, 0)
  return projects.sort((left, right) => left.localeCompare(right))
}

function solutionProjectsFromOutput(solutionPath: string, stdout: string): string[] {
  const projects = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().endsWith('.csproj'))
    .map((line) => path.resolve(path.dirname(solutionPath), line))
  assert(projects.length <= maxProjects, `solution project list exceeded ${maxProjects}`)
  return [...new Set(projects)].sort((left, right) => left.localeCompare(right))
}

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const visit = async (entryPath: string): Promise<void> => {
    const info = await lstat(entryPath)
    if (info.isDirectory()) {
      for (const entry of await readdir(entryPath)) await visit(path.join(entryPath, entry))
      return
    }
    if (info.isFile()) {
      result[relative(root, entryPath)] = createHash('sha256').update(await readFile(entryPath)).digest('hex')
    }
  }
  await visit(root)
  return result
}

function snapshotDifference(before: Record<string, string>, after: Record<string, string>): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...paths].filter((entry) => before[entry] !== after[entry]).sort()
}

async function copyFixture(source: string, runRoot: string): Promise<string> {
  const workspace = path.join(runRoot, 'workspace')
  await cp(source, workspace, {
    recursive: true,
    filter: (entry) => {
      const segments = path.relative(source, entry).split(path.sep).map((segment) => segment.toLowerCase())
      return !segments.some((segment) => excludedDiscoveryDirectories.has(segment))
    }
  })
  return workspace
}

async function evaluateProject(
  workspaceRoot: string,
  project: string,
  environmentRoot: string
): Promise<{ evaluation: ProjectEvaluation; references: string[]; failure: string | null }> {
  const result = await runDotnet(project === workspaceRoot ? workspaceRoot : path.dirname(project), 'project-evaluation', [
    'msbuild',
    project,
    '-nologo',
    '-verbosity:quiet',
    '-interactive:false',
    '-nodeReuse:false',
    '-getProperty:TargetFramework,TargetFrameworks,TargetFrameworkIdentifier,TargetFrameworkVersion',
    '-getItem:ProjectReference'
  ], environmentRoot)
  let parsed: any
  if (result.exitCode === 0 && !result.timedOut) {
    try { parsed = JSON.parse(result.stdout) } catch { parsed = undefined }
  }
  const items = Array.isArray(parsed?.Items?.ProjectReference) ? parsed.Items.ProjectReference : []
  const identities = items
    .map((item: any) => item?.Identity)
    .filter((identity: unknown): identity is string => typeof identity === 'string' && identity.length > 0)
  const references = identities.map((identity: string) => path.resolve(path.dirname(project), identity))
  const evaluation: ProjectEvaluation = {
    project: relative(workspaceRoot, project),
    command: commandEvidence(result),
    jsonParsed: parsed !== undefined,
    targetFramework: parsed?.Properties?.TargetFramework ?? null,
    targetFrameworkIdentifier: parsed?.Properties?.TargetFrameworkIdentifier ?? null,
    targetFrameworkVersion: parsed?.Properties?.TargetFrameworkVersion ?? null,
    projectReferences: identities
  }
  if (result.timedOut) return { evaluation, references, failure: 'PROJECT_EVALUATION_TIMEOUT' }
  if (result.exitCode !== 0) return { evaluation, references, failure: 'PROJECT_EVALUATION_FAILED' }
  if (!parsed) return { evaluation, references, failure: 'PROJECT_EVALUATION_NOT_MACHINE_READABLE' }
  return { evaluation, references, failure: null }
}

async function preflight(probe: ProbeCase): Promise<PreflightResult> {
  const runRoot = await mkdtemp(path.join(tmpdir(), `student-ide-csharp-preflight-${probe.name}-`))
  try {
    const workspace = await copyFixture(path.join(fixturesRoot, probe.source), runRoot)
    const before = await snapshot(workspace)
    const commands: CommandEvidence[] = []
    const evaluatedProjects: ProjectEvaluation[] = []
    const missingProjectReferences: string[] = []
    let reason: string | null = null

    const sdk = await runDotnet(workspace, 'sdk-probe', ['--version'], runRoot)
    commands.push(commandEvidence(sdk))
    if (sdk.exitCode !== 0 || sdk.timedOut) reason = 'SDK_SELECTION_FAILED'

    let solutionProjects: string[] | null = null
    if (!reason && probe.kind === 'solution') {
      const selected = path.join(workspace, probe.selected!)
      const solution = await runDotnet(workspace, 'solution-parse', ['sln', selected, 'list'], runRoot)
      commands.push(commandEvidence(solution))
      if (solution.exitCode !== 0 || solution.timedOut) reason = 'SOLUTION_PARSE_FAILED'
      else solutionProjects = solutionProjectsFromOutput(selected, solution.stdout)
    }

    const discovered = probe.kind === 'project'
      ? [path.join(workspace, probe.selected!)]
      : probe.kind === 'solution'
        ? solutionProjects ?? []
        : await discoverProjects(workspace)
    const queue = [...discovered]
    const visited = new Set<string>()

    while (!reason && queue.length > 0) {
      const project = queue.shift()!
      const identity = project.toLowerCase()
      if (visited.has(identity)) continue
      visited.add(identity)
      if (!isContained(workspace, project)) {
        reason = 'PROJECT_REFERENCE_OUTSIDE_WORKSPACE'
        break
      }
      try {
        const info = await lstat(project)
        if (!info.isFile()) throw new Error('not a file')
      } catch {
        missingProjectReferences.push(relative(workspace, project))
        reason = 'PROJECT_REFERENCE_MISSING'
        break
      }
      const evaluated = await evaluateProject(workspace, project, runRoot)
      commands.push(evaluated.evaluation.command)
      evaluatedProjects.push(evaluated.evaluation)
      if (evaluated.failure) {
        reason = evaluated.failure
        break
      }
      for (const reference of evaluated.references) {
        if (!isContained(workspace, reference)) {
          missingProjectReferences.push(relative(workspace, reference))
          reason = 'PROJECT_REFERENCE_OUTSIDE_WORKSPACE'
          break
        }
        try {
          const info = await lstat(reference)
          if (!info.isFile()) throw new Error('not a file')
          queue.push(reference)
        } catch {
          missingProjectReferences.push(relative(workspace, reference))
          reason = 'PROJECT_REFERENCE_MISSING'
          break
        }
      }
    }

    if (!reason && discovered.length === 0) reason = 'NO_PROJECTS_DISCOVERED'
    const after = await snapshot(workspace)
    const workspaceMutations = snapshotDifference(before, after)
    const markerCreated = Object.keys(after).some((entry) => entry.endsWith('preflight-must-not-create.txt'))
    assert.deepEqual(workspaceMutations, [], `${probe.name}: preflight modified workspace`)
    assert.equal(markerCreated, false, `${probe.name}: preflight executed a project target`)

    return {
      state: reason ? 'PREFLIGHT_FAILED' : 'READY',
      reason,
      commands,
      evaluatedProjects,
      discoveredProjects: discovered.map((project) => relative(workspace, project)),
      missingProjectReferences,
      workspaceMutations,
      targetExecutionMarkerCreated: markerCreated,
      targetingAvailabilityVerified: false
    }
  } finally {
    await rm(runRoot, { recursive: true, force: true })
  }
}

const cases: ProbeCase[] = [
  { name: 'valid-sln', source: 'solution-sln', kind: 'solution', selected: 'SpikeSolution.sln', expectedState: 'READY', expectProjectCount: 1 },
  { name: 'invalid-sln', source: 'preflight/invalid-sln', kind: 'solution', selected: 'Broken.sln', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'SOLUTION_PARSE_FAILED' },
  { name: 'missing-sln-project', source: 'preflight/missing-solution-project', kind: 'solution', selected: 'MissingProject.sln', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'PROJECT_REFERENCE_MISSING' },
  { name: 'valid-slnx', source: 'solution-slnx', kind: 'solution', selected: 'SpikeSolution.slnx', expectedState: 'READY', expectProjectCount: 1 },
  { name: 'invalid-slnx', source: 'preflight/invalid-slnx', kind: 'solution', selected: 'Broken.slnx', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'SOLUTION_PARSE_FAILED' },
  { name: 'valid-csproj', source: 'solution-sln/SpikeApp', kind: 'project', selected: 'SpikeApp.csproj', expectedState: 'READY', expectProjectCount: 1 },
  { name: 'malformed-csproj', source: 'invalid-workspace', kind: 'project', selected: 'Broken.csproj', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'PROJECT_EVALUATION_FAILED' },
  { name: 'missing-project-reference', source: 'preflight/missing-reference', kind: 'project', selected: 'MissingReference.csproj', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'PROJECT_REFERENCE_MISSING' },
  { name: 'unknown-project-sdk', source: 'preflight/unknown-project-sdk', kind: 'project', selected: 'UnknownSdk.csproj', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'PROJECT_EVALUATION_FAILED' },
  { name: 'unavailable-targeting-pack', source: 'preflight/targeting-pack', kind: 'project', selected: 'UnavailableTarget.csproj', expectedState: 'READY', expectTargetingResidual: true },
  { name: 'unavailable-global-json-sdk', source: 'preflight/unavailable-sdk', kind: 'project', selected: 'UnavailableSdk.csproj', expectedState: 'PREFLIGHT_FAILED', expectedReason: 'SDK_SELECTION_FAILED' },
  { name: 'multiple-csproj-project-mode', source: 'project-mode', kind: 'project-mode', expectedState: 'READY', expectProjectCount: 2 }
]

async function main(): Promise<void> {
  const results: Record<string, PreflightResult> = {}
  for (const probe of cases) {
    process.stderr.write(`[preflight] ${probe.name}: start\n`)
    const result = await preflight(probe)
    assert.equal(result.state, probe.expectedState, `${probe.name}: state`)
    if (probe.expectedReason) assert.equal(result.reason, probe.expectedReason, `${probe.name}: reason`)
    if (probe.expectProjectCount !== undefined) assert.equal(result.evaluatedProjects.length, probe.expectProjectCount, `${probe.name}: evaluated projects`)
    if (probe.expectTargetingResidual) {
      assert.equal(result.state, 'READY')
      assert.equal(result.targetingAvailabilityVerified, false)
    }
    results[probe.name] = result
    process.stderr.write(`[preflight] ${probe.name}: ${result.state}\n`)
  }
  const evidenceDir = path.join(spikeRoot, 'evidence')
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(path.join(evidenceDir, 'preflight-results.json'), JSON.stringify({
    mechanism: {
      solution: 'dotnet sln <selected> list exit code plus bounded project discovery',
      project: 'dotnet msbuild evaluation-only getProperty/getItem JSON plus Main-owned ProjectReference checks',
      executesTargets: false,
      invokesRestore: false,
      writesWorkspace: false
    },
    results
  }, null, 2) + '\n', 'utf8')
  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

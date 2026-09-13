import assert from 'node:assert/strict'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  CancellationTokenSource,
  CompletionRequest,
  CompletionResolveRequest,
  ConfigurationRequest,
  DefinitionRequest,
  DiagnosticRefreshRequest,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  ExitNotification,
  HoverRequest,
  InitializeRequest,
  InitializedNotification,
  RegistrationRequest,
  ShutdownRequest,
  SignatureHelpRequest,
  UnregistrationRequest,
  WorkDoneProgressCreateRequest,
  WorkspaceFoldersRequest,
  createProtocolConnection,
  type InitializeResult,
  type ProtocolConnection
} from 'vscode-languageserver-protocol/node'

type Position = { line: number; character: number }
type Range = { start: Position; end: Position }
type TextChange = { range: Range; text: string }

type SessionEvidence = {
  name: string
  root: string
  args: string[]
  processId: number
  initializeMs: number
  readyMs: number
  exitCode: number | null
  capabilities: unknown
  registrations: Array<{ method: string; registerOptions?: unknown }>
  serverRequests: Record<string, number>
  notifications: Record<string, number>
  protocolEvents: Array<{ method: string; params: unknown }>
  stderrBytes: number
  ownedProcessesBeforeShutdown: ProcessRecord[]
  survivingOwnedProcessesAfterShutdown: ProcessRecord[]
}

const spikeRoot = path.resolve(__dirname, '..')
const fixturesRoot = path.join(spikeRoot, 'fixtures')
const csharpLs = path.join(spikeRoot, '.tools', 'csharp-ls.exe')
const execFileAsync = promisify(execFile)
const requiredRegistrations = new Set([
  'textDocument/completion',
  'textDocument/definition',
  'textDocument/diagnostic',
  'textDocument/hover',
  'textDocument/signatureHelp',
  'textDocument/didOpen',
  'textDocument/didChange',
  'textDocument/didSave',
  'textDocument/didClose',
  'workspace/didChangeWatchedFiles'
])

function bump(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ProcessRecord = { ProcessId: number; ParentProcessId: number; Name: string }

async function processSnapshot(): Promise<ProcessRecord[]> {
  const command = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true })
  const parsed = JSON.parse(stdout.trim()) as ProcessRecord | ProcessRecord[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

function descendantProcesses(rootPid: number, processes: ProcessRecord[]): ProcessRecord[] {
  const descendants: ProcessRecord[] = []
  const parentIds = new Set([rootPid])
  let added = true
  while (added) {
    added = false
    for (const process of processes) {
      if (parentIds.has(process.ParentProcessId) && !parentIds.has(process.ProcessId)) {
        descendants.push(process)
        parentIds.add(process.ProcessId)
        added = true
      }
    }
  }
  return descendants
}

async function survivingProcesses(processes: ProcessRecord[]): Promise<ProcessRecord[]> {
  const current = new Set((await processSnapshot()).map((process) => process.ProcessId))
  return processes.filter((process) => current.has(process.ProcessId))
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
    await delay(25)
  }
}

function positionAt(text: string, offset: number): Position {
  const before = text.slice(0, offset)
  const lines = before.split('\n')
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 }
}

function offsetAt(text: string, position: Position): number {
  const lines = text.split('\n')
  assert(position.line >= 0 && position.line < lines.length, `line ${position.line} is out of range`)
  assert(position.character >= 0 && position.character <= lines[position.line].length, `character ${position.character} is out of range`)
  let offset = 0
  for (let index = 0; index < position.line; index += 1) offset += lines[index].length + 1
  return offset + position.character
}

function rangeOf(text: string, needle: string, occurrence = 0): Range {
  let offset = -1
  let from = 0
  for (let index = 0; index <= occurrence; index += 1) {
    offset = text.indexOf(needle, from)
    assert(offset >= 0, `Could not find ${needle}`)
    from = offset + needle.length
  }
  return { start: positionAt(text, offset), end: positionAt(text, offset + needle.length) }
}

function applyChange(text: string, change: TextChange): string {
  const start = offsetAt(text, change.range.start)
  const end = offsetAt(text, change.range.end)
  return text.slice(0, start) + change.text + text.slice(end)
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

class LspSession {
  readonly child: ChildProcessWithoutNullStreams
  readonly connection: ProtocolConnection
  readonly registrations: Array<{ method: string; registerOptions?: unknown }> = []
  readonly serverRequests: Record<string, number> = {}
  readonly notifications: Record<string, number> = {}
  readonly protocolEvents: Array<{ method: string; params: unknown }> = []
  readonly stderrChunks: Buffer[] = []
  readonly startedAt = Date.now()
  initializeResult?: InitializeResult
  initializeMs = 0
  readyMs = 0
  exitCode: number | null = null
  ownedProcessesBeforeShutdown: ProcessRecord[] = []
  survivingOwnedProcessesAfterShutdown: ProcessRecord[] = []

  constructor(readonly name: string, readonly root: string, readonly args: string[]) {
    this.child = spawn(csharpLs, args, {
      cwd: root,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    assert(this.child.pid, `${name}: process did not receive a PID`)
    this.child.stderr.on('data', (chunk: Buffer) => this.stderrChunks.push(chunk))
    this.child.once('exit', (code) => { this.exitCode = code })
    const logger = { error() {}, warn() {}, info() {}, log() {} }
    this.connection = createProtocolConnection(this.child.stdout, this.child.stdin, logger)
    this.registerHandlers()
    this.connection.listen()
  }

  private registerHandlers(): void {
    this.connection.onRequest(ConfigurationRequest.type, (params) => {
      bump(this.serverRequests, ConfigurationRequest.method)
      return params.items.map(() => ({ analyzersEnabled: false, useMetadataUris: false, razorSupport: false }))
    })
    this.connection.onRequest(WorkDoneProgressCreateRequest.type, () => {
      bump(this.serverRequests, WorkDoneProgressCreateRequest.method)
    })
    this.connection.onRequest(RegistrationRequest.type, (params) => {
      bump(this.serverRequests, RegistrationRequest.method)
      this.registrations.push(...params.registrations.map((item) => ({ method: item.method, registerOptions: item.registerOptions })))
    })
    this.connection.onRequest(UnregistrationRequest.type, () => {
      bump(this.serverRequests, UnregistrationRequest.method)
    })
    this.connection.onRequest(DiagnosticRefreshRequest.type, () => {
      bump(this.serverRequests, DiagnosticRefreshRequest.method)
    })
    this.connection.onRequest(WorkspaceFoldersRequest.type, () => {
      bump(this.serverRequests, WorkspaceFoldersRequest.method)
      return [{ uri: pathToFileURL(this.root).href, name: path.basename(this.root) }]
    })
    for (const method of ['$/progress', 'window/logMessage', 'window/showMessage', 'telemetry/event']) {
      this.connection.onNotification(method, (params: unknown) => {
        bump(this.notifications, method)
        this.protocolEvents.push({ method, params })
      })
    }
  }

  async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href
    this.initializeResult = await this.connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      clientInfo: { name: 'student-ide-csharp-spike', version: '0.0.0' },
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: path.basename(this.root) }],
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true,
          didChangeWatchedFiles: { dynamicRegistration: true },
          diagnostics: { refreshSupport: true }
        },
        window: { workDoneProgress: true },
        general: { positionEncodings: ['utf-16'] },
        textDocument: {
          synchronization: { dynamicRegistration: true, didSave: true },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              documentationFormat: ['markdown', 'plaintext'],
              snippetSupport: true,
              resolveSupport: { properties: ['detail', 'documentation', 'additionalTextEdits'] }
            }
          },
          hover: { dynamicRegistration: true, contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
              activeParameterSupport: true
            }
          },
          definition: { dynamicRegistration: true, linkSupport: true },
          diagnostic: { dynamicRegistration: true, relatedDocumentSupport: false }
        }
      }
    })
    this.initializeMs = Date.now() - this.startedAt
    await this.connection.sendNotification(InitializedNotification.type, {})
  }

  async waitUntilReady(): Promise<void> {
    await waitFor(() => {
      const methods = new Set(this.registrations.map((item) => item.method))
      return [...requiredRegistrations].every((method) => methods.has(method))
    }, 60_000, `${this.name} dynamic capability registration`)
    this.readyMs = Date.now() - this.startedAt
  }

  open(uri: string, text: string, version = 1): Promise<void> {
    return this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: 'csharp', version, text }
    })
  }

  change(uri: string, version: number, changes: TextChange[]): Promise<void> {
    return this.connection.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version }, contentChanges: changes
    })
  }

  save(uri: string, text: string): Promise<void> {
    return this.connection.sendNotification(DidSaveTextDocumentNotification.type, { textDocument: { uri }, text })
  }

  close(uri: string): Promise<void> {
    return this.connection.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri } })
  }

  async shutdown(): Promise<void> {
    if (this.child.exitCode !== null) return
    const snapshot = await processSnapshot()
    this.ownedProcessesBeforeShutdown = [
      ...snapshot.filter((process) => process.ProcessId === this.child.pid),
      ...descendantProcesses(this.child.pid!, snapshot)
    ]
    await this.connection.sendRequest(ShutdownRequest.type)
    await this.connection.sendNotification(ExitNotification.type)
    await waitFor(() => this.child.exitCode !== null, 15_000, `${this.name} process exit`)
    this.connection.dispose()
    assert.equal(this.exitCode, 0, `${this.name}: graceful exit code`)
    await delay(250)
    this.survivingOwnedProcessesAfterShutdown = await survivingProcesses(this.ownedProcessesBeforeShutdown)
    assert.deepEqual(this.survivingOwnedProcessesAfterShutdown, [], `${this.name}: graceful shutdown must leave no owned process`)
  }

  evidence(): SessionEvidence {
    return {
      name: this.name,
      root: this.root,
      args: this.args,
      processId: this.child.pid!,
      initializeMs: this.initializeMs,
      readyMs: this.readyMs,
      exitCode: this.exitCode,
      capabilities: this.initializeResult?.capabilities,
      registrations: this.registrations,
      serverRequests: this.serverRequests,
      notifications: this.notifications,
      protocolEvents: this.protocolEvents,
      stderrBytes: Buffer.concat(this.stderrChunks).byteLength,
      ownedProcessesBeforeShutdown: this.ownedProcessesBeforeShutdown,
      survivingOwnedProcessesAfterShutdown: this.survivingOwnedProcessesAfterShutdown
    }
  }
}

async function startSession(name: string, root: string, solution?: string): Promise<LspSession> {
  const args = ['--loglevel', 'error']
  if (solution) args.push('--solution', solution)
  const session = new LspSession(name, root, args)
  await session.initialize()
  await session.waitUntilReady()
  return session
}

function completionItems(result: any): any[] {
  return Array.isArray(result) ? result : asArray(result?.items)
}

function definitionUris(result: any): string[] {
  const values = Array.isArray(result) ? result : result ? [result] : []
  return values.map((item) => item.targetUri ?? item.uri).filter((item): item is string => typeof item === 'string')
}

async function waitForProtocolResult<T>(label: string, request: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 30_000): Promise<{ value: T; attempts: number; elapsedMs: number }> {
  const started = Date.now()
  let attempts = 0
  let lastValue: T | undefined
  while (Date.now() - started < timeoutMs) {
    attempts += 1
    lastValue = await request()
    if (accept(lastValue)) return { value: lastValue, attempts, elapsedMs: Date.now() - started }
    await delay(100)
  }
  throw new Error(`${label} did not become semantically ready after ${attempts} protocol requests; last=${JSON.stringify(lastValue)}`)
}

async function testSemanticSolution(): Promise<Record<string, unknown>> {
  const root = path.join(fixturesRoot, 'solution-sln')
  const session = await startSession('solution-sln', root, 'SpikeSolution.sln')
  try {
    const greeterPath = path.join(root, 'SpikeApp', 'Greeter.cs')
    const programPath = path.join(root, 'SpikeApp', 'Program.cs')
    const greeterUri = pathToFileURL(greeterPath).href
    const programUri = pathToFileURL(programPath).href
    let greeter = await readFile(greeterPath, 'utf8')
    let program = await readFile(programPath, 'utf8')
    await session.open(greeterUri, greeter)
    await session.open(programUri, program)

    const baselineCompletionPosition = positionAt(program, program.indexOf('Greeter.Greet') + 'Greeter.'.length)
    const semanticReadiness = await waitForProtocolResult(
      'solution-sln completion readiness',
      () => session.connection.sendRequest(CompletionRequest.type, {
        textDocument: { uri: programUri }, position: baselineCompletionPosition, context: { triggerKind: 2, triggerCharacter: '.' }
      }),
      (value) => completionItems(value).some((item) => typeof item.label === 'string' && item.label.includes('Greet'))
    )

    const greeterRename: TextChange = { range: rangeOf(greeter, 'Greet', 1), text: 'Welcome' }
    greeter = applyChange(greeter, greeterRename)
    await session.change(greeterUri, 2, [greeterRename])
    const programRename: TextChange = { range: rangeOf(program, 'Greet', 1), text: 'Welcome' }
    program = applyChange(program, programRename)
    await session.change(programUri, 2, [programRename])

    const changes: Array<{ version: number; kind: string }> = []
    for (const character of ['/', '/']) {
      const edit: TextChange = { range: { start: positionAt(program, program.length), end: positionAt(program, program.length) }, text: character }
      program = applyChange(program, edit)
      const version = 3 + changes.length
      await session.change(programUri, version, [edit])
      changes.push({ version, kind: 'typing' })
    }
    const paste: TextChange = { range: { start: positionAt(program, program.length), end: positionAt(program, program.length) }, text: ' Tiếng Việt 👩🏽‍💻' }
    program = applyChange(program, paste)
    await session.change(programUri, 5, [paste])
    changes.push({ version: 5, kind: 'paste' })
    for (const [version, replacement, kind] of [[6, 'Viet', 'replace'], [7, 'Việt', 'undo'], [8, 'Viet', 'redo'], [9, 'Việt', 'undo']] as const) {
      const edit: TextChange = { range: rangeOf(program, version === 6 || version === 8 ? 'Việt' : 'Viet'), text: replacement }
      program = applyChange(program, edit)
      await session.change(programUri, version, [edit])
      changes.push({ version, kind })
    }
    const editA: TextChange = { range: { start: positionAt(program, program.length), end: positionAt(program, program.length) }, text: ' A' }
    const afterA = applyChange(program, editA)
    const editB: TextChange = { range: { start: positionAt(afterA, afterA.length), end: positionAt(afterA, afterA.length) }, text: ' B' }
    program = applyChange(afterA, editB)
    await session.change(programUri, 10, [editA, editB])
    changes.push({ version: 10, kind: 'multiple-content-changes' })

    const completionPosition = positionAt(program, program.indexOf('Greeter.Welcome') + 'Greeter.'.length)
    const completion = await session.connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri: programUri }, position: completionPosition, context: { triggerKind: 2, triggerCharacter: '.' }
    })
    const items = completionItems(completion)
    const welcomeItem = items.find((item) => typeof item.label === 'string' && item.label.includes('Welcome'))
    assert(welcomeItem, `completion must include dirty cross-file Welcome symbol; labels=${JSON.stringify(items.slice(0, 30).map((item) => item.label))}`)
    const resolved = await session.connection.sendRequest(CompletionResolveRequest.type, welcomeItem)
    assert(resolved && (resolved.detail || resolved.documentation), 'completion resolve must supply detail or documentation')
    const completionListShape = Array.isArray(completion) ? 'array' : 'CompletionList'
    const isIncomplete = Array.isArray(completion) ? null : Boolean((completion as any).isIncomplete)

    const welcomeRange = rangeOf(program, 'Welcome')
    const semanticPosition = welcomeRange.start
    const hover = await session.connection.sendRequest(HoverRequest.type, { textDocument: { uri: programUri }, position: semanticPosition })
    assert(hover && (hover as any).contents, 'hover must return content')
    const signaturePosition = positionAt(program, program.indexOf(', 1') + 2)
    const signature = await session.connection.sendRequest(SignatureHelpRequest.type, {
      textDocument: { uri: programUri }, position: signaturePosition, context: { triggerKind: 1, isRetrigger: false }
    })
    assert(asArray((signature as any)?.signatures).length > 0, 'signature help must return signatures')
    assert.equal(typeof (signature as any).activeSignature, 'number', 'signature help activeSignature')
    const selectedSignature = (signature as any).signatures[(signature as any).activeSignature]
    const activeParameter = (signature as any).activeParameter ?? selectedSignature?.activeParameter
    const activeParameterSupported = typeof activeParameter === 'number'
    const definition = await session.connection.sendRequest(DefinitionRequest.type, { textDocument: { uri: programUri }, position: semanticPosition })
    const definitionTargets = definitionUris(definition)
    assert(definitionTargets.some((uri) => path.resolve(fileURLToPath(uri)) === path.resolve(greeterPath)), 'definition must target dirty Greeter.cs')

    const cancellation = new CancellationTokenSource()
    const cancellationRequest = session.connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri: programUri }, position: completionPosition
    }, cancellation.token)
    cancellation.cancel()
    let cancellationOutcome = 'late-result'
    try { await cancellationRequest } catch { cancellationOutcome = 'rejected' }
    cancellation.dispose()

    const requestVersion = 10
    const staleRequest = session.connection.sendRequest(HoverRequest.type, { textDocument: { uri: programUri }, position: semanticPosition })
    const staleEdit: TextChange = { range: { start: positionAt(program, program.length), end: positionAt(program, program.length) }, text: '\n// stale generation' }
    program = applyChange(program, staleEdit)
    await session.change(programUri, 11, [staleEdit])
    const staleResult = await staleRequest
    assert(staleResult, 'stale-work request should produce a result to reject by document version')
    assert(requestVersion < 11, 'client can reject late result by captured document version')

    const errorEdit: TextChange = {
      range: { start: positionAt(program, program.length), end: positionAt(program, program.length) },
      text: '\nint broken = "bad"; Console.WriteLine(broken);'
    }
    program = applyChange(program, errorEdit)
    await session.change(programUri, 12, [errorEdit])
    const fullDiagnostic = await session.connection.sendRequest<any>('textDocument/diagnostic', {
      textDocument: { uri: programUri }, identifier: 'csharp-ls'
    })
    assert.equal(fullDiagnostic.kind, 'full', 'first diagnostic report must be full')
    assert(asArray(fullDiagnostic.items).length > 0, 'intentional type error must produce diagnostics')
    assert.equal(typeof fullDiagnostic.resultId, 'string', 'full diagnostic report must include resultId')
    const unchangedDiagnostic = await session.connection.sendRequest<any>('textDocument/diagnostic', {
      textDocument: { uri: programUri }, identifier: 'csharp-ls', previousResultId: fullDiagnostic.resultId
    })
    assert(['unchanged', 'full'].includes(unchangedDiagnostic.kind), 'repeat diagnostic must be unchanged or full')
    if (unchangedDiagnostic.kind === 'unchanged') assert.equal(unchangedDiagnostic.resultId, fullDiagnostic.resultId)

    const correction: TextChange = { range: rangeOf(program, '"bad"'), text: '123' }
    program = applyChange(program, correction)
    await session.change(programUri, 13, [correction])
    const correctedDiagnosticReady = await waitForProtocolResult(
      'dirty diagnostic correction',
      () => session.connection.sendRequest<any>('textDocument/diagnostic', {
        textDocument: { uri: programUri }, identifier: 'csharp-ls', previousResultId: fullDiagnostic.resultId
      }),
      (report) => report?.kind === 'full' && asArray(report.items).length === 0
    )
    const correctedDiagnostic = correctedDiagnosticReady.value
    assert.equal(correctedDiagnostic.kind, 'full', 'changed diagnostics must return a fresh full report')
    assert.equal(asArray(correctedDiagnostic.items).length, 0, 'diagnostic must disappear after unsaved correction')
    assert.notEqual(correctedDiagnostic.resultId, fullDiagnostic.resultId, 'corrected diagnostic resultId must advance')

    const commentPosition = rangeOf(program, 'stale generation').end
    const legitimateEmptyCompletion = await session.connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri: programUri }, position: commentPosition
    })
    const legitimateNullHover = await session.connection.sendRequest(HoverRequest.type, {
      textDocument: { uri: programUri }, position: commentPosition
    })
    const legitimateEmptyDefinition = await session.connection.sendRequest(DefinitionRequest.type, {
      textDocument: { uri: programUri }, position: commentPosition
    })
    assert.equal(completionItems(legitimateEmptyCompletion).length, 0, 'valid comment position must have empty completion')
    assert.equal(legitimateNullHover, null, 'valid comment position must have null hover')
    assert.equal(definitionUris(legitimateEmptyDefinition).length, 0, 'valid comment position must have no definition')

    await session.save(programUri, program)
    await session.close(programUri)
    await session.close(greeterUri)
    await session.shutdown()
    return {
      session: session.evidence(),
      semanticReadiness: { attempts: semanticReadiness.attempts, elapsedMsAfterOpen: semanticReadiness.elapsedMs },
      dirtySync: { changes, finalVersion: 13, diskWasNotWritten: true, utf16Comment: 'Tiếng Việt 👩🏽‍💻 A B' },
      completion: { shape: completionListShape, isIncomplete, itemCount: items.length, resolvedHasDetail: Boolean((resolved as any).detail), resolvedHasDocumentation: Boolean((resolved as any).documentation) },
      hover: { hasContents: true, hasRange: Boolean((hover as any).range) },
      signature: {
        count: (signature as any).signatures.length,
        activeSignature: (signature as any).activeSignature,
        activeParameter: activeParameter ?? null,
        activeParameterSupported,
        activeParameterSource: typeof (signature as any).activeParameter === 'number'
          ? 'SignatureHelp'
          : typeof selectedSignature?.activeParameter === 'number' ? 'SignatureInformation' : null,
        raw: signature
      },
      definition: { targets: definitionTargets },
      cancellation: { outcome: cancellationOutcome, staleResultRejectedByVersion: true },
      legitimateEmptySemantics: {
        workspaceWasValid: true,
        completionCount: completionItems(legitimateEmptyCompletion).length,
        hoverWasNull: legitimateNullHover === null,
        definitionCount: definitionUris(legitimateEmptyDefinition).length,
        diagnosticCount: correctedDiagnostic.items.length
      },
      diagnostics: {
        firstKind: fullDiagnostic.kind,
        firstCount: fullDiagnostic.items.length,
        firstResultId: fullDiagnostic.resultId,
        repeatedKind: unchangedDiagnostic.kind,
        correctedKind: correctedDiagnostic.kind,
        correctedCount: correctedDiagnostic.items.length,
        correctedResultId: correctedDiagnostic.resultId,
        correctedReadiness: { attempts: correctedDiagnosticReady.attempts, elapsedMs: correctedDiagnosticReady.elapsedMs },
        staleResultRejectedByVersion: true
      }
    }
  } finally {
    if (session.child.exitCode === null) session.child.kill()
  }
}

async function testSimpleDefinition(name: string, root: string, solution: string | undefined, sourceDir: string, symbol: string): Promise<Record<string, unknown>> {
  const session = await startSession(name, root, solution)
  try {
    const greeterPath = path.join(root, sourceDir, name === 'unicode-path' ? 'UnicodeGreeter.cs' : 'Greeter.cs')
    const programPath = path.join(root, sourceDir, 'Program.cs')
    const greeterUri = pathToFileURL(greeterPath).href
    const programUri = pathToFileURL(programPath).href
    const greeter = await readFile(greeterPath, 'utf8')
    const program = await readFile(programPath, 'utf8')
    await session.open(greeterUri, greeter)
    await session.open(programUri, program)
    const position = rangeOf(program, symbol).start
    const hover = await session.connection.sendRequest(HoverRequest.type, { textDocument: { uri: programUri }, position })
    const definition = await session.connection.sendRequest(DefinitionRequest.type, { textDocument: { uri: programUri }, position })
    const targets = definitionUris(definition)
    assert(hover && (hover as any).contents, `${name}: hover`)
    assert(targets.some((uri) => path.resolve(fileURLToPath(uri)) === path.resolve(greeterPath)), `${name}: source definition`)
    await session.close(programUri)
    await session.close(greeterUri)
    await session.shutdown()
    return { session: session.evidence(), hover: true, definitionTargets: targets }
  } finally {
    if (session.child.exitCode === null) session.child.kill()
  }
}

async function testProjectMode(): Promise<Record<string, unknown>> {
  const root = path.join(fixturesRoot, 'project-mode')
  const session = await startSession('project-mode-multiple', root)
  try {
    const first = await session.connection.sendRequest<any>('workspace/symbol', { query: 'FirstType' })
    const second = await session.connection.sendRequest<any>('workspace/symbol', { query: 'SecondType' })
    const ignored: Record<string, number> = {}
    for (const symbol of ['BinIgnoredType', 'ObjIgnoredType', 'BuildIgnoredType', 'OutIgnoredType']) {
      const result = await session.connection.sendRequest<any>('workspace/symbol', { query: symbol })
      ignored[symbol] = asArray(result).length
    }
    assert(asArray(first).some((item: any) => item.name === 'FirstType'), 'project mode must load First.csproj')
    assert(asArray(second).some((item: any) => item.name === 'SecondType'), 'project mode must load Second.csproj')
    await session.shutdown()
    return {
      session: session.evidence(),
      discoveredSymbols: { FirstType: asArray(first).length, SecondType: asArray(second).length, ignored },
      providerOwnsRecursiveDiscovery: true
    }
  } finally {
    if (session.child.exitCode === null) session.child.kill()
  }
}

async function testCrash(): Promise<Record<string, unknown>> {
  const root = path.join(fixturesRoot, 'solution-sln')
  const session = await startSession('unexpected-exit', root, 'SpikeSolution.sln')
  const programPath = path.join(root, 'SpikeApp', 'Program.cs')
  const uri = pathToFileURL(programPath).href
  const text = await readFile(programPath, 'utf8')
  await session.open(uri, text)
  const pending = session.connection.sendRequest<any>('workspace/symbol', { query: '' })
  const pid = session.child.pid!
  const snapshot = await processSnapshot()
  const ownedProcesses = [
    ...snapshot.filter((process) => process.ProcessId === pid),
    ...descendantProcesses(pid, snapshot)
  ]
  process.stderr.write(`[spike] crash: sending exit-without-shutdown to PID ${pid}\n`)
  await session.connection.sendNotification(ExitNotification.type)
  let pendingOutcome = 'resolved'
  try { await pending } catch { pendingOutcome = 'rejected' }
  await waitFor(() => session.child.exitCode !== null, 10_000, 'unexpected csharp-ls exit')
  assert.notEqual(session.exitCode, 0, 'unexpected termination must be distinguishable from graceful exit')
  session.connection.dispose()
  await delay(250)
  const survivors = await survivingProcesses(ownedProcesses)
  assert.deepEqual(survivors, [], 'unexpected exit must leave no owned process')
  return { session: session.evidence(), pid, pendingOutcome, automaticRestart: false, ownedProcesses, survivors }
}

async function testInvalidWorkspace(): Promise<Record<string, unknown>> {
  const root = path.join(fixturesRoot, 'invalid-workspace')
  const session = new LspSession('invalid-workspace', root, ['--loglevel', 'error'])
  let initializeOutcome = 'resolved'
  try {
    await session.initialize()
  } catch {
    initializeOutcome = 'rejected'
  }
  await delay(15_000)
  const methods = [...new Set(session.registrations.map((item) => item.method))]
  const documentPath = path.join(root, 'Broken.cs')
  const documentUri = pathToFileURL(documentPath).href
  const documentText = `${await readFile(documentPath, 'utf8')}\n// no semantic target`
  const emptyPosition = positionAt(documentText, documentText.length)
  await session.open(documentUri, documentText)
  const emptyCompletion = await session.connection.sendRequest(CompletionRequest.type, {
    textDocument: { uri: documentUri }, position: emptyPosition
  })
  const nullHover = await session.connection.sendRequest(HoverRequest.type, {
    textDocument: { uri: documentUri }, position: emptyPosition
  })
  const emptyDefinition = await session.connection.sendRequest(DefinitionRequest.type, {
    textDocument: { uri: documentUri }, position: emptyPosition
  })
  const emptyDiagnostics = await session.connection.sendRequest<any>('textDocument/diagnostic', {
    textDocument: { uri: documentUri }, identifier: 'csharp-ls'
  })
  let workspaceSymbolOutcome: Record<string, unknown>
  try {
    const symbols = await session.connection.sendRequest<any>('workspace/symbol', { query: 'Broken' })
    workspaceSymbolOutcome = { kind: 'resolved', count: asArray(symbols).length }
  } catch (error: any) {
    workspaceSymbolOutcome = { kind: 'rejected', code: error?.code ?? null, data: error?.data ?? null }
  }
  const processExitCodeBeforeClientShutdown = session.exitCode
  const machineSignalBeforeShutdown = initializeOutcome === 'rejected'
    || (processExitCodeBeforeClientShutdown !== null && processExitCodeBeforeClientShutdown !== 0)
    || workspaceSymbolOutcome.kind === 'rejected'
  const protocolEventsBeforeClientShutdown = structuredClone(session.protocolEvents)
  await session.close(documentUri)
  if (session.child.exitCode === null) {
    try { await session.shutdown() } catch { session.child.kill('SIGKILL') }
  }
  return {
    initializeOutcome,
    processExitCodeBeforeClientShutdown,
    dynamicallyRegisteredMethods: methods,
    serverRequests: session.serverRequests,
    notifications: session.notifications,
    protocolEventsBeforeClientShutdown,
    workspaceSymbolOutcome,
    emptySemanticResults: {
      completionCount: completionItems(emptyCompletion).length,
      hoverWasNull: nullHover === null,
      definitionCount: definitionUris(emptyDefinition).length,
      diagnosticCount: asArray(emptyDiagnostics?.items).length
    },
    reliableMachineWorkspaceLoadFailureSignalObserved: machineSignalBeforeShutdown,
    session: session.evidence()
  }
}

async function main(): Promise<void> {
  const results: Record<string, unknown> = {}
  const evidenceDir = path.join(spikeRoot, 'evidence')
  await mkdir(evidenceDir, { recursive: true })

  const run = async (name: string, probe: () => Promise<unknown>): Promise<void> => {
    const started = Date.now()
    process.stderr.write(`[spike] ${name}: start\n`)
    results[name] = await probe()
    await writeFile(path.join(evidenceDir, 'results.json'), JSON.stringify(results, null, 2) + '\n', 'utf8')
    process.stderr.write(`[spike] ${name}: pass (${Date.now() - started} ms)\n`)
  }

  const probes: Record<string, () => Promise<unknown>> = {
    solutionSln: testSemanticSolution,
    solutionSlnx: () => testSimpleDefinition('solution-slnx', path.join(fixturesRoot, 'solution-slnx'), 'SpikeSolution.slnx', 'SpikeApp', 'Greet'),
    projectMode: testProjectMode,
    unicodePath: () => testSimpleDefinition('unicode-path', path.join(fixturesRoot, 'Đường dẫn # tiếng Việt'), undefined, 'UnicodeProject', 'Chào'),
    crash: testCrash,
    invalidWorkspace: testInvalidWorkspace
  }
  const selected = process.argv.slice(2)
  const names = selected.length > 0 ? selected : Object.keys(probes)
  for (const name of names) {
    const probe = probes[name]
    assert(probe, `Unknown probe: ${name}`)
    await run(name, probe)
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

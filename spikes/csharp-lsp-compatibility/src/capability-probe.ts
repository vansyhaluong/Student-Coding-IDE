import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import * as path from 'node:path'
import {
  createProtocolConnection,
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  ConfigurationRequest,
  RegistrationRequest,
  UnregistrationRequest,
  WorkDoneProgressCreateRequest,
  DiagnosticRefreshRequest,
  WorkspaceFoldersRequest
} from 'vscode-languageserver-protocol/node'

const root = path.resolve(__dirname, '..', 'fixtures', 'solution-sln')
const executable = path.resolve(__dirname, '..', '.tools', 'csharp-ls.exe')
const child = spawn(executable, ['--solution', 'SpikeSolution.sln', '--loglevel', 'error'], {
  cwd: root,
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
})

const logger = { error() {}, warn() {}, info() {}, log() {} }
const connection = createProtocolConnection(child.stdout, child.stdin, logger)
const registrations: unknown[] = []
const progress: unknown[] = []
let diagnosticRefreshes = 0
connection.onRequest(ConfigurationRequest.type, (params) => params.items.map(() => ({ csharp: { analyzersEnabled: false } })))
connection.onRequest(WorkDoneProgressCreateRequest.type, () => {})
connection.onRequest(RegistrationRequest.type, (params) => { registrations.push(...params.registrations) })
connection.onRequest(UnregistrationRequest.type, () => {})
connection.onRequest(DiagnosticRefreshRequest.type, () => { diagnosticRefreshes += 1 })
connection.onRequest(WorkspaceFoldersRequest.type, () => [{ uri: pathToFileURL(root).href, name: path.basename(root) }])
connection.onNotification('$/progress', (params: unknown) => { progress.push(params) })
connection.listen()

async function main(): Promise<void> {
  const rootUri = pathToFileURL(root).href
  const result = await connection.sendRequest(InitializeRequest.type, {
    processId: process.pid,
    clientInfo: { name: 'student-ide-csharp-spike', version: '0.0.0' },
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: path.basename(root) }],
    capabilities: {
      workspace: { configuration: true, workspaceFolders: true, didChangeWatchedFiles: { dynamicRegistration: true }, diagnostics: { refreshSupport: true } },
      window: { workDoneProgress: true },
      general: { positionEncodings: ['utf-16'] },
      textDocument: {
        synchronization: { dynamicRegistration: true, didSave: true },
        completion: { dynamicRegistration: true, completionItem: { resolveSupport: { properties: ['detail', 'documentation', 'additionalTextEdits'] } } },
        hover: { dynamicRegistration: true, contentFormat: ['markdown', 'plaintext'] },
        signatureHelp: { dynamicRegistration: true },
        definition: { dynamicRegistration: true, linkSupport: true },
        diagnostic: { dynamicRegistration: true, relatedDocumentSupport: false }
      }
    }
  })
  await connection.sendNotification(InitializedNotification.type, {})
  await new Promise((resolve) => setTimeout(resolve, 15_000))
  process.stdout.write(JSON.stringify({ capabilities: result.capabilities, serverInfo: result.serverInfo, registrations, progress, diagnosticRefreshes }, null, 2) + '\n')
  await connection.sendRequest(ShutdownRequest.type)
  await connection.sendNotification(ExitNotification.type)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('csharp-ls did not exit')), 10_000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
  })
  connection.dispose()
}

main().catch((error) => {
  child.kill()
  console.error(error)
  process.exitCode = 1
})

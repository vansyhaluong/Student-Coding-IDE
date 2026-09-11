/* global console, process, setTimeout, clearTimeout */
import { app } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdtemp, cp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { buildSync } = require('esbuild')
const modules = {
  ProjectService: 'project/project-service', FileSystemService: 'filesystem/filesystem-service',
  CsharpWorkspace: 'language/csharp-workspace', CsharpWorkspaceStore: 'language/csharp-workspace-store',
  CsharpWorkspaceSession: 'language/csharp-workspace-session',
}
const output = resolve('out/main/csharp-workspace-smoke.cjs')
buildSync({ stdin: { contents: Object.entries(modules).map(([name, path]) =>
  `export { ${name} } from './src/main/services/${path}';`).join('\n'), resolveDir: resolve('.') },
  bundle: true, platform: 'node', format: 'cjs', outfile: output })
const runtime = require(output)
const { CsharpPreflightProcess } = require(resolve('out/main/csharp-preflight-runtime.js'))
const { createCsharpLanguageManager } = require(resolve('out/main/language-runtime.js'))
const sdk = resolve('spikes/csharp-lsp-compatibility/.dotnet')
const env = { ...process.env, DOTNET_ROOT: sdk, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }
const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
env[pathKey] = sdk + ';' + (env[pathKey] ?? '')
const commands = new CsharpPreflightProcess({ detect: async () => ({
  runtime: { executable: join(sdk, 'dotnet.exe'), sdks: [] },
  status: { state: 'AVAILABLE', reason: null, warnings: [] },
}) }, undefined, env)
const owned = new Set()
const manager = createCsharpLanguageManager({ mode: 'development',
  privateExecutable: resolve('spikes/csharp-lsp-compatibility/.tools/csharp-ls.exe') }, {
  register(resource) { owned.add(resource); return () => owned.delete(resource) },
}, env)
const projects = new runtime.ProjectService()
const files = new runtime.FileSystemService(projects, { trashItem: async () => {} })
let session, store, adapter
const failures = []
const bridge = { get state() { return manager.state },
  async start(context) { adapter = await manager.start(context); return adapter }, stop: () => manager.stop() }
async function deadline(promise, ms = 60000) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('Workspace smoke deadline')), ms)
  })]) } finally { clearTimeout(timer) }
}
async function main() {
  try {
    await app.whenReady()
    const temporary = await mkdtemp(join(tmpdir(), 'csharp-workspace-smoke-'))
    store = new runtime.CsharpWorkspaceStore(join(temporary, 'state'))
    session = new runtime.CsharpWorkspaceSession(projects, files,
      new runtime.CsharpWorkspace(files, store, commands), bridge, commands, (error) => failures.push(error))
    files.start(); session.start()
    for (const fixture of ['solution-sln', 'solution-slnx', 'project-mode']) {
      const root = join(temporary, fixture + ' # ti\u1ebfng Vi\u1ec7t')
      await cp(resolve('spikes/csharp-lsp-compatibility/fixtures', fixture), root, { recursive: true })
      const project = await projects.openRoot(root)
      const result = await deadline(session.ensure(project.id))
      assert.equal(result.state, 'READY'); assert.equal(manager.state, 'RUNNING')
      assert.equal(owned.size, 1)
      const sync = session.sync
      const relativePath = 'Dirty # \u0110\u01b0\u1eddng.cs'
      await writeFile(join(root, relativePath), '// disk remains separate\n')
      const text = '// \ud83d\ude00\r\nclass DirtyBuffer { string Value = "initial"; }\r\n'
      const handle = await sync.open(relativePath, 1, text, true)
      const next = sync.change(handle, 2, [{ range: { start: { line: 0, character: 3 }, end: { line: 0, character: 5 } }, text: 'Vi\u1ec7t' }])
      const last = sync.change(handle, 3, [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, text: '// retained version\r\n' }])
      await Promise.all([next, last])
      const diagnostics = await deadline(sync.withFlushedDocument(handle,
        (uri) => adapter.documentDiagnostics('smoke-' + fixture, uri)))
      assert.ok(Array.isArray(diagnostics)) // Empty diagnostics are not a readiness signal.
      assert.equal(sync.snapshot(handle).version, 3)
      assert.equal(await readFile(join(root, relativePath), 'utf8'), '// disk remains separate\n')
      assert.deepEqual(await sync.save(handle, 3), { diskSaved: true })
      assert.equal(await readFile(join(root, relativePath), 'utf8'), sync.snapshot(handle).text)
      await sync.close(handle)
      assert.throws(() => sync.snapshot(handle))
      await deadline(projects.closeProject())
      await deadline(session.invalidate())
      assert.equal(manager.state, 'STOPPED'); assert.equal(owned.size, 0)
      assert.equal(manager.cleanupPending, false)
      console.log(JSON.stringify({ workspaceSync: 'PASS', fixture, unicode: true, orderedVersions: 3,
        savedThroughFileSystem: true, projectCloseReleased: true }))
    }
    const loose = join(temporary, 'loose')
    await mkdir(loose); await writeFile(join(loose, 'Only.cs'), 'class Only {}')
    const project = await projects.openRoot(loose)
    assert.deepEqual(await session.ensure(project.id), { state: 'NO_CSHARP_WORKSPACE' })
    assert.equal(owned.size, 0)
    assert.deepEqual(failures, [])
    console.log(JSON.stringify({ syntaxOnlyNoProcess: 'PASS', repeatedSessionCleanup: 'PASS' }))
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally {
    try { await session?.stop(); await manager.dispose(); await commands.stop(); await store?.stop()
      files.stop(); await projects.stop() } catch (error) { console.error(error); process.exitCode = 1 }
    app.exit(process.exitCode ?? 0)
  }
}
void main()

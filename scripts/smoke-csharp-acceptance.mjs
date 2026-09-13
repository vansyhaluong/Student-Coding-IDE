/* global console, process, setTimeout */
// Test-only instrumentation is built under out/. Public IPC and production source stay unchanged.
import { app, BrowserWindow, dialog } from 'electron'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdtemp, readFile, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mainDiagnosticsTrace, rendererDiagnosticsTrace, preloadDiagnosticsTrace } from './csharp-diagnostics-trace.mjs'

const require = createRequire(import.meta.url)
const root = resolve('.')
async function main() {
const temporary = await mkdtemp(join(tmpdir(), 'csharp-acceptance-'))
const sdk = resolve('spikes/csharp-lsp-compatibility/.dotnet')
process.env.DOTNET_ROOT = sdk
process.env.PATH = sdk + ';' + resolve('spikes/csharp-lsp-compatibility/.tools') + ';' + process.env.PATH
process.env.DOTNET_CLI_TELEMETRY_OPTOUT = '1'
delete process.env.ELECTRON_RENDERER_URL
app.setPath('userData', join(temporary, 'user-data'))
const copyProject = process.argv.find(arg=>arg.startsWith('--copy-project='))?.slice('--copy-project='.length)
if (copyProject) await cp(copyProject, join(temporary, 'TestCSharp'), {recursive:true})
else execFileSync(join(sdk, 'dotnet.exe'), ['new', 'console', '-n', 'TestCSharp'], {
  cwd: temporary, env: process.env, windowsHide: true, stdio: 'pipe', timeout: 60000,
})
const fixture = join(temporary, 'TestCSharp')
const traces = []
globalThis.__csharpTrace = (stage, detail) => traces.push({ time: Date.now(), stage, ...detail })
const { build } = await import('esbuild')
await build({entryPoints:['src/preload/index.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],
  outfile:'out/preload/csharp-acceptance.js',plugins:[{name:'preload-trace',setup(b){
    b.onLoad({filter:/bridge[\\/]language\.ts$/},async({path})=>({loader:'ts',contents:preloadDiagnosticsTrace(await readFile(path,'utf8'))}))
  }}]})
await build({ entryPoints: ['src/main/index.ts'], bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', outfile: 'out/main/csharp-acceptance.cjs', plugins: [{ name: 'trace', setup(b) {
    b.onLoad({ filter: /src[\\/]main[\\/]index\.ts$/ }, async ({ path }) => ({ loader: 'ts', contents: (await readFile(path, 'utf8')).replace('../preload/index.js','../preload/csharp-acceptance.js').replace("() => console.error('C# synchronization or cleanup failed; owned resources remain tracked.')", "error => globalThis.__csharpTrace('workspace.report', {reason: error?.reason, code: error?.code, operation: error?.operation})").replace('new BrowserWindow(options)', 'new BrowserWindow({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } })') }));
    b.onLoad({ filter: /(lsp-connection|language-ipc-service)\.ts$/ }, async ({ path }) => ({loader:'ts',contents:mainDiagnosticsTrace(await readFile(path,'utf8'),path)}))
    b.onLoad({ filter: /csharp-(ls-adapter|semantic-service|document-sync)\.ts$/ }, async ({ path }) => {
      let contents = mainDiagnosticsTrace(await readFile(path, 'utf8'), path)
      const name = path.endsWith('csharp-ls-adapter.ts') ? 'CSharpLsAdapter'
        : path.endsWith('csharp-semantic-service.ts') ? 'CsharpSemanticService' : 'CsharpDocumentSync'
      const methods = name === 'CSharpLsAdapter' ? ['hover', 'completion', 'signatureHelp', 'documentDiagnosticReport', 'didOpen', 'didChange']
        : name === 'CsharpSemanticService' ? ['semantic', 'diagnostics'] : ['withFlushedDocument']
      contents += `\nfor (const method of ${JSON.stringify(methods)}) {
        const original = ${name}.prototype[method];
        ${name}.prototype[method] = async function(...args) {
          globalThis.__csharpTrace('${name}.' + method + '.start', {});
          try { const result = await original.apply(this,args);
            globalThis.__csharpTrace('${name}.' + method + '.end', {
              kind: result?.kind, count: result?.items?.length ?? result?.diagnostics?.length ?? result?.signatures?.length,
              nonempty: !!(result?.contents), version: result?.documentVersion, nullResult: result === null });
            return result;
          } catch (error) { globalThis.__csharpTrace('${name}.' + method + '.error', {reason:error.reason}); throw error; }
        };
      }`
      return { contents, loader: 'ts' }
    })
  } }] })
const { build: viteBuild } = await import('vite')
const { default: react } = await import('@vitejs/plugin-react')
const { default: tailwind } = await import('@tailwindcss/vite')
if (!process.argv.includes('--reuse-renderer')) await viteBuild({ configFile: false, root: resolve('src/renderer'), base: './', logLevel: 'warn',
  plugins: [react(), tailwind(), { name: 'acceptance-observation', enforce: 'pre', transform(source, id) {
    source = rendererDiagnosticsTrace(source, id)
    if (id.endsWith('/features/editor/monaco.ts')) return source + `
      globalThis.__acceptance = { monaco, registrations: {}, replies: [] };
      for (const [register, provide] of [['registerHoverProvider','provideHover'], ['registerCompletionItemProvider','provideCompletionItems'], ['registerSignatureHelpProvider','provideSignatureHelp']]) {
        const original = monaco.languages[register];
        monaco.languages[register] = function(language, provider) {
          if (language !== 'csharp') return original(language,provider);
          const state = globalThis.__acceptance;
          state.registrations[register] = (state.registrations[register] ?? 0) + 1;
          const run = provider[provide]; provider[provide] = async function(...args) {
            const result = await run.apply(this,args); state.replies.push({provide, result}); return result;
          };
          const disposable = original(language, provider);
          return {dispose() {state.registrations[register]--; disposable.dispose();}};
        };
      }
    `
    if (id.endsWith('/features/problems/problems-session.ts')) return source + '\nglobalThis.__acceptance.problems = problemsStore;'
    return source
  } }], build: { outDir: resolve('out/csharp-acceptance-renderer'), emptyOutDir: true } })
const originalLoadFile = BrowserWindow.prototype.loadFile
BrowserWindow.prototype.loadFile = function(file, ...args) {
  return originalLoadFile.call(this, file === join(root, 'out/renderer/index.html')
    ? join(root, 'out/csharp-acceptance-renderer/index.html') : file, ...args)
}
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] })
let window
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until(run, label, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const value = await run(); if (value) return value; await pause(100) }
  throw Error('Timed out: ' + label)
}
const evaluate = code => window.webContents.executeJavaScript(code, true)
const evidence = { fixture, cases: {} }
try {
  require(resolve('out/main/csharp-acceptance.cjs'))
  window = await until(() => BrowserWindow.getAllWindows()[0], 'window')
  const preferences = window.webContents.getLastWebPreferences()
  assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.sandbox, true)
  evidence.security = { contextIsolation: true, nodeIntegration: false, sandbox: true }
  window.webContents.on('console-message', event => { if (event.message.startsWith('CSHARP_PRELOAD_TRACE ')) traces.push(JSON.parse(event.message.slice(21))); else if (event.level === 'error') console.log('Renderer:', event.message) })
  await until(async () => evaluate('!!document.querySelector("button")').catch(() => false), 'renderer')
  console.log('UI', await evaluate('document.body.innerText'))
  await evaluate(`window.studentIde.project.open()`)
  await until(() => evaluate(`!!document.querySelector('[title="Program.cs"]')`), 'Program.cs tree')
  await evaluate(`document.querySelector('[title="Program.cs"]').click()`)
  await until(() => evaluate(`globalThis.__acceptance?.monaco.editor.getEditors().some(e=>e.getModel()?.getLanguageId()==='csharp')`), 'editor')
  await until(() => evaluate(`globalThis.__acceptance.registrations.registerHoverProvider===1`), 'hover registered')
  evidence.capabilities = await evaluate(`window.studentIde.project.getActive().then(p=>window.studentIde.language.getStatus(p.value.id))`)
  const snapshot = async name => {
    window.webContents.invalidate(); await window.webContents.capturePage(); await pause(250)
    await writeFile(join(temporary, name + '.png'), (await window.webContents.capturePage()).toPNG())
  }
  const edit = async text => {
    window.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'})
    window.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'})
    await evaluate(`(() => { const e=__acceptance.monaco.editor.getEditors().find(e=>e.getModel()?.getLanguageId()==='csharp'); e.focus(); e.getModel().setValue(${JSON.stringify(text)}); e.setPosition(e.getModel().getPositionAt(e.getModel().getValueLength())); })()`)
  }
  if (process.argv.includes('--manual-diagnostics')) {
    window.show()
    console.log('MANUAL READY', fixture)
    await until(() => evaluate(`__acceptance.monaco.editor.getModelMarkers({}).some(m=>m.code==='CS0029') && __acceptance.problems.getSnapshot().problems.some(p=>p.code==='CS0029')`), 'manual error', 180000)
    await snapshot('manual-error')
    evidence.cases.manualError = 'PASS'
    await until(() => evaluate(`__acceptance.monaco.editor.getModels().some(m=>m.getValue().includes('int b = 123;')) && __diagnosticTrace.some(t=>t.stage==='renderer.dto' && t.version===__acceptance.monaco.editor.getModels().find(m=>m.getLanguageId()==='csharp').getVersionId() && t.kind==='full') && !__acceptance.monaco.editor.getModelMarkers({}).some(m=>m.code==='CS0029') && !__acceptance.problems.getSnapshot().problems.some(p=>p.code==='CS0029')`), 'manual corrected', 180000)
    await pause(1500)
    await snapshot('manual-corrected')
    evidence.cases.manualClear = 'PASS'
    return
  }
  if (process.argv.includes('--diagnostics-only')) {
    for (const [name, text, code] of [['assignment','int b = "abc";','CS0029'], ['syntax','int x =','CS1733'], ['unknown','DoesNotExist();','CS0103']]) {
      await edit(text)
      await until(() => evaluate(`__acceptance.monaco.editor.getModelMarkers({owner:'student-ide.language.csharp-ls'}).some(m=>m.code===${JSON.stringify(code)})`), name + ' marker')
      assert.equal(await evaluate(`__acceptance.problems.getSnapshot().problems.some(p=>p.providerId==='csharp-ls' && p.code===${JSON.stringify(code)})`), true)
      const saves = traces.filter(t=>t.stage==='wire.textDocument/didSave.send').length
      window.webContents.sendInputEvent({type:'keyDown',keyCode:'s',modifiers:['control']})
      window.webContents.sendInputEvent({type:'keyUp',keyCode:'s',modifiers:['control']})
      await until(()=>traces.filter(t=>t.stage==='wire.textDocument/didSave.send').length > saves, name + ' didSave')
      evidence.cases[name] = 'PASS'
      await pause(1500)
      assert.equal(await evaluate(`__acceptance.monaco.editor.getModelMarkers({}).some(m=>m.code===${JSON.stringify(code)})`),true)
      await snapshot(name)
    }
    await edit('int b = 123;')
    await until(() => evaluate(`!__acceptance.monaco.editor.getModelMarkers({}).some(m=>m.severity===8) && !__acceptance.problems.getSnapshot().errorCount`), 'errors clear')
    await until(() => evaluate(`__diagnosticTrace.some(t=>t.stage==='renderer.dto' && t.version===__acceptance.monaco.editor.getModels().find(m=>m.getLanguageId()==='csharp').getVersionId() && t.kind==='full')`), 'corrected full DTO')
    await pause(1500)
    assert.equal(await evaluate(`__acceptance.problems.getSnapshot().errorCount`),0)
    evidence.corrected = await evaluate(`({markers:__acceptance.monaco.editor.getModelMarkers({}).map(m=>({code:m.code,severity:m.severity})),problems:__acceptance.problems.getSnapshot()})`)
    evidence.cases.clear = 'PASS'
    await edit('int b = 123;\nConsole.WriteLine(b);\n')
    await until(() => evaluate(`__diagnosticTrace.some(t=>t.stage==='renderer.dto' && t.version===__acceptance.monaco.editor.getModels().find(m=>m.getLanguageId()==='csharp').getVersionId() && t.kind==='full' && !t.codes.length) && !__acceptance.monaco.editor.getModelMarkers({}).length && !__acceptance.problems.getSnapshot().totalCount`), 'all diagnostics clear')
    await pause(1500)
    assert.equal(await evaluate('__acceptance.problems.getSnapshot().totalCount'),0)
    evidence.cases.allClear = 'PASS'
    return
  }
  await edit('Console.')
  await evaluate(`__acceptance.monaco.editor.getEditors()[0].trigger('acceptance','editor.action.triggerSuggest',{})`)
  await until(() => evaluate(`!!document.querySelector('.suggest-widget.visible') && __acceptance.replies.some(r=>r.provide==='provideCompletionItems' && r.result.suggestions.some(s=>s.label==='WriteLine'))`), 'completion UI')
  evidence.cases.completion = 'PASS'
  await snapshot('completion')
  await edit('Console.WriteLine("Hello");\n')
  await evaluate(`(() => {const e=__acceptance.monaco.editor.getEditors()[0]; e.setPosition({lineNumber:1,column:4}); e.trigger('acceptance','editor.action.showHover',{});})()`)
  await until(() => evaluate(`document.querySelector('.monaco-hover')?.innerText.includes('Console')`), 'hover UI')
  evidence.cases.hover = 'PASS'
  await snapshot('hover')
  await edit('Console.WriteLine')
  await evaluate(`__acceptance.monaco.editor.getEditors()[0].trigger('keyboard','type',{text:'('})`)
  await evaluate(`__acceptance.monaco.editor.getEditors()[0].trigger('acceptance','editor.action.triggerParameterHints',{})`)
  await until(() => evaluate(`document.querySelector('.parameter-hints-widget.visible')?.innerText.includes('WriteLine')`), 'signature UI')
  evidence.cases.signatureHelp = 'PASS'
  await snapshot('signature')
  await edit('Console.WriteLine("Hello");\nint x = "abc";\n')
  await until(() => evaluate(`__acceptance.monaco.editor.getModelMarkers({}).some(m=>m.code==='CS0029')`), 'CS0029 marker')
  evidence.diagnostics = await evaluate(`({markers:__acceptance.monaco.editor.getModelMarkers({}).map(m=>({owner:m.owner,code:m.code,message:m.message})), problems:__acceptance.problems.getSnapshot()})`)
  console.log('DIAGNOSTICS', JSON.stringify(evidence.diagnostics))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Problems'))?.click()`)
  await until(() => evaluate(`document.body.innerText.includes("Cannot implicitly convert type")`), 'Problems UI')
  evidence.cases.diagnostics = 'PASS'
  await snapshot('diagnostics')
  await edit('Console.WriteLine("Hello");\nint x = 1;\nConsole.WriteLine(x);\n')
  await until(() => evaluate(`!__acceptance.monaco.editor.getModelMarkers({}).length && !document.body.innerText.includes('Cannot implicitly convert type')`), 'diagnostics clear')
  await pause(1500)
  assert.equal(await evaluate(`__acceptance.monaco.editor.getModelMarkers({}).length`), 0)
  evidence.cases.clear = 'PASS'
  evidence.registrations = await evaluate('__acceptance.registrations')
  for (const count of Object.values(evidence.registrations)) assert.equal(count, 1)
  assert.equal(await evaluate('__acceptance.problems.getSnapshot().totalCount'), 0)
  evidence.replies = await evaluate('JSON.parse(JSON.stringify(__acceptance.replies))')
  await snapshot('clear')
  console.log('ACCEPTANCE', JSON.stringify(evidence.cases))
} catch (error) {
  evidence.error = String(error)
  if (window) { evidence.replies = await evaluate('JSON.parse(JSON.stringify(__acceptance.replies))'); console.log('UI FAILURE', await evaluate('document.body.innerText')); await writeFile(join(temporary, 'failure.png'), (await window.webContents.capturePage()).toPNG()) }
  console.error(error); process.exitCode = 1
} finally {
  if (window) evidence.rendererTrace = await evaluate('globalThis.__diagnosticTrace ?? []')
  await writeFile(join(temporary, 'evidence.json'), JSON.stringify({ ...evidence, traces }, null, 2))
  console.log('EVIDENCE', temporary)
  // Explicit test-owned shutdown avoids unsaved prompts without touching user state.
  if (window) window.destroy()
  app.quit()
  setTimeout(() => app.exit(process.exitCode ?? 0), 10000)
}

}
void main().catch(error => { console.error(error); app.exit(1) })

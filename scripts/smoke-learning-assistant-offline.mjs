/* global console, process, Buffer, setTimeout, clearTimeout, Response, Request, ReadableStream, TextEncoder */
// C4-C: isolated, actual Electron bundles/IPC/services/Monaco/native parser ports.
// Only encryption and HTTP are fixtures. No component/service/parser replacement.
import assert from 'node:assert/strict'
import { createRequire, Module } from 'node:module'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
const sourceRoot = resolve(process.env.C4C_ARTIFACT_ROOT ?? 'out/ai-c4-c')
const packagedResources = process.env.C4C_PACKAGED_RESOURCES && resolve(process.env.C4C_PACKAGED_RESOURCES)
const root = process.versions.electron && packagedResources ? join(packagedResources, 'app.asar/out') : sourceRoot
const scenario = process.argv[2] ?? 'chat', heldWindow = process.argv.includes('--hold')
const traceServices = process.argv.includes('--trace-services'), pipeStdio = process.argv.includes('--pipe-stdio')
assert.ok(['chat', 'javascript', 'csharp', 'safety', 'layout', 'hint', 'hint-js', 'hint-apply', 'hint-apply-js', 'hint-f4', 'hint-f4-js', 'beui', 'detect-f5', 'detect-f5-js'].includes(scenario))
const hash = value => createHash('sha256').update(value).digest('hex')
const exitTrace = (stage, extra = {}) => console.log(JSON.stringify({ exitTrace: stage, pid: process.pid, ...extra }))
if (!process.versions.electron) {
  process.once('exit', code => exitTrace('parent-exit', { code }))
  const { resolveConfig } = await import('electron-vite')
  const c = (await resolveConfig({ mode: 'production' }, 'build', 'production')).config
  const expected = JSON.parse(c.main.define.__SMART_HINTS_BUILD_ID__)
  const entry = await readFile(join(root, 'main/index.js'), 'utf8')
  assert.ok(entry.includes(expected), 'Main identity must match current source')
  for (const symbol of ['ChatService', 'SharedExecutionCoordinator', 'SharedGeminiTransport', 'MainSelectionFixGuard', 'cancelSmartHintsOperation'])
    assert.ok(entry.includes(symbol), `Main contains ${symbol}`)
  const preload = await readFile(join(root, 'preload/index.js'))
  assert.ok(preload.includes(Buffer.from('learning-chat:prepare')))
  const html = await readFile(join(root, 'renderer/index.html'), 'utf8')
  const rendererPath = html.match(/src="([^"]+\.js)"/)[1]
  const renderer = await readFile(resolve(root, 'renderer', rendererPath.replace(/^\.\//, '')))
  if (packagedResources) {
    const { extractFile } = require('@electron/asar'), archive = join(packagedResources, 'app.asar')
    for (const [name, bytes] of [['main/index.js', entry], ['preload/index.js', preload],
      ['renderer/' + rendererPath.replace(/^\.\//, ''), renderer]]) {
      assert.equal(hash(extractFile(archive, join('out', name))), hash(bytes), 'Packaged regression must use the exact production bytes')
    }
  }
  assert.ok(renderer.includes(Buffer.from('learning-assistant-timeline')))
  const parser = JSON.parse(await readFile(join(root, 'main/smart-hints-parser/manifest.json'), 'utf8'))
  for (const [file, record] of Object.entries(parser.artifacts)) {
    const data = await readFile(join(root, 'main/smart-hints-parser', file))
    assert.equal(data.length, record.bytes); assert.equal(hash(data), record.sha256)
  }
  console.log(JSON.stringify({ artifact: { main: hash(entry), preload: hash(preload), renderer: hash(renderer),
    buildIdentity: expected, parser: { typescript: parser.typescript, csharp: parser.csharp, files: Object.keys(parser.artifacts).length } } }))
  const env = Object.fromEntries(Object.keys(process.env).filter(n => !/API_KEY|TOKEN|SECRET|ELECTRON_RUN_AS_NODE|ELECTRON_RENDERER_URL/i.test(n)).map(n => [n, process.env[n]]))
  const child = spawn(require('electron'), [resolve('scripts/smoke-learning-assistant-offline.mjs'), scenario, '--electron-child', ...(heldWindow ? ['--hold'] : []), ...(traceServices ? ['--trace-services'] : [])],
    { env, stdio: ['pipe', pipeStdio ? 'pipe' : 'inherit', pipeStdio ? 'pipe' : 'inherit'], windowsHide: true })
  exitTrace('electron-spawn', { childPid: child.pid, scenario, stdio: pipeStdio ? 'pipe' : 'inherit', traceServices })
  child.stdout?.on('data', data => process.stdout.write(data))
  let stderrSeen = false
  child.stderr?.on('data', data => { stderrSeen = true; process.stderr.write(`[electron:${child.pid}] ${data}`) })
  child.once('close', (code, signal) => {
    clearTimeout(watchdog)
    exitTrace('electron-close', { childPid: child.pid, code, signal })
    const clean = code === 0 && !stderrSeen
    process.exitCode = code === 0 && stderrSeen ? 1 : code ?? 1
    console.log(JSON.stringify({ scenario, result: clean ? 'PASS' : 'FAIL', stage: 'process-close', pid: process.pid,
      childPid: child.pid, code, signal, stderrEmpty: pipeStdio ? !stderrSeen : null }))
  })
  process.stdin.on('data', data => child.stdin.write(data))
  const watchdog = setTimeout(() => { child.kill(); process.exitCode = 1 }, heldWindow ? 900000 : 240000)
  child.once('exit', (code, signal) => { exitTrace('electron-exit', { childPid: child.pid, code, signal }); process.stdin.pause() })
} else void smoke().catch(() => { console.error(JSON.stringify({ scenario, result: 'FAIL', stage: 'bootstrap' })); process.exitCode = 1 })

async function smoke() {
  const { app, BrowserWindow, ipcMain, session } = await import('electron')
  if (packagedResources) {
    // Test-only composition: exercise the exact ASAR assets and packaged resource
    // paths with the existing HTTP/encryption fixtures, never a real Gemini call.
    Object.defineProperty(app, 'isPackaged', { value: true })
    Object.defineProperty(process, 'resourcesPath', { value: packagedResources })
  }
  exitTrace('electron-start', { parentPid: process.ppid, scenario, versions: { electron: process.versions.electron, node: process.versions.node, uv: process.versions.uv } })
  process.once('exit', code => exitTrace('electron-process-exit', { code }))
  let rendererDestroyed = false
  app.on('before-quit', () => exitTrace('before-quit'))
  app.on('will-quit', () => exitTrace('will-quit'))
  const children = new Map(), workers = new Set()
  const cp = require('node:child_process'), launch = cp.spawn
  cp.spawn = function (...args) {
    const child = launch.apply(this, args)
    const role = Array.isArray(args[1]) && args[1].some(a => typeof a === 'string' && a.endsWith('SelectionFixGuard.dll')) ? 'ROSLYN' : 'PROCESS'
    children.set(child.pid, role); exitTrace('helper-spawn', { childPid: child.pid, role })
    child.once('exit', (code, signal) => exitTrace('helper-exit', { childPid: child.pid, role, code, signal }))
    child.once('close', (code, signal) => { children.delete(child.pid); exitTrace('helper-close', { childPid: child.pid, role, code, signal }) })
    return child
  }
  const threads = require('node:worker_threads'), Worker = threads.Worker
  threads.Worker = class extends Worker {
    constructor(...args) {
      super(...args); const id = this.threadId; workers.add(id); exitTrace('worker-start', { threadId: id })
      this.once('exit', code => { workers.delete(id); exitTrace('worker-exit', { threadId: id, code }) })
    }
  }
  const removeHandler = ipcMain.removeHandler.bind(ipcMain)
  ipcMain.removeHandler = channel => { if (channel.startsWith('learning-chat:') || channel.includes('hint-apply')) exitTrace('ipc-remove', { channel, rendererDestroyed }); return removeHandler(channel) }
  app.on('will-quit', () => {
    assert.equal(rendererDestroyed, true, 'renderer endpoint destroyed before final quit')
    exitTrace('owned-resources-at-quit', { helpers: children.size, workers: workers.size })
    assert.equal(children.size, 0, 'all observed helpers closed'); assert.equal(workers.size, 0, 'all observed parser workers exited')
    if (configuration) {
      const remaining = { hintTasks: configuration.service.tasks.size, hintOperations: configuration.service.operations.size,
        hintSessions: configuration.service.sessions.size, chatTasks: configuration.chat.tasks.size,
        chatSessions: configuration.chat.conversations.sessions.size, inferenceActive: !!configuration.coordinator.active }
      exitTrace('domain-resources-at-quit', remaining)
      for (const [name, value] of Object.entries(remaining)) assert.equal(value, name === 'inferenceActive' ? false : 0, `${name} drained`)
    }
  })
  const directory = join(sourceRoot, `${scenario}-${Date.now()}`), userData = join(directory, 'user-data')
  await mkdir(userData, { recursive: true }); app.setPath('userData', userData)
  delete process.env.ELECTRON_RENDERER_URL
  const key = 'AQ.C4C_SYNTHETIC_OFFLINE_CREDENTIAL'
  const privateMarkers = [key, 'C4C_SOURCE_CANARY', 'C4C_QUESTION_CANARY', 'C4D_HINT']
  const checks = [], diagnostics = [], consoleErrors = [], requests = [], events = []
  let window, configuration, stage = 'bootstrap', mode = 'ok', pending = [], postCount = 0, aborts = 0, lateBodiesCancelled = 0, blockedNetwork = 0, diagnosticsLeak = false
  let f4Code = 'sum += i;'
  const guards = { preflight: 0, verify: 0, hintPrepare: 0, hintValidate: 0, languages: [], errors: [] }, timing = {}, pause = ms => new Promise(r => setTimeout(r, ms))
  let activeCheck
  const check = (condition, label) => { activeCheck = label; assert.ok(condition, label); checks.push(label) }
  const scan = value => { const text = typeof value === 'string' ? value : JSON.stringify(value); if (privateMarkers.some(m => text.includes(m))) diagnosticsLeak = true }
  const until = async (test, label, budget = 30000) => {
    const due = Date.now() + budget
    while (Date.now() < due) { if (await test()) return; await pause(35) }
    throw Error(`C4C_${label}`)
  }
  const envelope = value => ({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } }] })
  globalThis.fetch = async request => {
    assert.ok(request instanceof Request); assert.equal(request.headers.get('x-goog-api-key'), key)
    assert.ok(request.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite'))
    if (request.method === 'GET') { assert.ok(!request.url.includes('countTokens')); return Response.json({ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 }) }
    assert.equal(request.method, 'POST'); assert.ok(request.url.endsWith(':generateContent'))
    const body = await request.json(), input = JSON.parse(body.contents.at(-1).parts[0].text)
    postCount++; requests.push({ body, input })
    request.signal.addEventListener('abort', () => { aborts++ }, { once: true })
    if (mode === 'late') return new Promise(done => pending.push(() => done(new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(envelope({ kind: 'CHAT_REPLY', text: 'C4C_LATE_REPLY' })))); c.close() },
      cancel() { lateBodiesCancelled++ },
    }), { headers: { 'content-type': 'application/json' } }))))
    if (mode === 'failure') return Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: 'C4C_PRIVATE_PROVIDER_BODY' } }, { status: 503 })
    const a = input.action, out = !a ? { kind: 'CHAT_REPLY', text: scenario === 'beui'
      ? '## C4E Markdown\n\n**Use both inputs** and compare the public examples.\n\n```csharp\nreturn a + b;\n```\n\n' + Array.from({length:12},(_,i)=>`Step ${i+1}: read the inputs, check the expression, and explain the result before editing.`).join('\n\n')
      : `C4C_CHAT_${postCount}: advisory only.` }
      : a.kind === 'DETECT_ISSUES' ? { kind: 'DETECTION', issues: mode === 'detect-empty' ? [] : [{ type: 'logic', severity: 'warning', message: 'F5_MISSING_B',
        explanation: 'Only a is used.', reason: 'The public problem requests a plus b.', impact: 'Nonzero b can give the wrong result.', guidance: 'Compare the return expression with both parameters.', evidence: [],
        range: { startOffset: 0, endOffset: 1, quote: 'return a + 0;' } }] }
      : a.kind === 'HINT' ? { kind: 'HINT', thinking: 'C4D_HINT: compare the two public inputs.', steps: ['Use a and b from the public signature.', 'Return their sum.'], code: { language: input.language,
        text: scenario.startsWith('hint-f4') ? f4Code : scenario.startsWith('hint-apply') && input.implementationState === 'NO_IMPLEMENTATION'
          ? input.language === 'javascript' ? 'function Sum(a, b) {\nreturn a + b;\n}' : 'public class Solution { public int Sum(int a, int b) {\nreturn a + b;\n} }'
          : 'return a + b;' }, evidence: [] }
        : a.kind === 'ANALYZE' ? { kind: 'ANALYSIS', hypotheses: ['C4C_ANALYZE: inspect the public Run evidence.'], suggestions: ['Compare the two inputs.'], evidence: input.runContext.observations?.map(o => o.evidenceId).slice(0, 1) ?? [] }
          : a.kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'C4C_EXPLAIN: selected return statement.', variables: 'a and b are inputs.', controlFlow: 'Return ends the method.', algorithm: 'Addition.', illustrativeExamples: [] }
            : mode === 'no-fix' ? { kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'C4C_NO_FIX' }
              : mode === 'invalid-fix' ? { kind: 'EDIT_PROPOSAL', replacementText: 'public static int Wrong() { return 1; }', rationale: 'C4C_INVALID_FIX', evidence: [] }
              : { kind: 'EDIT_PROPOSAL', replacementText: 'return a + b;', rationale: 'C4C_FIX: use both inputs; manual review required.', evidence: [] }
    return Response.json(envelope(out))
  }
  await writeFile(join(userData, 'smart-hints-settings.json'), JSON.stringify({ version: 2, enabled: true, encryptedKey: 'U1lOVEhFVElD', usedRequests: 0,
    dailyLimit: 20, needsLimitReview: false, providerLimit: null }))
  await app.whenReady()
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { blockedNetwork++; callback({ cancel: true }) })
  globalThis.__c4cConfigure = (Configuration, options) => {
    const guard = options.selectionFixGuard
    assert.equal(guard.constructor.name, 'MainSelectionFixGuard')
    const prototype = Object.getPrototypeOf(guard), hintPrepare = prototype.prepareHintApply, hintValidate = prototype.validateHintFunction
    prototype.prepareHintApply = function (...args) { guards.hintPrepare++; return hintPrepare.apply(this, args) }
    prototype.validateHintFunction = function (...args) { guards.hintValidate++; return hintValidate.apply(this, args) }
    const preflight = guard.preflight.bind(guard)
    guard.preflight = async (...args) => {
      guards.preflight++; guards.languages.push(args[0].binding.language)
      let lease
      try { lease = await preflight(...args) }
      catch (e) { guards.errors.push(e.selectionFix ?? { code: e.code }); throw e }
      const verify = lease.verify.bind(lease)
      lease.verify = async (...values) => { guards.verify++; return verify(...values) }
      return lease
    }
    configuration = new Configuration({ ...options,
      encryption: { available: async () => true, decrypt: async () => key, encrypt: async () => { throw Error('Key writes prohibited') } },
      onDiagnostic: d => { scan(d); diagnostics.push(d); if (!diagnosticsLeak) options.onDiagnostic?.(d) },
    })
    assert.equal(configuration.chat.options.coordinator, configuration.coordinator)
    assert.equal(configuration.service.coordinator, configuration.coordinator)
    return configuration
  }
  globalThis.__c4cObserveApplication = (Application, services, options) => {
    for (const service of services) {
      if (!service.stop) continue
      const stop = service.stop.bind(service)
      service.stop = async () => { exitTrace('service-stop-start', { service: service.name }); await stop(); exitTrace('service-stop-done', { service: service.name }) }
    }
    return new Application(services, options)
  }
  const register = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => register(channel, async (event, ...args) => {
    if (channel === 'submission:submit' || channel.startsWith('analysis:')) throw Error('Unrelated execution forbidden')
    if (channel === 'exercise:run') check(scenario === 'javascript', 'only-explicit-public-Run')
    if (channel.startsWith('learning-chat:') || channel.startsWith('smart-hints:') || channel.startsWith('exercise:')) {
      check(!JSON.stringify(args).includes(key), 'IPC-no-key')
      const result = await listener(event, ...args)
      check(!JSON.stringify(result).includes(key), 'IPC-response-no-key')
      events.push({ channel, request: args[0], result })
      return result
    }
    return listener(event, ...args)
  })
  try {
    const filename = join(root, 'main/index.js'), original = await readFile(filename, 'utf8'), needle = 'new SmartHintsConfiguration({'
    assert.equal(original.split(needle).length, 2)
    const main = new Module(filename); main.filename = filename; main.paths = Module._nodeModulePaths(join(root, 'main'))
    const application = [...original.matchAll(/new ([\w.]*DesktopApplication)\(/g)]
    assert.equal(application.length, 1)
    const composed = original.replace(needle, 'globalThis.__c4cConfigure(SmartHintsConfiguration, {')
    main._compile(traceServices ? composed.replace(application[0][0], `globalThis.__c4cObserveApplication(${application[0][1]},`) : composed, filename)
    await until(() => BrowserWindow.getAllWindows().length > 0, 'window')
    window = BrowserWindow.getAllWindows()[0]; window.setSize(1440, 1000); window.setTitle(`C4-C Offline ${scenario} - isolated`); window.show()
    window.on('closed', () => exitTrace('window-closed'))
    window.webContents.once('destroyed', () => { rendererDestroyed = true; exitTrace('renderer-destroyed') })
    window.webContents.setBackgroundThrottling(false)
    window.webContents.on('console-message', event => { scan(event.message); if (event.level === 'error') consoleErrors.push(event.message) })
    window.webContents.on('render-process-gone', (_event, details) => {
      exitTrace('renderer-gone', { reason: details.reason, code: details.exitCode }); consoleErrors.push('RENDER_PROCESS_GONE')
    })
    const frame = window.webContents.mainFrame, publish = frame.send.bind(frame)
    frame.send = (channel, ...args) => {
      if (channel === 'exercise:changed') events.push({ channel, result: { ok: true, value: args[0] } })
      return publish(channel, ...args)
    }
    window.webContents.debugger.attach('1.3')
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
    const evaluate = text => window.webContents.executeJavaScript(text, true)
    const wait = (expression, label = 'UI-ready', budget) => until(() => evaluate(expression).catch(() => false), label, budget)
    const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
    const button = async (label, times = 1) => {
      const labels = label === 'Diff Preview' ? ['Diff Preview', 'Review Diff'] : [label]
      await wait(`Array.from(document.querySelectorAll('button')).some(b=>(${JSON.stringify(labels)}.includes(b.textContent.trim())||${JSON.stringify(labels)}.includes(b.getAttribute('aria-label')))&&!b.disabled)`)
      await evaluate(`(()=>{const dialog=document.querySelector('dialog[open]');const all=Array.from((dialog||document).querySelectorAll('button'));const b=all.find(b=>(${JSON.stringify(labels)}.includes(b.textContent.trim())||${JSON.stringify(labels)}.includes(b.getAttribute('aria-label')))&&!b.disabled);for(let i=0;i<${times};i++)b.click()})()`)
    }
    const select = async (selector, value) => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`) }
    const snap = async name => { await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await writeFile(join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG()) }
    const text = value => wait(`document.querySelector('.learning-assistant')?.textContent.includes(${JSON.stringify(value)})`, 'assistant-state')
    const connect = async () => wait(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);const api=Object.values(b).find(v=>v&&typeof v.getEditors==='function');const ed=api?.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode())&&e.getModel()?.uri.scheme==='practice');if(!ed)return false;globalThis.probe={ed,model:ed.getModel(),api};return true})()`, 'Monaco-real-editor')
    const edit = async source => { await evaluate(`probe.ed.executeEdits('c4c-fixture',[{range:probe.model.getFullModelRange(),text:${JSON.stringify(source)}}]);probe.ed.pushUndoStop()`); await pause(300) }
    const selected = async source => {
      const at = source.indexOf('return'), end = source.indexOf('\n', at) < 0 ? source.length : source.indexOf('\n', at)
      const line = source.slice(at, end).trimEnd()
      await evaluate(`probe.ed.setSelection(probe.api.Selection ? new probe.api.Selection(1,1,1,1) : {startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1})`).catch(() => {})
      await evaluate(`(()=>{const a=probe.model.getPositionAt(${at}),b=probe.model.getPositionAt(${at + line.length});probe.ed.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column})})()`)
      return line
    }
    const open = async () => { await button('Learning Assistant'); await wait(`!!document.querySelector('.learning-assistant')&&document.querySelector('.learning-assistant-state')?.textContent==='Ready'`); check(await evaluate(`document.querySelectorAll('.learning-assistant').length===1&&!document.querySelector('.smart-hints-drawer')`), 'one-unified-panel') }
    const compose = async (question, scope = 'QUESTION_ONLY') => {
      await select('[aria-label="Ngữ cảnh Chat"]', scope)
      await evaluate(`document.querySelector('[aria-label="Câu hỏi"]').focus()`)
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
      await window.webContents.debugger.sendCommand('Input.insertText', { text: question })
      const before = postCount
      await button('Send', 2); await wait(`!!document.querySelector('[aria-label="Xác nhận gửi Gemini"]')`, 'chat-consent')
      check(postCount === before, 'Chat-prepare-no-inference')
      check(await evaluate(`document.querySelector('.learning-assistant-composer').hidden`), 'consent-review-keeps-composer-within-layout')
      return before
    }
    const sendChat = async (question, scope) => {
      const messages = await evaluate(`document.querySelectorAll('[data-message-id]').length`)
      const before = await compose(question, scope)
      await snap(`consent-${before + 1}`)
      await button('Đồng ý gửi Gemini', 2)
      await until(() => postCount === before + 1, 'one-chat-POST')
      await wait(`document.querySelector('.learning-assistant-state')?.textContent==='Complete'`, 'chat-complete')
      await wait(`document.querySelectorAll('[data-message-id]').length===${messages + 2}`, 'Main-history-timeline')
      check(postCount === before + 1, 'duplicate-send-deduplicated')
    }
    const act = async label => {
      const before = postCount
      await button(label, 2); await wait(`!!document.querySelector('.smart-hints-consent[open]')`, 'action-consent')
      check(postCount === before, 'Quick-prepare-no-inference')
      await button('Đồng ý gửi snapshot', 2)
      await until(() => postCount === before + 1, 'one-action-POST')
    }
    const prefs = window.webContents.getLastWebPreferences()
    check(prefs.contextIsolation && prefs.sandbox && !prefs.nodeIntegration, 'Electron-security-preferences')
    await wait(`!!document.querySelector('[aria-label="Open Learning"]:not(:disabled)')`)
    const start = Date.now(); await click('[aria-label="Open Learning"]'); await wait(`!!document.querySelector('.learning-page:not([hidden]) .learning-material')`, 'theory-render')
    timing.openLearningMs = Date.now() - start
    exitTrace('renderer-ready', { rendererPid: window.webContents.getOSProcessId() })
    await evaluate(`globalThis.c4cFrames={last:performance.now(),gaps:[]};const tick=t=>{c4cFrames.gaps.push(t-c4cFrames.last);c4cFrames.last=t;if(c4cFrames.gaps.length<5000)requestAnimationFrame(tick)};requestAnimationFrame(tick)`)
    const chapter = scenario.startsWith('hint-f4') ? 4 : 2
    const nav = Date.now(); await click(`#learning-chapters button:nth-child(${chapter})`); await wait(`document.querySelector('#learning-chapters button:nth-child(${chapter})').getAttribute('aria-current')==='page'`)
    timing.chapterNavigationMs = Date.now() - nav
    await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row'); await connect()
    if (scenario === 'javascript' || scenario === 'hint-js' || scenario === 'hint-apply-js' || scenario === 'hint-f4-js' || scenario === 'detect-f5-js') { await select('[aria-label="Ngôn ngữ bài tập"]', 'javascript'); await pause(250); await connect() }
    const language = await evaluate('probe.model.getLanguageId()')
    const originalSource = await evaluate('probe.model.getValue()')
    const f4Loop = `${language === 'csharp' ? 'int' : 'let'} sum = 0;\nfor (${language === 'csharp' ? 'int' : 'let'} i = 1; i <= n; i++) {\n// missing\n}\nreturn sum;`
    const f4Wrap = body => language === 'csharp' ? `public class Solution { public int SumToN(int n) {\n${body}\n} }` : `function SumToN(n) {\n${body}\n}`
    const source = scenario.startsWith('hint-f4') ? f4Wrap(f4Loop) : scenario.startsWith('hint-apply') ? originalSource : language === 'javascript' ? 'function Sum(a, b) {\n  // C4C_SOURCE_CANARY\n  return a + 0;\n}\n'
      : originalSource.replace('throw new System.NotImplementedException();', '// C4C_SOURCE_CANARY\n        return a + 0;')
    await edit(source); if (!scenario.startsWith('hint-apply') && !scenario.startsWith('hint-f4') && !scenario.startsWith('detect-f5')) await selected(source); await open()
    await snap('empty')
    if (scenario === 'beui') {
      stage = 'beui-visual-and-Markdown'
      await evaluate(`document.documentElement.dataset.theme='dark'`)
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      check(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),'reduced-motion-media-supported')
      await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      await sendChat('C4C_QUESTION_CANARY: show an explanation with code.')
      await wait(`!!document.querySelector('.assistant-markdown h2')&&!!document.querySelector('.assistant-markdown code[data-highlighted="true"]')`)
      check(await evaluate(`!!document.querySelector('[data-slot="message-scroller"]')&&!!document.querySelector('[data-slot="message-bubble"]')&&!!document.querySelector('.learning-assistant-composer .learning-assistant-actions')`), 'official-beui-composition')
      await snap('dark-Markdown')
      await evaluate(`(()=>{const v=document.querySelector('.learning-assistant-timeline'),m=v.querySelector('[data-role="user"]');v.scrollTop+=m.getBoundingClientRect().top-v.getBoundingClientRect().top;v.dispatchEvent(new Event('scroll'))})()`)
      check(await evaluate(`(()=>{const u=document.querySelector('[data-from="user"] [data-slot="message-bubble"]'),a=document.querySelector('[data-from="assistant"] [data-slot="message-content"]');return u.getBoundingClientRect().left>a.getBoundingClientRect().left})()`),'user-right-assistant-left')
      await snap('message-alignment')
      await evaluate(`document.documentElement.dataset.theme='light'`); await pause(150); await snap('light-Markdown')
      await evaluate(`document.documentElement.dataset.theme='dark'`)
      for (const width of [1440,1000]) {
        window.setSize(width,1000); await pause(300)
        const size = await evaluate(`(()=>{const p=document.querySelector('.learning-assistant'),e=document.querySelector('.practice-code-column'),c=document.querySelector('.assistant-composer-area');
          return {fits:p.scrollWidth<=p.clientWidth+1,beside:e.getBoundingClientRect().right<=p.getBoundingClientRect().left+1,
            composer:c.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom+1,scroller:document.querySelector('.assistant-scroller').clientHeight>80}})()`)
        check(size.fits&&size.beside&&size.composer&&size.scroller,`responsive-beui-no-editor-overlap-${width}`)
        await snap(`beui-${width}`)
      }
      await evaluate(`(()=>{const v=document.querySelector('.learning-assistant-timeline');v.scrollTop=0;v.dispatchEvent(new Event('scroll'))})()`)
      await act('Analyze Code & Run'); await text('C4C_ANALYZE')
      check(await evaluate(`document.querySelector('.learning-assistant-timeline').scrollTop===0`), 'reader-scroll-position-retained')
      await button('Tin nhắn mới nhất')
      check(await evaluate(`(()=>{const v=document.querySelector('.learning-assistant-timeline');return v.scrollHeight-v.scrollTop-v.clientHeight<4})()`), 'latest-message-control')
      await selected(source); await act('Explain Selected Code (Practice)'); await text('C4C_EXPLAIN')
      await act('Suggest Fix'); await text('C4C_FIX'); await snap('beui-proposal')
      await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
      await snap('beui-Diff'); await button('Discard')
      check(await evaluate('probe.model.getValue()')===source,'beui-Discard-preserves-editor')
      await wait(`!document.querySelector('[aria-label="Câu hỏi"]').disabled`)
      await evaluate(`document.querySelector('[aria-label="Câu hỏi"]').focus()`)
      await window.webContents.debugger.sendCommand('Input.insertText', { text: 'C4C_QUESTION_CANARY: keyboard consent only.' })
      for (const type of ['keyDown','keyUp']) await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 8 })
      check(!(await evaluate(`!!document.querySelector('[aria-label="Xác nhận gửi Gemini"]')`)),'native-Shift-Enter-does-not-submit')
      for (const type of ['keyDown','keyUp']) await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await wait(`!!document.querySelector('[aria-label="Xác nhận gửi Gemini"]')`)
      check(postCount===5&&await evaluate(`document.activeElement?.textContent==='Đồng ý gửi Gemini'`),'native-Enter-prepares-and-focuses-consent-without-inference')
      await snap('keyboard-consent'); await button('Cancel')
      check(await evaluate('probe.model.getValue()')===source,'keyboard-composer-keeps-Monaco-source')
      check(postCount===5,'beui-no-extra-inference-or-tools')
    } else if (scenario.startsWith('detect-f5')) {
      stage = 'F5-whole-submission-detection'
      await evaluate(`probe.ed.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1})`)
      const before = postCount
      await button('Suggest Fix'); await wait(`!!document.querySelector('.smart-hints-consent')`)
      check(postCount === before, 'F5-consent-before-inference')
      await button('Đồng ý gửi snapshot'); await text('F5_MISSING_B')
      await wait(`probe.api.getModelMarkers({owner:'student-ide.ai-detection',resource:probe.model.uri}).length===1`, 'F5-Monaco-marker')
      check(await evaluate(`(()=>{const line=probe.model.getPositionAt(${source.indexOf('return')}).lineNumber;return probe.model.getAllDecorations().some(d=>d.options.className==='smart-detection-line'&&d.options.isWholeLine&&d.range.startLineNumber===line)})()`), 'F5-immediate-whole-error-line-highlight')
      await wait(`!!document.querySelector('.monaco-editor .smart-detection-line')`)
      check(await evaluate(`getComputedStyle(document.querySelector('.monaco-editor .smart-detection-line')).backgroundColor==='rgba(220, 38, 38, 0.12)'`), 'F5-light-red-error-line')
      check(!(await evaluate(`!!document.querySelector('[aria-label="Error Details"],.smart-detection-details')`)), 'F5-no-bottom-details-after-detection')
      await snap('F5-inline-error')
      check(await evaluate(`probe.model.getValue()` ) === source, 'F5-no-source-mutation')
      check(!(await evaluate(`!!document.querySelector('.smart-hint-diff')||[...document.querySelectorAll('button')].some(b=>['Review Diff','Confirm'].includes(b.textContent.trim()))`)), 'F5-no-Diff-or-Confirm')
      await evaluate(`[...document.querySelectorAll('[aria-label="Phát hiện lỗi toàn bài"] button')].find(b=>b.textContent.includes('F5_MISSING_B')).click()`)
      check(!(await evaluate(`!!document.querySelector('[aria-label="Error Details"]')`)), 'F5-issue-navigation-without-bottom-details')
      check(await evaluate(`probe.ed.getPosition().lineNumber===probe.model.getPositionAt(${source.indexOf('return')}).lineNumber`), 'F5-issue-navigates-to-source')
      const markerPoint = await evaluate(`(()=>{const p=probe.ed.getScrolledVisiblePosition(probe.model.getPositionAt(${source.indexOf('return') + 2}));const r=probe.ed.getDomNode().getBoundingClientRect();return {x:r.left+p.left+1,y:r.top+p.top+p.height/2}})()`)
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...markerPoint })
      await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...markerPoint })
      check(!(await evaluate(`!!document.querySelector('[aria-label="Error Details"]')`)), 'F5-marker-click-without-bottom-details')
      check(await evaluate(`probe.model.getAllDecorations().some(d=>d.options.linesDecorationsClassName==='smart-detection-margin')`), 'F5-visible-error-line-decoration')
      for (const target of ['whitespace', 'line-number', 'line-margin']) {
        const point = await evaluate(`(()=>{
          const line=probe.model.getPositionAt(${source.indexOf('return')}).lineNumber;
          const p=probe.ed.getScrolledVisiblePosition({lineNumber:line,column:probe.model.getLineMaxColumn(line)});
          const r=probe.ed.getDomNode().getBoundingClientRect(), l=probe.ed.getLayoutInfo();
          const x=${JSON.stringify(target)}==='whitespace'?p.left+12:${JSON.stringify(target)}==='line-number'?l.lineNumbersLeft+l.lineNumbersWidth/2:l.decorationsLeft+l.decorationsWidth/2;
          return {x:r.left+x,y:r.top+p.top+p.height/2};
        })()`)
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point })
        await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...point })
        check(!(await evaluate(`!!document.querySelector('[aria-label="Error Details"]')`)), `F5-native-${target}-click-without-bottom-details`)
      }
      await snap('F5-no-bottom-details')
      await edit(source + '\n')
      await wait(`probe.api.getModelMarkers({owner:'student-ide.ai-detection',resource:probe.model.uri}).length===0&&!document.querySelector('[aria-label="Error Details"]')`)
      check(await evaluate(`!probe.model.getAllDecorations().some(d=>d.options.linesDecorationsClassName==='smart-detection-margin')`), 'F5-edit-clears-line-decorations')
      check(true, 'F5-edit-clears-stale-marker-and-details')
      check(postCount === before + 1, 'F5-single-inference-no-auto-run')
      await snap('F5-final')
    } else if (scenario.startsWith('hint-f4')) {
      const target = async (a,b=a) => evaluate(`(()=>{const a=probe.model.getPositionAt(${a}),b=probe.model.getPositionAt(${b});probe.ed.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column})})()`)
      const review = async () => { await button('Apply',2); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`, 'F4-Diff') }
      stage = 'F4-incomplete-loop-auto-target'
      await target(0); await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      check(requests.at(-1).input.implementationState==='HAS_IMPLEMENTATION', 'F4-loop-HAS_IMPLEMENTATION')
      await review(); check(await evaluate('probe.model.getValue()')===source,'F4-Diff-before-any-edit')
      await button('Apply Fix',2); await wait(`probe.model.getValue().includes('sum += i;')`)
      const applied=await evaluate('probe.model.getValue()')
      check(applied.replace('sum += i;','')===source,'F4-loop-header-declarations-and-surroundings-preserved')
      await evaluate(`probe.ed.trigger('f4','undo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(source)}`)
      await evaluate(`probe.ed.trigger('f4','redo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(applied)}`)
      check(events.some(e=>e.channel==='smart-hints:prepare-hint-apply'&&e.result.value?.target.kind==='PARSER_RESOLVED'),'F4-correlated-parser-resolved-target')
      stage = 'F4-ambiguity-retry-and-Discard'
      const loop=f4Loop.slice(f4Loop.indexOf('for ('),f4Loop.indexOf('return sum;'))
      const ambiguous=f4Wrap(f4Loop.replace('return sum;',loop+'return sum;'))
      await edit(ambiguous); await target(0); await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      await button('Apply'); await text('TARGET_INVALID (TARGET)')
      const posts=postCount, at=ambiguous.indexOf('{',ambiguous.indexOf('for ('))+1
      await target(at); await review(); check(postCount===posts,'F4-target-retry-same-Hint-no-inference')
      await button('Discard'); await wait(`!document.querySelector('.smart-hint-diff[open]')`)
      check(await evaluate('probe.model.getValue()')===ambiguous,'F4-Discard-preserves-source')
      stage = 'F4-return-boundary-replacement'
      await click('#learning-chapters button:nth-child(2)')
      await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row'); await connect()
      if (await evaluate('probe.model.getLanguageId()')!==language) { await select('[aria-label="Ngôn ngữ bài tập"]',language); await pause(250); await connect() }
      const sumWrap=body=>language==='csharp'?`public class Solution { public int Sum(int a,int b) {\n${body}\n} }`:`function Sum(a,b) {\n${body}\n}`
      const logic=sumWrap('return a;'); f4Code='return a + b;'
      await edit(logic); await open(); await target(logic.indexOf('return')); await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      await review(); await button('Apply Fix'); await wait(`probe.model.getValue().includes('return a + b;')`)
      check(await evaluate('probe.model.getValue()')===logic.replace('return a;','return a + b;'),'F4-one-return-not-duplicate')
      await evaluate(`probe.ed.trigger('f4','undo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(logic)}`)
      await evaluate(`probe.ed.trigger('f4','redo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(logic.replace('return a;','return a + b;'))}`)
      stage = 'F4-syntax-uncertainty-fail-closed'
      const syntax=sumWrap('return a + ;')
      await edit(syntax); await target(syntax.indexOf('return'),syntax.indexOf('return')+'return a + ;'.length)
      await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      check(requests.at(-1).input.implementationState==='UNCERTAIN','F4-syntax-not-forced-to-HAS-or-NO')
      await button('Apply'); await text('UNSUPPORTED (CLASSIFICATION)')
      check(await evaluate('probe.model.getValue()')===syntax&&!await evaluate(`!!document.querySelector('.smart-hint-diff[open]')`),'F4-syntax-denied-without-source-replacement')
      check(postCount===4&&!events.some(e=>e.channel==='exercise:run'),'F4-no-extra-inference-or-execution')
      await snap('hint-f4-final')
    } else if (scenario.startsWith('hint-apply')) {
      stage = 'Hint-template-Diff-Apply'
      await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      check(postCount === 1 && requests[0].input.implementationState === 'NO_IMPLEMENTATION', 'template-Hint-one-inference')
      await wait(`(()=>{const h=document.querySelector('section[aria-label="Hint"] .assistant-code-header');return h&&Array.from(h.querySelectorAll('button')).some(b=>b.textContent==='Apply'&&!b.disabled)})()`, 'Hint-toolbar-ready')
      check(await evaluate(`(()=>{const h=document.querySelector('section[aria-label="Hint"] .assistant-code-header');return h.firstElementChild.className==='assistant-code-language'&&!!h.querySelector('[aria-label="Copy code"]')&&Array.from(h.querySelectorAll('button')).some(b=>b.textContent==='Apply'&&!b.disabled)})()`), 'Hint-toolbar-language-left-actions-right')
      await button('Apply', 2)
      await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`, 'Hint-real-Diff')
      check(await evaluate('probe.model.getValue()') === source && postCount === 1, 'Hint-Review-no-edit-or-inference')
      await snap('hint-template-diff'); await button('Apply Fix', 2)
      await wait(`probe.model.getValue().includes('return a + b;')`, 'Hint-manual-Apply')
      const applied = await evaluate('probe.model.getValue()')
      await evaluate(`probe.ed.trigger('c4c','undo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(source)}`, 'Hint-native-Undo')
      await evaluate(`probe.ed.trigger('c4c','redo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(applied)}`, 'Hint-native-Redo')
      check(events.filter(e=>e.channel==='smart-hints:prepare-hint-apply').length===1&&events.filter(e=>e.channel==='smart-hints:consume-hint-apply').length===1, 'Hint-duplicate-clicks-one-prepare-and-consume')
      const partial = applied.replace('return a + b;', 'return a + 0;')
      await edit(partial)
      const at = partial.indexOf('return a + 0;')
      const target = async (a,b) => evaluate(`(()=>{const a=probe.model.getPositionAt(${a}),b=probe.model.getPositionAt(${b});probe.ed.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column})})()`)
      await target(at,at+'return a + 0;'.length); await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      await button('Apply'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
      await button('Discard'); await wait(`!document.querySelector('.smart-hint-diff[open]')`)
      check(await evaluate('probe.model.getValue()')===partial&&postCount===2, 'Hint-partial-selection-Discard-no-edit-or-extra-inference')
      check(events.some(e=>e.channel==='smart-hints:discard-hint-apply'&&e.result.ok), 'Hint-Discard-revokes-Main-grant')
      await target(at+2,at+2); await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      await button('Apply'); await text('Failed')
      check(await evaluate('probe.model.getValue()')===partial&&postCount===3, 'invalid-caret-fails-closed-before-grant')
      check(await evaluate(`document.querySelector('.learning-assistant').textContent.includes('TARGET_INVALID (TARGET)')`), 'specific-target-stage-visible')
      let rejectedDiagnostic
      await until(async () => {
        try { rejectedDiagnostic = JSON.parse(await readFile(join(userData, 'smart-hints-last-hint-apply.json'), 'utf8')); return rejectedDiagnostic.reason === 'TARGET_INVALID' }
        catch (e) { if (e.code !== 'ENOENT') throw e; return false }
      }, 'persisted-Hint-target-diagnostic')
      scan(rejectedDiagnostic)
      check(rejectedDiagnostic.stage === 'TARGET' && rejectedDiagnostic.attempt === 1 && !Object.keys(rejectedDiagnostic).some(k => /source|code|offset|request|operation|path/i.test(k)), 'fixed-field-target-diagnostic-no-source')
      await target(at,at+'return a + 0;'.length); await button('Apply',2)
      await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`, 'same-Hint-retry-Diff')
      check(await evaluate('probe.model.getValue()')===partial&&postCount===3,'same-Hint-retry-no-edit-or-inference')
      await button('Apply Fix',2); await wait(`probe.model.getValue().includes('return a + b;')`, 'retry-manual-Apply')
      await evaluate(`probe.ed.trigger('c4c','undo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(partial)}`, 'retry-native-Undo')
      await evaluate(`probe.ed.trigger('c4c','redo',null)`); await wait(`probe.model.getValue().includes('return a + b;')`, 'retry-native-Redo')
      check(postCount===3,'same-Hint-retry-no-Gemini')
      const attempts = events.filter(e=>e.channel==='smart-hints:prepare-hint-apply').slice(-2)
      check(attempts.length===2&&!attempts[0].result.ok&&attempts[1].result.ok
        &&JSON.stringify(attempts[0].request.hint)===JSON.stringify(attempts[1].request.hint)
        &&attempts[0].request.requestId!==attempts[1].request.requestId,'same-trusted-Hint-two-manual-attempts')
      const retainedFailure = JSON.parse(await readFile(join(userData, 'smart-hints-last-hint-apply.json'), 'utf8'))
      check(retainedFailure.reason==='TARGET_INVALID'&&retainedFailure.attempt===1,'successful-retry-retains-last-rejection-diagnostic')
      check(events.filter(e=>e.channel==='smart-hints:consume-hint-apply').length===2, 'only-successful-grants-consume-once')
      check(guards.hintPrepare===4&&guards.hintValidate>=1,'real-Hint-parser-and-signature-gates')
      check(!events.some(e=>e.channel==='exercise:run'),'Hint-does-not-Run-Judge-Submit')
      await snap('hint-apply-final')
    } else if (scenario === 'hint' || scenario === 'hint-js') {
      stage = 'unified-Hint-consent-and-card'
      await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
      check(postCount===1, 'one-Hint-one-inference')
      check(requests[0].input.action.kind==='HINT' && !('level' in requests[0].input.action), 'no-level-or-unlock')
      await wait(`!!document.querySelector('section[aria-label="Hint"] code[data-highlighted="true"]')`, 'real-Hint-tokenizer')
      const card = await evaluate(`(()=>{const c=document.querySelector('section[aria-label="Hint"]');return {
        headings:Array.from(c.querySelectorAll('h3')).map(h=>h.textContent),last:c.lastElementChild.querySelector('code')?.textContent,
        language:c.querySelector('code')?.className,highlighted:c.querySelector('code')?.dataset.highlighted}})()`)
      check(card.headings.join('|')==='Gợi ý tư duy|Hướng dẫn thực hiện|Gợi ý code' && card.last==='return a + b;' && card.language===`language-${language}` && card.highlighted==='true', 'three-sections-language-code-last')
      check(await evaluate('probe.model.getValue()')===source, 'Hint-does-not-edit-editor')
      await snap('unified-hint')
      await sendChat('C4C_QUESTION_CANARY: follow up on the Hint.')
      check(!JSON.stringify(requests.at(-1).body).includes('C4D_HINT'), 'Hint-not-replayed-in-trusted-Chat-history')
      check(await evaluate(`document.querySelectorAll('section[aria-label="Hint"]').length===1&&!document.querySelector('.smart-hints-levels')`), 'Hint-retained-in-timeline-without-progression')
      await snap('Hint-and-Chat')
    } else if (scenario === 'layout') {
      stage = 'three-column-layout'
      check(await evaluate(`document.querySelector('.learning-layout').dataset.collapsed==='true'`), 'AI-open-collapses-roadmap')
      await evaluate(`globalThis.c4cEditor=probe.ed;void(globalThis.c4cModel=probe.model)`)
      for (const width of [1440, 1280, 1000]) {
        window.setSize(width, 1000); await pause(350)
        const layout = await evaluate(`(()=>{
          const box=s=>document.querySelector(s).getBoundingClientRect();
          const d=box('.practice-description-pane'),e=box('.practice-code-column'),a=box('.practice-body > .learning-assistant'),b=box('.practice-body');
          return {ordered:d.right<=e.left+1&&e.right<=a.left+1,contained:a.right<=b.right+1&&a.bottom<=b.bottom+1,
            widths:[d.width,e.width,a.width],height:a.height,position:getComputedStyle(document.querySelector('.practice-body > .learning-assistant')).position,
            sameEditor:probe.ed===c4cEditor&&probe.model===c4cModel&&!c4cModel.isDisposed()}
        })()`)
        console.log(JSON.stringify({layoutWidth:width,...layout}))
        check(layout.ordered && layout.contained && layout.position==='static' && layout.sameEditor && layout.widths.every(w=>w>150), `three-columns-no-overlap-${width}`)
        await snap(`three-columns-${width}`)
      }
      window.setSize(1440, 1000); await pause(200)
      const dockedWidth = await evaluate(`document.querySelector('.practice-code-column').getBoundingClientRect().width`)
      await button('Đóng Learning Assistant'); await wait(`!document.querySelector('.learning-assistant')`); await pause(250)
      check(await evaluate(`document.querySelector('.practice-code-column').getBoundingClientRect().width>${dockedWidth}&&probe.ed===c4cEditor&&probe.model===c4cModel`), 'close-restores-editor-space-without-remount')
      check(await evaluate(`document.querySelector('.learning-layout').dataset.collapsed==='true'`), 'close-keeps-sidebar-collapsed')
      await open(); await snap('reopened')
      check(postCount===0, 'layout-only-zero-inference')
    } else if (scenario === 'chat') {
      stage = 'chat-two-turns'
      await sendChat('C4C_QUESTION_CANARY: explain a boundary.', 'QUESTION_ONLY')
      check(requests[0].input.attachment === null && !JSON.stringify(requests[0].body).includes('C4C_SOURCE_CANARY'), 'question-only-no-source')
      await sendChat('C4C_QUESTION_CANARY: follow up.', 'QUESTION_ONLY')
      check(requests[1].body.contents.map(c => c.role).join(',') === 'user,model,user', 'trusted-two-turn-replay')
      stage = 'chat-selection-source'
      const selection = await selected(source)
      await sendChat('C4C_QUESTION_CANARY: selection.', 'QUESTION_WITH_SELECTION')
      check(requests[2].input.attachment.text === selection && !JSON.stringify(requests[2].body).includes('C4C_SOURCE_CANARY'), 'selection-only-attachment')
      await sendChat('C4C_QUESTION_CANARY: source.', 'QUESTION_WITH_SOURCE')
      check(requests[3].input.attachment.source === source, 'explicit-full-source')
      await snap('multi-turn')
      stage = 'chat-cancel-late'
      mode = 'late'; await compose('C4C_QUESTION_CANARY: cancel.')
      await button('Đồng ý gửi Gemini'); await until(() => pending.length === 1, 'pending-http')
      await snap('loading'); await button('Cancel'); await text('Cancelled')
      pending.splice(0).forEach(r => r()); await pause(200)
      check(!(await evaluate(`document.body.textContent.includes('C4C_LATE_REPLY')`)), 'cancel-rejects-late-reply')
      stage = 'chat-close-navigation'
      await button('Đóng Learning Assistant'); await open()
      check(await evaluate(`document.querySelectorAll('[data-message-id]').length===0`), 'close-purges-session')
      await button('Đóng Learning Assistant')
      await select('[aria-label="Ngôn ngữ bài tập"]', 'javascript'); await pause(250); await connect(); await open()
      check(await evaluate(`document.querySelectorAll('[data-message-id]').length===0`), 'language-rebind-no-history')
      mode = 'failure'; await compose('C4C_QUESTION_CANARY: failure.'); await button('Đồng ý gửi Gemini'); await text('Failed')
      check(await evaluate(`document.querySelectorAll('[data-message-id]').length===0`), 'failed-no-history-commit')
      await snap('failed')
    } else if (scenario === 'safety') {
      stage = 'source-stale-late'
      mode = 'late'; await compose('C4C_QUESTION_CANARY: stale source.'); await button('Đồng ý gửi Gemini')
      await until(() => pending.length === 1, 'held-stale-http')
      await edit(source + '// changed\n'); await text('Ready')
      pending.splice(0).forEach(r => r()); await pause(150)
      check(!(await evaluate(`document.body.textContent.includes('C4C_LATE_REPLY')`)), 'source-change-rejects-late-reply')
      stage = 'real-timeout'
      await compose('C4C_QUESTION_CANARY: timeout.'); const timeoutStart = Date.now(); await button('Đồng ý gửi Gemini')
      await until(() => events.some(e => e.channel === 'learning-chat:status' && e.result.value?.state === 'FAILED' && e.result.value.code === 'TIMEOUT'), 'actual-10s-timeout', 14000)
      timing.actualTimeoutMs = Date.now() - timeoutStart
      check(timing.actualTimeoutMs >= 9500 && timing.actualTimeoutMs < 14000, 'unchanged-real-10s-timeout')
      pending.splice(0).forEach(r => r()); await pause(150); await snap('timeout')
      stage = 'shared-slot-consent-ownership'
      await compose('C4C_QUESTION_CANARY: active slot.'); await button('Đồng ý gửi Gemini'); await until(() => pending.length === 1, 'held-active-http')
      check(await evaluate(`Array.from(document.querySelectorAll('.learning-assistant-actions button')).every(b=>b.disabled)`), 'UI-shared-slot-blocks-actions')
      const before = postCount
      const active = events.filter(e => e.channel === 'learning-chat:get' && e.result.ok).at(-1).result.value
      const busy = await evaluate(`(async()=>{
        const api=window.studentIde.learning.smartHints;
        const q={requestId:crypto.randomUUID(),clientContextId:crypto.randomUUID(),exerciseId:'ch2-01',language:'csharp',sourceRevision:${active.context.sourceRevision},
          source:probe.model.getValue(),origin:{kind:'PRACTICE',modelId:${JSON.stringify(active.context.modelId)},modelVersion:probe.model.getVersionId(),eol:probe.model.getEOL()==='\\r\\n'?'CRLF':'LF'},action:{kind:'ANALYZE'},run:null};
        const p=await api.prepare(q);if(!p.ok)return {prepared:false};
        const ref={requestId:q.requestId,operationId:p.value.operationId};
        const denied=await api.start(ref);
        const started=await api.start({...ref,captureToken:p.value.captureToken,consentVersion:1,consentGranted:true});
        return {prepared:true,unconsentedDenied:!denied.ok,state:started.ok?started.value.state:null,code:started.ok?started.value.code:null}
      })()`)
      check(busy.prepared && busy.unconsentedDenied && busy.state === 'FAILED' && busy.code === 'BUSY' && postCount === before, 'Main-shared-slot-and-consent-enforced')
      const child = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: join(root, 'preload/index.js') } })
      try {
        await child.loadURL('about:blank')
        const denied = await child.webContents.executeJavaScript(`window.studentIde.learning.chat.openSession({context:{kind:'LEARNING',courseId:'ky-thuat-lap-trinh',chapter:2}})`)
        check(denied.ok === false, 'foreign-WebContents-owner-rejected')
      } finally { child.destroy() }
      await button('Cancel'); await text('Cancelled'); pending.splice(0).forEach(r => r()); await pause(150)
      mode = 'ok'
      await sendChat('C4C_QUESTION_CANARY: rate one.'); await sendChat('C4C_QUESTION_CANARY: rate two.'); await sendChat('C4C_QUESTION_CANARY: rate three.')
      stage = 'shared-rate-limit'
      await button('Analyze Code & Run'); await wait(`!!document.querySelector('.smart-hints-consent[open]')`); await button('Đồng ý gửi snapshot')
      await until(() => events.some(e => e.channel === 'smart-hints:start' && e.result.value?.code === 'RATE_LIMIT'), 'shared-rate-limit')
      check(postCount === 6, 'six-per-minute-no-bypass-or-retry')
      check(lateBodiesCancelled >= 3, 'late-response-bodies-cleaned')
      await snap('rate-limit')
      stage = 'rapid-reopen-and-exercise-navigation'
      await button('Đóng Learning Assistant'); await wait(`!document.querySelector('.learning-assistant')`)
      stage = 'rapid-reopen-first'; await open()
      await button('Đóng Learning Assistant'); await wait(`!document.querySelector('.learning-assistant')`)
      stage = 'rapid-reopen-second'; await open()
      check(await evaluate(`document.querySelectorAll('[data-message-id]').length===0`), 'rapid-reopen-clean-session')
      stage = 'exercise-navigation'
      await button('Về danh sách bài tập'); await wait(`!document.querySelector('.learning-assistant')`)
      await wait(`document.querySelectorAll('.practice-row').length>1`)
      await evaluate(`document.querySelectorAll('.practice-row')[1].click()`); await connect()
      if (await evaluate(`!!document.querySelector('.learning-assistant')`)) await wait(`document.querySelector('.learning-assistant-state')?.textContent==='Ready'`)
      else await open()
      check(await evaluate(`document.querySelectorAll('[data-message-id]').length===0`), 'exercise-switch-clean-session')
      check(postCount === 6, 'navigation-no-inference')
    } else {
      stage = 'quick-actions'
      if (scenario === 'javascript') {
        await button('Đóng Learning Assistant')
        await button('Run'); await until(() => events.some(e => ['exercise:snapshot', 'exercise:changed'].includes(e.channel) && e.result.ok
          && e.result.value?.phase === 'finished' && e.result.value?.cleanup?.state === 'FINALIZED'), 'public-Run', 60000)
        await open(); await act('Hint'); await text('C4D_HINT: compare the two public inputs.')
        await sendChat('C4C_QUESTION_CANARY: advisory between actions.')
        check(!JSON.stringify(requests.at(-1).body).includes('C4D_HINT'), 'Quick-cards-not-in-Gemini-history')
        await wait(`Array.from(document.querySelectorAll('.learning-assistant-actions button')).some(b=>b.textContent==='Hint'&&!b.disabled)`)
        check(await evaluate('probe.model.getValue()') === source, 'free-chat-no-editor-change-or-Hint-reset')
        await act('Analyze Code & Run'); await text('C4C_ANALYZE')
        check(requests.at(-1).input.runContext.kind === 'RUN_PUBLIC', 'Analyze-real-public-Run-receipt')
        const beforeRun = events.filter(e => e.channel === 'exercise:run').length
        await selected(source); await act('Explain Selected Code (Practice)'); await text('C4C_EXPLAIN')
        check(requests.at(-1).input.action.selection.text === 'return a + 0;', 'Explain-real-Monaco-selection')
        check(events.filter(e => e.channel === 'exercise:run').length === beforeRun, 'actions-do-not-auto-Run')
      }
      let baseline = source
      if (scenario === 'csharp') {
        baseline = source.replace('return a + 0;', 'return a + ;')
        await edit(baseline); await selected(baseline); await wait(`!!document.querySelector('.learning-assistant-state')&&document.querySelector('.learning-assistant-state').textContent==='Ready'`)
      }
      stage = 'real-parser-Fix'
      await act('Suggest Fix'); await text('C4C_FIX')
      check(await evaluate('probe.model.getValue()') === baseline, 'no-auto-Apply')
      await snap('proposal'); await button('Diff Preview')
      await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`, 'real-Diff')
      await wait(`Array.from(document.querySelectorAll('.smart-hint-diff button')).some(b=>b.textContent==='Apply Fix'&&!b.disabled)`, 'Diff-computed')
      await snap('diff')
      await button('Apply Fix', 2); await wait(`probe.model.getValue().includes('return a + b;')`, 'manual-Apply')
      await evaluate(`probe.ed.trigger('c4c','undo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(baseline)}`, 'native-Undo')
      await evaluate(`probe.ed.trigger('c4c','redo',null)`); await wait(`probe.model.getValue().includes('return a + b;')`, 'native-Redo')
      check(guards.preflight > 0 && guards.verify > 0 && guards.languages.includes(language), 'real-parser-preflight-and-postflight')
      await edit(baseline); await selected(baseline); await act('Suggest Fix'); await text('C4C_FIX')
      await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open]')`); await button('Discard')
      check(await evaluate('probe.model.getValue()') === baseline, 'Discard-no-editor-change')
      check(!(await evaluate(`Array.from(document.querySelectorAll('.learning-assistant button')).some(b=>b.textContent==='Diff Preview')`)), 'discard-revokes-authority')
      await snap('discarded')
      if (scenario === 'csharp') {
        stage = 'stale-proposal'
        await selected(baseline); await act('Suggest Fix'); await text('C4C_FIX'); await button('Diff Preview')
        await wait(`!!document.querySelector('.smart-hint-diff[open]')`)
        await edit(baseline + '// newer source\n')
        await wait(`!document.querySelector('.smart-hint-diff[open]')`)
        check(!(await evaluate(`Array.from(document.querySelectorAll('.learning-assistant button')).some(b=>b.textContent==='Diff Preview')`)), 'source-revision-revokes-old-proposal')
        await evaluate(`probe.ed.trigger('c4c','undo',null)`)
        check(!(await evaluate(`Array.from(document.querySelectorAll('.learning-assistant button')).some(b=>b.textContent==='Diff Preview')`)), 'Undo-does-not-revive-Apply-grant')
        stage = 'real-signature-guard'
        await edit(baseline); await selected(baseline); mode = 'invalid-fix'; await act('Suggest Fix')
        await until(() => events.some(e=>e.channel==='smart-hints:status' && e.result.value?.state==='FAILED' && e.result.value.code==='INVALID_RESPONSE'), 'real-guard-rejects-invalid-edit')
        check(await evaluate('probe.model.getValue()') === baseline, 'invalid-edit-no-authority')
        mode = 'no-fix'; await selected(baseline); await act('Suggest Fix'); await text('C4C_NO_FIX')
        check(!(await evaluate(`Array.from(document.querySelectorAll('.learning-assistant button')).some(b=>b.textContent==='Diff Preview')`)), 'NO_FIX-no-Apply-authority')
        await snap('no-fix')
      }
      check(originalSource.includes('Sum'), 'catalogue-signature-preserved')
    }
    stage = 'final-safety'
    const stored = JSON.parse(await readFile(join(userData, 'smart-hints-settings.json'), 'utf8'))
    check(stored.usedRequests === postCount, 'one-durable-reservation-per-POST')
    check(blockedNetwork === 0, 'zero-real-Chromium-HTTP')
    check(consoleErrors.length === 0, 'zero-Renderer-console-errors')
    const gaps = await evaluate('c4cFrames.gaps.slice().sort((a,b)=>a-b)')
    timing.frameP95Ms = Math.round(gaps[Math.floor(gaps.length * .95)] ?? 0); timing.maxFrameGapMs = Math.round(gaps.at(-1) ?? 0)
    try { scan(await readFile(join(userData, 'smart-hints-last-suggest-fix.json'), 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
    try { scan(await readFile(join(userData, 'smart-hints-last-hint-apply.json'), 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
    check(!diagnosticsLeak, 'diagnostics-no-source-prompt-history-or-key')
    const unique = [...new Set(checks)]
    console.log(JSON.stringify({ scenario, result: 'FUNCTIONAL_PASS', directory, checks: unique, postCount, reserved: stored.usedRequests, aborts, lateBodiesCancelled,
      guards, timing, consoleErrors: consoleErrors.length, diagnostics: diagnostics.length, appPid: process.pid, windowVisible: window.isVisible() }))
    if (heldWindow) {
      window.setTitle(`C4-C Offline ${scenario} - isolated`)
      window.show(); window.focus()
      console.log('C4C_GUI_READY')
      const holdUntil = Date.now() + 600000
      while (!window.isDestroyed() && Date.now() < holdUntil) {
        if (await access(join(directory, 'release')).then(() => true, () => false)) break
        await pause(200)
      }
    }
    // Exercise normal awaited service/draft/diagnostic cleanup. app.exit()
    // bypasses before-quit and does not verify the application's shutdown path.
    app.once('will-quit', () => console.log(JSON.stringify({ scenario, result: 'SHUTDOWN_EVENT', stage: 'normal-shutdown' })))
    app.quit()
  } catch (error) {
    if (window && !window.isDestroyed()) await writeFile(join(directory, 'failure.png'), (await window.webContents.capturePage()).toPNG()).catch(() => {})
    console.error(JSON.stringify({ scenario, result: 'FAIL', stage, directory, postCount, consoleErrors: consoleErrors.length, guards,
      error: error.name, check: activeCheck, lastEvent: events.at(-1) ? { channel: events.at(-1).channel, state: events.at(-1).result.value?.state,
        code: events.at(-1).result.error?.code } : null }))
    app.exit(1)
  } finally { delete globalThis.__c4cConfigure; delete globalThis.__c4cObserveApplication }
}

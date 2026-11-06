/* global process, console, setTimeout, clearTimeout, Response */
// SH-4 offline tests. Default: normal Main configuration with fake dependencies. --launcher: historical
// Main argv composition, fake fetch/native preflight confirmation; build unchanged.
// Real renderer/preload/IPC/capture/service/Gemini adapter; synthetic HTTP only.
import assert from 'node:assert/strict'
import { createRequire, Module } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
if (!process.versions.electron) {
  const launcherMode = process.argv[2] === '--launcher'
  const { build } = await import('vite')
  await build({ configFile: false, logLevel: 'silent', build: {
    outDir: resolve('out/sh4-ui-provider'), emptyOutDir: false, minify: false,
    lib: { entry: resolve('src/main/services/learning/smart-hints/gemini-provider.ts'), formats: ['cjs'], fileName: () => 'provider.cjs' },
    rollupOptions: { external: [/^node:/] }
  } })
  if (launcherMode) await build({ configFile: false, logLevel: 'silent', build: {
    outDir: resolve('out/sh4-ui-provider'), emptyOutDir: false, minify: false,
    lib: { entry: resolve('src/main/services/learning/smart-hints/live-ui-acceptance.ts'), formats: ['cjs'], fileName: () => 'live-ui.cjs' },
    rollupOptions: { external: [/^node:/] }
  } })
  const env = Object.fromEntries(Object.keys(process.env)
    .filter(name => !/API_KEY|TOKEN|SECRET|ELECTRON_RUN_AS_NODE|ELECTRON_RENDERER_URL/i.test(name))
    .map(name => [name, process.env[name]]))
  const scenarios = ['csharp', 'javascript', 'review', 'missing-key', 'rate-limit', 'invalid-json', 'invalid-schema', 'timeout', 'retire', 'max-tokens', 'safety', 'provider-error', ...(launcherMode ? ['no-gate', 'budget', 'preflight-cancel', 'invalid-gate', 'entry', 'capability-race'] : [])]
  const selected = process.argv[launcherMode ? 3 : 2]
  if (process.argv.length > (launcherMode ? 4 : 3) || selected && !scenarios.includes(selected)) throw Error('Unsupported offline scenario')
  for (const scenario of selected ? [selected] : scenarios) {
    const code = await new Promise((done, reject) => {
      let output = ''
      const child = spawn(require('electron'), [resolve('scripts/smoke-smart-hints-gemini-ui.mjs'), scenario, ...(launcherMode ? ['--launcher-test'] : [])], { env, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true })
      child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
      const timer = setTimeout(() => { child.kill(); reject(Error(`Watchdog: ${scenario}`)) }, 180000)
      child.once('error', reject)
      child.once('exit', code => { clearTimeout(timer); done(code === 0 && output.includes('"result":"PASS"') ? 0 : 1) })
    })
    if (code !== 0) { process.exitCode = 1; break }
  }
} else {
  // Electron waits for ESM evaluation before emitting ready.
  void smoke().catch(error => { console.error(String(error)); process.exitCode = 1 })
}

async function smoke() {
  const { app, BrowserWindow, ipcMain, session, dialog } = await import('electron')
  const scenario = process.argv[2]
  const launcherMode = process.argv.includes('--launcher-test')
  const directory = resolve('out', `sh4-${launcherMode ? 'launcher' : 'ui'}-${scenario}-${Date.now()}`)
  await mkdir(join(directory, 'user-data'), { recursive: true })
  app.setPath('userData', join(directory, 'user-data'))
  const evidence = { scenario, result: 'NOT_TESTED', checks: [], calls: [], capabilities: [], forbiddenCalls: [], transport: [], diagnostics: [], errors: [], credentialLeak: false, networkBlocked: 0, aborts: 0 }
  let releaseCapabilities
  const delayedCapabilities = new Promise(done => { releaseCapabilities = done })
  let window, hold = false, lastInput
  const fakeKey = 'AQ.SH4_SYNTHETIC_OFFLINE_CREDENTIAL'
  const pause = ms => new Promise(done => setTimeout(done, ms))
  const until = async (check, label) => {
    const due = Date.now() + 35000
    while (Date.now() < due) { if (await check()) return; await pause(40) }
    throw Error(`UI timeout: ${label}`)
  }
  // Block real HTTP in Main and Chromium. Transport below never delegates.
  globalThis.fetch = () => { evidence.networkBlocked++; throw Error('Real HTTP forbidden') }
  await app.whenReady()
  // Keep the observer alive after the last real window closes, solely to
  // persist abort/owner cleanup evidence. Final app.exit below is unconditional.
  app.on('before-quit', event => event.preventDefault())
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    evidence.networkBlocked++; callback({ cancel: true })
  })
  const send = async request => {
    assert.equal(request.headers.get('x-goog-api-key'), fakeKey)
    evidence.transport.push({ method: request.method, url: request.url })
    if (request.method === 'GET') return Response.json({ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 2048 })
    const body = await request.json(), input = JSON.parse(body.contents[0].parts[0].text)
    lastInput = input
    assert.equal(JSON.stringify(body).includes(fakeKey), false)
    if (['max-tokens', 'safety', 'provider-error'].includes(scenario)) {
      assert.equal(input.action.kind, 'SUGGEST_FIX'); assert.equal(body.generationConfig.maxOutputTokens, 2048)
      if (scenario === 'provider-error') return Response.json({ error: { code: 503, status: 'UNAVAILABLE', message: 'SYNTHETIC_PROVIDER_PRIVATE_TEXT' } }, { status: 503 })
      return Response.json({ candidates: [{ finishReason: scenario === 'max-tokens' ? 'MAX_TOKENS' : 'SAFETY',
        content: { role: 'model', parts: [{ text: '{"kind":"EDIT_PROPOSAL"' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 768, thoughtsTokenCount: 1280, totalTokenCount: 2148 } })
    }
    if (hold || scenario === 'timeout') return new Promise((_, reject) => {
      request.signal.addEventListener('abort', () => { evidence.aborts++; reject(Error('Synthetic aborted')) }, { once: true })
    })
    if (!launcherMode && ['csharp', 'javascript'].includes(scenario) && input.action.kind === 'SUGGEST_FIX') {
      await new Promise((done, reject) => {
        const timer = setTimeout(done, 15000)
        request.signal.addEventListener('abort', () => { clearTimeout(timer); evidence.aborts++; reject(Error('Synthetic aborted')) }, { once: true })
      })
    }
    if (scenario === 'rate-limit') return Response.json({}, { status: 429 })
    const a = input.action, sumSample = input.source.includes('return a + 0;')
    const output = a.kind === 'HINT' ? { kind: 'HINT', level: a.level, paragraphs: [[
      'Hãy đối chiếu giá trị đầu vào và yêu cầu đầu ra, chưa cần viết code mới.',
      sumSample ? 'Kết hợp hai đầu vào bằng một phép toán trực tiếp; không cần vòng lặp. Đối chiếu cách tiếp cận với ví dụ công khai.'
        : 'Dùng phép biến đổi trực tiếp trên đầu vào; kiểm tra cách tiếp cận bằng ví dụ công khai.',
      sumSample ? 'Biểu thức return hiện dùng a và số 0; hãy kiểm tra đầu vào b còn thiếu trong phép tính.'
        : 'Theo dõi giá trị biểu thức ngay trước return rồi so sánh với ví dụ công khai.'
    ][a.level - 1]], nextQuestion: 'Giá trị trả về đang khác yêu cầu ở đâu?', evidence: [] }
      : a.kind === 'ANALYZE' ? { kind: 'ANALYSIS', hypotheses: [`Snapshot ${input.language}: ${sumSample ? 'return a + 0 giữ nguyên a và bỏ qua b.' : 'biểu thức cộng 0 giữ nguyên toán hạng trái.'}`], suggestions: ['Đối chiếu với yêu cầu đề bài; đây là nhận định chưa được Run xác nhận.'], evidence: [] }
        : a.kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'return trả giá trị biểu thức cho nơi gọi.', variables: 'Các tham số là dữ liệu đầu vào của hàm.', controlFlow: 'Hàm kết thúc tại return.', algorithm: 'Cộng số không giữ nguyên giá trị.', illustrativeExamples: ['Ví dụ minh họa: 2 + 0 bằng 2.'] }
          : { kind: 'EDIT_PROPOSAL', edits: [{ startOffset: input.source.indexOf('0;'), endOffset: input.source.indexOf('0;') + 1, expectedOldText: '0', replacementText: sumSample ? 'b' : '1', rationale: sumSample ? 'Dùng đầu vào b thay cho hằng số 0 để cộng hai đầu vào; chưa được Run xác nhận.' : 'Thay đổi minh họa để nghiệm thu; chưa xác nhận đúng đề.' }], rationale: 'OFFLINE: đề xuất chưa được kiểm chứng.', evidence: [] }
    const text = scenario === 'invalid-json' ? '{broken' : JSON.stringify(scenario === 'invalid-schema' ? { kind: 'ANALYSIS', hypotheses: 1 } : output)
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text }] } }] })
  }
  // Production build eliminates the disabled provider branch. Load the same
  // source factory independently for this process, without changing its gates.
  const { createGeminiSmartHintsService } = require(resolve('out/sh4-ui-provider/provider.cjs'))
  const liveUi = launcherMode ? require(resolve('out/sh4-ui-provider/live-ui.cjs')) : undefined
  if (launcherMode) {
    // Test actual built Main argv composition, not a replacement IPC/service.
    if (scenario !== 'no-gate') process.argv.push('--sh4-live-ui', '--live-ui-approved', '--free-tier-confirmed', '--samples-only-confirmed',
      '--approval-id', scenario === 'entry' ? `offline-entry-${Date.now()}` : 'synthetic-launch', '--project-id', 'sample-project', '--budget', scenario === 'invalid-gate' ? '0' : scenario === 'budget' ? '1' : scenario === 'capability-race' ? '3' : '6')
    if (scenario !== 'missing-key') process.env.GEMINI_API_KEY = fakeKey
    globalThis.fetch = request => send(request)
    const nativeConfirm = dialog.showMessageBox.bind(dialog)
    dialog.showMessageBox = async (...args) => {
      const details = args[0]
      if (details.title !== 'SH-4 Live UI Acceptance') return nativeConfirm(...args)
      assert.equal(details.defaultId, 0); assert.equal(details.cancelId, 0)
      assert.match(details.message, /gemini-3.1-flash-lite/)
      evidence.checks.push('Main native preflight: Cancel default, model/project/budget/terms disclosed; fake confirmation only')
      return { response: scenario === 'preflight-cancel' ? 0 : 1, checkboxChecked: false }
    }
  }
  globalThis.__sh4Create = (_factory, options) => createGeminiSmartHintsService({ ...options, development: true, liveApproved: true, freeTierConfirmed: true,
      readKey: () => scenario === 'missing-key' ? undefined : fakeKey, transport: { send } })
  // Reuse the actual built normal configuration/service; replace only privileged dependencies.
  // Fixture ciphertext and userData are isolated; never open native key input or real storage.
  if (!launcherMode) await writeFile(join(directory, 'user-data', 'smart-hints-settings.json'), JSON.stringify({
    version: 2, enabled: true, encryptedKey: scenario === 'missing-key' ? null : 'U1lOVEhFVElDX0VOR1JZUFRFRA==',
    usedRequests: 0, dailyLimit: 20, needsLimitReview: false, providerLimit: null,
  }))
  globalThis.__sh4Configure = (Configuration, options) => new Configuration({ ...options,
    transport: { send }, encryption: { available: async () => true, encrypt: async () => { throw Error('No key writes in UI test') }, decrypt: async () => fakeKey },
    onDiagnostic: diagnostic => { evidence.diagnostics.push(diagnostic); options.onDiagnostic?.(diagnostic) },
  })
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) => handle(channel, async (event, ...args) => {
    assert.equal(JSON.stringify(args).includes(fakeKey), false, 'credential absent from IPC request')
    if (/^(exercise:run|submission:submit|analysis:(prepare|start))$/.test(channel)) {
      evidence.forbiddenCalls.push(channel); throw Error('Unexpected Run/Submit/analysis')
    }
    if (channel.startsWith('smart-hints:')) evidence.calls.push({ channel, action: args[0]?.action?.kind })
    const response = await listener(event, ...args)
    assert.equal(JSON.stringify(response)?.includes(fakeKey), false, 'credential absent from IPC response')
    if (channel === 'smart-hints:capabilities') {
      evidence.capabilities.push(response.ok ? response.value : { enabled: false, failed: true })
      if (scenario === 'capability-race') await delayedCapabilities
    }
    return response
  })
  try {
    const filename = resolve('out/main/index.js'), original = await readFile(filename, 'utf8')
    const needle = launcherMode ? 'createGeminiSmartHintsService({' : 'new SmartHintsConfiguration({'
    assert.equal(original.split(needle).length, 2, 'exact single composition seam')
    const main = new Module(filename)
    main.filename = filename; main.paths = Module._nodeModulePaths(resolve('out/main'))
    if (launcherMode && scenario === 'entry') await import('./run-smart-hints-live-ui.mjs')
    else main._compile(launcherMode ? original : original.replace(needle, 'globalThis.__sh4Configure(SmartHintsConfiguration, {'), filename)
    await until(() => BrowserWindow.getAllWindows().length > 0, 'application window')
    window = BrowserWindow.getAllWindows()[0]
    window.setSize(1440, 1000); window.webContents.setBackgroundThrottling(false)
    window.webContents.on('console-message', event => {
      if (event.message.includes(fakeKey)) evidence.credentialLeak = true
      if (event.level === 'error') evidence.errors.push(event.message.replaceAll(fakeKey, '[REDACTED]'))
    })
    const prefs = window.webContents.getLastWebPreferences()
    assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true); assert.equal(prefs.nodeIntegration, false)
    const evaluate = code => window.webContents.executeJavaScript(code, true)
    const wait = expression => until(() => evaluate(expression).catch(() => false), expression)
    const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
    const button = async (label, times = 1) => {
      await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`)
      await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled);for(let i=0;i<${times};i++)b.click()})()`)
    }
    const text = value => wait(`document.querySelector('.smart-hints-body')?.textContent.includes(${JSON.stringify(value)})`)
    const connect = async () => {
      await wait(`!!document.querySelector('.practice-workspace .monaco-editor textarea')`)
      await wait(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);const api=Object.values(b).find(v=>v&&typeof v.getEditors==='function');const ed=api?.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode()));if(!ed)return false;globalThis.probe={ed,model:ed.getModel()};return true})()`)
    }
    const act = async label => {
      const before = evidence.transport.length
      await button(label, 2); await wait(`!!document.querySelector('dialog[open]')`)
      assert.equal(evidence.transport.length, before, 'consent precedes HTTP')
      assert.equal(await evaluate('document.activeElement.textContent'), 'Hủy')
      await button('Đồng ý gửi snapshot', 2)
      if (!launcherMode && ['csharp', 'javascript'].includes(scenario) && label === 'Suggest Fix') {
        await text('Đang chờ AI cho snapshot đã xác nhận')
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Hủy yêu cầu AI'&&!b.disabled)`), true)
        evidence.checks.push('Slow Suggest Fix: real loading and Cancel available; ordinary Main deadline30s, fake response delayed15s')
      }
    }
    await click('[aria-label="Open Learning"]')
    await click('#learning-chapters button:nth-child(2)')
    await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row')
    await connect()
    if (scenario === 'javascript') {
      await evaluate(`(()=>{const e=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'javascript');e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
      await wait(`document.querySelector('.practice-workspace .monaco-editor') && probe.model.isDisposed()`)
      await connect()
    }
    const language = scenario === 'javascript' ? 'javascript' : 'csharp'
    const source = launcherMode ? liveUi.LIVE_UI_SAMPLES[language]
      : language === 'javascript' ? 'function solve(x) {\n  return x + 0;\n}\n' : 'public static int Solve(int x) {\n  return x + 0;\n}\n'
    await evaluate(`probe.model.setValue(${JSON.stringify(source)})`)
    await button('Smart Hints')
    if (launcherMode && scenario !== 'no-gate') assert.equal(process.env.GEMINI_API_KEY, undefined, 'Main clears key environment before IDE window')
    if (scenario === 'capability-race') {
      await until(() => evidence.capabilities.length === 1, 'real Main capabilities')
      assert.equal(evidence.capabilities[0].enabled, true)
      await evaluate(`probe.ed.executeEdits('offline.capability-race',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'// source revised while capabilities pending\\n'}])`)
      await pause(100); releaseCapabilities()
      await text('Development/test · Google Gemini')
      await wait(`Array.from(document.querySelectorAll('.smart-hints-actions button')).every(b=>!b.disabled)`)
      assert.equal(evidence.transport.length, 0)
      assert.equal(evidence.calls.some(c => /smart-hints:(prepare|start)/.test(c.channel)), false)
      evidence.checks.push('Budget3 fake approval: real Main enabled response survives Monaco source revision; zero source sends/inference; no gate or budget renewal')
      await evaluate(`probe.model.setValue(${JSON.stringify(source)})`)
      await act('Analyze Code & Run'); await text(`Snapshot ${language}`)
      assert.equal(lastInput.source, source)
      assert.equal(evidence.transport.filter(r => r.method === 'POST').length, 1)
      const approval = JSON.parse(await readFile(join(directory, 'user-data/sh4-live-ui-approvals/synthetic-launch/approval.json'), 'utf8'))
      assert.equal(approval.budget, 3); evidence.approvalBudget = approval.budget
      evidence.checks.push('After explicit snapshot consent: exactly one fake inference on restored allowed sample; original budget3 unchanged')
    } else if (['missing-key', 'no-gate', 'preflight-cancel', 'invalid-gate'].includes(scenario)) {
      await text('AI chưa được cấu hình')
      assert.equal(evidence.transport.length, 0)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('.smart-hints-actions button')).every(b=>b.disabled)`), true)
      await button('Kiểm tra khả dụng')
      await until(() => evidence.capabilities.length === 2, 'explicit capability recheck')
      assert.equal(evidence.capabilities[1].enabled, false)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('.smart-hints-actions button')).every(b=>b.disabled)`), true)
      evidence.checks.push('Missing key disables actions, no source sent')
    } else if (scenario === 'entry') {
      await text('Development/test · Google Gemini')
      assert.equal(evidence.transport.length, 0)
      evidence.checks.push('Actual launcher Electron entry opens real Learning/Practice, isolates userData and sends zero HTTP on startup/open')
    } else if (scenario === 'budget') {
      await act('Analyze Code & Run'); await text('Snapshot')
      await act('Analyze Code & Run'); await text('Đã đạt giới hạn')
      assert.equal(evidence.transport.filter(x => x.method === 'POST').length, 1)
      assert.equal(evidence.transport.filter(x => x.method === 'GET').length, 1)
      evidence.checks.push('Budget one: second action rejected before model GET or inference; no retry/refund')
    } else if (['rate-limit', 'invalid-json', 'invalid-schema', 'timeout', 'max-tokens', 'safety', 'provider-error'].includes(scenario)) {
      await act(['timeout', 'max-tokens', 'safety', 'provider-error'].includes(scenario) ? 'Suggest Fix' : 'Analyze Code & Run')
      await text(scenario === 'rate-limit' ? 'Đã đạt giới hạn' : scenario === 'timeout' ? 'Suggest Fix đã hết thời gian' : scenario === 'provider-error' ? 'AI chưa hoàn tất yêu cầu' : 'Phản hồi không hợp lệ')
      assert.equal(evidence.transport.filter(x => x.method === 'POST').length, 1)
      assert.equal(await evaluate('probe.model.getValue()'), source)
      evidence.checks.push('Safe error displayed, no retry, no source mutation')
      if (['max-tokens', 'safety', 'provider-error'].includes(scenario)) {
        const diagnostic = evidence.diagnostics[0]
        assert.equal(diagnostic.maxOutputTokens, 2048); assert.equal(diagnostic.schemaValidation, 'NOT_RUN')
        assert.equal(diagnostic.outputJsonValidation, 'NOT_RUN'); assert.equal(diagnostic.inferenceDispatched, true)
        assert.equal(diagnostic.httpStatus, scenario === 'provider-error' ? 503 : 200)
        assert.equal(diagnostic.finishReason, scenario === 'max-tokens' ? 'MAX_TOKENS' : scenario === 'safety' ? 'SAFETY' : 'UNOBSERVED')
        assert.equal(diagnostic.code, scenario === 'provider-error' ? 'PROVIDER' : 'INVALID_RESPONSE')
        assert.equal(JSON.stringify(diagnostic).includes('SYNTHETIC_PROVIDER_PRIVATE_TEXT'), false)
        evidence.checks.push('Complete safe finish/token/usage/JSON/schema evidence; truncated/safety/HTTP error never becomes an editable proposal')
      }
      if (scenario === 'timeout' && !launcherMode) {
        assert.equal(evidence.aborts, 1)
        assert.equal(evidence.diagnostics.length, 1)
        assert.equal(evidence.diagnostics[0].timeoutMs, 30000)
        assert.equal(evidence.diagnostics[0].timeoutOwner, 'MAIN_SERVICE')
        assert.equal(evidence.diagnostics[0].requestKind, 'INFERENCE')
        assert.equal(evidence.diagnostics[0].stage, 'WAITING_HEADERS')
        assert.ok(evidence.diagnostics[0].elapsedMs >= 30000)
        evidence.checks.push('Normal Suggest Fix30s timeout: one POST, one abort, safe elapsed/stage/owner diagnostic, unchanged source')
      }
    } else if (scenario === 'retire') {
      hold = true
      for (const reason of ['edit', 'exercise', 'cancel', 'close']) {
        if (launcherMode) await evaluate(`probe.model.setValue(${JSON.stringify(source)})`)
        await act('Analyze Code & Run')
        await until(() => evidence.transport.filter(x => x.method === 'POST').length === ['edit', 'exercise', 'cancel', 'close'].indexOf(reason) + 1, 'pending inference')
        if (reason === 'edit') await evaluate(`probe.ed.executeEdits('sh4.concurrent',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'// changed\\n'}])`)
        if (reason === 'exercise') {
          await click('[aria-label="Về danh sách bài tập"]')
          await wait(`document.querySelectorAll('.practice-row').length>1`)
          await evaluate(`document.querySelectorAll('.practice-row')[1].click()`); await connect(); await button('Smart Hints')
          if (launcherMode) {
            await click('[aria-label="Về danh sách bài tập"]'); await click('.practice-row'); await connect(); await button('Smart Hints')
          }
        }
        if (reason === 'cancel') await button('Hủy yêu cầu AI')
        if (reason === 'close') window.close()
        await until(() => evidence.aborts >= ['edit', 'exercise', 'cancel', 'close'].indexOf(reason) + 1, `abort ${reason}`)
        evidence.checks.push(`${reason}: pending transport aborted`)
      }
    } else if (scenario === 'review') {
      await act('Suggest Fix'); await text('OFFLINE: đề xuất')
      await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
      await button('Discard'); assert.equal(await evaluate('probe.model.getValue()'), source)
      await act('Suggest Fix'); await text('OFFLINE: đề xuất'); await button('Diff Preview')
      await wait(`Array.from(document.querySelectorAll('.smart-hint-diff button')).some(b=>b.textContent==='Apply Fix'&&!b.disabled)`)
      await evaluate(`(()=>{globalThis.retiredApply=Array.from(document.querySelectorAll('.smart-hint-diff button')).find(b=>b.textContent==='Apply Fix');probe.ed.executeEdits('sh4.concurrent',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'// changed\\n'}])})()`)
      await wait(`!document.querySelector('.smart-hint-diff')`)
      const changed = await evaluate('probe.model.getValue()')
      await evaluate('retiredApply.click()'); assert.equal(await evaluate('probe.model.getValue()'), changed)
      evidence.checks.push('Discard does not edit; concurrent source revision retires Diff; detached Apply cannot change source; double-click actions/consent send once')
      assert.equal(evidence.transport.filter(x => x.method === 'POST').length, 2)
    } else {
      for (const level of [1, 2, 3]) {
        await act(`Get Hint · Level ${level}`); await wait(`!!document.querySelector('[aria-label="Hint Level ${level}"]')`)
      }
      await act('Analyze Code & Run'); await text(`Snapshot ${language}`)
      assert.equal(lastInput.source, source); assert.equal(lastInput.language, language)
      const line = source.split('\n').findIndex(value => value.includes('return')) + 1
      const column = source.split('\n')[line - 1].indexOf('return') + 1
      await evaluate(`probe.ed.setSelection({startLineNumber:${line},startColumn:${column},endLineNumber:${line},endColumn:${column + 13}})`)
      await act('Explain Selected Code (Practice)'); await text('Cộng số không')
      assert.equal(lastInput.action.selection.text, launcherMode ? 'return a + 0;' : 'return x + 0;')
      await act('Suggest Fix'); await text('OFFLINE: đề xuất')
      assert.equal(await evaluate('probe.model.getValue()'), source)
      const candidate = source.replace('0;', launcherMode ? 'b;' : '1;')
      await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
      await wait(`(async()=>{const b=await import(document.querySelector('script[type="module"][src]').src);const api=Object.values(b).find(v=>v&&typeof v.getDiffEditors==='function');return api?.getDiffEditors().some(e=>document.querySelector('.smart-hint-diff')?.contains(e.getContainerDomNode())&&e.getLineChanges()?.length>0&&e.getModel()?.original.getValue()===${JSON.stringify(source)}&&e.getModel()?.modified.getValue()===${JSON.stringify(candidate)}&&e.getModifiedEditor().getRawOptions().readOnly===true)})()`)
      await wait(`Array.from(document.querySelectorAll('.smart-hint-diff button')).some(b=>b.textContent==='Apply Fix'&&!b.disabled)`)
      await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
      await writeFile(join(directory, 'diff.png'), (await window.webContents.capturePage()).toPNG())
      await button('Apply Fix', 2)
      await wait(`probe.model.getValue()===${JSON.stringify(candidate)}`)
      await evaluate(`probe.ed.trigger('sh4','undo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(source)}`)
      await evaluate(`probe.ed.trigger('sh4','redo',null)`); await wait(`probe.model.getValue()===${JSON.stringify(candidate)}`)
      assert.equal(evidence.transport.filter(x => x.method === 'POST').length, 6)
      if (!launcherMode) {
        const fix = evidence.diagnostics.find(d => d.action === 'SUGGEST_FIX')
        assert.equal(fix.timeoutMs, 30000); assert.equal(fix.state, 'COMPLETE'); assert.ok(fix.elapsedMs >= 15000 && fix.elapsedMs < 30000)
        assert.ok(evidence.diagnostics.filter(d => d.action !== 'SUGGEST_FIX').every(d => d.timeoutMs === 10000))
      }
      evidence.checks.push('L1/L2/L3, current source analysis, exact selection Explain, readonly Diff, explicit Apply once on double-click, Monaco Undo/Redo')
      if (launcherMode) evidence.checks.push('Public Sum fixture: L1 orientation/no formula, L2 direct arithmetic approach, L3 unused b; current-source analysis; computed Monaco diff and explicit a+0 to a+b transaction')
    }
    assert.deepEqual(evidence.errors, [])
    assert.deepEqual(evidence.forbiddenCalls, [])
    assert.equal(evidence.credentialLeak, false)
    assert.equal(evidence.networkBlocked, 0)
    evidence.result = 'PASS'
  } catch (error) {
    evidence.result = 'FAIL'; evidence.failure = String(error)
    if (window && !window.isDestroyed()) {
      evidence.body = await window.webContents.executeJavaScript('document.body.innerText').catch(() => '')
      await writeFile(join(directory, 'failure.png'), (await window.webContents.capturePage()).toPNG())
    }
  } finally {
    delete globalThis.__sh4Create
    delete globalThis.__sh4Configure
    await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ directory, result: evidence.result, failure: evidence.failure }))
    app.exit(evidence.result === 'PASS' ? 0 : 1)
  }
}

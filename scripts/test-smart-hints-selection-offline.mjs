// D6-5 integration / D6-6 final acceptance: real built application and parsers.
// The only substituted boundary is HTTP. Never imported by normal application code.
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url), built = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? 'out')
const finalAcceptance = process.argv.includes('--final-acceptance')
const base = resolve(tmpdir()), owned = mkdtempSync(join(base, 'sh4-d65-offline-'))
if (!owned.startsWith(base + sep)) throw Error('OWNED_PATH_INVALID')
app.setPath('userData', owned)
delete process.env.ELECTRON_RENDERER_URL
let stage = 'startup', posts = 0, gets = 0, forbidden = 0, mode = 'EDIT', win
let holdRelease, holdSignal
let lastPrepare
const checks = []
const key = 'SYNTHETIC-D65-OFFLINE-KEY-DO-NOT-USE'
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, (event, ...args) => {
  if (/^(exercise:run|submission:submit|analysis:(prepare|start))$/.test(channel)) { forbidden++; throw Error('EXECUTION_FORBIDDEN') }
  if (channel === 'smart-hints:prepare') lastPrepare = globalThis.structuredClone(args[0])
  return listener(event, ...args) // No fabricated capabilities/status/proposal/IPC results.
})
globalThis.fetch = async request => {
  assert.equal(request.headers.get('x-goog-api-key'), key)
  if (request.method === 'GET' && request.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite') {
    gets++; return globalThis.Response.json({ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 })
  }
  assert.equal(request.method, 'POST')
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
  posts++
  const body = await request.json(), input = JSON.parse(body.contents[0].parts[0].text)
  assert.equal(body.generationConfig.maxOutputTokens, 2048)
  assert.equal(input.source, lastPrepare.source)
  assert.equal(input.action.kind, lastPrepare.action.kind)
  if (input.action.kind === 'SUGGEST_FIX' || input.action.kind === 'EXPLAIN') {
    assert.deepEqual(input.action.selection, lastPrepare.action.selection)
    const s = input.action.selection
    assert.equal(input.source.slice(s.startOffset, s.endOffset), s.text)
  }
  if (input.action.kind === 'SUGGEST_FIX') assert.equal(input.sourceEol, input.source.includes('\r\n') ? 'CRLF' : 'LF')
  if (mode === 'HOLD') await new Promise(done => { holdRelease = done; holdSignal = request.signal })
  const output = input.action.kind === 'HINT' ? { kind: 'HINT', level: input.action.level,
    paragraphs: ['Synthetic offline Hint.'], nextQuestion: 'Check the public examples?', evidence: [] }
    : input.action.kind === 'ANALYZE' ? { kind: 'ANALYSIS', hypotheses: ['Synthetic offline analysis.'], suggestions: ['Review public input.'], evidence: [] }
      : input.action.kind === 'EXPLAIN' ? { kind: 'EXPLANATION', syntax: 'Synthetic offline explanation.', variables: 'Values.', controlFlow: 'Return.', algorithm: 'Addition.', illustrativeExamples: [] }
    : mode === 'NO_FIX' ? { kind: 'NO_FIX', reason: 'NO_FOCUSED_CHANGE', advice: 'Synthetic offline advice only.' }
      : mode === 'INVALID' ? { kind: 'EDIT_PROPOSAL', replacementText: 'a + b', rationale: 'Synthetic invalid evidence.', evidence: ['R99'] }
        : { kind: 'EDIT_PROPOSAL', replacementText: input.action.selection.text === 'a' ? 'a + b'
          : input.action.selection.text.replace('return value;', 'return value + b;'), rationale: 'Synthetic offline focused edit.', evidence: [] }
  return globalThis.Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(output) }] } }] })
}
const until = async (check, label) => {
  const due = Date.now() + 30000
  while (Date.now() < due) { if (await check()) return; await delay(40) }
  throw Error(`OFFLINE_TIMEOUT:${label}`)
}
async function main() {
try {
  await app.whenReady()
  assert.equal(await safeStorage.isAsyncEncryptionAvailable(), true)
  const encrypted = await safeStorage.encryptStringAsync(key)
  await mkdir(owned, { recursive: true })
  await writeFile(join(owned, 'smart-hints-settings.json'), JSON.stringify({ version: 2, enabled: true, encryptedKey: encrypted.toString('base64'),
    usedRequests: 0, dailyLimit: 20, needsLimitReview: false, providerLimit: null }))
  BrowserWindow.prototype.show = function () {} // This test's window stays hidden.
  require(join(built, 'main/index.js'))
  await until(() => BrowserWindow.getAllWindows().length > 0, 'normal Main window')
  win = BrowserWindow.getAllWindows()[0]
  win.setSize(1440, 1000); win.webContents.setBackgroundThrottling(false)
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
  const evaluate = code => win.webContents.executeJavaScript(code, true)
  const wait = (code, label = stage) => until(() => evaluate(code).catch(() => false), label)
  const button = async name => {
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(name)}&&!b.disabled)`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(name)}&&!b.disabled).click()`)
  }
  const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
  const preferences = win.webContents.getLastWebPreferences()
  assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false)
  await click('[aria-label="Open Learning"]')
  await click('#learning-chapters button:nth-child(2)')
  await click('.learning-section-nav [data-tabs-value="practice"]'); await click('.practice-row')
  const connect = async expectedLanguage => {
    await wait(`(async()=>{const bundle=await import(document.querySelector('script[type="module"][src]').src);
      const api=Object.values(bundle).find(v=>v&&typeof v.getEditors==='function');
      const selectedLanguage=document.querySelector('[aria-label="Ngôn ngữ bài tập"]')?.value;
      const language=${JSON.stringify(expectedLanguage ?? null)}??selectedLanguage;
      if(selectedLanguage!==language)return false;
      const ed=api?.getEditors().find(e=>document.querySelector('.practice-workspace')?.contains(e.getDomNode())&&e.getModel()?.uri.path.endsWith(language==='csharp'?'.cs':'.js'));
      if(!ed||ed.getModel().isDisposed())return false;globalThis.d65={ed,model:ed.getModel(),api};return true})()`)
  }
  const sourceFor = language => (language === 'csharp'
    ? '// 🐟\npublic class Solution {\n public int Sum(int a, int b) {\n  int value = a;\n  return value;\n }\n public int Other() { return 1; }\n}'
    : '// 🐟\nfunction Sum(a, b) {\n const value = a;\n return value;\n}\nfunction other() { return 1; }')
  const setup = async (language, eol = '\n') => {
    const setupStage = stage
    stage = `${setupStage}/language-event`
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="Ngôn ngữ bài tập"]');if(e.value!==${JSON.stringify(language)}){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(language)});e.dispatchEvent(new Event('change',{bubbles:true}))}})()`)
    stage = `${setupStage}/connect`
    await connect(language)
    stage = `${setupStage}/fixture-edit`
    const source = sourceFor(language).replace(/\n/g, eol)
    await evaluate(`(()=>{const {ed,model}=d65;ed.executeEdits('d65.fixture',[{range:model.getFullModelRange(),text:${JSON.stringify(source)}}]);model.pushEOL(${eol === '\r\n' ? 1 : 0});ed.pushUndoStop();d65.source=model.getValue();ed.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1})})()`)
    await wait(`document.querySelector('.smart-hints-drawer')||!!document.querySelector('.practice-workspace')`)
    return source
  }
  const select = async text => {
    await evaluate(`(()=>{const {ed,model}=d65,at=model.getValue().indexOf(${JSON.stringify(text)});if(at<0)throw Error('FIXTURE_TARGET');const a=model.getPositionAt(at),b=model.getPositionAt(at+${text.length});ed.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column})})()`)
    await wait(`document.querySelector('[aria-label="Chuẩn bị vùng chọn Suggest Fix"]')?.textContent.includes('Vùng chọn')`)
  }
  const consent = async () => {
    await wait(`!!document.querySelector('.smart-hints-consent[open]')`)
    assert.equal(await evaluate(`document.querySelector('.smart-hints-consent').textContent.includes('Gemini nhận toàn bộ source và vùng chọn')`), true)
    await button('Đồng ý gửi snapshot')
  }
  await connect(); await setup('csharp'); await button('Smart Hints')
  await wait(`!document.querySelector('.smart-hints-body')?.textContent.includes('Đang kiểm tra AI')`)
  const cap = await evaluate(`window.studentIde.learning.smartHints.capabilities()`)
  assert.equal(cap.ok, true); assert.equal(cap.value.suggestFixMode, 'SELECTION_V1')
  assert.deepEqual(cap.value.suggestFixLanguages, ['csharp', 'javascript'])
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Suggest Fix').disabled`), true)
  assert.equal(posts, 0); assert.equal(gets, 0)
  checks.push('normal capability real C#/JS probes; no selection disabled; no HTTP before consent')

  if (!finalAcceptance) {
  stage = 'unsupported target before consent'
  await select('Sum(int a'); await button('Suggest Fix')
  await wait(`!!document.querySelector('.smart-hints-body [role="alert"]')`)
  assert.equal(await evaluate(`!!document.querySelector('.smart-hints-consent[open]')`), false)
  assert.equal(posts, 0); assert.equal(gets, 0)
  checks.push('unsupported target fails before consent/HTTP and exits loading')

  stage = 'Hint progression and before-consent selection'
  await button('Get Hint · Level 1'); await wait(`!!document.querySelector('.smart-hints-consent[open]')`)
  await button('Đồng ý gửi snapshot'); await wait(`document.body.textContent.includes('Synthetic offline Hint.')`)
  await select('return value;'); await button('Suggest Fix'); await wait(`!!document.querySelector('.smart-hints-consent[open]')`)
  await select('a;'); await wait(`!document.querySelector('.smart-hints-consent[open]')`)
  assert.equal(posts, 1)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Get Hint · Level 2')`), true)
  checks.push('before-consent selection cancels only Fix and preserves Hint Level 2')

  for (const [language, shape, apply] of [['csharp', 'expression', true], ['javascript', 'multiline', true], ['csharp', 'function', false]]) {
    const scenario = `${language}/${shape}/${apply ? 'Apply' : 'Discard'}`
    stage = `${scenario}/setup`
    const source = await setup(language)
    if (!await evaluate(`!!document.querySelector('.smart-hints-drawer')`)) await button('Smart Hints')
    const selected = shape === 'expression' ? 'a' : shape === 'multiline' ? 'const value = a;\n return value;'
      : 'public int Sum(int a, int b) {\n  int value = a;\n  return value;\n }'
    // Choose the body expression, not the parameter with identical text.
    if (shape === 'expression') {
      await evaluate(`(()=>{const {ed,model}=d65,at=model.getValue().indexOf('value = a')+8,a=model.getPositionAt(at),b=model.getPositionAt(at+1);ed.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column})})()`)
    } else await select(selected)
    stage = `${scenario}/consent`; await button('Suggest Fix'); await consent()
    await evaluate(`d65.ed.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1})`)
    stage = `${scenario}/Diff`; await button('Diff Preview'); await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
    const candidate = shape === 'expression' ? source.replace('value = a;', 'value = a + b;') : source.replace('return value;', 'return value + b;')
    assert.equal(await evaluate(`d65.model.getValue()===${JSON.stringify(source)}`), true)
    assert.equal(await evaluate(`(()=>{const models=d65.api.getModels().filter(m=>m.uri.scheme==='smart-hint-preview');return models.length===2&&models.some(m=>m.getValue()===${JSON.stringify(source)})&&models.some(m=>m.getValue()===${JSON.stringify(candidate)})})()`), true)
    if (apply) {
      stage = `${scenario}/ApplyUndoRedo`
      await button('Apply Fix'); await wait(`!document.querySelector('.smart-hint-diff')`)
      assert.equal(await evaluate(`d65.model.getValue()===${JSON.stringify(candidate)}`), true)
      await evaluate(`d65.ed.trigger('keyboard','undo',null)`); await wait(`d65.model.getValue()===${JSON.stringify(source)}`)
      await evaluate(`d65.ed.trigger('keyboard','redo',null)`); await wait(`d65.model.getValue()===${JSON.stringify(candidate)}`)
    } else { await button('Discard'); assert.equal(await evaluate(`d65.model.getValue()===${JSON.stringify(source)}`), true) }
    await wait(`d65.api.getModels().filter(m=>m.uri.scheme==='smart-hint-preview').length===0`)
    checks.push(`${scenario}: exact original/candidate; cursor cannot retarget; native transaction and models disposed`)
  }
  for (mode of ['NO_FIX', 'INVALID']) {
    stage = `${mode}/setup`; await setup('javascript')
    if (!await evaluate(`!!document.querySelector('.smart-hints-drawer')`)) await button('Smart Hints')
    await select('return value;'); stage = `${mode}/consent`; await button('Suggest Fix'); await consent(); stage = `${mode}/result`
    await wait(mode === 'NO_FIX' ? `document.body.textContent.includes('Synthetic offline advice only.')` : `!!document.querySelector('.smart-hints-body [role="alert"]')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Diff Preview')`), false)
    checks.push(`${mode}: no Diff or Apply grant`)
  }
  assert.equal(posts, 6); assert.equal(gets, 6); assert.equal(forbidden, 0)
  } else {
    const ensurePanel = async () => { if (!await evaluate(`!!document.querySelector('.smart-hints-drawer')`)) await button('Smart Hints') }
    const noDiff = () => evaluate(`!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Diff Preview')`)
    stage = 'empty/multi-cursor/whole-file local rejection'
    for (const selection of ['empty', 'multi', 'file']) {
      stage = `local rejection/${selection}`
      await evaluate(`(()=>{const {ed,model}=d65;const r={startLineNumber:2,startColumn:1,endLineNumber:2,endColumn:2};
        if(${JSON.stringify(selection)}==='empty')ed.setSelection({...r,endColumn:1});
        else if(${JSON.stringify(selection)}==='file')ed.setSelection(model.getFullModelRange());
        else ed.setSelections([2,3].map(line=>({selectionStartLineNumber:line,selectionStartColumn:1,positionLineNumber:line,positionColumn:2})))})()`)
      await wait(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Suggest Fix')?.disabled===true`)
    }
    assert.equal(posts, 0); assert.equal(gets, 0)
    checks.push('empty/multi-cursor/whole-file rejected locally with zero HTTP')

    for (const shape of ['single-line', 'whole-function']) {
      stage = `javascript/CRLF/Unicode/${shape}`
      const source = await setup('javascript', '\r\n'); await ensurePanel()
      const selected = shape === 'single-line' ? 'return value;' : 'function Sum(a, b) {\r\n const value = a;\r\n return value;\r\n}'
      await select(selected); await button('Suggest Fix'); await consent(); await button('Diff Preview')
      await wait(`!!document.querySelector('.smart-hint-diff[open] .monaco-diff-editor')`)
      const candidate = source.replace('return value;', 'return value + b;')
      assert.equal(lastPrepare.source, source)
      assert.equal(lastPrepare.action.selection.text, selected)
      assert.equal(lastPrepare.action.selection.startOffset, source.indexOf(selected))
      assert.equal(lastPrepare.origin.eol, 'CRLF'); assert.ok(Number.isSafeInteger(lastPrepare.sourceRevision))
      assert.equal(await evaluate(`d65.model.getValue()===${JSON.stringify(source)}&&d65.model.getEOL()===${JSON.stringify('\r\n')}`), true)
      assert.equal(await evaluate(`(()=>{const m=d65.api.getModels().filter(m=>m.uri.scheme==='smart-hint-preview');return m.length===2&&m.some(m=>m.getValue()===${JSON.stringify(source)})&&m.some(m=>m.getValue()===${JSON.stringify(candidate)})})()`), true)
      if (shape === 'whole-function') {
        await button('Apply Fix'); await wait(`d65.model.getValue()===${JSON.stringify(candidate)}`)
        await evaluate(`d65.ed.trigger('keyboard','undo',null)`); await wait(`d65.model.getValue()===${JSON.stringify(source)}`)
        await evaluate(`d65.ed.trigger('keyboard','redo',null)`); await wait(`d65.model.getValue()===${JSON.stringify(candidate)}`)
      } else await button('Discard')
      await wait(`d65.api.getModels().filter(m=>m.uri.scheme==='smart-hint-preview').length===0`)
      checks.push(`${stage}: exact UTF-16/CRLF capture, original/candidate, manual transaction, preview disposal`)
    }
    for (const retire of ['source-edit-undo', 'cancel']) {
      stage = `pending/${retire}`; const source = await setup('javascript'); await ensurePanel()
      mode = 'HOLD'; holdRelease = undefined; holdSignal = undefined
      await select('return value;'); await button('Suggest Fix'); await consent()
      await until(() => !!holdRelease, 'fake provider pending')
      const count = posts
      if (retire === 'cancel') await button('Hủy yêu cầu AI')
      else await evaluate(`(()=>{const {ed,model}=d65;ed.pushUndoStop();ed.executeEdits('d66.stale',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:' '}]);ed.pushUndoStop();ed.trigger('keyboard','undo',null)})()`)
      await until(() => holdSignal.aborted, 'Main abort of retired operation')
      holdRelease(); await delay(700)
      assert.equal(posts, count); assert.equal(await noDiff(), true)
      assert.equal(await evaluate(`d65.model.getValue()===${JSON.stringify(source)}`), true)
      checks.push(`${stage}: shared abort, late provider response dropped, no grant/Apply/retry`)
      mode = 'EDIT'
    }
    stage = 'Analyze and Explain compatibility'
    await setup('javascript'); await ensurePanel()
    await button('Analyze Code & Run'); await wait(`!!document.querySelector('.smart-hints-consent[open]')`)
    await button('Đồng ý gửi snapshot'); await wait(`document.body.textContent.includes('Synthetic offline analysis.')`)
    await select('return value;'); await button('Explain Selected Code (Practice)')
    await wait(`!!document.querySelector('.smart-hints-consent[open]')`); await button('Đồng ý gửi snapshot')
    await wait(`document.body.textContent.includes('Synthetic offline explanation.')`)
    assert.equal(await noDiff(), true); assert.equal(posts, 6); assert.equal(gets, 6); assert.equal(forbidden, 0)
    checks.push('Analyze/Explain unchanged through real IPC and normal Gemini adapter; no automatic execution')
    const diagnostic = JSON.parse(await readFile(join(owned, 'smart-hints-last-suggest-fix.json'), 'utf8'))
    assert.match(diagnostic.buildIdentity, /^[a-f0-9]{64}$/)
    assert.equal((await readFile(join(built, 'main/index.js'), 'utf8')).includes(diagnostic.buildIdentity), true)
    const serialized = JSON.stringify(diagnostic)
    for (const secret of [key, sourceFor('javascript'), sourceFor('csharp'), 'return value;']) assert.equal(serialized.includes(secret), false)
    checks.push('normal persisted diagnostics match built Main identity and contain no source/selection/key')
    lastPrepare = undefined
  }
  console.log(JSON.stringify({ result: 'PASS', finalAcceptance, electron: process.versions.electron, checks, fakeGets: gets, fakePosts: posts, realHttp: 0, forbiddenExecution: forbidden }))
} catch (error) {
  const ui = win && !win.isDestroyed() ? await win.webContents.executeJavaScript(`({workspace:!!document.querySelector('.practice-workspace'),language:document.querySelector('[aria-label="Ngôn ngữ bài tập"]')?.value,drawer:!!document.querySelector('.smart-hints-drawer'),modelDisposed:globalThis.d65?.model.isDisposed()})`).catch(() => null) : null
  console.error(JSON.stringify({ result: 'FAIL', stage, ui, errorType: ['TypeError','Error','AssertionError'].includes(error?.name) ? error.name : 'OTHER', code: error instanceof assert.AssertionError ? 'ASSERTION' : error?.message?.startsWith('OFFLINE_TIMEOUT:') ? error.message : 'OFFLINE_FAILURE', fakeGets: gets, fakePosts: posts, forbiddenExecution: forbidden }))
  process.exitCode = 1
} finally {
  // Close only this test's window, leaving all user sessions untouched.
  const exited = process.exitCode ?? 0
  if (win && !win.isDestroyed()) win.destroy()
  // Electron can hold files until process exit; userData is isolated and not a report.
  try { await rm(owned, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch { /* Locked profile remains in OS temp only. */ }
  app.exit(exited)
}
}
void main()

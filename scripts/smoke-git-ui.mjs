/* global console */
import { app, BrowserWindow, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { buildSync } = require('esbuild')
const modules = {
  ProjectService: 'services/project/project-service',
  FileSystemService: 'services/filesystem/filesystem-service',
  GitService: 'services/git/git-service',
  GitExecutableDetector: 'services/dependencies/git-executable',
  GitOwnedCommandRunner: 'services/git/git-owned-command-runner',
  GitOperationLifecycle: 'services/git/git-operation-lifecycle',
  GitDocumentOwners: 'services/git/git-document-owners',
  GitLifecycleIpcService: 'ipc/git-lifecycle-ipc-service',
  FileIpcService: 'ipc/file-ipc-service',
  IpcHandlerRegistry: 'ipc/ipc-handler-registry',
}

async function main() {
  await app.whenReady()
  const output = resolve('out/main/phase-5e-smoke.cjs')
  buildSync({ stdin: { contents: Object.entries(modules).map(([name, path]) =>
    `export { ${name} } from './src/main/${path}';`).join('\n'), resolveDir: resolve('.') },
  bundle: true, platform: 'node', format: 'cjs', outfile: output })
  const runtime = require(output)
  const root = await mkdtemp(join(tmpdir(), 'student-ide-git-ui-'))
  const repository = join(root, 'repository'), ordinary = join(root, 'ordinary')
  await mkdir(repository); await mkdir(ordinary)
  const detector = new runtime.GitExecutableDetector()
  const dependency = await detector.detect()
  assert.equal(dependency.state, 'AVAILABLE', 'Windows PATH Git is required')
  const git = (...args) => execFileSync(dependency.git.executable, args,
    { cwd: repository, encoding: 'utf8', windowsHide: true })
  // Only this newly created disposable repository is mutated.
  git('init', '-b', 'main')
  git('config', 'user.name', 'Student UI Smoke')
  git('config', 'user.email', 'student-ui@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', join(root, 'no-hooks'))
  await writeFile(join(repository, 'sample.txt'), 'initial\n')
  await mkdir(join(repository, 'src'))
  await writeFile(join(repository, 'src', 'nested.txt'), 'nested\n')
  git('add', '--', 'sample.txt', 'src/nested.txt'); git('commit', '-m', 'Initial smoke commit')
  git('branch', 'topic')
  await writeFile(join(repository, 'sample.txt'), 'modified\n')
  await writeFile(join(repository, 'new.txt'), 'untracked\n')

  const projects = new runtime.ProjectService()
  const files = new runtime.FileSystemService(projects, { trashItem: async () => {} })
  const runner = new runtime.GitOwnedCommandRunner()
  const lifecycle = new runtime.GitOperationLifecycle(projects, files, runner)
  const service = new runtime.GitService(projects, files, detector, lifecycle.commands)
  const documents = new runtime.GitDocumentOwners(lifecycle)
  const registry = new runtime.IpcHandlerRegistry(ipcMain)
  const gitIpc = new runtime.GitLifecycleIpcService(registry, service, lifecycle,
    (context) => documents.assertCurrent(context))
  const window = new BrowserWindow({ show: false, width: 1280, height: 820,
    webPreferences: { preload: resolve('out/preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true } })
  documents.observe(window.webContents)
  const send = (channel, payload) => window.webContents.send(channel, payload)
  const fileIpc = new runtime.FileIpcService(registry, files,
    (event) => send('file:changed', event), (status) => send('file:status-changed', status))
  const remove = projects.subscribe((activeProject) => send('project:changed', { activeProject }))
  ipcMain.handle('project:get-active', () => ({ ok: true, value: projects.getActiveProject() }))
  ipcMain.handle('lifecycle:get-status', () => ({ ok: true, value: { state: 'RUNNING' } }))
  const evaluate = (code) => window.webContents.executeJavaScript(code, true)
  const wait = (expression) => evaluate(`new Promise((resolve, reject) => {
    const check = () => { if (${expression}) { observer.disconnect(); clearTimeout(timer); resolve(); } };
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error('UI condition: ' + ${JSON.stringify(expression)})); }, 15000);
    observer.observe(document.body, {subtree:true,childList:true,attributes:true,characterData:true}); check();
  })`)
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const setValue = (selector, value, type = 'HTMLTextAreaElement') => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(${type}.prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('${type === 'HTMLSelectElement' ? 'change' : 'input'}', {bubbles:true}));
  })()`)
  const row = (name) => `[aria-label="${name}"]:not(:disabled)`
  try {
    files.start(); lifecycle.start(); gitIpc.start(); fileIpc.start()
    await projects.openRoot(repository)
    await window.loadFile(resolve('out/renderer/index.html'))
    await wait(`document.querySelector('.tree-row[title="sample.txt"] .file-git-decoration')?.textContent === 'M'`)
    await wait(`document.querySelector('.tree-row[title="new.txt"] .file-git-decoration')?.textContent === 'U'`)
    assert.equal(await evaluate(`document.querySelector('.tree-row[title="sample.txt"]').getAttribute('aria-label')`), 'sample.txt Modified')
    assert.equal(await evaluate(`document.querySelector('.tree-row[title="new.txt"]').getAttribute('aria-label')`), 'new.txt Untracked')
    await click('.tree-row[title="src"]')
    await wait(`document.querySelector('.tree-row[title="src/nested.txt"]')`)
    assert.equal(await evaluate(`document.querySelector('.tree-row[title="src"] .file-git-decoration') === null`), true)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.tree-row[title="src/nested.txt"]')).paddingLeft`), '24px')
    const geometry = await evaluate(`(() => {
      const size = selector => { const rect = document.querySelector(selector).getBoundingClientRect(); return { width: rect.width, height: rect.height }; };
      return { tab: size('#explorer-sidebar-tab'), strip: size('.sidebar-tabs'),
        stripBorder: parseFloat(getComputedStyle(document.querySelector('.sidebar-tabs')).borderBottomWidth),
        icon: size('#explorer-sidebar-tab svg'), header: size('.explorer-toolbar'),
        input: size('.search-input-shell'), modes: size('.search-mode-tabs'), row: size('.tree-row'),
        underline: getComputedStyle(document.querySelector('#explorer-sidebar-tab'),'::after').height,
        font: getComputedStyle(document.querySelector('.tree-name')).fontSize,
        modesEqual: size('#search-mode-names').width === size('#search-mode-contents').width };
    })()`)
    assert.equal(geometry.tab.width, 36)
    assert.equal(geometry.strip.height, 36)
    assert.ok(Math.abs(geometry.tab.height - (geometry.strip.height - geometry.stripBorder)) < 0.01)
    assert.deepEqual(geometry.icon, { width: 16, height: 16 })
    assert.equal(geometry.header.height, 32); assert.equal(geometry.input.height, 28)
    assert.equal(geometry.modes.height, 28); assert.equal(geometry.row.height, 24)
    assert.equal(geometry.underline, '2px'); assert.equal(geometry.font, '12px'); assert.equal(geometry.modesEqual, true)
    await click('.tree-row[title="sample.txt"]')
    await mkdir(resolve('out/phase-5e-ui'), { recursive: true })
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await writeFile(resolve('out/phase-5e-ui/explorer-aligned.png'), (await window.webContents.capturePage()).toPNG())
    for (let step = 0; step < 6; step++) {
      await evaluate(`document.querySelector('[aria-label="Resize right sidebar"]').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}))`)
    }
    await wait(`document.querySelector('[aria-label="Resize right sidebar"]').getAttribute('aria-valuenow') === '220'`)
    const narrow = await evaluate(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; };
      return {viewport:innerWidth, sidebar:rect('.explorer-sidebar'), row:rect('.tree-row'), actions:rect('.explorer-actions')};
    })()`)
    assert.ok(narrow.sidebar.right <= narrow.viewport + 1, JSON.stringify(narrow))
    assert.ok(narrow.actions.right <= narrow.sidebar.right + 1, JSON.stringify(narrow))
    assert.ok(narrow.row.right <= narrow.sidebar.right + 1, JSON.stringify(narrow))
    assert.equal(await evaluate(`(() => { const panel = document.querySelector('.explorer-sidebar'); return panel.scrollWidth > panel.clientWidth; })()`), false)
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await writeFile(resolve('out/phase-5e-ui/explorer-narrow.png'), (await window.webContents.capturePage()).toPNG())
    for (let step = 0; step < 6; step++) {
      await evaluate(`document.querySelector('[aria-label="Resize right sidebar"]').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true}))`)
    }
    await wait(`document.querySelector('[aria-label="Resize right sidebar"]').getAttribute('aria-valuenow') === '280'`)
    await click('#git-sidebar-tab')
    await wait(`document.querySelector('${row('Stage sample.txt')}')`)
    await click(row('Stage sample.txt'))
    await wait(`document.querySelector('${row('Unstage sample.txt')}')`)
    assert.equal(git('diff', '--cached', '--name-only').trim(), 'sample.txt')
    await click(row('Unstage sample.txt'))
    await wait(`document.querySelector('${row('Stage sample.txt')}')`)
    assert.equal(git('diff', '--cached', '--name-only').trim(), '')
    await click(row('Stage sample.txt'))
    await wait(`document.querySelector('${row('Unstage sample.txt')}')`)
    await setValue('#git-commit-message', 'Commit from Source Control')
    await click('#explorer-sidebar-tab'); await click('#git-sidebar-tab')
    assert.equal(await evaluate('document.querySelector("#git-commit-message").value'), 'Commit from Source Control')
    await click('.git-commit button')
    await wait(`document.querySelector('.git-history')?.textContent.includes('Commit from Source Control') && !document.querySelector('#git-local-branch').disabled`)
    assert.equal(git('log', '-1', '--format=%s').trim(), 'Commit from Source Control')
    assert.equal(await evaluate('document.querySelector("#git-commit-message").value'), '')
    assert.equal(git('status', '--porcelain').trim(), '?? new.txt')
    await setValue('#git-local-branch', 'topic', 'HTMLSelectElement')
    await click('.git-branch button')
    await wait(`document.querySelector('.git-branch p')?.textContent.trim() === 'topic' && !document.querySelector('#git-local-branch').disabled`)
    assert.equal(git('branch', '--show-current').trim(), 'topic')
    await setValue('#git-commit-message', 'Keep until project changes')
    await click('[aria-label="Refresh Source Control"]')
    await wait(`!document.querySelector('#git-local-branch').disabled`)
    assert.equal(await evaluate('document.querySelector("#git-commit-message").value'), 'Keep until project changes')
    assert.equal(await evaluate('typeof window.require'), 'undefined')
    const screenshot = resolve('out/phase-5e-ui/full-shell.png')
    await mkdir(resolve('out/phase-5e-ui'), { recursive: true })
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await writeFile(screenshot, (await window.webContents.capturePage()).toPNG())
    await projects.openRoot(ordinary)
    await wait(`document.querySelector('.source-control')?.textContent.includes('not a Git repository')`)
    assert.equal(await evaluate('document.querySelector("#git-commit-message") === null'), true)
    await projects.openRoot(repository)
    await wait(`document.querySelector('#git-commit-message') && !document.querySelector('#git-local-branch').disabled`)
    assert.equal(await evaluate('document.querySelector("#git-commit-message").value'), '')
    await projects.closeProject()
    await wait(`document.body.textContent.includes('Open a project to use Source Control.')`)
    await lifecycle.stop()
    assert.equal(runner.cleanupPending, false)
    console.log(JSON.stringify({ result: 'PASS', scope: 'built App + production Preload/IPC/GitService/native runner',
      scenarios: ['status', 'stage', 'unstage', 'commit staged only', 'branch switch', 'history', 'draft tab/refresh retention',
        'project replacement', 'non-repository', 'close', 'sandbox', 'owned cleanup', 'Explorer M/U and Orca geometry', '220px keyboard resize without overflow'], geometry, screenshot, repository }))
  } finally {
    remove(); gitIpc.stop(); fileIpc.stop(); documents.stop()
    await lifecycle.stop(); await files.stop(); await projects.stop()
    ipcMain.removeHandler('project:get-active'); ipcMain.removeHandler('lifecycle:get-status')
    window.destroy()
  }
}
void main().then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })

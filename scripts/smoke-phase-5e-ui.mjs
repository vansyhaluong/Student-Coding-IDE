/* global process, console */
import { app, BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { buildSync } = require('esbuild')
const directory = resolve('out/phase-5e-ui')
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SourceControl } from './src/renderer/src/features/git/SourceControl';
import { SearchPanel } from './src/renderer/src/features/search/SearchPanel';
const project = {id:'project_1234567890abcdef12345678',name:'student-project'};
const ok = value => Promise.resolve({ok:true,value});
let publishNames;
window.studentIde = {search: {
  start: () => ok(null), cancel: () => ok(null), onEvent: () => () => {},
  onNamesEvent: listener => { publishNames = listener; return () => {}; },
  startNames: (projectId,operationId) => {
    publishNames({projectId,operationId,type:'batch',matches:[{relativePath:'src/services/Auth.ts'},{relativePath:'src/server/index.ts'}]});
    publishNames({projectId,operationId,type:'complete',status:'completed',scannedFiles:12,skippedFiles:2,limitReached:false});
    return ok(null);
  }
}};
const api = {
 getState: () => ok({dependency:'AVAILABLE',repository:'REPOSITORY'}),
 getStatus: () => ok({entries:[
  {path:'src/services/Auth.ts',staged:{kind:'MODIFIED'},unstaged:{kind:'MODIFIED'},untracked:false},
  {path:'README.md',staged:{kind:'CONFLICTED'},unstaged:null,untracked:false},
  {path:'src/server/index.ts',staged:null,unstaged:null,untracked:true}],didHitLimit:false}),
 getBranches: () => ok({state:'ATTACHED',currentBranch:'feature/student-project',branches:['main','feature/student-project','@']}),
 getHistory: () => ok([{id:'a'.repeat(40),subject:'Add student authentication',authorName:'Student',authoredAt:'2026-09-08T12:00:00Z'}])
};
createRoot(document.getElementById('root')).render(<main style={{height:'100%',display:'flex',justifyContent:'space-between',background:'var(--editor-surface)'}}>
 <aside style={{width:280,display:'flex',background:'var(--sidebar)'}}><SearchPanel project={project} onNavigate={()=>{}} tree={<p className="git-empty">Normal Explorer tree</p>} /></aside>
 <div style={{padding:30,color:'var(--muted-foreground)'}}>Phase 5E component verification</div>
 <aside style={{width:280,display:'flex',background:'var(--sidebar)'}}><SourceControl project={project} api={api}/></aside>
</main>);
`

async function main() {
  await app.whenReady()
  await mkdir(directory, { recursive: true })
  const css = (await readdir(resolve('out/renderer/assets'))).find((name) => /^index-.*\.css$/.test(name))
  assert.ok(css, 'Build production CSS before visual smoke')
  buildSync({ stdin: { contents: source, loader: 'jsx', resolveDir: resolve('.') }, bundle: true,
    platform: 'browser', format: 'iife', jsx: 'automatic', outfile: resolve(directory, 'fixture.js') })
  await writeFile(resolve(directory, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../renderer/assets/${css}"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`)
  const window = new BrowserWindow({ show: false, width: 1000, height: 820,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  try {
    await window.loadFile(resolve(directory, 'index.html'))
    await window.webContents.executeJavaScript(`new Promise(resolve => {
      const ready = () => document.querySelector('#git-commit-message');
      if (ready()) return resolve();
      const observer = new MutationObserver(() => { if (ready()) { observer.disconnect(); resolve(); } });
      observer.observe(document.body, {childList:true,subtree:true});
    })`)
    await window.webContents.executeJavaScript(`(() => {
      const input = document.getElementById('project-search-input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'src/');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    })()`)
    await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
    const evidence = await window.webContents.executeJavaScript(`({
      paths:[...document.querySelectorAll('.names-results button')].map(button=>button.textContent),
      conflict:document.querySelector('.source-control').textContent.includes('Conflicted — read-only'),
      overflow:[...document.querySelectorAll('aside')].some(element=>element.scrollWidth>element.clientWidth),
      stageButtons:[...document.querySelectorAll('.git-change button')].map(button=>button.getAttribute('aria-label'))
    })`)
    assert.deepEqual(evidence.paths, ['src/services/Auth.ts', 'src/server/index.ts'])
    assert.equal(evidence.conflict, true)
    assert.equal(evidence.overflow, false)
    assert.equal(evidence.stageButtons.some((name) => name.includes('README.md')), false)
    await writeFile(resolve(directory, 'source-control.png'), (await window.webContents.capturePage()).toPNG())
    console.log(JSON.stringify({ result: 'PASS', electron: process.versions.electron, ...evidence,
      screenshot: resolve(directory, 'source-control.png'), scope: 'production components and CSS; fixture domain responses' }))
  } finally { window.destroy() }
}
void main().then(() => app.exit(0), (error) => { console.error(error); app.exit(1) })

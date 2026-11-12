/** @vitest-environment node */
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { ProblemDescriptionContent } from '../../src/renderer/src/features/learning/practice/ProblemDescriptionContent'
import { descriptionExercise } from '../fixtures/learning/problem-description'

it('measures typography, contrast and content containment in light/dark roots at resized panel widths', async () => {
  const output = resolve('out/problem-description-check/layout')
  await mkdir(output, { recursive: true })
  const url = (p: string) => pathToFileURL(resolve(p)).href
  const content = renderToStaticMarkup(<ProblemDescriptionContent exercise={descriptionExercise} />)
  await writeFile(resolve(output, 'fixture.html'), `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
    <link rel="stylesheet" href="${url('node_modules/@fontsource-variable/geist/index.css')}">
    <link rel="stylesheet" href="${url('src/renderer/src/features/learning/learning.css')}">
    <style>body{margin:0}.learning-workspace{width:720px}.practice-workspace{display:block}
    .practice-description{height:360px;overflow-y:auto!important}.control{font-size:11px}</style></head>
    <body><main class="learning-workspace"><div class="practice-workspace">${content}<p class="control">Untouched</p></div></main></body></html>`)
  // A hidden, isolated local document only: no app preload, screen capture or Gemini.
  const child = resolve(output, 'measure.cjs')
  await writeFile(child, `const {app,BrowserWindow,session}=require('electron');
    const assert=require('node:assert/strict');
    app.setPath('userData', ${JSON.stringify(resolve(output, 'profile'))});
    app.whenReady().then(async()=>{
      session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('file:')&&!d.url.startsWith('data:')}));
      const w=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
      try {
        await w.loadFile(${JSON.stringify(resolve(output, 'fixture.html'))});
        const results=await w.webContents.executeJavaScript(
          '('+${JSON.stringify(measureDescription.toString())}+')()');
        assert.equal(results.length,8);
        for(const r of results){
          assert.equal(r.titleSize,'21px');assert.equal(r.titleWeight,'600');
          assert.equal(r.bodySize,'15px');assert.equal(r.bodyLineHeight,'25.5px');assert.equal(r.bodyWeight,'400');
          assert.equal(r.headingSize,'16px');assert.equal(r.headingWeight,'600');
          assert.equal(r.codeSize,'13.5px');assert.equal(r.paragraphGap,'14px');assert.ok(r.geist);
          assert.ok(r.outerOverflow<=1,JSON.stringify(r));assert.ok(r.tableOverflow<=1,JSON.stringify(r));
          assert.ok(r.codeScroll&&r.verticalScroll&&r.endReachable&&r.unchanged,JSON.stringify(r));
          assert.ok(r.bodyContrast>=4.5&&r.codeContrast>=4.5,JSON.stringify(r));
          assert.equal(r.exampleWhiteSpace,'pre-wrap');assert.notEqual(r.exampleBackground,r.background);
          assert.equal(r.controlSize,'11px');
        }
        console.log('PASS: '+results.length+' theme/width combinations, Geist, contrast, wrapping, scroll and content preservation');
      }finally{w.destroy()}
    }).then(()=>app.exit(0)).catch(e=>{console.error(e);app.exit(1)});`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const electron = createRequire(import.meta.url)('electron') as string
  const result = await promisify(execFile)(electron, [child], { env, windowsHide: true, timeout: 30000 })
  expect(result.stdout).toContain('PASS: 8 theme/width combinations')
}, 40000)

async function measureDescription() {
  await document.fonts.ready
  const article = document.querySelector<HTMLElement>('.practice-description')!
  const host = document.querySelector<HTMLElement>('.learning-workspace')!
  article.querySelector('details')!.open = true
  const original = article.textContent
  const style = (selector: string) => getComputedStyle(article.querySelector(selector)!)
  const luminance = (color: string) => {
    const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
      const n = v / 255
      return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4
    })
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  const results = []
  for (const theme of ['light', 'dark']) for (const width of [240, 320, 480, 720]) {
    document.documentElement.dataset.theme = theme
    host.style.width = `${width}px`
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    const title = style('h1'), body = style('p'), heading = style('h2'), code = style('p code'), example = style('.practice-description-example')
    const background = getComputedStyle(host).backgroundColor
    const table = article.querySelector<HTMLElement>('.practice-description-table')!
    const pre = article.querySelector<HTMLElement>('.practice-description-prose pre')!
    article.scrollTop = article.scrollHeight
    results.push({ theme, width, titleSize: title.fontSize, titleWeight: title.fontWeight,
      bodySize: body.fontSize, bodyLineHeight: body.lineHeight, bodyWeight: body.fontWeight,
      headingSize: heading.fontSize, headingWeight: heading.fontWeight, codeSize: code.fontSize,
      paragraphGap: body.marginBottom, geist: body.fontFamily.includes('Geist Variable')
        && Array.from(document.fonts).some(font => font.family.includes('Geist Variable') && font.status === 'loaded')
        && document.fonts.check('15px "Geist Variable"', 'Tiếng Việt ă â đ ê ô ơ ư'),
      outerOverflow: article.scrollWidth - article.clientWidth, tableOverflow: table.getBoundingClientRect().right - article.getBoundingClientRect().right,
      codeScroll: pre.scrollWidth > pre.clientWidth && getComputedStyle(pre).overflowX === 'auto',
      verticalScroll: article.scrollHeight > article.clientHeight,
      endReachable: article.querySelector('details')!.getBoundingClientRect().bottom <= article.getBoundingClientRect().bottom,
      unchanged: article.textContent === original, bodyContrast: contrast(body.color, background),
      codeContrast: contrast(code.color, code.backgroundColor), exampleWhiteSpace: example.whiteSpace,
      exampleBackground: example.backgroundColor, background, controlSize: getComputedStyle(document.querySelector('.control')!).fontSize,
    })
  }
  return results
}

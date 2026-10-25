/* global console, process, setInterval, clearInterval */
// Step5 instrumentation around the existing production C#/Project/PTY smoke.
// Records sizes/timings only, never source or private case evidence.
import { app, ipcMain } from 'electron'
import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance, PerformanceObserver } from 'node:perf_hooks'

const directory = resolve('out', `package-foundation-electron-step5-${Date.now()}`)
await mkdir(directory, { recursive: true })
const start = performance.now(), baseline = process.memoryUsage(), peak = { ...baseline }
const timings = [], ipc = [], stalls = [], gc = []
let previous = performance.now()
const timer = setInterval(() => {
  const now = performance.now(); stalls.push(Math.max(0, now - previous - 5)); previous = now
  const current = process.memoryUsage()
  for (const key of Object.keys(current)) peak[key] = Math.max(peak[key], current[key])
}, 5)
const observer = new PerformanceObserver(list => { for (const event of list.getEntries()) gc.push(event.duration) })
observer.observe({ entryTypes: ['gc'] })
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
  const began = performance.now(), value = await listener(...args)
  if (['practice:list', 'practice:detail'].includes(channel)) {
    ipc.push({ channel, milliseconds: performance.now() - began, ok: value.ok, bytes: Buffer.byteLength(JSON.stringify(value)) })
    save('public-ipc-checkpoint')
  }
  return value
})
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', () => {
    timings.push({ event: 'firstDocumentLoaded', milliseconds: performance.now() - start }); save('document-checkpoint')
  })
})
const summary = values => {
  const sorted = [...values].sort((a, b) => a - b)
  return { n: sorted.length, p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, max: sorted.at(-1) ?? null }
}
function save(stage) {
  writeFileSync(join(directory, 'measurement.json'), JSON.stringify({ stage, measuredAt: new Date().toISOString(),
    scope: 'Production Main/Renderer smoke; not isolated loader timing or installed startup',
    timings, baseline, sampledPeak: peak, peakRssDelta: peak.rss - baseline.rss, ipc,
    eventLoopExcessDelayMs: summary(stalls), gcDurationMs: summary(gc),
    limitations: ['One warm-filesystem application run; no approved absolute full-app startup/RSS/GC threshold',
      'Includes existing C# native Run, Project and Terminal activity; cannot attribute all stalls to package loader',
      'Small synchronous evidence checkpoints add instrumentation overhead',
      'Read paired production smoke evidence for functional verdict, not measurement file alone'] }, null, 2))
}
// Observe the original smoke's quit without adding a shutdown owner or retry.
app.on('quit', () => {
  clearInterval(timer); observer.disconnect(); save('quit')
  console.log(JSON.stringify({ packageFoundationMeasurement: directory }))
})
// The original smoke owns isolated userData, secure production windows and shutdown.
// It hides windows itself; no production startup or UI code is replaced here.
await import('./smoke-learning-csharp-run.mjs')

/** Diagnostic-only aggregate probes. Never retain package/source/argument data. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { Session } from 'node:inspector'
import { performance, PerformanceObserver } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'

type Usage = { user: number; system: number }
type Span = { id: number; parent?: number; label: string; start: number; end: number; cpuMs: number; failed: boolean; deadline?: number; remainingMs?: number }
const threadClock = (process as unknown as { threadCpuUsage?: () => Usage }).threadCpuUsage
const cpu = () => threadClock ? threadClock() : process.cpuUsage()
const delta = (a: Usage, b: Usage) => (b.user + b.system - a.user - a.system) / 1000
const context = new AsyncLocalStorage<number>()
const stages = new Map<string, { n: number; wall: number; cpu: number; max: number }>()
const spans: Span[] = [], gc: { start: number; duration: number }[] = []
const waits = { n: 0, wall: 0, max: 0, barrier: 0, steps: 0, nodes: 0, chars: 0, entries: 0, time: 0 }
let mode = 'plain', active = false, next = 0, droppedSpans = 0, observer: PerformanceObserver | undefined, inspector: Session | undefined
let profile: unknown
let totalCpu = cpu(), start = performance.now()
let activeWork: { label: string; start: number; cpu: Usage; waitStart?: number; waitCpu?: Usage; wait: number; waitUsage: number } | undefined
const workTotals: Record<string, { n: number; wall: number; activeWall: number; cpuMs: number; wait: number; transitions: number }> = {}
const controls = new WeakMap<object, string>()
const labels = new WeakMap<object, string>()
const post = (method: string, parameters = {}) => new Promise<unknown>((resolve, reject) => inspector!.post(method, parameters, (error, result) => error ? reject(error) : resolve(result)))
function record(label: string, start: number, before: Usage, parent: number | undefined, id: number, failed: boolean) {
  const end = performance.now(), used = delta(before, cpu()), elapsed = end - start
  const row = stages.get(label) ?? { n: 0, wall: 0, cpu: 0, max: 0 }
  row.n++; row.wall += elapsed; row.cpu += used; row.max = Math.max(row.max, elapsed); stages.set(label, row)
  // Full-app FS calls are aggregated rather than exhausting the trace before
  // later Prepare phases. Parallel FS wall sums are not physical service time.
  if (!label.startsWith('FS.')) {
    if (spans.length < 120000) spans.push({ id, parent, label, start, end, cpuMs: used, failed })
    else droppedSpans++
  }
}
export const diagnostics = {
  tag<T extends object>(label: string, value: T): T { labels.set(value, label); return value },
  label(value: object): string { return labels.get(value) ?? 'unlabelled' },
  force(control: object, force: boolean) { if (force) controls.set(control, 'forced') },
  deadline(label: string, deadline: number) {
    if (Number.isFinite(deadline) && spans.length < 120000) {
      const now = performance.now()
      spans.push({ id: next++, label: 'deadline:' + label, start: now, end: now, cpuMs: 0, failed: false, deadline, remainingMs: deadline - now })
    }
  },
  async start(selected: string) {
    totalCpu = cpu(); start = performance.now()
    mode = selected; active = selected !== 'plain'
    observer = new PerformanceObserver(list => { for (const event of list.getEntries()) if (gc.length < 50000) gc.push({ start: event.startTime, duration: event.duration }) })
    observer.observe({ entryTypes: ['gc'] })
    if (mode === 'cpu') { inspector = new Session(); inspector.connect(); await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 1000 }); await post('Profiler.start') }
  },
  sync<T>(label: string, work: () => T): T {
    if (!active || mode !== 'stages') return work()
    const began = performance.now(), before = cpu(), parent = context.getStore(), id = next++
    let failed = false
    try { return context.run(id, work) } catch (error) { failed = true; throw error } finally { record(label, began, before, parent, id, failed) }
  },
  async async<T>(label: string, work: () => Promise<T>): Promise<T> {
    if (!active || mode !== 'stages') return work()
    const began = performance.now(), before = cpu(), parent = context.getStore(), id = next++
    let failed = false
    try { return await context.run(id, work) } catch (error) { failed = true; throw error } finally { record(label, began, before, parent, id, failed) }
  },
  mark(label: string) { if (spans.length < 120000) { const now = performance.now(); spans.push({ id: next++, label, start: now, end: now, cpuMs: 0, failed: false }) } },
  workStart(label: string) {
    if (mode !== 'stages') return
    if (activeWork) throw Error('Diagnostic work driver overlap')
    activeWork = { label, start: performance.now(), cpu: cpu(), wait: 0, waitUsage: 0 }
  },
  workEnd(transitions: number) {
    if (!activeWork) return
    const row = workTotals[activeWork.label] ??= { n: 0, wall: 0, activeWall: 0, cpuMs: 0, wait: 0, transitions: 0 }
    const elapsed = performance.now() - activeWork.start
    row.n++; row.wall += elapsed; row.wait += activeWork.wait; row.activeWall += elapsed - activeWork.wait
    row.cpuMs += delta(activeWork.cpu, cpu()) - activeWork.waitUsage; row.transitions += transitions
    activeWork = undefined
  },
  waitStart(control: object, work: { barrier?: boolean }, counters: { chars: number; nodes: number; steps: number; entries: number }, force = false) {
    if (mode !== 'stages') return
    const reason = force || work.barrier || controls.get(control) === 'forced' ? 'barrier' : counters.steps >= 2048 ? 'steps' : counters.nodes >= 512 ? 'nodes'
      : counters.entries >= 32 ? 'entries' : counters.chars >= 8192 ? 'chars' : 'time'
    waits[reason]++; controls.set(control, reason)
    if (activeWork) { activeWork.waitStart = performance.now(); activeWork.waitCpu = cpu() }
  },
  waitEnd(control: object, elapsed: number) {
    if (mode !== 'stages') return
    waits.n++; waits.wall += elapsed; waits.max = Math.max(waits.max, elapsed); controls.delete(control)
    if (activeWork?.waitStart !== undefined) {
      activeWork.wait += performance.now() - activeWork.waitStart
      activeWork.waitUsage += delta(activeWork.waitCpu!, cpu()); activeWork.waitStart = undefined
    }
  },
  async stop() {
    active = false; observer?.disconnect()
    if (inspector) { profile = (await post('Profiler.stop') as { profile: unknown }).profile; await post('Profiler.disable'); inspector.disconnect(); inspector = undefined }
  },
  save(path: string, extra: object = {}) {
    writeFileSync(path, JSON.stringify({ mode, start, end: performance.now(), mainCpuMs: delta(totalCpu, cpu()),
      cpuClock: threadClock ? 'threadCpuUsage (Windows tick quantized)' : 'processCpuUsage (all process threads)',
      stages: Object.fromEntries(stages), spans, spansTruncated: droppedSpans > 0, droppedSpans, fullAppFsSpansAggregated: true, gc, waits, workTotals, ...extra }, null, 2))
    if (profile) writeFileSync(path.replace(/\.json$/, '.cpuprofile'), JSON.stringify(profile))
  },
}
;(globalThis as typeof globalThis & { __step5Diagnostics?: typeof diagnostics }).__step5Diagnostics = diagnostics

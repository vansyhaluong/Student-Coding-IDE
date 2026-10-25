/** Test-only Main-thread profiling. Never records arguments, source or values. */
import { Session } from 'node:inspector'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance, PerformanceObserver } from 'node:perf_hooks'

type Cpu = { user: number; system: number }
type Span = { id: number; parent: number | null; name: string; async: boolean;
  start: number; end: number; wallMs: number; cpuMs: number; selfWallMs: number; selfCpuMs: number }
type Frame = { id: number; parent?: Frame; name: string; async: boolean; start: number; cpu: Cpu; childWall: number; childCpu: number }
const cpuClock = (process as unknown as { threadCpuUsage?: () => Cpu }).threadCpuUsage
const cpu = () => cpuClock ? cpuClock() : process.cpuUsage()
let active = false, mode = 'plain', frame: Frame | undefined, nextId = 0
const spans: Span[] = [], gc: { start: number; duration: number; kind?: number }[] = []
const lags: { start: number; end: number; excessMs: number }[] = []
let observer: PerformanceObserver | undefined, session: Session | undefined, cpuProfile: unknown
const post = (method: string, parameters: object = {}) => new Promise<unknown>((resolve, reject) => {
  session!.post(method, parameters, (error, value) => error ? reject(error) : resolve(value))
})
function begin(name: string, async: boolean): Frame {
  if (nextId >= 100_000) throw Error('Profiling span ceiling exceeded')
  const value = { id: nextId++, parent: frame, name, async, start: performance.now(), cpu: cpu(), childWall: 0, childCpu: 0 }
  frame = value; return value
}
function end(value: Frame) {
  const now = performance.now(), usage = cpu()
  const wallMs = now - value.start, cpuMs = (usage.user - value.cpu.user + usage.system - value.cpu.system) / 1000
  spans.push({ id: value.id, parent: value.parent?.id ?? null, name: value.name, async: value.async,
    start: value.start, end: now, wallMs, cpuMs, selfWallMs: wallMs - value.childWall, selfCpuMs: cpuMs - value.childCpu })
  if (frame !== value) throw Error('Overlapping unsupported profiling spans')
  frame = value.parent
  if (frame) { frame.childWall += wallMs; frame.childCpu += cpuMs }
}
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { n: sorted.length, total: values.reduce((a, b) => a + b, 0), p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? 0,
    p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? 0, max: sorted.at(-1) ?? 0 }
}
export const profile = {
  lag(start: number, end: number, excessMs: number) { if (active) lags.push({ start, end, excessMs }) },
  sync<T>(name: string, work: () => T): T {
    if (!active || mode !== 'stages') return work()
    const current = begin(name, false)
    try { return work() } finally { end(current) }
  },
  async async<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (!active || mode !== 'stages') return work()
    const current = begin(name, true)
    try { return await work() } finally { end(current) }
  },
  async start(selectedMode: string) {
    mode = selectedMode
    if (mode === 'plain') return
    observer = new PerformanceObserver(list => { for (const event of list.getEntries()) gc.push({ start: event.startTime, duration: event.duration,
      kind: (event as unknown as { detail?: { kind: number } }).detail?.kind }) })
    observer.observe({ entryTypes: ['gc'] })
    if (mode === 'cpu') {
      session = new Session(); session.connect()
      await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 1000 }); await post('Profiler.start')
    }
    active = true
  },
  async stopSampling() {
    active = false; observer?.disconnect()
    if (session) {
      cpuProfile = (await post('Profiler.stop') as { profile: unknown }).profile
      await post('Profiler.disable'); session.disconnect(); session = undefined
    }
  },
  async save(directory: string, scenario: string, selectedMode: string) {
    if (frame) throw Error('Unsettled profiling frame')
    const stages = Object.fromEntries([...new Set(spans.map(span => span.name))].map(name => {
      const rows = spans.filter(span => span.name === name)
      return [name, Object.fromEntries(['wallMs', 'cpuMs', 'selfWallMs', 'selfCpuMs'].map(key => [key, summary(rows.map(row => row[key as keyof Span] as number))]))]
    }))
    await writeFile(join(directory, `${scenario}-profile.json`), JSON.stringify({ mode: selectedMode, cpuClock: cpuClock ? 'process.threadCpuUsage' : 'process.cpuUsage (includes process threads)',
      stages, spans, gc, lags, measuredAt: new Date().toISOString(), limitations: ['Nested spans are inclusive; exclusive columns subtract direct children',
        'Async CPU deltas cover Main-thread work during the interval, not filesystem service CPU',
        'Wall minus CPU is not a direct I/O measurement; it also includes scheduling/GC waiting',
        'Stage instrumentation has overhead; compare the plain and sampling-only runs'] }, null, 2))
    if (cpuProfile) await writeFile(join(directory, `${scenario}.cpuprofile`), JSON.stringify(cpuProfile))
  },
}

// Used only by in-memory transformed profiling bundles, never production files.
;(globalThis as typeof globalThis & { __packageProfile?: typeof profile }).__packageProfile = profile

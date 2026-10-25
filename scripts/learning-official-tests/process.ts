// Private fixed-driver subprocess plumbing. Never imported by product services.
import { spawn } from 'node:child_process'
import { check, demand, LIMITS, Quarantine } from './model'

export interface ChildOptions { cwd: string; input?: Buffer; timeoutMs: number; signal?: AbortSignal; outputLimit?: number; trustedLeaf?: boolean }
/** Await close, not just exit. A kill failure is quarantine, never successful cleanup.
 * Windows taskkill /T targets only this owned PID; POSIX uses a new process group.
 * Trusted drivers cannot launch work from input. No shell command composition. */
export async function boundedChild(command: string, args: string[], o: ChildOptions): Promise<Buffer> {
  check(o.signal)
  demand(o.timeoutMs > 0 && o.timeoutMs <= LIMITS.campaignMs, 'TIME_LIMIT')
  demand(!o.input || o.input.length <= LIMITS.bytes, 'INPUT_LIMIT')
  const outputLimit = o.outputLimit ?? LIMITS.bytes
  demand(outputLimit > 0 && outputLimit <= LIMITS.bytes, 'OUTPUT_LIMIT')
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: o.cwd, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env,
        DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_NOLOGO: '1',
        DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: 'true', DOTNET_GCHeapHardLimit: '0x8000000', MSBUILDDISABLENODEREUSE: '1' } })
    let reason: string | undefined, bytes = 0, errors = 0, finished = false
    let killing: Promise<void> = Promise.resolve()
    let drainTimer: ReturnType<typeof setTimeout> | undefined
    const chunks: Buffer[] = []
    function stop(code: string) {
      if (reason || finished) return
      reason = code
      if (!child.pid) return
      drainTimer = setTimeout(() => {
        reason = 'CLEANUP_UNVERIFIED'
        child.kill(); child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy()
      }, 5000)
      // Only the fixed Node reference driver / Pilot.dll are declared leaf tasks.
      // They contain no spawn API; close proves their entire owned work settled.
      // Avoid taskkill's PID-already-exited race without weakening build/tree cleanup.
      if (o.trustedLeaf) { child.kill(); return }
      killing = new Promise(done => {
        if (process.platform !== 'win32') {
          try { process.kill(-child.pid!, 'SIGKILL') } catch { reason = 'CLEANUP_UNVERIFIED' }
          done(); return
        }
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' })
        const killTimer = setTimeout(() => { reason = 'CLEANUP_UNVERIFIED'; killer.kill() }, 3000)
        killer.once('error', () => { reason = 'CLEANUP_UNVERIFIED'; done() })
        killer.once('close', code => { clearTimeout(killTimer); if (code !== 0) reason = 'CLEANUP_UNVERIFIED'; done() })
      })
    }
    const abort = () => stop('CANCELLED')
    const timer = setTimeout(() => stop('TOOL_TIMEOUT'), o.timeoutMs)
    o.signal?.addEventListener('abort', abort, { once: true })
    // Close the race between initial check and subscription.
    if (o.signal?.aborted) abort()
    child.stdout.on('data', (b: Buffer) => { bytes += b.length; if (bytes > outputLimit) stop('OUTPUT_LIMIT'); else chunks.push(b) })
    child.stderr.on('data', (b: Buffer) => { errors += b.length; if (errors > LIMITS.stderr) stop('STDERR_LIMIT') })
    child.stdin.on('error', () => { if (!reason) stop('INPUT_IO') })
    child.once('error', () => { reason ??= 'SPAWN_FAILED' })
    child.once('close', code => {
      finished = true; clearTimeout(timer); o.signal?.removeEventListener('abort', abort)
      void killing.then(() => {
        clearTimeout(drainTimer)
        if (reason || code !== 0) reject(new Quarantine(reason ?? 'CHILD_FAILED'))
        else resolve(Buffer.concat(chunks, bytes))
      })
    })
    child.stdin.end(o.input)
  })
}

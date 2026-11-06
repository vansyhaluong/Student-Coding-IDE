/* global process, setTimeout, clearTimeout */
// Offline bundler and bounded supervisor. Only the isolated Electron entry has HTTP.
import { build } from 'vite'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, readdir, access } from 'node:fs/promises'
import { claimAttempt, attemptPaths, acquireAttemptLock, publishExclusive } from './sh4-attempt-store.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stageMessages = {
  MAIN_STARTING: 'Electron Main starting.', MAIN_STARTED: 'Workflow started.',
  USER_DATA_CREATING: 'Creating isolated user-data.', USER_DATA_CONFIGURING: 'Configuring isolated user-data.',
  ELECTRON_READY_WAIT: 'Waiting for Electron ready.',
  PREFLIGHT_CONSENT: 'Waiting for PREFLIGHT consent (60s). Open the SH-4 consent window in the taskbar. Cancel sends nothing.',
  SNAPSHOT_CONSENT: 'Waiting for SNAPSHOT consent (60s). Open the SH-4 consent window in the taskbar. No inference before explicit consent.',
  ACCOUNT_DISPATCHING: 'Account metadata dispatch reserved.', CATALOGUE_DISPATCHING: 'Catalogue metadata dispatch reserved.',
  INFERENCE_HEADERS_RECEIVED: 'Inference headers received; reading bounded body.',
  INFERENCE_VALIDATION: 'Inference body received; validating response.',
  INFERENCE_DISPATCHING: 'Inference dispatch reserved (30s execution budget).' }
// Kill only our spawned child's tree, never all Electron/Node processes.
export async function terminateTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((done, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      const timer = setTimeout(() => { killer.kill(); reject(new Error('CLEANUP_TIMEOUT')) }, 5000)
      killer.once('error', () => { clearTimeout(timer); reject(new Error('CLEANUP_FAILED')) })
      killer.once('close', code => {
        clearTimeout(timer)
        if (code === 0 || child.exitCode !== null) done()
        else reject(new Error('CLEANUP_FAILED'))
      })
    })
  } else {
    // Launcher creates a dedicated process group on POSIX.
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}

/** Dependencies permit real child lifecycle tests without Electron, credentials or HTTP. */
export async function runRunner({ rootPath = root, env = process.env, prepare, launch,
  terminate = terminateTree, signals = process, timeoutMs = 300000, cleanupMs = 6000,
  attemptId, profile = 'FREE_ROUTER', onStage = () => {}, pollMs = 250, executionMode = 'LIVE' } = {}) {
  const runId = randomUUID(), startedAt = new Date().toISOString()
  let attempt
  try { attempt = await claimAttempt(rootPath, { attemptId, runId, profile, executionMode }) }
  catch (error) { return { result: 'STOP', code: error.code === 'EEXIST' ? 'ATTEMPT_ALREADY_EXISTS' : 'ATTEMPT_CLAIM_FAILED',
    runnerState: 'FINISHED', httpRequests: 0, inferenceRequests: 0, httpDelivery: 'NOT_ATTEMPTED', productionEnabled: false, retry: false, paidFallback: false } }
  let releaseLock
  let child, timer, monitor, stage = 'PREPARING', stop, cancelled = false, reading = false, lastStage
  let status = { ...attempt.manifestValue, runId, startedAt, executionMode, runnerState: 'RUNNING', result: 'STOP', code: stage,
    httpRequests: 0, inferenceRequests: 0, httpDelivery: 'NOT_ATTEMPTED',
    productionEnabled: false, retry: false, paidFallback: false }
  const interrupted = new Promise(resolveStop => { stop = code => resolveStop({ failure: code }) })
  async function latestEvidence() {
    const directory = attempt.directory, prefix = `progress-${runId}-`
    try {
      const snapshots = (await readdir(directory)).filter(name => name.startsWith(prefix) && /^\d+\.json$/.test(name.slice(prefix.length)))
        .sort((a, b) => Number(b.slice(prefix.length, -5)) - Number(a.slice(prefix.length, -5)))
      if (snapshots.length) {
        const value = JSON.parse(await readFile(resolve(directory, snapshots[0]), 'utf8'))
        return value.runId === runId ? value : undefined
      }
    } catch { /* Missing snapshot directory is normal before Main starts. */ }
    return undefined
  }
  const onInterrupt = () => stop('INTERRUPTED')
  signals.on('SIGINT', onInterrupt); signals.on('SIGTERM', onInterrupt)
  try {
    try { releaseLock = await acquireAttemptLock(attempt) }
    catch { status = { ...status, result: 'STOP', runnerState: 'FINISHED', code: 'ATTEMPT_ACTIVE_OR_RECOVERY_REQUIRED' }
      await publishExclusive(attempt.result, status); return status }
    const finish = async value => {
      if (releaseLock && value.cleanup !== 'FAILED') {
        try { await releaseLock(); releaseLock = undefined }
        catch { value = { ...value, cleanup: 'FAILED', lockRetained: true }; releaseLock = undefined }
      }
      if (value.cleanup === 'FAILED') { value.lockRetained = true; releaseLock = undefined }
      await publishExclusive(attempt.result, value)
      return value
    }
    timer = setTimeout(() => stop('RUNNER_TIMEOUT'), timeoutMs)
    monitor = globalThis.setInterval(async () => {
      if (reading || cancelled) return
      reading = true
      try {
        const value = await latestEvidence()
        if (!cancelled && value && Object.hasOwn(stageMessages, value.stage) && value.stage !== lastStage) {
          lastStage = value.stage
          onStage(lastStage, stageMessages[lastStage]) // Never emit untrusted file text or errors.
        }
      } catch { /* Transient read failures cannot authorize HTTP; watchdog remains active. */ }
      finally { reading = false }
    }, pollMs)
    const work = (async () => {
      try {
        await prepare(attempt)
        if (cancelled) return { failure: 'INTERRUPTED' }
        if (env.ELECTRON_RUN_AS_NODE) return { failure: 'ELECTRON_RUN_AS_NODE_SET' }
        stage = 'ELECTRON_STARTING'
        // Explicit snapshot inheritance; no credential argument, dump, persistence or Vite define.
        child = launch({ ...env, SH4_RUN_ID: runId, SH4_ATTEMPT_ID: attemptId, SH4_MODEL_PROFILE: profile, SH4_EXECUTION_MODE: executionMode })
        return await new Promise(done => {
          child.once('error', () => done({ failure: 'ELECTRON_LAUNCH_FAILED' }))
          child.once('close', (code, signal) => done({ code, signal }))
        })
      } catch { return { failure: stage === 'PREPARING' ? 'PREPARATION_FAILED' : 'ELECTRON_LAUNCH_FAILED' } }
    })()
    const outcome = await Promise.race([work, interrupted])
    cancelled = true
    clearTimeout(timer)
    // Preparation may finish after cancellation. Prevent a late launch before cleaning up.
    stop = () => {}
    if (outcome.failure) {
      // Wait no longer than cleanupMs, even if the OS cleanup tool itself stalls.
      if (child) {
        let cleanupTimer
        try {
          await Promise.race([terminate(child), new Promise((_, reject) => {
            cleanupTimer = setTimeout(() => reject(new Error('CLEANUP_TIMEOUT')), cleanupMs)
          })])
        } catch { outcome.cleanupFailed = true }
        finally { clearTimeout(cleanupTimer) }
      }
    }
    try {
      const latest = await latestEvidence()
      if (latest) status = latest
    } catch { /* Missing/corrupt evidence is handled as early exit below. Never print raw errors. */ }
    try {
      // Main can publish an immutable safe fallback if progress publication fails.
      const failure = JSON.parse(await readFile(resolve(attempt.directory, `failure-${runId}.json`), 'utf8'))
      if (failure.runId === runId && failure.code === 'MAIN_FAILED') status = { ...status, ...failure }
    } catch { /* No fallback is normal. Never print untrusted file text. */ }
    if (!outcome.failure && status.runnerState === 'FINISHED'
      && outcome.code === (status.result === 'PASS' ? 0 : 1) && !outcome.signal) {
      return await finish({ ...status, ...attempt.manifestValue })
    }
    status = { ...status, runnerState: 'FINISHED', result: 'STOP',
      code: outcome.failure ?? 'ELECTRON_EXIT_WITHOUT_RESULT', lastStage: status.stage ?? stage,
      exitCode: outcome.code ?? child?.exitCode ?? null, exitSignal: outcome.signal ?? child?.signalCode ?? null,
      cleanup: outcome.cleanupFailed ? 'FAILED' : child && outcome.failure ? 'TREE_TERMINATED' : 'NOT_REQUIRED',
      finishedAt: new Date().toISOString() }
    // A missing/abnormal final response cannot prove what happened after launch.
    if (child) status = { ...status, httpRequests: 'UNKNOWN', inferenceRequests: 'UNKNOWN', httpDelivery: 'UNKNOWN' }
    let inferenceReservation = 'UNKNOWN'
    try { await access(attempt.reservation); inferenceReservation = 'RESERVED' }
    catch (error) { if (error.code === 'ENOENT') inferenceReservation = 'NOT_RESERVED' }
    return await finish({ ...status, ...attempt.manifestValue, inferenceReservation })
  } finally {
    clearTimeout(timer)
    globalThis.clearInterval(monitor)
    signals.off('SIGINT', onInterrupt); signals.off('SIGTERM', onInterrupt)
  }
}

async function cli() {
  const args = process.argv.slice(2)
  const north = args.includes('--north-mini-code-free')
  const idAt = args.indexOf('--attempt-id'), attemptId = idAt >= 0 ? args[idAt + 1] : undefined
  const modes = args.filter((arg, index) => arg !== '--north-mini-code-free' && (idAt < 0 || (index !== idAt && index !== idAt + 1)))
  const prepareOnly = modes.length === 1 && modes[0] === '--prepare-only'
  const consentTests = modes.length === 1 && modes[0] === '--offline-consent-tests'
  const offline = consentTests || (modes.length === 1 && modes[0] === '--offline-check')
  if (new Set(args).size !== args.length || modes.length > 1 || (modes.length > 0 && !prepareOnly && !offline)
    || (idAt >= 0 && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(attemptId ?? '')) || (!prepareOnly && !offline && !attemptId)) {
    process.stderr.write('SH-4 STOP: live mode requires an explicit --attempt-id; unsupported arguments. No HTTP or history change.\n')
    process.exitCode = 1; return
  }
  // Retained for historical offline audit only. Gemini is the active SH provider.
  if (!offline && !prepareOnly) {
    process.stderr.write('SH-4 STOP: OPENROUTER_RETIRED. Use the separately approved Gemini runner. No HTTP or history change.\n')
    process.exitCode = 1; return
  }
  const prepare = attempt => build({ configFile: false, root, logLevel: 'silent', build: {
    outDir: attempt?.directory ?? resolve(root, 'out/sh4-live-runner'), emptyOutDir: false, minify: false,
    lib: { entry: resolve(root, consentTests ? 'scripts/sh4-consent-electron-tests.ts' : 'scripts/sh4-openrouter-smoke-main.ts'),
      formats: ['cjs'], fileName: () => consentTests ? 'consent-tests.cjs' : 'main.cjs' },
    rollupOptions: { external: ['electron', /^node:/] } } })
  try {
    if (prepareOnly) {
      await prepare()
      process.stdout.write('SH-4 runner prepared offline; no Electron/network/request.\n'); return
    }
    const require = createRequire(import.meta.url)
    // Offline harness inherits only OS startup essentials, never any API credential.
    const env = offline ? Object.fromEntries(Object.keys(process.env).filter(name =>
      /^(?:SystemRoot|WINDIR|PATH|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(name))
      .map(name => [name, process.env[name]])) : process.env
    const selectedAttempt = attemptId ?? `offline-${randomUUID()}`
    const evidence = await runRunner({ prepare, env, attemptId: selectedAttempt, profile: north ? 'NORTH_MINI_CODE_FREE' : 'FREE_ROUTER', executionMode: offline ? 'OFFLINE' : 'LIVE',
      onStage: (_, message) => process.stdout.write(`SH-4 ${offline ? 'OFFLINE ' : ''}${message}\n`),
      launch: env => spawn(require('electron'),
      [resolve(attemptPaths(root, env.SH4_ATTEMPT_ID, offline ? 'OFFLINE' : 'LIVE').directory, consentTests ? 'consent-tests.cjs' : 'main.cjs')], { cwd: root, env: offline ? { ...env, SH4_OFFLINE_CHECK: '1' } : env, stdio: 'ignore', windowsHide: false,
        detached: process.platform !== 'win32' }) })
    process.stdout.write(`SH-4 ${offline ? 'OFFLINE ' : ''}${evidence.result}: ${evidence.code}. Attempt ${selectedAttempt}; inspect out/sh4-attempts/${offline ? 'offline' : 'live'}/${selectedAttempt}/result.json.\n`)
    process.exitCode = evidence.result === 'PASS' ? 0 : 1
  } catch {
    process.stderr.write('SH-4 STOP: runner or result persistence failed; HTTP UNKNOWN. No retry.\n')
    process.exitCode = 1
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli()

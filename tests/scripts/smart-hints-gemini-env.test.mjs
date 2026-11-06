import { expect, it } from 'vitest'
import { build } from 'vite'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'

// Actual Windows PowerShell -> Node supervisor -> Electron Main, fake credential
// and transport only. Isolated temp root; no old attempt/evidence is accessed.
it.each(['STANDARD', 'AUTHORIZATION'])('inherits a synthetic %s PowerShell environment key through the real runner into bundled Electron Main', async kind => {
  const directory = await mkdtemp(join(tmpdir(), 'sh4-gemini-env-'))
  try {
    const fixture = join(directory, 'electron-fixture.ts'), bundle = join(directory, 'bundle')
    const smoke = resolve('scripts/sh4-gemini-smoke.ts').replaceAll('\\', '/')
    const store = resolve('scripts/sh4-attempt-store.mjs').replaceAll('\\', '/')
    await mkdir(join(directory, 'user-data'))
    await writeFile(fixture, `
      import { app } from 'electron'
      import process from 'node:process'
      import { resolve } from 'node:path'
      import { runGeminiSmoke } from ${JSON.stringify(smoke)}
      import { publishExclusive } from ${JSON.stringify(store)}
      globalThis.fetch = async () => { throw new Error('REAL_NETWORK_FORBIDDEN') }
      app.setPath('userData', ${JSON.stringify(join(directory, 'user-data'))})
      void (async () => {
      await app.whenReady()
      const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      let headersUnchanged = true
      const result = await runGeminiSmoke({ electronMainDevelopment: true, liveApproved: true,
        readKey: () => process.env.GEMINI_API_KEY,
        confirm: async () => true, reserve: async () => {}, send: async request => {
          headersUnchanged &&= request.headers.get('x-goog-api-key') === process.env.GEMINI_API_KEY && !request.headers.has('authorization')
          return request.method === 'GET'
            ? json({ name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 })
            : json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ kind: 'HINT', level: 1, paragraphs: ['Synthetic hint.'], nextQuestion: 'Why?', evidence: [] }) }] } }] })
        } })
      const safe = { mainKeyPresent: !!process.env.GEMINI_API_KEY,
        code: result.code, inferenceRequests: result.inferenceRequests, headersUnchanged }
      await publishExclusive(resolve(process.env.SH4_ENV_PROBE_DIRECTORY, 'progress-' + process.env.SH4_RUN_ID + '-1.json'), {
        ...safe, runId: process.env.SH4_RUN_ID, runnerState: 'FINISHED', result: result.result })
      process.stdout.write('ENV_PROBE ' + JSON.stringify(safe) + '\\n')
      app.exit(result.result === 'PASS' ? 0 : 1)
      })().catch(() => { process.stdout.write('ENV_PROBE {}\\n'); app.exit(1) })
    `)
    // Same library/external configuration as the real launcher. No env loading,
    // env define or credential injection into the bundle.
    const built = await build({ configFile: false, envFile: false, logLevel: 'silent', build: { outDir: bundle,
      minify: false, lib: { entry: fixture, formats: ['cjs'], fileName: () => 'main.cjs' },
      rollupOptions: { external: ['electron', /^node:/] } } })
    const outputs = (Array.isArray(built) ? built : [built]).flatMap(result => result.output)
    expect(outputs.some(o => o.type === 'chunk' && /\w+\.env\.GEMINI_API_KEY/.test(o.code))).toBe(true)
    const runner = pathToFileURL(resolve('scripts/run-smart-hints-gemini-live.mjs')).href
    const probe = join(directory, 'node-probe.mjs')
    const electron = createRequire(import.meta.url)('electron')
    await writeFile(probe, `
      import { runRunner } from ${JSON.stringify(runner)}
      import { spawn } from 'node:child_process'
      import process from 'node:process'
      const nodeKeyPresent = !!process.env.GEMINI_API_KEY
      let attempt, observation = '', inherited = false
      const result = await runRunner({ rootPath: ${JSON.stringify(directory)}, env: process.env,
        executionMode: 'LIVE', attemptId: 'env-probe', timeoutMs: 15000,
        prepare: async current => { attempt = current },
        launch: env => {
          inherited = env.GEMINI_API_KEY === process.env.GEMINI_API_KEY
          const child = spawn(${JSON.stringify(electron)}, [${JSON.stringify(join(bundle, 'main.cjs'))}], { env: { ...env, SH4_ENV_PROBE_DIRECTORY: attempt.directory }, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
          child.stdout.on('data', data => { observation += data.toString() })
          return child
        } })
      const line = observation.split('\\n').find(line => line.startsWith('ENV_PROBE '))
      process.stdout.write(JSON.stringify({ nodeKeyPresent, inherited, main: line ? JSON.parse(line.slice(10)) : {}, runnerCode: result.code }) + '\\n')
    `)
    const fake = kind === 'STANDARD' ? 'AIza' + 'SYNTHETIC_Only-0123456789'.padEnd(35, 'x')
      : 'AQ.' + 'SYNTHETIC_Auth-0123456789'.padEnd(600, 'x')
    const shell = join(directory, 'probe.ps1'), quote = value => "'" + value.replaceAll("'", "''") + "'"
    await writeFile(shell, `$env:GEMINI_API_KEY = ${quote(fake)}\n& ${quote(process.execPath)} ${quote(probe)}\nexit $LASTEXITCODE\n`)
    // Pass only OS startup variables; never inspect/read an actual API credential.
    const env = Object.fromEntries(Object.keys(process.env).filter(name => /^(SystemRoot|WINDIR|PATH|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(name)).map(name => [name, process.env[name]]))
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', shell], { env, windowsHide: true, timeout: 20000 })
    const result = JSON.parse(stdout.trim())
    expect(result).toMatchObject({ nodeKeyPresent: true, inherited: true, runnerCode: 'COMPLETE', main: { mainKeyPresent: true, code: 'COMPLETE', inferenceRequests: 1, headersUnchanged: true } })
    expect(stdout.includes(fake)).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30000)

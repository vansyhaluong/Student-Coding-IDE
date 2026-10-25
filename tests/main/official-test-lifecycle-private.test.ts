import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { build, createServer, isFileLoadingAllowed, normalizePath } from 'vite'
import { boundedChild } from '../../scripts/learning-official-tests/process'
import { exercisePackageRendererBoundary } from '../../src/main/services/learning/content/exercise-package-build'

const temporary: string[] = []
async function temp() { const p = await fs.mkdtemp(join(tmpdir(), 'official-tool-test-')); temporary.push(p); return p }
afterEach(async () => {
  for (const p of temporary.splice(0)) {
    if (dirname(resolve(p)) !== resolve(tmpdir()) || !basename(p).startsWith('official-tool-test-')) throw new Error('unsafe cleanup')
    await fs.rm(p, { recursive: true, force: true })
  }
})

describe('owned developer children: pipe caps and drain before return', () => {
  it('rejects pre-cancel before spawn and accepts bounded ordinary output', async () => {
    const cwd = await temp()
    await expect(boundedChild(process.execPath, ['-e', 'process.exit(0)'], { cwd, timeoutMs: 1000, signal: AbortSignal.abort() })).rejects.toThrow('CANCELLED')
    const out = await boundedChild(process.execPath, ['-e', 'process.stdout.write("ok")'], { cwd, timeoutMs: 5000 })
    expect(out.toString()).toBe('ok')
  })
  it.each(['stdout', 'stderr'] as const)('rejects excess %s and waits for closure', async stream => {
    const cwd = await temp()
    await expect(boundedChild(process.execPath, ['-e', `process.${stream}.write('x'.repeat(200000));setInterval(()=>{},1000)`],
      { cwd, timeoutMs: 5000, outputLimit: 32 })).rejects.toThrow(stream === 'stdout' ? 'OUTPUT_LIMIT' : 'STDERR_LIMIT')
  }, 12_000)
  it('rejects nonzero exit, missing executable and oversized input', async () => {
    const cwd = await temp()
    await expect(boundedChild(process.execPath, ['-e', 'process.exit(3)'], { cwd, timeoutMs: 5000 })).rejects.toThrow('CHILD_FAILED')
    await expect(boundedChild(join(cwd, 'missing-executable'), [], { cwd, timeoutMs: 5000 })).rejects.toThrow('SPAWN_FAILED')
    await expect(boundedChild(process.execPath, [], { cwd, timeoutMs: 5000, input: Buffer.alloc(1024 * 1024 + 1) })).rejects.toThrow('INPUT_LIMIT')
  })
  it.each(['timeout', 'cancel'])('%s kills owned parent and descendant before result/cleanup', async mode => {
    const cwd = await temp(), file = join(cwd, 'pid.txt'), controller = new AbortController()
    const source = `const cp=require('node:child_process'),fs=require('node:fs');const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);`
    const timer = mode === 'cancel' ? setTimeout(() => controller.abort(), 900) : undefined
    try {
      await expect(boundedChild(process.execPath, ['-e', source, file], { cwd, timeoutMs: mode === 'timeout' ? 900 : 5000, signal: controller.signal })).rejects.toThrow(mode === 'timeout' ? 'TOOL_TIMEOUT' : 'CANCELLED')
      const pid = Number(await fs.readFile(file, 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow()
      // Recursive cleanup only after close; locked handles would surface here on Windows.
      await fs.unlink(file)
    } finally { clearTimeout(timer) }
  }, 12_000)
})

describe('actual Vite canonical/encoded private routes and bundle exclusion', () => {
  it('HTTP denies source, evidence, old resources and encoded forms without leaking sentinel', async () => {
    const repo = resolve('.'), secretRoot = await temp(), secret = join(secretRoot, '.env')
    await fs.writeFile(secret, 'S2-SECRET-DO-NOT-LEAK')
    const server = await createServer({ configFile: false, root: repo, logLevel: 'silent',
      plugins: [exercisePackageRendererBoundary()], optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, fs: { allow: [repo, secretRoot], deny: ['**/custom-secret/**'] } } })
    try {
      await server.listen()
      const address = server.httpServer!.address(); if (!address || typeof address === 'string') throw new Error('address')
      const base = `http://127.0.0.1:${address.port}`
      const file = normalizePath(join(repo, 'scripts/learning-official-tests/references/ch2-04/solution.js'))
      for (const path of [
        '/@fs/' + file, '/@fs/' + file.replace('learning-official-tests', '%6cearning-official-tests'),
        '/@fs/' + file.replace('learning-official-tests', '%256cearning-official-tests'),
        '/@fs/' + file.replaceAll('/', '%2f'), '/@fs/' + file.replaceAll('/', '%5c'),
        '/scripts/learning-official-tests/references/ch2-04/solution.js?raw',
        '/out/official-tests/s2-integration-report.json', '/resources/learning/exercises/manifest.json',
      ]) {
        const reply = await fetch(base + path)
        expect(reply.status, path).toBe(403)
        const body = await reply.text()
        expect(body).not.toContain('E2-PILOT-REFERENCE-ONLY')
        expect(body).not.toContain('S2-SECRET-DO-NOT-LEAK')
      }
      // Vite may conceal denied dotfiles with 404; verify both FS denial and no content.
      expect(isFileLoadingAllowed(server.config, normalizePath(secret))).toBe(false)
      const secretReply = await fetch(base + '/@fs/' + normalizePath(secret))
      expect([403, 404]).toContain(secretReply.status)
      expect(await secretReply.text()).not.toContain('S2-SECRET-DO-NOT-LEAK')
      expect((await fetch(base + '/@fs/' + normalizePath(join(repo, 'package.json')))).status).toBe(200)
      expect(server.config.server.fs.deny).toContain('.env')
      expect(server.config.server.fs.deny).toContain('**/custom-secret/**')
    } finally { await server.close() }
  }, 30_000)
  it('rejects an accidental reference import and private emitted asset before shipping', async () => {
    const root = await temp(), entry = join(root, 'entry.js')
    await fs.writeFile(entry, `import ${JSON.stringify(normalizePath(resolve('scripts/learning-official-tests/references/ch2-04/solution.js')))};`)
    const config = { configFile: false as const, root, logLevel: 'silent' as const, plugins: [exercisePackageRendererBoundary()],
      build: { write: false, lib: { entry, formats: ['es' as const] } } }
    await expect(build(config)).rejects.toThrow('PRIVATE_AUTHORING_IMPORT_FORBIDDEN')
    await fs.writeFile(entry, 'export const safe = true;')
    await expect(build({ ...config, plugins: [...config.plugins, { name: 'inject-private-asset', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'out/official-tests/leak.json', source: 'PRIVATE_SENTINEL' })
    } }] })).rejects.toThrow('PRIVATE_AUTHORING_ASSET_FORBIDDEN')
  }, 15_000)
})

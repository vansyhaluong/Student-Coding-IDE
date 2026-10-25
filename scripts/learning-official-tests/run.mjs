// Fixed developer CLI. Bundles only this tool with installed Vite, never product entries.
import { build } from 'vite'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { getHeapStatistics } from 'node:v8'
// Node24 adds young-generation space to the old-space cap (448 MiB on this host).
// This is a developer V8 heap ceiling, not a total RSS/OS Job quota.
if (getHeapStatistics().heap_size_limit > 512 * 1024 * 1024) throw new Error('Invoke with node --max-old-space-size=256')
const repo = process.cwd(), args = process.argv.slice(2)
if (args.length > 1 || (args.length && !/^--seed=\d{1,10}$/.test(args[0]))) throw new Error('OPTIONS')
const seed = args.length ? Number(args[0].slice(7)) : 20261024
if (!Number.isInteger(seed) || seed > 0xffffffff) throw new Error('SEED')
const controller = new AbortController()
const stop = () => controller.abort()
process.once('SIGINT', stop); process.once('SIGTERM', stop)
try {
  const bundled = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, target: 'node24',
    lib: { entry: resolve(repo, 'scripts/learning-official-tests/verify.ts'), formats: ['cjs'] },
    rollupOptions: { external: id => id.startsWith('node:') } } })
  const chunk = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output)
    .find(item => item.type === 'chunk' && item.isEntry)
  if (!chunk) throw new Error('TOOL_BUILD')
  // In-memory CommonJS evaluator is fixed tool code, never input-supplied code.
  const module = { exports: {} }
  new Function('require', 'module', 'exports', chunk.code)(createRequire(import.meta.url), module, module.exports)
  const report = await module.exports.campaign(repo, seed, controller.signal)
  const base = resolve(repo, 'out', 'official-tests')
  await mkdir(base, { recursive: true })
  const dir = await mkdtemp(join(base, 'e2-s2-'))
  const reportText = JSON.stringify(report, null, 2) + '\n'
  if (Buffer.byteLength(reportText) > 1024 * 1024) throw new Error('EVIDENCE_LIMIT')
  await writeFile(join(dir, 'report.json'), reportText, { flag: 'wx' })
  console.log(JSON.stringify({ status: report.status, exercises: report.results.length, evidence: dir }))
} catch {
  console.error('QUARANTINED: no candidate promotion or partial success'); process.exitCode = 1
} finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }

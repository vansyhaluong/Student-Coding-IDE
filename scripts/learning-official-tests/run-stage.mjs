// E2-S3 only: fresh ignored staging, never normal resources or compiled anchor.
import { build } from 'vite'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { getHeapStatistics } from 'node:v8'
if (getHeapStatistics().heap_size_limit > 512 * 1024 * 1024) throw new Error('Invoke with node --max-old-space-size=256')
const args = process.argv.slice(2), repo = process.cwd()
if (args.length > 1 || (args.length && !/^--seed=\d{1,10}$/.test(args[0]))) throw new Error('OPTIONS')
const seed = args.length ? Number(args[0].slice(7)) : 20261024
if (!Number.isInteger(seed) || seed > 0xffffffff) throw new Error('SEED')
const controller = new AbortController(), stop = () => controller.abort()
process.once('SIGINT', stop); process.once('SIGTERM', stop)
try {
  const bundled = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, target: 'node24',
    lib: { entry: resolve(repo, 'scripts/learning-official-tests/pilot-staging.ts'), formats: ['cjs'] }, rollupOptions: { external: id => id.startsWith('node:') } } })
  const chunk = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(x => x.output).find(x => x.type === 'chunk' && x.isEntry)
  if (!chunk) throw new Error('TOOL_BUILD')
  const module = { exports: {} }
  new Function('require', 'module', 'exports', chunk.code)(createRequire(import.meta.url), module, module.exports)
  const first = await module.exports.stagePilot(repo, seed, controller.signal)
  if (first.status !== 'PASS_WITH_LIMITATIONS') { console.log(JSON.stringify(first)); process.exitCode = 1 }
  else {
    const second = await module.exports.stagePilot(repo, seed, controller.signal)
    if (second.status !== 'PASS_WITH_LIMITATIONS') { console.log(JSON.stringify(second)); process.exitCode = 1 }
    else {
      const reproduction = await module.exports.compareStaging(first.rootPath, second.rootPath)
      const dir = await mkdtemp(resolve(repo, 'out/official-tests/e2-s3-evidence-'))
      const report = { status: 'PASS_WITH_LIMITATIONS', first: first.rootPath, second: second.rootPath, seed, reproduction }
      await writeFile(join(dir, 'reproducibility.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
      console.log(JSON.stringify({ ...report, reproduction: { ...reproduction, fileHashes: undefined }, evidence: dir }))
    }
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'QUARANTINED', code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'STAGING_FAILED' })); process.exitCode = 1
} finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }

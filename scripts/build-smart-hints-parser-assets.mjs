// Developer build only. Compile this app's trusted helper, never a student file/project.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, mkdir, readdir, rename, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'
import console from 'node:console'

const execute = promisify(execFile), require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? join(root, 'out/main/smart-hints-parser'))
const tsRoot = dirname(require.resolve('typescript/package.json'))
if (JSON.parse(await readFile(join(tsRoot, 'package.json'), 'utf8')).version !== '6.0.3') throw Error('Unsupported parser compiler version')
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
if (lock.packages?.['node_modules/typescript']?.version !== '6.0.3') throw Error('Parser lock mismatch')
await mkdir(output, { recursive: true })
await build({ entryPoints: [join(root, 'src/main/services/learning/smart-hints/parsers/javascript.ts')], bundle: true,
  platform: 'node', format: 'cjs', target: 'node24', outfile: join(output, 'selection-fix-js.cjs'),
  legalComments: 'eof', logLevel: 'silent', treeShaking: true })
await writeFile(join(output, 'TYPESCRIPT-LICENSE.txt'), await readFile(join(tsRoot, 'LICENSE.txt')))
await writeFile(join(output, 'TYPESCRIPT-NOTICE.txt'), await readFile(join(tsRoot, 'ThirdPartyNoticeText.txt')))
const files = ['selection-fix-js.cjs', 'TYPESCRIPT-LICENSE.txt', 'TYPESCRIPT-NOTICE.txt']
let csharp = null
if (process.platform === 'win32' && process.arch === 'x64') {
  const dotnetRoot = join(process.env.ProgramFiles ?? 'C:/Program Files', 'dotnet')
  const sdk = join(dotnetRoot, 'sdk/10.0.112/Roslyn/bincore'), refs = join(dotnetRoot, 'packs/Microsoft.NETCore.App.Ref/10.0.12/ref/net10.0')
  const dotnet = join(dotnetRoot, 'dotnet.exe')
  const response = join(output, `compile-${randomUUID()}.rsp`)
  const args = ['/nostdlib+', '/deterministic+', '/nullable:enable', '/langversion:14', '/target:exe',
    `/out:"${join(output, 'SelectionFixGuard.dll')}"`,
    ...(await readdir(refs)).filter(f => f.endsWith('.dll')).sort().map(f => `/r:"${join(refs, f)}"`),
    ...['Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll'].map(f => `/r:"${join(sdk, f)}"`),
    `"${join(root, 'src/main/services/learning/smart-hints/parsers/SelectionFixGuard.cs')}"`]
  try {
    await writeFile(response, args.join('\n'), { flag: 'wx' })
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
    await execute(dotnet, [join(sdk, 'csc.dll'), '/noconfig', `@${response}`], { cwd: output, env, windowsHide: true, timeout: 30000, maxBuffer: 32768 })
  } catch (error) {
    // Trusted developer compiler diagnostics, never student source or provider data.
    if (error.stdout) console.error(error.stdout)
    throw Error('Trusted parser helper build failed', { cause: error })
  } finally { await unlink(response).catch(() => {}) }
  await writeFile(join(output, 'SelectionFixGuard.runtimeconfig.json'), JSON.stringify({ runtimeOptions: {
    tfm: 'net10.0', framework: { name: 'Microsoft.NETCore.App', version: '10.0.12' }, rollForward: 'Disable' } }))
  files.push('SelectionFixGuard.dll', 'SelectionFixGuard.runtimeconfig.json')
  csharp = { sdk: '10.0.112', runtime: '10.0.12', roslyn: '5.0.0.0' }
}
const artifacts = {}
for (const file of files) {
  const data = await readFile(join(output, file))
  artifacts[file] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }
}
const manifest = { protocol: 1, typescript: '6.0.3', csharp, artifacts }
const temporary = join(output, `manifest-${randomUUID()}.tmp`)
await writeFile(temporary, JSON.stringify(manifest), { flag: 'wx' }); await rename(temporary, join(output, 'manifest.json'))
console.log(`Built private selection parsers: JS 6.0.3; C# ${csharp ? 'Roslyn 5.0.0.0 / SDK 10.0.112' : 'unavailable on this host'}.`)

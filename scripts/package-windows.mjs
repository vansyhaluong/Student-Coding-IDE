import process from 'node:process'
import console from 'node:console'
import { createRequire } from 'node:module'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, readdir, readFile, writeFile, cp, access, lstat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { build, Platform, Arch } from 'electron-builder'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const config = require('../electron-builder.config.cjs')
const { verifyCsharpPayload } = require('./csharp-ls-payload.cjs')
const secretName = /(?:^|[/\\])(?:\.env(?:\..*)?|smart-hints-settings\.json|app-state\.json|drafts\.json)|\.(?:pem|key|pfx|p12)$/i
async function auditTree(directory) {
  for (const entry of await readdir(directory)) {
    const file = join(directory, entry), stat = await lstat(file)
    if (stat.isSymbolicLink() || secretName.test(file)) throw Error('Forbidden link or private configuration in packaging inputs.')
    if (stat.isDirectory()) await auditTree(file)
    else if (/\.(?:js|cjs|json|html|css|txt)$/i.test(file)) {
      const text = await readFile(file, 'utf8')
      if (/AIza[\w-]{35}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw Error('Credential signature detected; packaging stopped.')
    }
  }
}
const installer = process.argv.includes('--nsis')
const packageOutputIndex = process.argv.indexOf('--package-output')
const packageOutput = packageOutputIndex < 0 ? join(root, 'release') : resolve(process.argv[packageOutputIndex + 1] ?? '')
if (packageOutputIndex >= 0) {
  const scopedOutput = relative(join(root, 'out'), packageOutput)
  if (installer || !scopedOutput || scopedOutput.startsWith('..') || isAbsolute(scopedOutput)) throw Error('Isolated packaging requires a new directory inside out/ and cannot create NSIS.')
  // mkdir without recursive refuses to overwrite any previous build/test output.
  await mkdir(packageOutput)
}
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Packaging requires Windows x64.')
if (require('electron-builder/package.json').version !== '26.18.0') throw Error('electron-builder 26.18.0 is required.')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
await mkdir(join(root, 'out'), { recursive: true })
// Unique build/staging roots preserve all earlier build/test artifacts.
const work = await mkdtemp(join(root, 'out/windows-packaging-'))
const reuseIndex = process.argv.indexOf('--from-build')
const output = reuseIndex < 0 ? join(work, 'production') : resolve(process.argv[reuseIndex + 1] ?? '')
const scoped = relative(join(root, 'out'), output)
if (!scoped || scoped.startsWith('..') || isAbsolute(scoped)) throw Error('Build output must be inside repository out/.')
const app = join(work, 'app')
const env = { ...process.env, STUDENT_IDE_BUILD_ROOT: output }
delete env.GEMINI_API_KEY
function run(script, args = [], overrides = {}) {
  execFileSync(process.execPath, [join(root, script), ...args], {
    cwd: root, env: { ...env, ...overrides }, stdio: 'inherit', windowsHide: true,
  })
}
run('scripts/apply-monaco-hover-lifetime-patch.mjs')
run('scripts/apply-node-pty-job-patch.mjs')
// Uses the repository's patched source, exact Electron headers and ABI load check.
if (reuseIndex < 0) {
  run('scripts/rebuild-node-pty-for-electron.mjs')
  run('node_modules/electron-vite/bin/electron-vite.js', ['build'])
}
// Reused builds still require the patched binary to load in this exact Electron.
execFileSync(join(root, 'node_modules/electron/dist/electron.exe'), ['-e',
  `if(require(${JSON.stringify(join(root, 'node_modules/node-pty'))}).supportsWindowsJobOwnership()!=='student-coding-ide-windows-job-v1')process.exit(2)`],
{ cwd: root, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true })
await mkdir(app, { recursive: true })
// Select production domains explicitly, including when reusing a retained build.
// Never stage the entire out/ tree or unrelated sibling test artifacts.
for (const domain of ['main', 'preload', 'renderer']) {
  await cp(join(output, domain), join(app, 'out', domain), { recursive: true,
    filter: source => !/\.(?:obj|lib|exp|pdb|map)$/i.test(source) })
}
const dependencies = {}
// All other dependencies are bundled by Vite (including the private TS parser).
for (const name of ['node-pty', 'vscode-jsonrpc', 'vscode-languageserver-protocol', 'vscode-languageserver-types']) {
  const source = join(root, 'node_modules', name)
  dependencies[name] = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version
  await cp(source, join(app, 'node_modules', name), { recursive: true,
    filter: sourcePath => {
      const relative = sourcePath.slice(source.length).replaceAll('\\', '/')
      if (!relative) return true
      if (/^\/(?:package\.json|licen[sc]e[^/]*|notice[^/]*)$/i.test(relative)) return true
      if (/^\/lib(?:\/|$)/.test(relative)) return !/(?:test|\.map$|\.ts$)/i.test(relative)
      return name === 'node-pty' && (/^\/build(?:\/Release(?:\/conpty)?)?$/.test(relative)
        || /^\/build\/Release\/(?:conpty\/)?[^/]+\.(?:node|exe|dll)$/.test(relative))
    } })
  if (name === 'node-pty') {
    // node-addon-api supplies C++ headers at build time only, not JS/runtime code.
    const metadata = JSON.parse(await readFile(join(app, 'node_modules', name, 'package.json'), 'utf8'))
    delete metadata.dependencies
    delete metadata.scripts
    await writeFile(join(app, 'node_modules', name, 'package.json'), JSON.stringify(metadata))
  }
}
await writeFile(join(app, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version,
  description: 'Student Coding IDE desktop application', author: pkg.author, license: pkg.license,
  main: 'out/main/index.js', dependencies }, null, 2))
// Provider deployment is intentionally app-owned, never copied from global PATH.
const provider = join(root, 'resources/csharp-ls')
let hasProvider = false
try { await access(join(provider, 'csharp-ls.exe')); hasProvider = true } catch { /* Explicit missing dependency below. */ }
const extraResources = [
  { from: join(output, 'main/resources/learning/exercises'), to: 'learning/exercises' },
  { from: join(output, 'main/smart-hints-parser'), to: 'smart-hints-parser' },
]
if (hasProvider) {
  verifyCsharpPayload(provider)
  const version = execFileSync(join(provider, 'csharp-ls.exe'), ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim()
  if (!/^csharp-ls,\s+0\.27\.0(?:\s|$)/.test(version)) throw Error('Unapproved csharp-ls version.')
  await cp(provider, join(app, 'csharp-ls'), { recursive: true })
  verifyCsharpPayload(join(app, 'csharp-ls'))
  extraResources.push({ from: join(app, 'csharp-ls'), to: 'csharp-ls', filter: ['**/*', '!**/.env*', '!**/*.{pem,key,pfx,p12}'] })
} else {
  console.warn('LIMITATION: csharp-ls 0.27.0 app-owned payload missing; C# IntelliSense unavailable. NSIS is blocked.')
  if (installer) throw Error('NSIS blocked by missing C# language server.')
}
// Check exact native assets and all parser manifest digests before packaging.
for (const file of ['native/run-process.node', 'native/learning/learning-job.node', 'native/smart-hints-key.node']) await access(join(output, 'main', file))
const parser = join(output, 'main/smart-hints-parser')
const manifest = JSON.parse(await readFile(join(parser, 'manifest.json'), 'utf8'))
const { createHash } = await import('node:crypto')
for (const [name, identity] of Object.entries(manifest.artifacts)) {
  const bytes = await readFile(join(parser, name))
  if (bytes.length !== identity.bytes || createHash('sha256').update(bytes).digest('hex') !== identity.sha256) throw Error('Parser asset integrity failed.')
}
const workers = (await readdir(join(output, 'renderer/assets'))).filter(name => /worker.*\.js$/i.test(name))
if (workers.length < 5) throw Error('Missing Monaco worker bundles.')
await auditTree(app)
for (const resource of extraResources) await auditTree(resource.from)
const installerArchive = join(work, 'installer-payload-x64.7z')
await build({ projectDir: root, targets: Platform.WINDOWS.createTarget(installer ? ['nsis'] : ['dir'], Arch.x64),
  ...(installer ? { effectiveOptionComputed: async ([defines]) => {
    // Preserve the exact APP_64 input before builder removes its temporary archive.
    if (!defines.APP_64) throw Error('NSIS x64 archive input is missing.')
    await cp(defines.APP_64, installerArchive)
    return false
  } } : {}),
  config: { ...config, directories: { app, output: packageOutput }, extraResources,
    electronDist: join(root, 'node_modules/electron/dist') }, publish: 'never' })
const entries = require('@electron/asar').listPackage(join(packageOutput, 'win-unpacked/resources/app.asar'))
if (hasProvider) verifyCsharpPayload(join(packageOutput, 'win-unpacked/resources/csharp-ls'))
if (entries.some(file => secretName.test(file) || /(?:^|[/\\])(?:tests?|spikes|prototypes)(?:[/\\]|$)|\.(?:map|pdb|obj|lib|exp|gypi|vcxproj)$/i.test(file))) throw Error('Unexpected development/private files in packaged ASAR.')
if (installer) {
  const setup = join(packageOutput, 'Student Coding IDE Setup.exe')
  const bytes = await readFile(setup), archive = await readFile(installerArchive)
  const offset = bytes.indexOf(archive.subarray(0, Math.min(65536, archive.length)))
  if (offset < 0 || !bytes.subarray(offset, offset + archive.length).equals(archive)) throw Error('Installer does not embed the inspected x64 payload verbatim.')
  const inspection = join(work, 'installer-contents')
  const { getPath7za } = require('app-builder-lib/out/toolsets/7zip.js')
  execFileSync(await getPath7za(), ['x', installerArchive, `-o${inspection}`, '-y'], { windowsHide: true, stdio: 'pipe' })
  verifyCsharpPayload(join(inspection, 'resources/csharp-ls'))
  await auditTree(inspection)
  const collect = async (directory, prefix = '') => {
    const files = {}
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name, path = join(directory, entry.name)
      if (entry.isDirectory()) Object.assign(files, await collect(path, name + '/'))
      else files[name] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
    return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  }
  const expected = await collect(join(packageOutput, 'win-unpacked')), actual = await collect(inspection)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Installer contents differ from the audited unpacked application.')
  const checksum = createHash('sha256').update(bytes).digest('hex')
  await writeFile(setup + '.sha256', `${checksum}  Student Coding IDE Setup.exe\n`)
  console.info(`Installer embedded archive/content audit PASS: ${Object.keys(actual).length} files; SHA256 ${checksum}`)
}
console.info(`ASAR scope/private-file audit PASS: ${entries.length} entries, ${workers.length} Monaco worker bundles.`)
console.info(`Packaged executable: ${join(packageOutput, 'win-unpacked/Student Coding IDE.exe')}`)
console.info(`Retained production/staging build: ${work}`)

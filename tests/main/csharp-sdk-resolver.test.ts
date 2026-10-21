import { mkdir, mkdtemp, readFile, readdir, realpath, lstat, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { release, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FilesystemCsharpSdkResolver, revalidateCsharpSdk, type CsharpSdkFileSystem } from '../../src/main/services/learning/runtime/csharp-sdk-resolver'
import type { CsharpSdkResolution } from '../../src/main/services/learning/runtime/csharp-execution-contracts'
import { serializeAppError } from '../../src/main/errors/app-error'

const windows = process.platform === 'win32' && process.arch === 'x64'
const references = ['System.Runtime', 'System.Console', 'System.Text.Json', 'System.Text.Encodings.Web', 'System.Memory',
  'System.Collections', 'System.Runtime.InteropServices', 'System.Runtime.Extensions', 'netstandard', 'mscorlib']
const context = () => ({ signal: new AbortController().signal, deadline: performance.now() + 10_000 })
const fs: CsharpSdkFileSystem = { lstat, readFile: file => readFile(file), readdir, realpath }
const invalid = { state: 'INVALID_CONFIGURATION', reason: 'INSTALLATION_INCOMPLETE' }
let root: string

// Synthetic PE/CLI metadata, not executable compiler/runtime binaries.
function binary(name?: string, deps: string[] = [], machine = name ? 0x14c : 0x8664, assemblyMajor = 10): Buffer {
  const b = Buffer.alloc(4096), optional = 0x98, optionalSize = machine === 0x8664 ? 240 : 224
  b.writeUInt16LE(0x5a4d); b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x4550, 0x80)
  b.writeUInt16LE(machine, 0x84); b.writeUInt16LE(1, 0x86); b.writeUInt16LE(optionalSize, 0x94); b.writeUInt16LE(2, 0x96)
  b.writeUInt16LE(machine === 0x8664 ? 0x20b : 0x10b, optional)
  const section = optional + optionalSize
  b.writeUInt32LE(0xe00, section + 8); b.writeUInt32LE(0x2000, section + 12)
  b.writeUInt32LE(0xe00, section + 16); b.writeUInt32LE(0x200, section + 20)
  if (!name) return b
  const directories = optional + (machine === 0x8664 ? 112 : 96)
  b.writeUInt32LE(0x2000, directories + 112); b.writeUInt32LE(72, directories + 116)
  b.writeUInt32LE(72, 0x200); b.writeUInt32LE(0x2080, 0x208); b.writeUInt32LE(1, 0x210)
  const metadata = 0x280, table = metadata + 64, tableSize = 32 + 22 + deps.length * 20, strings = (table + tableSize + 3) & ~3
  b.writeUInt32LE(0x424a5342, metadata); b.writeUInt32LE(12, metadata + 12)
  b.write('v4.0.30319', metadata + 16); b.writeUInt16LE(2, metadata + 30)
  b.writeUInt32LE(table - metadata, metadata + 32); b.writeUInt32LE(tableSize, metadata + 36); b.write('#~', metadata + 40)
  b.writeUInt32LE(strings - metadata, metadata + 44); b.write('#Strings', metadata + 52)
  b.writeBigUInt64LE((1n << 32n) | (1n << 35n), table + 8)
  b.writeUInt32LE(1, table + 24); b.writeUInt32LE(deps.length, table + 28)
  let next = 1
  const text = (s: string) => { const index = next; next += b.write(s, strings + next) + 1; return index }
  const assembly = table + 32
  b.writeUInt16LE(assemblyMajor, assembly + 4); b.writeUInt16LE(text(name), assembly + 18)
  deps.forEach((dependency, i) => { const entry = assembly + 22 + i * 20
    b.writeUInt16LE(assemblyMajor, entry); b.writeUInt16LE(text(dependency), entry + 14) })
  b.writeUInt32LE(next, metadata + 48); b.writeUInt32LE(strings + next - metadata, 0x20c)
  return b
}
async function put(path: string, value: string | Buffer | object) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
}
function manifest(names = references): string { return '<FileList TargetFrameworkIdentifier=".NETCoreApp" TargetFrameworkVersion="10.0" FrameworkName="Microsoft.NETCore.App">'
  + names.map(name => `<File Type="Managed" Path="ref/net10.0/${name}.dll" AssemblyName="${name}" AssemblyVersion="10.0.0.0" />`).join('') + '</FileList>' }
async function install(sdk = '10.0.100', runtime = '10.0.0', location = root) {
  await put(join(location, 'dotnet.exe'), binary())
  await put(join(location, 'sdk', sdk, '.version'), `commit\n${sdk}\nwin-x64\n`)
  const compiler = join(location, 'sdk', sdk, 'Roslyn', 'bincore')
  await put(join(compiler, 'csc.runtimeconfig.json'), { runtimeOptions: { tfm: 'net9.0', framework: { name: 'Microsoft.NETCore.App', version: runtime }, rollForward: 'Major' } })
  const assets = ['csc', 'Microsoft.CodeAnalysis', 'Microsoft.CodeAnalysis.CSharp']
  for (const asset of assets) await put(join(compiler, `${asset}.dll`), binary(asset, ['System.Runtime']))
  await put(join(compiler, 'csc.deps.json'), { runtimeTarget: { name: '.NETCoreApp,Version=v9.0' },
    targets: { '.NETCoreApp,Version=v9.0': Object.fromEntries(assets.map(asset => [`${asset}/1.0.0`, { runtime: { [`${asset}.dll`]: {} } }])) } })
  const runtimeDirectory = join(location, 'shared', 'Microsoft.NETCore.App', runtime)
  const runtimeAssets = [...references, 'System.Private.CoreLib']
  for (const name of runtimeAssets) await put(join(runtimeDirectory, `${name}.dll`), binary(name))
  for (const name of ['coreclr.dll', 'clrjit.dll', 'hostpolicy.dll']) await put(join(runtimeDirectory, name), binary())
  const target = '.NETCoreApp,Version=v10.0/win-x64'
  await put(join(runtimeDirectory, 'Microsoft.NETCore.App.deps.json'), { runtimeTarget: { name: target },
    targets: { [target]: { [`Microsoft.NETCore.App.Runtime.win-x64/${runtime}`]: { runtime: Object.fromEntries(runtimeAssets.map(a => [`${a}.dll`, {}])) } } } })
  await put(join(location, 'host', 'fxr', runtime, 'hostfxr.dll'), binary())
  const pack = join(location, 'packs', 'Microsoft.NETCore.App.Ref', runtime)
  for (const name of references) await put(join(pack, 'ref', 'net10.0', `${name}.dll`), binary(name, name === 'System.Runtime' ? [] : ['System.Runtime']))
  await put(join(pack, 'data', 'FrameworkList.xml'), manifest())
}
function resolver(options: ConstructorParameters<typeof FilesystemCsharpSdkResolver>[0] = {}) {
  return new FilesystemCsharpSdkResolver({ roots: [root], ...options })
}
const compilerPath = () => join(root, 'sdk', '10.0.100', 'Roslyn', 'bincore', 'csc.dll')
const packPath = () => join(root, 'packs', 'Microsoft.NETCore.App.Ref', '10.0.0')

describe.skipIf(!windows)('C# SDK controlled filesystem installations (synthetic PE metadata)', () => {
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'learning-sdk-')) })
  afterEach(async () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('learning-sdk-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  })
  it('selects a complete stable 10.x installation, independent of compiler tfm or component prerelease labels', async () => {
    await install()
    const selected = await resolver().resolve(context())
    expect(selected.state).toBe('AVAILABLE')
    if (selected.state === 'AVAILABLE') expect(selected.selection).toMatchObject({ sdkVersion: '10.0.100', runtimeVersion: '10.0.0',
      compilerPath: compilerPath(), targetFramework: 'net10.0', references: expect.arrayContaining([join(packPath(), 'ref', 'net10.0', 'System.Text.Json.dll')]) })
  })
  it('sorts SDK/pack/runtime versions numerically and chooses highest compatible valid SDK across roots', async () => {
    await install('10.0.99'); await install('10.0.100'); await install('10.0.900', '10.0.9'); await install('10.0.1000', '10.0.10')
    const other = join(root, 'other'); await install('10.0.1001', '10.0.11', other)
    const selected = await resolver({ roots: [root, other] }).resolve(context())
    expect(selected.state === 'AVAILABLE' && selected.selection.sdkVersion).toBe('10.0.1001')
    expect(selected.state === 'AVAILABLE' && selected.selection.runtimeVersion).toBe('10.0.11')
  })
  it('skips a broken newer stable installation within major 10, never chooses preview/another major', async () => {
    await install(); await install('10.0.101'); await rm(join(root, 'sdk', '10.0.101', 'Roslyn', 'bincore', 'csc.dll'))
    for (const v of ['10.0.999-preview.1', '11.0.100', '9.0.999', '010.0.200']) await mkdir(join(root, 'sdk', v))
    const selected = await resolver().resolve(context())
    expect(selected.state === 'AVAILABLE' && selected.selection.sdkVersion).toBe('10.0.100')
  })
  it('maps no SDK to MISSING and preview/other majors to SDK_INCOMPATIBLE', async () => {
    expect(await resolver().resolve(context())).toEqual({ state: 'MISSING', reason: 'SDK_NOT_FOUND' })
    await mkdir(join(root, 'sdk', 'unrelated-cache'), { recursive: true })
    expect(await resolver().resolve(context())).toEqual({ state: 'MISSING', reason: 'SDK_NOT_FOUND' })
    for (const v of ['9.0.100', '11.0.100', '10.0.100-preview.1']) await mkdir(join(root, 'sdk', v), { recursive: true })
    expect(await resolver().resolve(context())).toEqual({ state: 'INVALID_CONFIGURATION', reason: 'SDK_INCOMPATIBLE' })
  })
  it.each(['missing', 'text', 'truncated', 'renamed', 'wrong-sdk-record'])('rejects %s compiler/SDK, rather than trusting folder name', async fault => {
    await install()
    if (fault === 'missing') await rm(compilerPath())
    if (fault === 'text') await writeFile(compilerPath(), 'not a compiler')
    if (fault === 'truncated') await writeFile(compilerPath(), binary('csc').subarray(0, 500))
    if (fault === 'renamed') await writeFile(compilerPath(), binary('different'))
    if (fault === 'wrong-sdk-record') await writeFile(join(root, 'sdk', '10.0.100', '.version'), 'commit\n11.0.100\nwin-x64')
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it.each(['dotnet.exe', 'sdk/10.0.100/Roslyn/bincore/Microsoft.CodeAnalysis.dll',
    'packs/Microsoft.NETCore.App.Ref/10.0.0/ref/net10.0/System.Text.Json.dll',
    'shared/Microsoft.NETCore.App/10.0.0/System.Private.CoreLib.dll',
    'shared/Microsoft.NETCore.App/10.0.0/coreclr.dll', 'host/fxr/10.0.0/hostfxr.dll'])('rejects missing installation file %s', async file => {
    await install(); await rm(join(root, file)); expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it('rejects missing reference closure, manifest identity mismatch and unlisted reference DLLs', async () => {
    await install()
    await put(join(packPath(), 'ref/net10.0/System.Text.Json.dll'), binary('System.Text.Json', ['Missing.Transitive']))
    expect(await resolver().resolve(context())).toEqual(invalid)
    await put(join(packPath(), 'ref/net10.0/System.Text.Json.dll'), binary('System.Text.Json', ['System.Runtime'], 0x14c, 9))
    expect(await resolver().resolve(context())).toEqual(invalid)
    await install(); await put(join(packPath(), 'ref/net10.0/Unlisted.dll'), binary('Unlisted'))
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it('does not mistake optional compatibility-facade forwards for dependencies of the harness', async () => {
    await install()
    await put(join(packPath(), 'ref/net10.0/mscorlib.dll'), binary('mscorlib', ['Optional.NuGet.Package']))
    expect((await resolver().resolve(context())).state).toBe('AVAILABLE')
  })
  it('rejects manifest traversal/entities and compiler dependency path escape', async () => {
    await install(); const file = join(packPath(), 'data/FrameworkList.xml')
    await put(file, manifest().replace('ref/net10.0/System.Runtime.dll', '../../outside.dll'))
    expect(await resolver().resolve(context())).toEqual(invalid)
    await put(file, '<!DOCTYPE evil>' + manifest()); expect(await resolver().resolve(context())).toEqual(invalid)
    await put(file, manifest().replace('TargetFrameworkVersion="10.0"', 'TargetFrameworkVersion="9.0" TargetFrameworkVersion="10.0"'))
    expect(await resolver().resolve(context())).toEqual(invalid)
    await put(file, manifest())
    await put(join(root, 'sdk/10.0.100/Roslyn/bincore/csc.deps.json'), { runtimeTarget: { name: 'target' },
      targets: { target: { csc: { runtime: { '../../outside.dll': {} } } } } })
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it('ignores poisoned Project/global.json and rejects unresolved compiler assembly dependencies', async () => {
    await install(); await put(join(root, 'global.json'), { sdk: { version: '99.0.100' } })
    const reads: string[] = []
    const files = { ...fs, readFile: async (file: string) => { reads.push(basename(file)); return readFile(file) } }
    expect((await resolver({ files }).resolve(context())).state).toBe('AVAILABLE')
    expect(reads).not.toContain('global.json')
    await put(compilerPath(), binary('csc', ['Missing.Compiler.Dependency']))
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it.each(['host', 'sdk', 'runtime', 'mixed-x86-compiler'])('rejects %s architecture mismatch', async target => {
    await install()
    if (target === 'host') await put(join(root, 'dotnet.exe'), binary(undefined, [], 0x14c))
    if (target === 'sdk') await put(join(root, 'sdk/10.0.100/.version'), 'commit\n10.0.100\nwin-arm64')
    if (target === 'runtime') await put(join(root, 'shared/Microsoft.NETCore.App/10.0.0/coreclr.dll'), binary(undefined, [], 0x14c))
    if (target === 'mixed-x86-compiler') { const data = binary('csc'); data.writeUInt32LE(0, 0x210); await put(compilerPath(), data) }
    expect((await resolver().resolve(context())).state).toBe('INVALID_CONFIGURATION')
    expect(await resolver().resolve(context())).toEqual({ state: 'INVALID_CONFIGURATION', reason: 'ARCHITECTURE_MISMATCH' })
  })
  it.each(['relative', 'C:relative', '\\rooted', '\\\\?\\C:\\dotnet', 'C:\\SDK\\..\\escape', 'C:\\SDK:stream', 'C:\\SDK.'])('rejects unsafe Main candidate %s', async candidate => {
    expect(await resolver({ roots: [candidate] }).resolve(context())).toEqual(invalid)
  })
  it('rejects both inside-root and outside-root junctions without following them', async () => {
    await install(); const original = join(root, 'sdk', '10.0.100'), target = join(root, 'relocated')
    await rm(original, { recursive: true }); await mkdir(target)
    await symlink(target, original, 'junction')
    expect(await resolver().resolve(context())).toEqual(invalid)
    await rm(original); await symlink(tmpdir(), original, 'junction')
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it('supports spaces/Unicode and discovers only absolute Main environment candidates, with no global mutation', async () => {
    const location = join(root, 'SDK học tập có khoảng trắng'); await install('10.0.100', '10.0.0', location)
    const environment = { dotnet_root_x64: location, Path: '.;C:relative' }
    expect((await new FilesystemCsharpSdkResolver({ environment }).resolve(context())).state).toBe('AVAILABLE')
    expect(environment).toEqual({ dotnet_root_x64: location, Path: '.;C:relative' })
  })
  it.each(['EACCES', 'EPERM', 'EIO'])('reports %s as safe typed infrastructure error, not missing SDK', async code => {
    const files = { ...fs, lstat: async () => { throw Object.assign(new Error('secret C:\\private\\sdk'), { code }) } }
    let failure: unknown
    try { await resolver({ files }).resolve(context()) } catch (e) { failure = e }
    const safe = serializeAppError(failure)
    expect(safe.code).toBe(code === 'EIO' ? 'PROCESS_FAILED' : 'PERMISSION_DENIED')
    expect(safe.details).toEqual({ reason: 'INFRASTRUCTURE_FAILURE' })
    expect(JSON.stringify(safe)).not.toMatch(/secret|private|EACCES|EPERM|EIO/)
  })
  it('rejects cancelled/late filesystem results without starting a replacement task', async () => {
    await install(); const controller = new AbortController(); let tick = 0, calls = 0
    const files = { ...fs, readFile: async (file: string) => { calls++; const data = await readFile(file); tick = 11; return data } }
    await expect(resolver({ files, now: () => tick }).resolve({ signal: controller.signal, deadline: 10 })).rejects.toMatchObject({ details: { reason: 'PHASE_DEADLINE' } })
    expect(calls).toBe(1)
    controller.abort(new Error('private abort reason'))
    await expect(resolver({ files }).resolve({ signal: controller.signal, deadline: performance.now() + 1000 })).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' })
    expect(calls).toBe(1)
  })
  it('retains pending I/O until settlement and then rejects owner cancellation without leaking its reason', async () => {
    await install(); const controller = new AbortController()
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(r => { entered = r }), pending = new Promise<void>(r => { release = r })
    const files = { ...fs, readFile: async (file: string) => { entered(); await pending; return readFile(file) } }
    let settled = false
    const work = resolver({ files }).resolve({ signal: controller.signal, deadline: performance.now() + 10_000 })
      .then(() => { settled = true; return undefined }, error => { settled = true; return serializeAppError(error) })
    await started; controller.abort(new Error('private owner reason')); await Promise.resolve()
    expect(settled).toBe(false); release()
    const result = await work
    expect(result?.code).toBe('PROCESS_CANCELLED'); expect(JSON.stringify(result)).not.toContain('private')
  })
  it('rejects identity replacement or canonical escape during file validation', async () => {
    await install()
    const escaped = { ...fs, realpath: async (file: string) => file === compilerPath() ? join(root, 'outside.dll') : realpath(file) }
    expect(await resolver({ files: escaped }).resolve(context())).toEqual(invalid)
    const changed = { ...fs, readFile: async (file: string) => {
      const data = await readFile(file)
      if (file === compilerPath()) { await rename(file, file + '.old'); await writeFile(file, data) }
      return data
    } }
    expect(await resolver({ files: changed }).resolve(context())).toEqual(invalid)
  })
  it('selects highest numeric compatible runtime/reference pack and rejects incomplete closure', async () => {
    await install(); await install('10.0.100', '10.0.9'); await install('10.0.100', '10.0.10')
    await put(join(root, 'sdk/10.0.100/Roslyn/bincore/csc.runtimeconfig.json'), {
      runtimeOptions: { tfm: 'net9.0', framework: { name: 'Microsoft.NETCore.App', version: '10.0.0' } } })
    const result = await resolver().resolve(context())
    expect(result.state === 'AVAILABLE' && result.selection.runtimeVersion).toBe('10.0.10')
    expect(result.state === 'AVAILABLE' && result.selection.referenceDirectory).toBe(join(root, 'packs/Microsoft.NETCore.App.Ref/10.0.10/ref/net10.0'))
    for (const v of ['10.0.0', '10.0.9', '10.0.10']) await rm(join(root, 'shared/Microsoft.NETCore.App', v, 'System.Text.Json.dll'))
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it('rejects renamed runtime package versions and mixed runtime-major binaries', async () => {
    await install()
    const file = join(root, 'shared/Microsoft.NETCore.App/10.0.0/Microsoft.NETCore.App.deps.json')
    await put(file, (await readFile(file, 'utf8')).replace('win-x64/10.0.0', 'win-x64/10.0.1'))
    expect(await resolver().resolve(context())).toEqual(invalid)
    await install()
    await put(join(root, 'shared/Microsoft.NETCore.App/10.0.0/System.Private.CoreLib.dll'), binary('System.Private.CoreLib', [], 0x14c, 11))
    expect(await resolver().resolve(context())).toEqual(invalid)
  })
  it('keeps a detached frozen selection per operation; subsequent resolution discovers a newer SDK', async () => {
    await install(); const instance = resolver(), first = await instance.resolve(context())
    if (first.state !== 'AVAILABLE') throw Error('Expected controlled installation')
    expect(Object.isFrozen(first.selection)).toBe(true); expect(Object.isFrozen(first.selection.references)).toBe(true)
    await install('10.0.101'); const next = await instance.resolve(context())
    expect(first.selection.sdkVersion).toBe('10.0.100')
    expect(next.state === 'AVAILABLE' && next.selection.sdkVersion).toBe('10.0.101')
  })
  it('revalidates the operation selection without upgrading to a newer installed SDK', async () => {
    await install(); const first = await resolver().resolve(context())
    if (first.state !== 'AVAILABLE') throw Error('Expected controlled installation')
    await install('10.0.101')
    expect(await revalidateCsharpSdk(first.selection, context())).toBe(true)
    await writeFile(first.selection.compilerPath, 'corrupt')
    expect(await revalidateCsharpSdk(first.selection, context())).toBe(false)
  })
})

describe.skipIf(!windows || process.env.LEARNING_CSHARP_REAL_SDK !== '1')('Installed SDK read-only observation (not fixture or compilation)', () => {
  it('records filesystem-only installed SDK selection separately from synthetic fixtures', async () => {
    const directory = resolve('out', `learning-csharp-sdk-step2-${Date.now()}`); await mkdir(directory, { recursive: true })
    const start = performance.now(); let result: CsharpSdkResolution | undefined
    try {
      result = await new FilesystemCsharpSdkResolver().resolve(context())
      const observation = result.state === 'AVAILABLE' ? { sdkVersion: result.selection.sdkVersion, runtimeVersion: result.selection.runtimeVersion,
        referencePackVersion: basename(dirname(dirname(result.selection.referenceDirectory))), references: result.selection.references.length,
        compilerSha256: createHash('sha256').update(await readFile(result.selection.compilerPath)).digest('hex') } : result
      await writeFile(join(directory, 'evidence.json'), JSON.stringify({ result: result.state === 'AVAILABLE' ? 'PASS' : 'NOT_OBSERVED',
        classification: 'REAL_INSTALLED_FILESYSTEM_ONLY', observation, elapsedMs: performance.now() - start, processExecuted: false,
        environment: { windows: release(), arch: process.arch, node: process.version },
        sourceSha256: createHash('sha256').update(await readFile('src/main/services/learning/runtime/csharp-sdk-resolver.ts')).digest('hex') }, null, 2))
      expect(result.state).toBe('AVAILABLE')
    } catch (error) {
      await writeFile(join(directory, 'failure.json'), JSON.stringify({ result: 'FAIL', error: serializeAppError(error), selectionState: result?.state }, null, 2))
      throw error
    }
  }, 15_000)
})

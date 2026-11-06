import { lstat, open, readdir, realpath } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { win32 as path } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DomainError } from '../../../errors/app-error'
import type { CsharpPreparationContext, CsharpSdkResolution, CsharpSdkResolver, CsharpSdkSelection } from './csharp-execution-contracts'

// Main-only injection ports for deterministic filesystem/fault tests, never IPC.
export interface CsharpSdkFileSystem {
  lstat(file: string): Promise<Stats>
  realpath(file: string): Promise<string>
  readdir(file: string): Promise<string[]>
  readFile(file: string, expected: Stats): Promise<Buffer>
}
const maximumFileBytes = 64 * 1024 ** 2
const disk: CsharpSdkFileSystem = { lstat, realpath, readdir,
  async readFile(file, expected) {
    const handle = await open(file, 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile() || !sameFile(expected, info) || info.size <= 0 || info.size > maximumFileBytes) throw new InvalidInstallation()
      const data = Buffer.alloc(info.size)
      let offset = 0
      while (offset < data.length) {
        const read = await handle.read(data, offset, data.length - offset, offset)
        if (!read.bytesRead) throw new InvalidInstallation()
        offset += read.bytesRead
      }
      const after = await handle.stat()
      if (!sameFile(info, after)) throw new InvalidInstallation()
      return data
    } finally { await handle.close() }
  },
}

// Main-only reuse of identical bounded/identity-checked I/O by narrower consumers.
// Exporting this port does not change Learning's discovery or selection policy.
export { disk as csharpSdkDiskAccess }
type InvalidReason = 'INSTALLATION_INCOMPLETE' | 'ARCHITECTURE_MISMATCH'
class InvalidInstallation extends Error { constructor(readonly reason: InvalidReason = 'INSTALLATION_INCOMPLETE') { super('Invalid Learning SDK installation.') } }
type Version = readonly number[]
function version(text: string): Version | undefined {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text)) return
  const numbers = text.split('.').map(Number)
  if (numbers.every(Number.isSafeInteger)) return numbers
}
const compare = (a: Version, b: Version): number => { for (let i = 0; i < Math.max(a.length, b.length); i++) {
  const delta = (a[i] ?? 0) - (b[i] ?? 0); if (delta) return delta
} return 0 }
const sameFile = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs
  && a.size === b.size && a.mtimeMs === b.mtimeMs
const identity = (file: string): string => path.normalize(file).toLowerCase().replace(/\\$/, '')
function absolute(file: string): boolean {
  return typeof file === 'string' && (/^[A-Za-z]:[\\/]/.test(file) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(file))
    && !/^(?:\\\\[?.]\\)/.test(file) && !/[\0<>"|?*]/.test(file)
    && !file.replace(/^[A-Za-z]:/, '').includes(':')
    && !file.split(/[\\/]/).some(p => p === '.' || p === '..' || /[. ]$/.test(p)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))
}
function contained(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..\\')
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InvalidInstallation()
  return v as Record<string, unknown>
}
// Harness API roots; compatibility facades can forward unrelated optional NuGet
// APIs and are not an offline dependency of the typed Solution/Console/JSON harness.
const requiredReferences = ['System.Runtime', 'System.Console', 'System.Text.Json', 'System.Collections']
function attributes(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  const pattern = /(\w+)="([^"]*)"/g
  if (text.replace(pattern, '').trim()) throw new InvalidInstallation()
  for (const match of text.matchAll(pattern)) {
    if (Object.hasOwn(result, match[1])) throw new InvalidInstallation()
    result[match[1]] = match[2]
  }
  return result
}

/** Narrow ECMA-335 Assembly/AssemblyRef reader, used only for installed PE integrity/closure. */
function pe(data: Buffer, managed: boolean): { name: string; version: Version; references: { name: string; version: Version }[] } | undefined {
  try {
  const bad = () => { throw new InvalidInstallation() }
  const range = (offset: number, length: number) => { if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > data.length) bad() }
  const u16 = (o: number) => { range(o, 2); return data.readUInt16LE(o) }
  const u32 = (o: number) => { range(o, 4); return data.readUInt32LE(o) }
  if (u16(0) !== 0x5a4d) bad()
  const header = u32(0x3c)
  if (u32(header) !== 0x4550 || !(u16(header + 22) & 2)) bad()
  const machine = u16(header + 4), sections = u16(header + 6), size = u16(header + 20), optional = header + 24
  if (!sections || sections > 96 || size < 96) bad()
  const magic = u16(optional), directories = magic === 0x20b ? optional + 112 : optional + 96
  if (magic !== 0x10b && magic !== 0x20b) bad()
  if (!managed) {
    if (machine !== 0x8664 || magic !== 0x20b) throw new InvalidInstallation('ARCHITECTURE_MISMATCH')
    range(optional, size + sections * 40); return
  }
  if (machine !== 0x14c && machine !== 0x8664) throw new InvalidInstallation('ARCHITECTURE_MISMATCH')
  if (size < directories - optional + 15 * 8) bad()
  const rva = (address: number, length: number): number => {
    for (let i = 0; i < sections; i++) {
      const section = optional + size + i * 40
      const virtual = u32(section + 12), rawSize = u32(section + 16), raw = u32(section + 20)
      if (address >= virtual && address - virtual + length <= rawSize) { const o = raw + address - virtual; range(o, length); return o }
    }
    return bad() as never
  }
  const cli = rva(u32(directories + 14 * 8), 72)
  if (u32(cli) < 72) bad()
  const corFlags = u32(cli + 16)
  if (corFlags & 2 || machine === 0x14c && !(corFlags & 1)) throw new InvalidInstallation('ARCHITECTURE_MISMATCH')
  const metadataSize = u32(cli + 12), metadata = rva(u32(cli + 8), metadataSize)
  if (metadataSize < 24 || u32(metadata) !== 0x424a5342) bad()
  let cursor = metadata + 16 + Math.ceil(u32(metadata + 12) / 4) * 4
  const streams = u16(cursor + 2); cursor += 4
  if (!streams || streams > 16) bad()
  const heaps = new Map<string, { offset: number; size: number }>()
  for (let i = 0; i < streams; i++) {
    const offset = u32(cursor), length = u32(cursor + 4), end = data.indexOf(0, cursor + 8)
    if (end < cursor + 8 || end > cursor + 40 || offset + length > metadataSize) bad()
    const name = data.toString('ascii', cursor + 8, end)
    if (heaps.has(name)) bad()
    heaps.set(name, { offset: metadata + offset, size: length }); cursor += 8 + Math.ceil((end - cursor - 8 + 1) / 4) * 4
  }
  const strings = heaps.get('#Strings'), table = heaps.get('#~') ?? heaps.get('#-')
  if (!strings || !table || table.size < 24) return bad() as never
  range(table.offset, table.size)
  const rows = Array<number>(64).fill(0), valid = data.readBigUInt64LE(table.offset + 8)
  cursor = table.offset + 24
  for (let i = 0; i < 64; i++) if (valid & 1n << BigInt(i)) { rows[i] = u32(cursor); cursor += 4 }
  if (rows[32] !== 1) bad()
  const flags = data[table.offset + 6], str = flags & 1 ? 4 : 2, guid = flags & 2 ? 4 : 2, blob = flags & 4 ? 4 : 2
  const idx = (id: number) => rows[id] >= 65536 ? 4 : 2
  const coded = (bits: number, ids: number[]) => ids.some(id => rows[id] >= 2 ** (16 - bits)) ? 4 : 2
  const td = coded(2, [2, 1, 27]), method = coded(1, [6, 10])
  const sizes = [2 + str + 3 * guid, coded(2, [0, 26, 35, 1]) + 2 * str,
    4 + 2 * str + td + idx(4) + idx(6), idx(4), 2 + str + blob, idx(6), 8 + str + blob + idx(8), idx(8), 4 + str,
    idx(2) + td, coded(3, [2, 1, 26, 6, 27]) + str + blob, 2 + coded(2, [4, 8, 23]) + blob,
    coded(5, [6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42, 44, 43]) + coded(3, [6, 10]) + blob,
    coded(1, [4, 8]) + blob, 2 + coded(2, [2, 6, 32]) + blob, 6 + idx(2), 4 + idx(4), blob,
    idx(2) + idx(20), idx(20), 2 + str + td, idx(2) + idx(23), idx(23), 2 + str + blob,
    2 + idx(6) + coded(1, [20, 23]), idx(2) + 2 * method, str, blob, 2 + coded(1, [4, 6]) + str + idx(26),
    4 + idx(4), 8, 4, 16 + blob + 2 * str, 4, 12, 12 + 2 * blob + 2 * str]
  const readIndex = (offset: number, width: number) => width === 2 ? u16(offset) : u32(offset)
  const name = (offset: number): string => {
    const index = readIndex(offset, str), start = strings.offset + index, end = data.indexOf(0, start)
    if (!index || index >= strings.size || end < start || end >= strings.offset + strings.size) return bad() as never
    const text = data.toString('utf8', start, end)
    if (!/^[A-Za-z0-9_.-]+$/.test(text)) bad()
    return text
  }
  for (let i = 0; i < 32; i++) cursor += rows[i] * sizes[i]
  const readVersion = (o: number) => [u16(o), u16(o + 2), u16(o + 4), u16(o + 6)]
  const result = { name: name(cursor + 16 + blob), version: readVersion(cursor + 4), references: [] as { name: string; version: Version }[] }
  cursor += sizes[32] + rows[33] * sizes[33] + rows[34] * sizes[34]
  if (cursor + rows[35] * sizes[35] > table.offset + table.size) bad()
  for (let i = 0; i < rows[35]; i++, cursor += sizes[35]) result.references.push({ name: name(cursor + 12 + blob), version: readVersion(cursor) })
  return result
  } catch (error) {
    if (error instanceof RangeError) throw new InvalidInstallation()
    throw error
  }
}

export interface CsharpSdkResolverOptions {
  /** Main configuration/test fixture only. Not a public configured SDK path feature. */
  roots?: readonly string[]
  environment?: NodeJS.ProcessEnv
  files?: CsharpSdkFileSystem
  now?: () => number
}
/** Revalidate the operation's EXACT selection, without selecting a newly installed patch. */
export async function revalidateCsharpSdk(selection: CsharpSdkSelection, context: CsharpPreparationContext): Promise<boolean> {
  const root = path.dirname(selection.dotnetPath)
  const pack = path.basename(path.dirname(path.dirname(selection.referenceDirectory)))
  const filters = new Map([
    [identity(path.join(root, 'sdk')), selection.sdkVersion],
    [identity(path.join(root, 'shared', 'Microsoft.NETCore.App')), selection.runtimeVersion],
    [identity(path.join(root, 'packs', 'Microsoft.NETCore.App.Ref')), pack],
  ])
  const result = await new FilesystemCsharpSdkResolver({ roots: [root], files: { ...disk,
    readdir: async file => {
      const entries = await disk.readdir(file), selected = filters.get(identity(file))
      return selected === undefined ? entries : entries.filter(entry => entry === selected)
    },
  } }).resolve(context)
  return result.state === 'AVAILABLE' && JSON.stringify(result.selection) === JSON.stringify(selection)
}
export class FilesystemCsharpSdkResolver implements CsharpSdkResolver {
  constructor(private readonly options: CsharpSdkResolverOptions = {}) {}
  async resolve(context: CsharpPreparationContext): Promise<CsharpSdkResolution> {
    const files = this.options.files ?? disk, now = this.options.now ?? (() => performance.now())
    const check = () => {
      if (context.signal.aborted) throw new DomainError({ code: 'PROCESS_CANCELLED', operation: 'exercise:sdk',
        message: 'Learning SDK discovery was cancelled.', details: { reason: 'CANCELLED' }, retryable: false })
      if (!Number.isFinite(context.deadline) || now() >= context.deadline) throw new DomainError({ code: 'PROCESS_FAILED', operation: 'exercise:sdk',
        message: 'Learning SDK discovery exceeded its deadline.', details: { reason: 'PHASE_DEADLINE' }, retryable: false })
    }
    const io = async <T>(work: () => Promise<T>): Promise<T> => { check(); const result = await work(); check(); return result }
    const safe = async (root: string, file: string, kind: 'file' | 'directory'): Promise<Stats> => {
      if (!absolute(file) || !contained(root, file)) throw new InvalidInstallation()
      const parents: string[] = []
      for (let p = path.dirname(file); ; p = path.dirname(p)) { parents.push(p); if (path.dirname(p) === p) break }
      for (const parent of parents.reverse()) {
        const info = await io(() => files.lstat(parent))
        if (!info.isDirectory() || info.isSymbolicLink() || identity(await io(() => files.realpath(parent))) !== identity(parent)) throw new InvalidInstallation()
      }
      const info = await io(() => files.lstat(file))
      if (info.isSymbolicLink() || (kind === 'file' ? !info.isFile() : !info.isDirectory())
        || identity(await io(() => files.realpath(file))) !== identity(file)) throw new InvalidInstallation()
      return info
    }
    const read = async (root: string, file: string): Promise<Buffer> => {
      const before = await safe(root, file, 'file')
      if (before.size <= 0 || before.size > maximumFileBytes) throw new InvalidInstallation()
      const data = await io(() => files.readFile(file, before))
      if (data.length !== before.size || !sameFile(before, await safe(root, file, 'file'))) throw new InvalidInstallation()
      return data
    }
    const json = async (root: string, file: string): Promise<Record<string, unknown>> => {
      const data = await read(root, file)
      if (data.length > 1024 ** 2) throw new InvalidInstallation()
      try { return object(JSON.parse(data.toString('utf8'))) } catch { throw new InvalidInstallation() }
    }
    const list = async (root: string, file: string, optional = false): Promise<string[]> => {
      try { await safe(root, file, 'directory'); return await io(() => files.readdir(file)) }
      catch (e) { if (optional && (e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
    }
    const versions = async (root: string, file: string): Promise<string[]> => (await list(root, file, true))
      .filter(v => version(v)?.[0] === 10).sort((a, b) => compare(version(b)!, version(a)!))
    const environment = this.options.environment ?? process.env
    const env = (key: string) => Object.entries(environment).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]
    const roots = this.options.roots ?? [env('DOTNET_ROOT_X64'), env('DOTNET_ROOT'),
      ...(env('ProgramFiles') ? [path.join(env('ProgramFiles')!, 'dotnet')] : []),
      ...(env('PATH') ?? '').split(';').map(p => p.trim().replace(/^"(.*)"$/, '$1')).filter(absolute)]
      .filter((p): p is string => !!p)
    let invalid: InvalidReason | 'SDK_INCOMPATIBLE' | undefined
    const candidates: { root: string; sdk: string }[] = []
    try {
      check()
      if (process.platform !== 'win32' || process.arch !== 'x64') return { state: 'INVALID_CONFIGURATION', reason: 'ARCHITECTURE_MISMATCH' }
      for (const root of [...new Set(roots.map(p => absolute(p) ? path.normalize(p) : p))]) {
        if (!absolute(root)) { invalid ??= 'INSTALLATION_INCOMPLETE'; continue }
        try {
          const entries = await list(root, path.join(root, 'sdk'), true)
          if (entries.some(entry => /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(entry))) invalid ??= 'SDK_INCOMPATIBLE'
          for (const sdk of entries) if (version(sdk)?.[0] === 10) candidates.push({ root, sdk })
        } catch (error) { if (!(error instanceof InvalidInstallation)) throw error; invalid = error.reason }
      }
      candidates.sort((a, b) => compare(version(b.sdk)!, version(a.sdk)!) || identity(a.root).localeCompare(identity(b.root)))
      for (const { root, sdk } of candidates) {
        try {
          const dotnetPath = path.join(root, 'dotnet.exe'), sdkDirectory = path.join(root, 'sdk', sdk), compilerDirectory = path.join(sdkDirectory, 'Roslyn', 'bincore')
          pe(await read(root, dotnetPath), false)
          const sdkInfo = (await read(root, path.join(sdkDirectory, '.version'))).toString('utf8').trim().split(/\r?\n/)
          if (sdkInfo[1] !== sdk) throw new InvalidInstallation()
          if (sdkInfo[2] !== 'win-x64') throw new InvalidInstallation('ARCHITECTURE_MISMATCH')
          const config = object((await json(root, path.join(compilerDirectory, 'csc.runtimeconfig.json'))).runtimeOptions)
          const framework = object(config.framework), minimum = typeof framework.version === 'string' ? version(framework.version) : undefined
          if (framework.name !== 'Microsoft.NETCore.App' || !minimum || minimum[0] !== 10) throw new InvalidInstallation()
          const runtimeBase = path.join(root, 'shared', 'Microsoft.NETCore.App')
          const runtimeVersions = (await versions(root, runtimeBase)).filter(v => compare(version(v)!, minimum) >= 0)
          let componentFailure: InvalidReason = 'INSTALLATION_INCOMPLETE'
          let runtimeVersion: string | undefined, runtimeDirectory = '', runtimeAssemblies = new Map<string, NonNullable<ReturnType<typeof pe>>>()
          for (const runtime of runtimeVersions) {
            try {
              const directory = path.join(runtimeBase, runtime), deps = await json(root, path.join(directory, 'Microsoft.NETCore.App.deps.json'))
              const target = object(deps.runtimeTarget).name
              if (typeof target !== 'string' || !/^\.NETCoreApp,Version=v10\.\d+\/win-x64$/.test(target)) throw new InvalidInstallation('ARCHITECTURE_MISMATCH')
              const nodes = object(object(deps.targets)[target]), assemblies = new Map<string, NonNullable<ReturnType<typeof pe>>>()
              if (!Object.hasOwn(nodes, `Microsoft.NETCore.App.Runtime.win-x64/${runtime}`)) throw new InvalidInstallation()
              for (const node of Object.values(nodes)) for (const [asset, description] of Object.entries(object(object(node).runtime))) {
                if (!/^[A-Za-z0-9_.-]+\.dll$/.test(asset)) throw new InvalidInstallation()
                const assembly = pe(await read(root, path.join(directory, asset)), true)!
                if (assembly.name.toLowerCase() !== asset.slice(0, -4).toLowerCase()) throw new InvalidInstallation()
                const declared = object(description).assemblyVersion
                if (declared !== undefined && (typeof declared !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(declared)
                  || compare(assembly.version, declared.split('.').map(Number)) !== 0)) throw new InvalidInstallation()
                assemblies.set(assembly.name, assembly)
              }
              for (const name of ['coreclr.dll', 'clrjit.dll', 'hostpolicy.dll']) pe(await read(root, path.join(directory, name)), false)
              if (assemblies.get('System.Private.CoreLib')?.version[0] !== 10 || assemblies.get('System.Runtime')?.version[0] !== 10
                || !assemblies.has('System.Text.Json')) throw new InvalidInstallation()
              runtimeVersion = runtime; runtimeDirectory = directory; runtimeAssemblies = assemblies; break
            } catch (e) {
              if (e instanceof InvalidInstallation) { componentFailure = e.reason; continue }
              if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
              throw e
            }
          }
          if (!runtimeVersion) throw new InvalidInstallation(componentFailure)
          const fxrVersions = (await versions(root, path.join(root, 'host', 'fxr'))).filter(v => compare(version(v)!, version(runtimeVersion)!) >= 0)
          let hostReady = false
          for (const fxr of fxrVersions) {
            try { pe(await read(root, path.join(root, 'host', 'fxr', fxr, 'hostfxr.dll')), false); hostReady = true; break }
            catch (e) {
              if (e instanceof InvalidInstallation) componentFailure = e.reason
              else if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
            }
          }
          if (!hostReady) throw new InvalidInstallation(componentFailure)
          const compilerPath = path.join(compilerDirectory, 'csc.dll'), compilerDeps = await json(root, path.join(compilerDirectory, 'csc.deps.json'))
          const compilerTarget = object(compilerDeps.runtimeTarget).name
          if (typeof compilerTarget !== 'string') throw new InvalidInstallation()
          const local = new Map<string, NonNullable<ReturnType<typeof pe>>>()
          for (const node of Object.values(object(object(compilerDeps.targets)[compilerTarget]))) {
            for (const asset of Object.keys(object(object(node).runtime))) {
              if (!/^[A-Za-z0-9_.-]+\.dll$/.test(asset)) throw new InvalidInstallation()
              const assembly = pe(await read(root, path.join(compilerDirectory, asset)), true)!
              if (assembly.name.toLowerCase() !== asset.slice(0, -4).toLowerCase()) throw new InvalidInstallation()
              local.set(assembly.name, assembly)
            }
          }
          if (!local.has('csc') || !local.has('Microsoft.CodeAnalysis') || !local.has('Microsoft.CodeAnalysis.CSharp')) throw new InvalidInstallation()
          for (const assembly of local.values()) for (const ref of assembly.references) {
            const found = local.get(ref.name) ?? runtimeAssemblies.get(ref.name)
            if (!found || compare(found.version, ref.version) < 0) throw new InvalidInstallation()
          }
          const packBase = path.join(root, 'packs', 'Microsoft.NETCore.App.Ref')
          for (const pack of await versions(root, packBase)) {
            if (compare(version(pack)!, version(runtimeVersion)!) > 0) continue
            try {
              const packDirectory = path.join(packBase, pack), referenceDirectory = path.join(packDirectory, 'ref', 'net10.0')
              const manifest = (await read(root, path.join(packDirectory, 'data', 'FrameworkList.xml'))).toString('utf8')
              if (manifest.length > 1024 ** 2 || /<!|&/.test(manifest)) throw new InvalidInstallation()
              const xml = /^\s*<FileList\s+([^>]+)>([\s\S]*)<\/FileList>\s*$/.exec(manifest)
              if (!xml) throw new InvalidInstallation()
              const header = attributes(xml[1]), tags = /<File\s+([^>]*)\/>/g
              if (header.TargetFrameworkIdentifier !== '.NETCoreApp' || header.TargetFrameworkVersion !== '10.0'
                || header.FrameworkName !== 'Microsoft.NETCore.App' || xml[2].replace(tags, '').trim()) throw new InvalidInstallation()
              const references: string[] = [], assemblies = new Map<string, NonNullable<ReturnType<typeof pe>>>()
              for (const tag of xml[2].matchAll(tags)) {
                const item = attributes(tag[1])
                if (item.Type !== 'Managed') continue
                if (!/^ref\/net10\.0\/[A-Za-z0-9_.-]+\.dll$/.test(item.Path ?? '')) throw new InvalidInstallation()
                const file = path.join(packDirectory, item.Path), assembly = pe(await read(root, file), true)!
                if (assembly.name !== item.AssemblyName || !/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(item.AssemblyVersion ?? '')
                  || compare(assembly.version, item.AssemblyVersion.split('.').map(Number)) !== 0 || assemblies.has(assembly.name)) throw new InvalidInstallation()
                references.push(file); assemblies.set(assembly.name, assembly)
              }
              if (requiredReferences.some(name => !assemblies.has(name))) throw new InvalidInstallation()
              const checked = new Set<string>(), pending = [...requiredReferences]
              while (pending.length) {
                const name = pending.pop()!
                if (checked.has(name)) continue
                checked.add(name)
                const assembly = assemblies.get(name)
                if (!assembly) throw new InvalidInstallation()
                for (const ref of assembly.references) {
                  const found = assemblies.get(ref.name)
                  if (!found || compare(found.version, ref.version) !== 0) throw new InvalidInstallation()
                  pending.push(ref.name)
                }
              }
              const referenceFiles = (await list(root, referenceDirectory)).filter(f => /\.dll$/i.test(f))
              if (referenceFiles.length !== references.length) throw new InvalidInstallation()
              check()
              const selection: CsharpSdkSelection = Object.freeze({ sdkVersion: sdk, runtimeVersion, dotnetPath, sdkDirectory,
                compilerPath, referenceDirectory, references: Object.freeze(references.sort()), runtimeDirectory, targetFramework: 'net10.0' })
              return { state: 'AVAILABLE', selection }
            } catch (e) { if (!(e instanceof InvalidInstallation) && (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          }
          throw new InvalidInstallation()
        } catch (error) {
          if (error instanceof InvalidInstallation) { invalid = error.reason; continue }
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') { invalid = 'INSTALLATION_INCOMPLETE'; continue }
          throw error
        }
      }
      check()
      return invalid ? { state: 'INVALID_CONFIGURATION', reason: invalid } : { state: 'MISSING', reason: 'SDK_NOT_FOUND' }
    } catch (error) {
      if (error instanceof DomainError) throw error
      const denied = ['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')
      throw new DomainError({ code: denied ? 'PERMISSION_DENIED' : 'PROCESS_FAILED', operation: 'exercise:sdk',
        message: denied ? 'Learning SDK files could not be accessed.' : 'Learning SDK discovery could not complete safely.',
        details: { reason: 'INFRASTRUCTURE_FAILURE' }, retryable: true })
    }
  }
}

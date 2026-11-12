import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const { verifyCsharpPayload } = require('../../scripts/csharp-ls-payload.cjs')
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true }) })
async function deployment(launcher?: string) {
  const root = await mkdtemp(join(tmpdir(), 'csharp-payload-test-')); roots.push(root)
  const base = '.store/csharp-ls/0.27.0/csharp-ls/0.27.0/tools/net10.0/any/'
  const files: Record<string, string> = {}
  const assets = { 'csharp-ls.exe': launcher ?? (base + 'CSharpLanguageServer.dll').replaceAll('/', '\\'),
    'licenses/csharp-ls-LICENSE.txt': 'license fixture', 'licenses/THIRD-PARTY.json': '[]',
    ...Object.fromEntries(['CSharpLanguageServer.dll', 'CSharpLanguageServer.deps.json', 'CSharpLanguageServer.runtimeconfig.json',
      'Microsoft.CodeAnalysis.CSharp.dll', 'Microsoft.Build.Locator.dll',
      'BuildHost-netcore/Microsoft.CodeAnalysis.Workspaces.MSBuild.BuildHost.dll'].map(name => [base + name, 'fixture'])) }
  for (const [name, text] of Object.entries(assets)) {
    const path = join(root, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, text)
    files[name] = createHash('sha256').update(text).digest('hex')
  }
  const manifest = { version: '0.27.0', packageSha256: 'a49a34d4664e4fba4781cb50d537efad1771393828370e32ece3fe75e2bcedaf',
    source: 'https://api.nuget.org/v3-flatcontainer/csharp-ls/0.27.0/csharp-ls.0.27.0.nupkg', files }
  await writeFile(join(root, 'deployment.json'), JSON.stringify(manifest))
  return { root, manifest }
}
describe('C# packaging deployment integrity gate', () => {
  it('accepts a complete relative launcher deployment from an arbitrary root', async () => {
    const { root } = await deployment(); expect(verifyCsharpPayload(root).version).toBe('0.27.0')
    const config = require('../../electron-builder.config.cjs')
    expect(() => config.beforePack({ targets: [{ name: 'nsis' }], packager: { info: { appDir: root } } })).toThrow(/NSIS blocked/)
  })
  it('blocks changed runtime bytes and unlisted private files', async () => {
    const { root } = await deployment()
    await writeFile(join(root, 'unexpected-token.txt'), 'fixture')
    expect(() => verifyCsharpPayload(root)).toThrow(/digest mismatch/)
    await unlink(join(root, 'unexpected-token.txt'))
    await writeFile(join(root, 'csharp-ls.exe'), 'altered')
    expect(() => verifyCsharpPayload(root)).toThrow(/digest mismatch/)
  })
  it('blocks missing dependencies even with an otherwise valid manifest', async () => {
    const { root } = await deployment(); await unlink(join(root, 'licenses/THIRD-PARTY.json'))
    expect(() => verifyCsharpPayload(root)).toThrow(/Incomplete/)
  })
  it('blocks an absolute launcher even when its digest matches', async () => {
    const { root } = await deployment('C:\\developer\\.dotnet\\tools\\server.dll')
    expect(() => verifyCsharpPayload(root)).toThrow(/relative deployment path/)
  })
  it('blocks a version or package identity change', async () => {
    const { root, manifest } = await deployment()
    await writeFile(join(root, 'deployment.json'), JSON.stringify({ ...manifest, version: '0.28.0' }))
    expect(() => verifyCsharpPayload(root)).toThrow(/Unapproved/)
  })
})

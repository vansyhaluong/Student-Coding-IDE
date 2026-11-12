// Build-time verifier only; Main retains its existing semantic provider boundary.
const { readFileSync, readdirSync, lstatSync } = require('node:fs')
const { join } = require('node:path')
const { createHash } = require('node:crypto')
const PACKAGE_SHA256 = 'a49a34d4664e4fba4781cb50d537efad1771393828370e32ece3fe75e2bcedaf'
function verifyCsharpPayload(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'deployment.json'), 'utf8'))
  if (manifest.version !== '0.27.0' || manifest.packageSha256 !== PACKAGE_SHA256
    || manifest.source !== 'https://api.nuget.org/v3-flatcontainer/csharp-ls/0.27.0/csharp-ls.0.27.0.nupkg'
    || !manifest.files || typeof manifest.files !== 'object') throw Error('Unapproved csharp-ls deployment identity.')
  const actual = new Set()
  function walk(folder, prefix = '') {
    for (const name of readdirSync(folder)) {
      const file = join(folder, name), relative = prefix + name, stat = lstatSync(file)
      if (stat.isSymbolicLink()) throw Error('Linked csharp-ls asset rejected.')
      if (stat.isDirectory()) walk(file, relative + '/')
      else if (relative !== 'deployment.json') {
        actual.add(relative)
        if (manifest.files[relative] !== createHash('sha256').update(readFileSync(file)).digest('hex')) throw Error('csharp-ls asset digest mismatch: ' + relative)
      }
    }
  }
  walk(directory)
  if (Object.keys(manifest.files).length !== actual.size) throw Error('Incomplete csharp-ls deployment.')
  const base = '.store/csharp-ls/0.27.0/csharp-ls/0.27.0/tools/net10.0/any/'
  for (const file of ['csharp-ls.exe', 'licenses/csharp-ls-LICENSE.txt', 'licenses/THIRD-PARTY.json',
    ...['CSharpLanguageServer.dll', 'CSharpLanguageServer.deps.json', 'CSharpLanguageServer.runtimeconfig.json',
      'Microsoft.CodeAnalysis.CSharp.dll', 'Microsoft.Build.Locator.dll',
      'BuildHost-netcore/Microsoft.CodeAnalysis.Workspaces.MSBuild.BuildHost.dll'].map(name => base + name)]) {
    if (!actual.has(file)) throw Error('Missing required csharp-ls payload asset: ' + file)
  }
  if (!readFileSync(join(directory, 'csharp-ls.exe')).includes(Buffer.from((base + 'CSharpLanguageServer.dll').replaceAll('/', '\\')))) {
    throw Error('csharp-ls launcher does not use the approved relative deployment path.')
  }
  return manifest
}
module.exports = { verifyCsharpPayload }

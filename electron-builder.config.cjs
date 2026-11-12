// Runtime contents are prepared by scripts/package-windows.mjs, never the repo root.
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { verifyCsharpPayload } = require('./scripts/csharp-ls-payload.cjs')

module.exports = {
  appId: 'org.studentcodingide.desktop',
  productName: 'Student Coding IDE',
  directories: { app: 'out/windows-packaging/app', output: 'release' },
  asar: true,
  asarUnpack: ['out/main/native/**', 'node_modules/node-pty/**'],
  // The patched node-pty is rebuilt/verified explicitly against the installed
  // Electron. A generic rebuild must not replace its Job-ownership patch.
  npmRebuild: false,
  files: ['package.json', 'out/main/*.js', 'out/main/native/**/*.node',
    'out/preload/*.js', 'out/renderer/**',
    '!**/*.map', '!**/.env*', '!**/*.{pem,key,pfx,p12}', '!**/smart-hints-settings.json'],
  extraResources: [
    { from: 'out/windows-packaging/app/out/main/resources/learning/exercises', to: 'learning/exercises' },
    { from: 'out/windows-packaging/app/out/main/smart-hints-parser', to: 'smart-hints-parser' },
  ],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowElevation: true,
    allowToChangeInstallationDirectory: true, createDesktopShortcut: true,
    createStartMenuShortcut: true, shortcutName: 'Student Coding IDE',
    artifactName: '${productName} Setup.${ext}' },
  beforePack(context) {
    const provider = join(context.packager.info.appDir, 'csharp-ls')
    if (existsSync(join(provider, 'csharp-ls.exe'))) verifyCsharpPayload(provider)
    else if (context.targets.some(target => target.name === 'nsis')) {
      throw Error('NSIS blocked: verified app-owned csharp-ls 0.27.0 payload is missing.')
    }
  },
}

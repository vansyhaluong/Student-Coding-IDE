import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { createProtocolConnection } from 'vscode-languageserver-protocol/node'
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

void app.whenReady().then(() => {
  assert.equal(typeof createProtocolConnection, 'function')
  assert.equal(typeof StreamMessageReader, 'function')
  assert.equal(typeof StreamMessageWriter, 'function')
  writeFileSync(path.resolve(__dirname, '..', 'evidence', 'electron-probe.json'), JSON.stringify({
    electron: process.versions.electron,
    node: process.versions.node,
    modules: process.versions.modules,
    commonjsImports: true
  }, null, 2) + '\n')
  app.quit()
})

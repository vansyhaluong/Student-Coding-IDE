// Sandbox-compatible, test-only receive capability. No renderer execution authority.
const { contextBridge, ipcRenderer } = require('electron')
let received = []
ipcRenderer.on('staged-exercise-result', (_event, value) => { received.push(value) })
contextBridge.exposeInMainWorld('stagedResults', {
  snapshot: () => received.slice()
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { editorModelManager } from './features/editor/editor-session'
import { terminalController } from './features/terminal/terminal-session'
import '@fontsource-variable/geist'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

window.addEventListener('pagehide', () => {
  terminalController.shutdown()
  editorModelManager.dispose()
}, { once: true })

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { startCsharpSession } from './features/language/csharp/csharp-session'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { editorModelManager } from './features/editor/editor-session'
import { typeScriptProjectController } from './features/language/language-session'
import { disposeProblemsSession } from './features/problems/problems-session'
import { terminalController } from './features/terminal/terminal-session'
import '@fontsource-variable/geist'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

const disposeCsharpSession = startCsharpSession()
window.addEventListener('pagehide', () => {
  disposeCsharpSession()
  terminalController.shutdown()
  typeScriptProjectController.dispose()
  disposeProblemsSession()
  editorModelManager.dispose()
}, { once: true })

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

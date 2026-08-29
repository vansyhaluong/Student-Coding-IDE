import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { editorModelManager } from './features/editor/editor-session'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

window.addEventListener('pagehide', () => editorModelManager.dispose(), { once: true })

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

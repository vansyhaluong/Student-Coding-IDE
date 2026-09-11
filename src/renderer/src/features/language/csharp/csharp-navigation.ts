import type { EditorNavigationRequest } from '../../editor/editor-navigation'
let navigate: ((request: EditorNavigationRequest) => Promise<void>) | undefined
export function registerCsharpNavigation(handler: (request: EditorNavigationRequest) => Promise<void>): () => void {
  navigate = handler
  return () => { if (navigate === handler) navigate = undefined }
}
export async function navigateCsharp(request: EditorNavigationRequest): Promise<boolean> {
  if (!navigate) return false
  await navigate(request)
  return true
}

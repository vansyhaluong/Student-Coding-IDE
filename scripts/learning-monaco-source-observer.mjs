/* global document */
import assert from 'node:assert/strict'

// Serialized into the existing Renderer by the diagnostic harness only.
export async function captureMonacoSourceAndRun() {
  const entry = document.querySelector('script[type="module"][src]')
  if (!entry) throw Error('Renderer module entry unavailable')
  const bundle = await import(entry.src)
  const apis = Object.values(bundle).filter(value => value && typeof value.getEditors === 'function')
  if (apis.length !== 1) throw Error('Ambiguous Monaco API')
  const root = document.querySelector('.practice-workspace')
  const editors = apis[0].getEditors().filter(editor => root?.contains(editor.getDomNode()))
  if (editors.length !== 1) throw Error('Ambiguous Learning editor')
  const model = editors[0].getModel()
  const button = root.querySelector('[aria-label="Run"]')
  if (!model || model.isDisposed() || !button || button.disabled) throw Error('Learning Run is not ready')
  const { scheme, authority, path, query, fragment } = model.uri
  const capture = { source: model.getValue(), uri: model.uri.toString(),
    identity: { scheme, authority, path, query, fragment }, version: model.getVersionId() }
  // No await between reading the live model and dispatching the real Run click.
  button.click()
  if (model.getVersionId() !== capture.version) throw Error('Model changed during Run click')
  return capture
}

export function assertMonacoRunSource(request, capture) {
  assert.ok(capture && typeof capture.source === 'string', 'Missing pre-click model source')
  assert.ok(Number.isInteger(capture.version) && capture.version > 0, 'Missing model version')
  assert.deepEqual(capture.identity, { scheme: 'practice', authority: '',
    path: `/${request.exerciseId}/solution.${request.language === 'csharp' ? 'cs' : 'js'}`, query: '', fragment: '' },
    'Run must use the captured Learning model identity')
  assert.equal(request.code, capture.source, 'IPC source must exactly match the Monaco model at Run click')
}

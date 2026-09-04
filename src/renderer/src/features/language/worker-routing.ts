export type MonacoWorkerKind = 'editor' | 'typescript' | 'html' | 'css' | 'json'

export function workerKindForLabel(label: string): MonacoWorkerKind {
  if (label === 'json') return 'json'
  if (label === 'css' || label === 'scss' || label === 'less') return 'css'
  if (label === 'html' || label === 'handlebars' || label === 'razor') return 'html'
  if (label === 'typescript' || label === 'javascript') return 'typescript'
  return 'editor'
}

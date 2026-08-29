declare module '*?worker' {
  const WorkerConstructor: {
    new (): Worker
  }
  export default WorkerConstructor
}

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const WorkerConstructor: { new (): Worker }
  export default WorkerConstructor
}
declare module 'monaco-editor/esm/vs/language/css/css.worker?worker' {
  const WorkerConstructor: { new (): Worker }
  export default WorkerConstructor
}
declare module 'monaco-editor/esm/vs/language/html/html.worker?worker' {
  const WorkerConstructor: { new (): Worker }
  export default WorkerConstructor
}
declare module 'monaco-editor/esm/vs/language/json/json.worker?worker' {
  const WorkerConstructor: { new (): Worker }
  export default WorkerConstructor
}
declare module 'monaco-editor/esm/vs/language/typescript/ts.worker?worker' {
  const WorkerConstructor: { new (): Worker }
  export default WorkerConstructor
}

declare module 'monaco-editor/esm/vs/editor/editor.worker.js'
declare module 'monaco-editor/esm/vs/language/css/css.worker.js'
declare module 'monaco-editor/esm/vs/language/html/html.worker.js'
declare module 'monaco-editor/esm/vs/language/json/json.worker.js'
declare module 'monaco-editor/esm/vs/language/typescript/ts.worker.js'
declare module 'monaco-editor/editor/editor.worker'
declare module 'monaco-editor/language/css/css.worker'
declare module 'monaco-editor/language/html/html.worker'
declare module 'monaco-editor/language/json/json.worker'
declare module 'monaco-editor/language/typescript/ts.worker'

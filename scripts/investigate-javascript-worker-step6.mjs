/* global console, process */
// Disposable build experiment only. Never edits production config or node_modules.
import { build } from 'vite'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const root = resolve(process.argv[2])
await mkdir(root, { recursive: true })
const entry = join(root, 'compiler-probe.mjs')
const compiler = resolve('node_modules/monaco-editor/esm/vs/languages/features/typescript/lib/typescriptServices.js')
await writeFile(entry, `import * as ts from ${JSON.stringify(compiler.replaceAll('\\', '/'))};
export function diagnose(){
 const file='probe.js',text='function Sum(a,b){return a+b;}';
 const host={getScriptFileNames:()=>[file],getScriptVersion:()=> '1',getScriptSnapshot:n=>n===file?{getText:(s,e)=>text.slice(s,e),getLength:()=>text.length,getChangeRange:()=>undefined}:undefined,
 getCurrentDirectory:()=>'',getCompilationSettings:()=>({allowJs:true,checkJs:true,noLib:true,noEmit:true}),getDefaultLibFileName:()=>'',fileExists:n=>n===file,readFile:n=>n===file?text:undefined};
 const service=ts.createLanguageService(host);
 try{return {syntax:service.getSyntacticDiagnostics(file).map(d=>d.code),semantic:service.getSemanticDiagnostics(file).map(d=>d.code)};}
 finally{service.dispose();}
}`)
const evidence = { classification: 'TEST_ONLY_COMPILER_BUILD_EXPERIMENT_NOT_A_PRODUCTION_FIX', variants: [], unchangedSinceHead: {} }
const require = createRequire(import.meta.url)
for (const [name, treeshake] of [['default', true], ['annotations-off', { annotations: false }], ['no-treeshake', false]]) {
  const directory = join(root, name)
  await build({ configFile: false, logLevel: 'error', build: { ssr: entry, outDir: directory, emptyOutDir: false, minify: false,
    rollupOptions: { treeshake, output: { format: 'cjs', entryFileNames: 'probe.cjs' } } } })
  const file = join(directory, 'probe.cjs'), source = await readFile(file, 'utf8')
  const record = { name, binderCallPresent: /binder\w*\(file, options\)/.test(source), sha256: createHash('sha256').update(source).digest('hex') }
  try { record.diagnostics = require(file).diagnose(); record.status = 'PASS' }
  catch (error) { record.status = 'FAIL'; record.error = String(error); record.stack = error.stack }
  evidence.variants.push(record)
}
for (const file of ['electron.vite.config.ts', 'package.json', 'package-lock.json',
  'src/renderer/src/features/editor/workers/typescript.worker.ts', 'src/renderer/src/features/editor/monaco.ts',
  'src/renderer/src/features/language/monaco-typescript-defaults.ts', 'src/renderer/src/features/learning/practice/PracticeEditor.tsx']) {
  const head = execFileSync('git', ['show', `HEAD:${file}`]), current = await readFile(file)
  evidence.unchangedSinceHead[file] = head.toString().replaceAll('\r\n','\n') === current.toString().replaceAll('\r\n','\n')
}
await writeFile(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence, null, 2))

// Offline relocation/closure check of the ACTUAL built Main entry. No GUI or provider.
import { readFile, readdir, copyFile, cp, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'
import console from 'node:console'
import electron from 'electron'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), output = resolve(process.argv[2] ?? join(root, 'out/main'))
const base = resolve(tmpdir()), owned = await mkdtemp(join(base, 'sh4-d64-assets thử nghiệm '))
// Verify the exact owned cleanup target before entering the try/finally.
if (!resolve(owned).toLowerCase().startsWith((base + sep).toLowerCase()) || !basename(owned).startsWith('sh4-d64-assets ')) throw Error('Unsafe cleanup path')
try {
  const manifest = JSON.parse(await readFile(join(output, 'smart-hints-parser/manifest.json'), 'utf8'))
  if (manifest.typescript !== '6.0.3' || manifest.csharp?.sdk !== '10.0.112') throw Error('Pinned parser closure missing')
  for (const name of await readdir(output)) if (/^[A-Za-z0-9_.-]+\.js$/.test(name)) await copyFile(join(output, name), join(owned, name))
  await cp(join(output, 'smart-hints-parser'), join(owned, 'smart-hints-parser'), { recursive: true })
  await writeFile(join(owned, 'check.cjs'), `
const assert = require('node:assert/strict'); const {createHash,randomUUID}=require('node:crypto');
global.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};
try {require.resolve('typescript'); throw Error('Dev dependency leaked')} catch(e) {if(e.code!=='MODULE_NOT_FOUND')throw e;}
const {MainSelectionFixGuard}=require('./selection-fix-runtime.js');
const hash=s=>createHash('sha256').update(s).digest('hex');
const scope=()=>({signal:new AbortController().signal,deadline:Date.now()+30000,clock:Date.now,check(){}});
async function run(){
 let verified=0;
 for(const language of ['javascript','csharp']){
  const source=language==='javascript'?'// 🐟\\nfunction solve(x) { return x; }\\nfunction other() { return 1; }':'public class Solution { public int Solve(int x) { return x; } public int Other() { return 1; } }';
  const start=source.indexOf('x;'),end=start+1;
  const position=n=>{const a=source.slice(0,n).split('\\n');return {line:a.length,column:a.at(-1).length+1}};
  const a=position(start),b=position(end),selection={startOffset:start,endOffset:end,text:source.slice(start,end),startLine:a.line,startColumn:a.column,endLine:b.line,endColumn:b.column};
  const {text,...range}=selection,action={kind:'SUGGEST_FIX',selection};
  const signature={functionName:language==='javascript'?'solve':'Solve',parameters:[{name:'x',type:'int32'}],returnType:'int32'};
  const capture={source,action,statement:'Return x + 1.',constraints:[],signature,signatureIdentity:{version:1,hash:hash(JSON.stringify(signature))},runContext:{kind:'CODE_ONLY',reason:'NO_MATCHING_PUBLIC_RUN'},
   binding:{clientContextId:randomUUID(),contextGeneration:1,exerciseId:'synthetic',language,packageVersion:1,sourceRevision:1,fingerprint:hash(source),sourceBytes:Buffer.byteLength(source),
    origin:{kind:'PRACTICE',modelId:randomUUID(),modelVersion:1,eol:'LF'},action:{kind:'SUGGEST_FIX',selection:{...range,fingerprint:hash(text)}}}};
  const guard=new MainSelectionFixGuard(); assert.equal(await guard.availability(language,scope()),true);
  const lease=await guard.preflight(capture,scope());
  try{await lease.verify(source.slice(0,start)+'x + 1'+source.slice(end),scope());verified++;}finally{await lease.dispose();}
 }
 process.stdout.write(JSON.stringify({verified,noDevDependency:true,relocated:true,electron:process.versions.electron}));
}
run().catch(()=>{process.stderr.write('Parser asset closure failed');process.exitCode=2;});
`)
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'ProgramFiles'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
  const result = await promisify(execFile)(electron, [join(owned, 'check.cjs')], {
    cwd: owned, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 60000, maxBuffer: 8192,
  })
  const evidence = JSON.parse(result.stdout)
  if (evidence.verified !== 2 || !evidence.noDevDependency || !evidence.relocated) throw Error('Parser closure was not verified')
  console.log(JSON.stringify(evidence))
} finally {
  // Delete only this task's owned temporary tree, after the child has exited.
  await rm(owned, { recursive: true, force: true })
}

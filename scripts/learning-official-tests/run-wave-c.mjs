/* global process,console,AbortController */
// Explicit Wave C only; two clean roots before optional separate promotion.
import { build } from 'vite'
import { createRequire } from 'node:module'
import { resolve,join,basename,dirname } from 'node:path'
import { mkdtemp,readFile,writeFile } from 'node:fs/promises'
import { getHeapStatistics } from 'node:v8'
if(getHeapStatistics().heap_size_limit>512*1024*1024)throw Error('Use node --max-old-space-size=256')
const args=process.argv.slice(2),controller=new AbortController(),stop=()=>controller.abort()
process.once('SIGINT',stop);process.once('SIGTERM',stop)
try{
  const b=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,target:'node24',lib:{entry:resolve('scripts/learning-official-tests/wave-c-staging.ts'),formats:['cjs']},rollupOptions:{external:id=>id.startsWith('node:')}}})
  const c=(Array.isArray(b)?b:[b]).flatMap(x=>x.output).find(x=>x.type==='chunk'&&x.isEntry)
  if(!c)throw Error('TOOL_BUILD');const m={exports:{}};new Function('require','module','exports',c.code)(createRequire(import.meta.url),m,m.exports)
  if(args.length===2&&args[0].startsWith('--promote=')&&args[1].startsWith('--repro=')){
    const root=resolve(args[0].slice(10));if(dirname(root)!==resolve('out/official-tests')||!basename(root).startsWith('e2-s6-wave-c-'))throw Error('PROMOTION_PATH')
    const ready=JSON.parse(await readFile(join(root,'READY.json'),'utf8')),proof=JSON.parse(await readFile(join(root,'evidence/candidate-report.json'),'utf8'))
    if(proof.proofs.length!==7||proof.full!==56||proof.publicOnly!==7||!ready.dataOnly)throw Error('PROMOTION_GATE')
    const receipt=resolve(args[1].slice(8)),verification=await m.exports.verifyWaveRelease(process.cwd(),root,receipt,controller.signal)
    await writeFile(join(dirname(receipt),'prepromotion-verification.json'),JSON.stringify(verification,null,2)+'\n',{flag:'wx'})
    await m.exports.promoteWaveC(process.cwd(),root,ready.manifest);console.log(JSON.stringify({status:'PROMOTED_RUNTIME_UNVERIFIED',root,anchor:ready.manifest}))
  }else{
    if(args.length)throw Error('OPTIONS')
    const a=await m.exports.stageWaveC(process.cwd(),20261025,controller.signal);console.log(JSON.stringify({stage:1,status:a.status,root:a.rootPath,quarantined:a.quarantined}))
    if(a.status!=='PASS_WITH_LIMITATIONS'){process.exitCode=1}else{
      const d=await m.exports.stageWaveC(process.cwd(),20261025,controller.signal);console.log(JSON.stringify({stage:2,status:d.status,root:d.rootPath,quarantined:d.quarantined}))
      if(d.status!=='PASS_WITH_LIMITATIONS')process.exitCode=1
      else{
        const {compareStaging}=await m.exports.loadComparison()
        const reproduction=await compareStaging(a.rootPath,d.rootPath),out=await mkdtemp(resolve('out/official-tests/e2-s6-wave-c-evidence-'))
        await writeFile(join(out,'reproducibility.json'),JSON.stringify({first:a.rootPath,second:d.rootPath,seed:20261025,reproduction},null,2)+'\n',{flag:'wx'})
        console.log(JSON.stringify({status:'REPRODUCIBLE_DATA_RUNTIME_UNVERIFIED',first:a.rootPath,second:d.rootPath,evidence:out,files:reproduction.files,treeSHA256:reproduction.treeSHA256}))
      }
    }
  }
}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop)}

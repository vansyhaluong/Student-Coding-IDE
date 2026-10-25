// Wave C only; shared verifier, compactor, parser, reader, Registry and transaction.
import * as fs from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setImmediate as tick } from 'node:timers/promises'
import { createReferences, evidenceRoot, type ReferenceProfile, type References } from './references'
import { verifyRows, type VerificationPorts } from './verify'
import { compactWitnesses, digest, frozenBytes } from './pilot-freeze'
import { jsonStatistics, wireScreen, compareStaging } from './pilot-staging'
import { promotePreparedRelease } from './pilot-release'
import { check, demand, encode, LIMITS, random, same, type Args } from './model'
import type { Candidate } from './author'
import { WAVE_C_IDS, waveSpecs, waveDomain, waveOracle, waveObligations, waveCoverage, waveMutants, type WaveId, seededArgs } from './wave-c-spec'
import { waveRegistryScreen } from './wave-a-staging'
const PILOT_RELEASE={version:5,rawBytes:62462,sha256:'43c46cc6c361219f7dd2960e8575f4bf7ab6e0a1599f2839dace3809b89ea804'}
import { ExerciseResourceRoot, type PackageManifestAnchor } from '../../src/main/services/learning/content/exercise-package-resources'
import type { ExerciseMetadataAsset, ExercisePackageAssetBytes, OfficialPackageTestSet, PublicPackageManifest, ValidatedPublicPackage } from '../../src/main/services/learning/content/exercise-package-contracts'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
import { validateExercisePackageAssets } from '../../src/main/services/learning/content/exercise-package-validation'

export const WAVE_C_VERSION='e2-s6-wave-c-v1/xorshift32-v1/shared-greedy-cover-v1/reverse-delete-v1/facets-v1'
export async function loadComparison(){return {compareStaging}}
const paths={metadata:'exercise.json',samples:'samples.json',csharp:'starters/csharp.txt',javascript:'starters/javascript.txt',judge:'judge/v1.json'} as const
export const waveReferenceProfile:ReferenceProfile={project:'WaveC.csproj',assembly:'WaveC.dll',child:'wave-c-child.mjs',validate:waveDomain,
  files:['model.ts','author.ts','mutants.ts','domains.ts','oracles.ts','verify.ts','references.ts','process.ts','pilot-freeze.ts','pilot-coverage.ts','pilot-mutants.ts','pilot-staging.ts','pilot-release.ts',
    'wave-a-spec.ts','wave-a-staging.ts','wave-c-spec.ts','wave-c-staging.ts','wave-c-child.mjs','run-wave-c.mjs','references/WaveC.csproj','references/WaveCProgram.cs','references/NuGet.Config',
    ...WAVE_C_IDS.flatMap(id=>[`references/${id}/Solution.cs`,`references/${id}/solution.js`])]}
export async function authorWave(id:WaveId,seed:number,samples:ValidatedPublicPackage['samples']['samples'],signal?:AbortSignal){
  const due=performance.now()+LIMITS.generationMs,next=random(seed,id),pool:Candidate[]=[],seen=new Set<string>()
  function add(args:Args,source:Candidate['source'],key:string){waveDomain(id,args);const identity=encode(args).toString();if(source!=='public'&&seen.has(identity))return false;seen.add(identity);pool.push({args:structuredClone(args),source,key,obligations:waveCoverage(id,args)});demand(pool.length<=LIMITS.rows&&encode(pool).length<=LIMITS.bytes,'CAMPAIGN_LIMIT');return true}
  for(const s of samples)add(s.args,'public','public:'+s.id)
  for(const [i,args]of waveSpecs[id].curated.entries()){await tick();check(signal,due);add(args,'curated','curated:'+i)}
  const target=8
  let accepted=0
  for(let attempt=0;attempt<LIMITS.attempts&&accepted<target;attempt++){
    await tick();check(signal,due)
    const args=seededArgs(id,next)
    try{waveDomain(id,args)}catch{continue}
    if(add(args,'seeded',`xorshift32-v1:${seed}:${attempt}`))accepted++
  }
  demand(accepted===target,'ATTEMPTS_EXHAUSTED');return pool
}
export async function freezeWave(id:WaveId,source:ValidatedPublicPackage,ports:VerificationPorts,seed:number,signal?:AbortSignal,due?:number){
  const pool=await authorWave(id,seed,source.samples.samples,signal),declared=waveObligations(id),catalog=waveMutants(id)
  const options={signal,due,domain:(a:Args)=>waveDomain(id,a),obligations:declared,resultType:waveSpecs[id].result,mutants:catalog}
  let expected:unknown[]=[]
  const result=await verifyRows(id,pool,{oracle:ports.oracle,reference:async(language,args)=>{const out=await ports.reference(language,args);if(language==='csharp'){demand(Array.isArray(out),'REFERENCE_COUNT');expected=out}return out}},options)
  demand(!result.unwitnessed.length&&result.mutation.every(m=>m.status==='KILLED'||m.status==='PENDING_RUNTIME'),'WAVE_QUARANTINE')
  const required=[...declared,...result.mutation.filter(m=>m.status==='KILLED').map(m=>'kill:'+m.name)]
  const sets=pool.map(row=>new Set([...waveCoverage(id,row.args),...result.mutation.filter(m=>m.kills.includes(row.key)).map(m=>'kill:'+m.name)]))
  const chosen=compactWitnesses(pool,sets,required),rows=chosen.map(i=>pool[i]),claims=chosen.map(i=>expected[i])
  demand(rows.length>2&&rows.length<=P.officialCases,'CASE_LIMIT')
  const final=await verifyRows(id,rows,ports,{...options,expectedClaims:claims})
  demand(!final.unwitnessed.length&&final.mutation.every(m=>m.status==='KILLED'||m.status==='PENDING_RUNTIME'),'FROZEN_QUARANTINE')
  for(let i=0;i<2;i++)demand(same(rows[i].args,source.samples.samples[i].args)&&same(claims[i],source.samples.samples[i].expected),'PUBLIC_EXPECTED_DISAGREEMENT')
  const cases=rows.map((r,i)=>i<2?{...structuredClone(source.samples.samples[i]),visibility:'public' as const,sampleId:source.samples.samples[i].id}:{id:'hidden-'+String(i-1).padStart(3,'0'),visibility:'hidden' as const,args:r.args,expected:claims[i]})
  const judge={schemaVersion:1,exerciseId:id,testSetId:id+'-official',version:1,signatureVersion:source.metadata.signature.version,signatureHash:source.metadata.signature.hash,comparator:{id:'exact-typed',version:1},cases} as OfficialPackageTestSet
  const bytes=frozenBytes(judge),critical=final.mutation.filter(m=>catalog.find(c=>c.name===m.name)!.tier==='critical'),broader=final.mutation.filter(m=>catalog.find(c=>c.name===m.name)!.tier==='broader')
  demand(critical.every(m=>m.status==='KILLED'||m.status==='PENDING_RUNTIME')&&broader.filter(m=>m.status==='KILLED').length/broader.length>=.9,'MUTATION_GATE')
  const proof={id,version:WAVE_C_VERSION,seed,poolRows:pool.length,poolSHA256:digest(encode(pool)),semantics:waveSpecs[id].semantics,domain:waveSpecs[id].ranges,required,declared,
    critical:{total:critical.length,killed:critical.filter(m=>m.status==='KILLED').length,pending:critical.filter(m=>m.status==='PENDING_RUNTIME').map(m=>m.name)},
    broader:{total:broader.length,killed:broader.filter(m=>m.status==='KILLED').length,score:broader.filter(m=>m.status==='KILLED').length/broader.length,survivors:broader.filter(m=>m.status!=='KILLED')},
    catalog:catalog.map(({name,obligations,kind,tier,rationale})=>({name,obligations,kind,tier,rationale})),mutation:final.mutation,
    cases:chosen.map((index,i)=>({id:cases[i].id,origin:pool[index].key,source:pool[index].source,obligations:[...sets[index]].sort(),argsSHA256:digest(encode(cases[i].args)),expectedSHA256:digest(encode(cases[i].expected)),soleWitnessFor:required.filter(k=>sets[index].has(k)&&!chosen.some(other=>other!==index&&sets[other].has(k)))})),
    caseCount:cases.length,judge:jsonStatistics(bytes),judgeSHA256:digest(bytes),wire:wireScreen(judge),runtime60s:'UNVERIFIED'}
  demand(proof.cases.slice(2).every(c=>c.soleWitnessFor.length>0),'REDUNDANT_HIDDEN_CASE')
  return {judge,bytes,proof,rows}
}
export async function stageWaveC(repo:string,seed:number,signal?:AbortSignal){
  const base=await evidenceRoot(repo),rootPath=await fs.mkdtemp(join(base,'e2-s6-wave-c-')),source=await ExerciseResourceRoot.open(resolve(repo),['resources','learning','exercises'])
  const original=await source.manifest(PILOT_RELEASE),manifest:PublicPackageManifest={...structuredClone(original.manifest) as PublicPackageManifest,version:6}
  await fs.mkdir(join(rootPath,'resources','learning'),{recursive:true});await fs.cp(join(repo,'resources','learning','exercises'),join(rootPath,'resources','learning','exercises'),{recursive:true})
  await fs.mkdir(join(rootPath,'evidence'))
  const proofs=[],quarantined=[],sourceHashes:Record<string,string>={},baselines:Record<string,string>={}
  let versions:References['versions']|undefined
  for(const p of original.manifest.packages)for(const [k,v]of Object.entries(p.assets))baselines[p.exerciseId+'/'+k]=v.sha256
  // One existing-size bounded campaign (7 exercises), not a raised tool or Runtime deadline.
  for(let batch=0;batch<1;batch++){
    const due=performance.now()+LIMITS.campaignMs,refs:References=await createReferences(repo,signal,due,waveReferenceProfile)
    try{
      for(const id of WAVE_C_IDS.slice(batch*8,batch*8+8)){
        check(signal,due)
        try{
          const input=await source.publicPackage(original.manifest,id)
          const ports={reference:(language:'csharp'|'javascript',args:Args[])=>refs.run(language,id,args),oracle:(args:Args)=>waveOracle(id,args)}
          const frozen=await freezeWave(id,input.data,ports,seed,signal,due)
          const metadata:ExerciseMetadataAsset={...input.data.metadata,schemaVersion:1,packageVersion:2,official:{testSetId:id+'-official',version:1,hash:digest(frozen.bytes)}}
          const bytes={...input.bytes,metadata:frozenBytes(metadata),judge:frozen.bytes} as ExercisePackageAssetBytes
          const descriptor={profile:'full' as const,exerciseId:id,packageVersion:2,assets:Object.fromEntries(Object.entries(bytes).map(([kind,b])=>[kind,{path:paths[kind as keyof typeof paths],bytes:b.byteLength,sha256:digest(b)}]))}
          for(const kind of ['judge','metadata'] as const){const target=join(rootPath,'resources/learning/exercises',id,paths[kind]);await fs.mkdir(resolve(target,'..'),{recursive:true});await fs.writeFile(target,bytes[kind],{flag:kind==='judge'?'wx':'w'})}
          const readback={...bytes,judge:await fs.readFile(join(rootPath,'resources/learning/exercises',id,paths.judge)),metadata:await fs.readFile(join(rootPath,'resources/learning/exercises',id,paths.metadata))}
          const checked=validateExercisePackageAssets(readback);demand(checked.ok,'READBACK_SCHEMA')
          const reverified=await verifyRows(id,frozen.rows,ports,{signal,due,domain:a=>waveDomain(id,a),obligations:waveObligations(id),resultType:waveSpecs[id].result,mutants:waveMutants(id),expectedClaims:checked.value.judge.cases.map(c=>c.expected)})
          demand(!reverified.unwitnessed.length&&reverified.mutation.every(m=>m.status==='KILLED'||m.status==='PENDING_RUNTIME'),'READBACK_QUARANTINE')
          manifest.packages[manifest.packages.findIndex(p=>p.exerciseId===id)]=descriptor as PublicPackageManifest['packages'][number]
          const proof={...frozen.proof,metadataSHA256:digest(bytes.metadata),source:{url:input.data.metadata.metadata.source.url,statementSHA256:digest(encode(input.data.metadata.statement)),constraintsSHA256:digest(encode(input.data.metadata.constraints)),signatureSHA256:input.data.metadata.signature.hash,samplesSHA256:digest(input.bytes.samples)}}
          proofs.push(proof);await fs.writeFile(join(rootPath,'evidence',id+'.json'),frozenBytes(proof),{flag:'wx'})
        }catch(error){quarantined.push({id,code:error instanceof Error?error.message:'WAVE_FAILED'})}
      }
      await refs.verifySources();demand(!versions||same(versions,refs.versions),'REFERENCE_VERSION_CHANGED');versions=refs.versions
      for(const [p,h]of Object.entries(refs.sourceHashes)){demand(!sourceHashes[p]||sourceHashes[p]===h,'SOURCE_CHANGED');sourceHashes[p]=h}
    }finally{await refs.close()}
  }
  if(quarantined.length){await fs.writeFile(join(rootPath,'QUARANTINE.json'),frozenBytes({quarantined,ready:false}));return {status:'NOT_PASS' as const,rootPath,quarantined}}
  const raw=frozenBytes(manifest),anchor={version:6,rawBytes:raw.length,sha256:digest(raw)}
  await fs.writeFile(join(rootPath,'resources/learning/exercises/manifest.json'),raw)
  const staged=await ExerciseResourceRoot.open(rootPath,['resources','learning','exercises']);await staged.manifest(anchor)
  for(const d of manifest.packages){const old=await source.publicPackage(original.manifest,d.exerciseId),current=await staged.publicPackage(manifest,d.exerciseId);demand(same(publicExercise(old.data),publicExercise(current.data)),'PUBLIC_DRIFT');for(const k of ['samples','csharp','javascript'] as const)demand(same(old.bytes[k],current.bytes[k]),'PUBLIC_ASSET_DRIFT');if(d.profile==='full')await staged.package(manifest,d.exerciseId);if(!(WAVE_C_IDS as readonly string[]).includes(d.exerciseId))demand(same(d,original.manifest.packages.find(p=>p.exerciseId===d.exerciseId)),'PRIOR_PACKAGE_DRIFT')}
  const ledger=await waveRegistryScreen(rootPath,anchor)
  await source.manifest(PILOT_RELEASE)
  const report={version:WAVE_C_VERSION,seed,versions,baseline:PILOT_RELEASE,manifest:anchor,sourceHashes,baselines,proofs,ledger,full:56,publicOnly:7,runtime60s:'UNVERIFIED',inheritedPerformanceMutants:'PENDING_RUNTIME'}
  await fs.writeFile(join(rootPath,'evidence/candidate-report.json'),frozenBytes(report),{flag:'wx'})
  await fs.writeFile(join(rootPath,'READY.json'),frozenBytes({manifest:anchor,dataOnly:true,runtimeCertified:false}),{flag:'wx'})
  return {status:'PASS_WITH_LIMITATIONS' as const,rootPath,manifest:anchor,proofs,ledger}
}
export async function promoteWaveC(repo:string,rootPath:string,anchor:PackageManifestAnchor){
  demand(anchor.version===6,'RELEASE_VERSION');return promotePreparedRelease(repo,rootPath,PILOT_RELEASE.sha256,anchor,'e2-s6-wave-c-')
}
/** Reopen exact frozen bytes and rerun both real references/oracles before promotion. */
export async function verifyWaveRelease(repo:string,rootPath:string,receiptPath:string,signal?:AbortSignal){
  const base=resolve(repo,'out/official-tests'),rootName=resolve(rootPath)
  demand(dirname(rootName)===base&&basename(rootName).startsWith('e2-s6-wave-c-'),'RELEASE_PATH')
  demand(dirname(resolve(receiptPath)).startsWith(base+'/')||dirname(resolve(receiptPath)).startsWith(base+'\\'),'RECEIPT_PATH')
  const receipt=JSON.parse(await fs.readFile(receiptPath,'utf8'))
  demand([receipt.first,receipt.second].includes(rootName),'RECEIPT_ROOT')
  for(const p of [receipt.first,receipt.second])demand(dirname(resolve(p))===base&&basename(p).startsWith('e2-s6-wave-c-'),'RECEIPT_ROOT')
  demand(same(await compareStaging(receipt.first,receipt.second),receipt.reproduction),'REPRODUCTION_CHANGED')
  const proof=JSON.parse(await fs.readFile(join(rootName,'evidence/candidate-report.json'),'utf8'))
  demand(proof.version===WAVE_C_VERSION&&proof.proofs.length===7&&same(proof.proofs.map((p:{id:string})=>p.id),WAVE_C_IDS),'PROOF_INVENTORY')
  const source=await ExerciseResourceRoot.open(repo,['resources','learning','exercises']),prior=await source.manifest(PILOT_RELEASE)
  const root=await ExerciseResourceRoot.open(rootName,['resources','learning','exercises']),candidate=await root.manifest(proof.manifest)
  const checked=[]
  for(let batch=0;batch<1;batch++){
    const due=performance.now()+LIMITS.campaignMs,refs=await createReferences(repo,signal,due,waveReferenceProfile)
    try{
      demand(same(refs.sourceHashes,proof.sourceHashes),'SOURCE_CHANGED')
      for(const id of WAVE_C_IDS.slice(batch*8,batch*8+8)){
        const data=await root.package(candidate.manifest,id),saved=proof.proofs.find((p:{id:string})=>p.id===id)
        demand(digest(data.bytes.judge)===saved.judgeSHA256&&digest(data.bytes.metadata)===saved.metadataSHA256,'FROZEN_HASH')
        const rows:Candidate[]=data.data.judge.cases.map((c,i)=>({args:c.args,key:saved.cases[i].origin,source:saved.cases[i].source,obligations:waveCoverage(id,c.args)}))
        const result=await verifyRows(id,rows,{reference:(language,a)=>refs.run(language,id,a),oracle:a=>waveOracle(id,a)},
          {signal,due,domain:a=>waveDomain(id,a),obligations:waveObligations(id),resultType:waveSpecs[id].result,mutants:waveMutants(id),expectedClaims:data.data.judge.cases.map(c=>c.expected)})
        demand(!result.unwitnessed.length&&same(result.mutation,saved.mutation),'FROZEN_CORRECTNESS')
        checked.push({id,cases:rows.length,agreement:'PASS',critical:saved.critical,broader:saved.broader})
      }
      await refs.verifySources()
    }finally{await refs.close()}
  }
  for(const p of prior.manifest.packages){const current=candidate.manifest.packages.find(d=>d.exerciseId===p.exerciseId)!,old=await source.publicPackage(prior.manifest,p.exerciseId),next=await root.publicPackage(candidate.manifest,p.exerciseId)
    demand(same(publicExercise(old.data),publicExercise(next.data)),'PUBLIC_DRIFT')
    for(const kind of ['samples','csharp','javascript'] as const)demand(p.assets[kind].sha256===current.assets[kind].sha256,'PUBLIC_ASSET_DRIFT')
    if(!(WAVE_C_IDS as readonly string[]).includes(p.exerciseId))demand(same(current,p),'PRIOR_PACKAGE_DRIFT')
  }
  await source.manifest(PILOT_RELEASE)
  return {status:'FROZEN_REVERIFIED_RUNTIME_UNVERIFIED',manifest:proof.manifest,checked,resourceFiles:309,publicParity:63,pilotCasesUnchanged:73,runtime60s:'UNVERIFIED'}
}

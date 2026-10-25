import { describe,it,expect } from 'vitest'
import * as fs from 'node:fs/promises'
import { resolve } from 'node:path'
import { WAVE_D_IDS,waveDomain,waveOracle } from '../../scripts/learning-official-tests/wave-d-spec'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { sourceRegistry } from '../fixtures/learning/package-registry'
import { PACKAGE_POLICY as P } from '../../src/main/services/learning/content/exercise-package-policy'
import { publicExercise } from '../../src/main/services/learning/content/public-exercise-projection'
import type { PackagePrepareOwner } from '../../src/main/services/learning/content/exercise-package-registry'

describe('Wave D final mixed production release',()=>{
  it('has exactly63 full/0 public-only with unchanged two-sample prefix for every new set',async()=>{
    const root=await ExerciseResourceRoot.open(resolve('.'),['resources','learning','exercises']),{manifest}=await root.manifest()
    expect(manifest.version).toBe(7)
    expect(manifest.packages.filter(p=>'profile'in p&&p.profile==='full')).toHaveLength(63)
    expect(manifest.packages.filter(p=>'profile'in p&&p.profile==='public-only')).toHaveLength(0)
    for(const id of WAVE_D_IDS){
      const p=await root.package(manifest,id),judge=p.data.judge,samples=p.data.samples.samples
      expect(p.data.metadata.packageVersion).toBe(2)
      expect(judge.cases.slice(0,2)).toEqual(samples.map(s=>({...s,visibility:'public',sampleId:s.id})))
      const seen=new Set<string>()
      for(const c of judge.cases){expect(seen.has(c.id)).toBe(false);seen.add(c.id);waveDomain(id,c.args);expect(c.expected).toEqual(waveOracle(id,c.args))}
      expect(judge.cases.slice(2).every(c=>c.visibility==='hidden'&&!('sampleId'in c))).toBe(true)
    }
  },30000)
  it('accounts owned Official copies/representations across Wave D7 and zeroes shutdown ledger',async()=>{
    const manifest=JSON.parse(await fs.readFile('resources/learning/exercises/manifest.json','utf8')),r=await sourceRegistry()
    const tasks=new Set<Promise<unknown>>(),measurements=[]
    const owner:PackagePrepareOwner={owner:{},generation:1,phase:'prepare',isCurrent:()=>true,check(){},canRelease:()=>!tasks.size,retain(p){tasks.add(p);void p.finally(()=>tasks.delete(p)).catch(()=>{})}}
    try{for(const d of manifest.packages.filter((p:{exerciseId:string})=>(WAVE_D_IDS as readonly string[]).includes(p.exerciseId))){
      const lease=await r.acquire(d.exerciseId,owner)
      try{
        const task=lease.copyCooperative();await expect(lease.copyCooperative()).rejects.toHaveProperty('code','PACKAGE_BUSY')
        const copy=await task
        try{const representation=await lease.representCooperative(JSON.stringify(lease.data.judge),P.publicDetailBytes)
          try{const s=r.status();expect(s.parsedBytes).toBeLessThan(P.residentLogicalBytes);expect(s.nodes).toBeLessThan(P.residentNodes);expect(s.rawBytes).toBe(0);expect(copy.data.judge).toEqual(lease.data.judge);measurements.push({id:d.exerciseId,bytes:s.parsedBytes,nodes:s.nodes,raw:s.rawBytes});expect(JSON.stringify(publicExercise(lease.data))).not.toMatch(/hidden-\d|"official"|testSetId|signatureHash/)}finally{representation.release()}
        }finally{copy.release()}
      }finally{await Promise.allSettled([...tasks]);lease.release()}
    }}finally{await r.stop()}
    expect(measurements).toHaveLength(7);expect(tasks.size).toBe(0)
    expect(r.status()).toMatchObject({state:'STOPPED',parsedBytes:0,nodes:0,rawBytes:0})
  },30000)
})

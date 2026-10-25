import { describe,expect,it } from 'vitest'
import { resolve } from 'node:path'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { WAVE_A_IDS,waveSpecs,waveDomain,waveCoverage,waveObligations,waveOracle,waveMutants } from '../../scripts/learning-official-tests/wave-a-spec'
import { authorWave,freezeWave } from '../../scripts/learning-official-tests/wave-a-staging'
import { same,type Args } from '../../scripts/learning-official-tests/model'

async function source(id:string){const root=await ExerciseResourceRoot.open(resolve('.'),['resources','learning','exercises']);return (await root.publicPackage((await root.manifest()).manifest,id)).data}
describe('Wave A semantic/domain/coverage admission',()=>{
  it.each(WAVE_A_IDS)('%s admits curated inputs and rejects wrong type/arity/outer bounds',id=>{
    const spec=waveSpecs[id]
    for(const args of spec.curated)expect(()=>waveDomain(id,args)).not.toThrow()
    const base=spec.curated[0]
    expect(()=>waveDomain(id,[])).toThrow()
    expect(()=>waveDomain(id,[...base,0])).toThrow()
    for(const [i,r]of spec.ranges.entries()){
      const wrong=[...base];wrong[i]='1';expect(()=>waveDomain(id,wrong)).toThrow()
      for(const v of r==='boolean'?[0,1,null]:[r[0]-1,r[1]+1,.5,Infinity]){const invalid=[...base];invalid[i]=v;expect(()=>waveDomain(id,invalid)).toThrow()}
    }
  })
  it.each(WAVE_A_IDS)('%s independently witnesses every declared facet and kills the entire finite catalogue',id=>{
    const rows=waveSpecs[id].curated,seen=new Set(rows.flatMap(a=>waveCoverage(id,a)))
    expect(waveObligations(id).filter(k=>!seen.has(k))).toEqual([])
    for(const m of waveMutants(id)){
      if(m.kind==='performance'){expect(m.obligations.every(k=>seen.has(k))).toBe(true);continue}
      const kills=rows.filter(a=>{const e=waveOracle(id,a);return !same(m.run(structuredClone(a),structuredClone(e)),e)})
      expect(kills.length,m.name).toBeGreaterThan(0)
    }
  })
  it('uses exact Gregorian relational date domain and leap-century output order',()=>{
    for(const a of [[29,2,1900],[31,4,2024],[0,1,2024],[1,13,2024],[1,1,9999]])expect(()=>waveDomain('ch3-08',a)).toThrow()
    expect(waveOracle('ch3-08',[28,2,1900])).toEqual([1,3,1900])
    expect(waveOracle('ch3-08',[28,2,2000])).toEqual([29,2,2000])
    expect(waveOracle('ch3-08',[31,12,9998])).toEqual([1,1,9999])
    expect(waveOracle('ch3-06',[2,1900])).toBe(28)
    expect(waveOracle('ch3-06',[2,2000])).toBe(29)
  })
  it('proves arithmetic upper bounds and inclusivity with explicit independent claims',()=>{
    expect(waveOracle('ch2-09',[100,100,1000])).toBe(50050000)
    expect(waveOracle('ch4-01',[10000])).toBe(50005000)
    expect(waveOracle('ch4-02',[12])).toBe(479001600)
    expect(waveOracle('ch4-03',[1000000000])).toBe(10)
    expect(waveOracle('ch4-04',[1002])).toBe(2001)
    expect(waveOracle('ch3-09',[100000])).toBe(499750)
    expect(waveOracle('ch4-07',[100000])).toBe(9592)
    for(const n of [6,28,496,8128])expect(waveOracle('ch4-08',[n])).toBe(true)
    for(const n of [1,36,49,1000000])expect(waveOracle('ch4-08',[n])).toBe(false)
  })
  it.each(WAVE_A_IDS)('%s keeps exact two-sample claims and deterministic seeded order',async id=>{
    const data=await source(id),a=await authorWave(id,20261025,data.samples.samples),b=await authorWave(id,20261025,data.samples.samples)
    expect(same(a,b)).toBe(true)
    expect(a.slice(0,2).map(r=>r.args)).toEqual(data.samples.samples.map(s=>s.args))
    for(const s of data.samples.samples)expect(waveOracle(id,s.args)).toEqual(s.expected)
    expect(a.length).toBeLessThanOrEqual(64)
  },30000)
  it('quarantines reference/oracle/Expected disagreement without producing a frozen set',async()=>{
    const id='ch2-01',data=await source(id)
    const reference=async(_language:'csharp'|'javascript',rows:Args[])=>rows.map(a=>waveOracle(id,a))
    // These injected ports test rejection only; real reference agreement is measured in staging.
    await expect(freezeWave(id,data,{reference:async()=>[],oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('REFERENCE_COUNT')
    await expect(freezeWave(id,data,{reference,oracle:()=>999},1)).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
    const bad=structuredClone(data);bad.samples.samples[0].expected=999
    await expect(freezeWave(id,bad,{reference,oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('PUBLIC_EXPECTED_DISAGREEMENT')
    await expect(authorWave(id,1,data.samples.samples,AbortSignal.abort())).rejects.toThrow('CANCELLED')
  },30000)
})

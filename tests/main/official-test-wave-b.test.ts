import { describe,it,expect } from 'vitest'
import { resolve } from 'node:path'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { WAVE_B_IDS,waveSpecs,waveDomain,waveCoverage,waveObligations,waveOracle,waveMutants } from '../../scripts/learning-official-tests/wave-b-spec'
import { authorWave,freezeWave } from '../../scripts/learning-official-tests/wave-b-staging'
import { same,type Args } from '../../scripts/learning-official-tests/model'
async function source(id:string){const root=await ExerciseResourceRoot.open(resolve('.'),['resources','learning','exercises']);return (await root.publicPackage((await root.manifest()).manifest,id)).data}
describe('Wave B semantic authoring',()=>{
 it.each(WAVE_B_IDS)('%s validates full domain, types and curated witnesses',id=>{
  const spec=waveSpecs[id],base=spec.curated[0];for(const a of spec.curated)expect(()=>waveDomain(id,a)).not.toThrow()
  expect(()=>waveDomain(id,[])).toThrow();expect(()=>waveDomain(id,[...base,0])).toThrow()
  for(const [i,r]of spec.ranges.entries()){
   const wrong=[...base];wrong[i]=typeof base[i]==='string'?0:'1';expect(()=>waveDomain(id,wrong)).toThrow()
   const invalid=Array.isArray(r)?[r[0]-1,r[1]+1,.5,Infinity]:['A','\t','é','a'.repeat((r as {max:number}).max+1)]
   for(const v of invalid){const a=[...base];a[i]=v;expect(()=>waveDomain(id,a)).toThrow()}
  }
 })
 it.each(WAVE_B_IDS)('%s retains all declared facets and kills finite correctness catalogue',id=>{
  const rows=waveSpecs[id].curated,covered=new Set(rows.flatMap(a=>waveCoverage(id,a)))
  expect(waveObligations(id).filter(k=>!covered.has(k))).toEqual([])
  const values=rows.map(a=>waveOracle(id,a))
  for(const m of waveMutants(id)){if(m.kind==='performance'){expect(m.obligations.every(k=>covered.has(k))).toBe(true);continue}expect(rows.some((a,i)=>!same(m.run(structuredClone(a),structuredClone(values[i])),values[i])),m.name).toBe(true)}
 })
 it.each(WAVE_B_IDS)('%s reproduces admitted seeded pool and public Expected',async id=>{
  const data=await source(id),a=await authorWave(id,20261025,data.samples.samples),b=await authorWave(id,20261025,data.samples.samples)
  expect(same(a,b)).toBe(true);expect(a.slice(0,2).map(r=>r.args)).toEqual(data.samples.samples.map(s=>s.args));a.forEach(r=>waveDomain(id,r.args))
  for(const row of data.samples.samples)expect(waveOracle(id,row.args)).toEqual(row.expected)
 })
 it('rejects forbidden empty/all-space words, relational pairs and beyond-domain arithmetic',()=>{
  for(const id of ['ch5-01','ch5-04'] as const)for(const a of [[''],['   ']])expect(()=>waveDomain(id,a)).toThrow()
  for(const [id,a]of [['ch5-02',['a','']],['ch6-07',[3,4]],['ch6-09',[5,4]],['ch6-02',[2,-1]],['ch6-04',[0,1]]] as const)expect(()=>waveDomain(id,[...a])).toThrow()
 })
 it('proves DP empty/ordering/bounds and arithmetic endpoints independently',()=>{
  expect(waveOracle('ch5-08',['ab','ba'])).toBe(2);expect(waveOracle('ch5-08',['kitten','sitting'])).toBe(3)
  expect(waveOracle('ch5-08',['a'.repeat(100),'b'.repeat(100)])).toBe(100)
  expect(waveOracle('ch5-09',['',''])).toBe(1);expect(waveOracle('ch5-09',['','a'])).toBe(0)
  expect(waveOracle('ch5-09',['a'.repeat(20),'a'.repeat(10)])).toBe(184756)
  expect(waveOracle('ch6-04',[9999,10000])).toBe(99990000)
  for(let b=-5;b<=5;b++)for(let e=0;e<=10;e++)expect(waveOracle('ch6-02',[b,e])).toBe(b**e)
  for(let n=0;n<=20;n++)for(let k=0;k<=n;k++){
   const v=waveOracle('ch6-07',[n,k]) as number;expect(v).toBeLessThanOrEqual(184756);expect(v).toBe(waveOracle('ch6-07',[n,n-k]));if(k>0&&k<n)expect(v).toBe(Number(waveOracle('ch6-07',[n-1,k-1]))+Number(waveOracle('ch6-07',[n-1,k])))
  }
  expect(waveOracle('ch6-06',[36])).toEqual([1,2,3,4,6,9,12,18,36]);expect(waveOracle('ch6-09',[0,10000])).toBe(1229)
 })
 it('quarantines mismatched references/oracle/public claims and supports cancellation',async()=>{
  const id='ch6-01',data=await source(id),reference=async(_l:'csharp'|'javascript',rows:Args[])=>rows.map(a=>waveOracle(id,a))
  await expect(freezeWave(id,data,{reference:async()=>[],oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('REFERENCE_COUNT')
  await expect(freezeWave(id,data,{reference,oracle:()=>999},1)).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
  const bad=structuredClone(data);bad.samples.samples[0].expected=999
  await expect(freezeWave(id,bad,{reference,oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('PUBLIC_EXPECTED_DISAGREEMENT')
  await expect(authorWave(id,1,data.samples.samples,AbortSignal.abort())).rejects.toThrow('CANCELLED')
 })
})

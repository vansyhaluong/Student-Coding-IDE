import { describe,it,expect } from 'vitest'
import { resolve } from 'node:path'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { WAVE_C_IDS,waveSpecs,waveDomain,waveCoverage,waveObligations,waveOracle,waveMutants } from '../../scripts/learning-official-tests/wave-c-spec'
import { authorWave,freezeWave } from '../../scripts/learning-official-tests/wave-c-staging'
import { same,typed,type Args } from '../../scripts/learning-official-tests/model'
async function source(id:string){const root=await ExerciseResourceRoot.open(resolve('.'),['resources','learning','exercises']);return (await root.publicPackage((await root.manifest()).manifest,id)).data}
function arrays(alphabet:number[],n:number):number[][]{if(!n)return [[]];return arrays(alphabet,n-1).flatMap(a=>alphabet.map(v=>[...a,v]))}
function candiesBrute(r:number[]){let best=r.length*(r.length+1)/2;function visit(c:number[],sum:number){if(c.length===r.length){best=Math.min(best,sum);return}const i=c.length;for(let x=1;x<=r.length;x++){if(sum+x>best)continue;if(i&&(r[i]>r[i-1]&&x<=c[i-1]||r[i]<r[i-1]&&x>=c[i-1]))continue;visit([...c,x],sum+x)}}visit([],0);return best}
describe('Wave C exact domains and coverage',()=>{
 it.each(WAVE_C_IDS)('%s admits curated inputs, rejects type/arity/length/value boundaries',id=>{
  const spec=waveSpecs[id],base=spec.curated[0],r=spec.ranges[0]
  for(const a of spec.curated)expect(()=>waveDomain(id,a)).not.toThrow()
  expect(()=>waveDomain(id,[])).toThrow();expect(()=>waveDomain(id,[...base,0])).toThrow()
  for(const x of ['1',null,1,[[1]],[.5],[NaN],[r.lo-1],[r.hi+1],Array(r.max+1).fill(1)]){const a=[...base];a[0]=x;expect(()=>waveDomain(id,a)).toThrow()}
  if(r.min)expect(()=>waveDomain(id,id==='ch7-06'?[[],0]:[[]])).toThrow()
 })
 it.each(WAVE_C_IDS)('%s witnesses all obligations and detects every applicable finite correctness model',id=>{
  const rows=waveSpecs[id].curated,seen=new Set(rows.flatMap(a=>waveCoverage(id,a))),values=rows.map(a=>waveOracle(id,a))
  expect(waveObligations(id).filter(k=>!seen.has(k))).toEqual([])
  for(const m of waveMutants(id)){if(m.kind==='performance'){expect(m.obligations.every(k=>seen.has(k))).toBe(true);continue}
   const kills=rows.filter((a,i)=>{const actual=m.run(structuredClone(a),structuredClone(values[i]));typed(actual,waveSpecs[id].result);return !same(actual,values[i])})
   expect(kills.length,m.name).toBeGreaterThan(0)
  }
 })
 it.each(WAVE_C_IDS)('%s reproduces seeded pools and exact public claims without mutation',async id=>{
  const data=await source(id),before=JSON.stringify(data),a=await authorWave(id,20261025,data.samples.samples),b=await authorWave(id,20261025,data.samples.samples)
  expect(same(a,b)).toBe(true);expect(a.slice(0,2).map(r=>r.args)).toEqual(data.samples.samples.map(s=>s.args))
  for(const row of a)waveDomain(id,row.args);for(const row of data.samples.samples)expect(waveOracle(id,row.args)).toEqual(row.expected)
  expect(JSON.stringify(data)).toBe(before)
 })
 it('enforces canonical PlusOne digits and true strict-rotation relational constraints',()=>{
  for(const a of [[[0,1]],[[0,0]],[[10]],[[1,-1]]])expect(()=>waveDomain('ch7-03',a)).toThrow()
  for(const a of [[[1,1],1],[[2,1,3],1],[[3,2,1],1],[[1],1000001],[[1],.5]])expect(()=>waveDomain('ch7-06',a)).toThrow()
  for(let n=0;n<=5;n++){const b=[-5,-1,0,2,9].slice(0,n);for(let k=0;k<Math.max(1,n);k++){const a=b.slice(k).concat(b.slice(0,k));for(const t of [-1000000,-5,-1,0,2,9,1000000]){waveDomain('ch7-06',[a,t]);expect(waveOracle('ch7-06',[a,t])).toBe(a.indexOf(t))}}}
 })
 it('independently exhausts tiny profit/subarray/water/Candy states with direct brute proofs',()=>{
  for(let n=0;n<=5;n++)for(const b of arrays([0,1,2],n)){
   let profit=0,water=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)profit=Math.max(profit,b[j]-b[i])
   for(let i=0;i<n;i++)for(let level=b[i]+1;level<=2;level++)if(b.slice(0,i).some(x=>x>=level)&&b.slice(i+1).some(x=>x>=level))water++
   expect(waveOracle('ch7-08',[b])).toBe(water)
   if(n){expect(waveOracle('ch7-02',[b])).toBe(profit);expect(waveOracle('ch7-09',[b])).toBe(candiesBrute(b));const signed=b.map(x=>x-1);let best=-Infinity;for(let i=0;i<n;i++){let sum=0;for(let j=i;j<n;j++){sum+=signed[j];best=Math.max(best,sum)}}expect(waveOracle('ch7-04',[signed])).toBe(best)}
  }
  for(let n=0;n<=5;n++)for(const b of arrays([-1,0,1,2],n)){let expected=1;while(b.includes(expected))expected++;expect(waveOracle('ch7-07',[b])).toBe(expected)}
 })
 it('proves full-scale arithmetic/growth bounds and nonempty/ordered optima',()=>{
  expect(waveOracle('ch7-03',[Array(100).fill(9)])).toEqual([1,...Array(100).fill(0)])
  expect(waveOracle('ch7-02',[[10000,0]])).toBe(0);expect(waveOracle('ch7-02',[[0,10000]])).toBe(10000)
  expect(waveOracle('ch7-04',[Array(10000).fill(1000)])).toBe(10000000);expect(waveOracle('ch7-04',[Array(10000).fill(-1000)])).toBe(-1000)
  expect(waveOracle('ch7-07',[Array.from({length:10000},(_,i)=>i+1)])).toBe(10001)
  expect(waveOracle('ch7-08',[[10000,...Array(9998).fill(0),10000]])).toBe(99980000)
  for(const b of [Array.from({length:10000},(_,i)=>i),Array.from({length:10000},(_,i)=>9999-i)])expect(waveOracle('ch7-09',[b])).toBe(50005000)
 })
 it('quarantines reference/oracle/public Expected discrepancies and cancellation',async()=>{
  const id='ch7-02',data=await source(id),reference=async(_l:'csharp'|'javascript',rows:Args[])=>rows.map(a=>waveOracle(id,a))
  await expect(freezeWave(id,data,{reference:async()=>[],oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('REFERENCE_COUNT')
  await expect(freezeWave(id,data,{reference,oracle:()=>999},1)).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
  const bad=structuredClone(data);bad.samples.samples[0].expected=999
  await expect(freezeWave(id,bad,{reference,oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('PUBLIC_EXPECTED_DISAGREEMENT')
  await expect(authorWave(id,1,data.samples.samples,AbortSignal.abort())).rejects.toThrow('CANCELLED')
 })
})

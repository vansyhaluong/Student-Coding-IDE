import { describe,it,expect } from 'vitest'
import { resolve } from 'node:path'
import { ExerciseResourceRoot } from '../../src/main/services/learning/content/exercise-package-resources'
import { WAVE_D_IDS,waveSpecs,waveDomain,waveCoverage,waveObligations,waveOracle,waveMutants,grid,type Matrix } from '../../scripts/learning-official-tests/wave-d-spec'
import { authorWave,freezeWave } from '../../scripts/learning-official-tests/wave-d-staging'
import { same,typed,type Args } from '../../scripts/learning-official-tests/model'
async function source(id:string){const root=await ExerciseResourceRoot.open(resolve('.'),['resources','learning','exercises']);return (await root.publicPackage((await root.manifest()).manifest,id)).data}
function sequences(alphabet:number[],n:number):number[][]{return n?sequences(alphabet,n-1).flatMap(a=>alphabet.map(x=>[...a,x])):[[]]}
function healthBrute(m:Matrix){let best=Infinity;function visit(i:number,j:number,sum:number,low:number){sum+=m[i][j];low=Math.min(low,sum);if(i===m.length-1&&j===m[0].length-1)best=Math.min(best,Math.max(1,1-low));else{if(i+1<m.length)visit(i+1,j,sum,low);if(j+1<m[0].length)visit(i,j+1,sum,low)}}visit(0,0,0,0);return best}
function rectangleBrute(m:Matrix){let best=0;for(let t=0;t<m.length;t++)for(let b=t;b<m.length;b++)for(let l=0;l<m[0].length;l++)for(let r=l;r<m[0].length;r++){let valid=true;for(let i=t;i<=b;i++)for(let j=l;j<=r;j++)if(m[i][j]!==1)valid=false;if(valid)best=Math.max(best,(b-t+1)*(r-l+1))}return best}
describe('Wave D exact domains, independent proofs and frozen coverage',()=>{
 it.each(WAVE_D_IDS)('%s rejects invalid input shapes, dimensions, arity and values',id=>{
  const spec=waveSpecs[id];for(const a of spec.curated)expect(()=>waveDomain(id,a)).not.toThrow()
  for(const a of [[],[[],0],[[]],[[[]]],[[[1],[1,2]]],[[[.5]]],[[[NaN]]],[[['1']]],[[[null]]],[grid(51,1,()=>1)],[grid(1,51,()=>1)],[[[spec.lo-1]]],[[[spec.hi+1]]]])expect(()=>waveDomain(id,a)).toThrow()
  if(spec.square)expect(()=>waveDomain(id,[[[1,2]]])).toThrow()
 })
 it.each(WAVE_D_IDS)('%s witnesses every obligation and kills all finite critical/broader faults',id=>{
  const rows=waveSpecs[id].curated,seen=new Set(rows.flatMap(a=>waveCoverage(id,a))),expected=rows.map(a=>waveOracle(id,a))
  expect(waveObligations(id).filter(x=>!seen.has(x))).toEqual([])
  for(const m of waveMutants(id)){if(m.kind==='performance'){expect(m.obligations.every(x=>seen.has(x))).toBe(true);continue}const kills=rows.filter((a,i)=>{const value=m.run(structuredClone(a),structuredClone(expected[i]));typed(value,waveSpecs[id].result);return !same(value,expected[i])});expect(kills.length,m.name).toBeGreaterThan(0)}
 })
 it.each(WAVE_D_IDS)('%s preserves both public samples and deterministic seeded candidate pools',async id=>{
  const data=await source(id),before=JSON.stringify(data),first=await authorWave(id,20261025,data.samples.samples),second=await authorWave(id,20261025,data.samples.samples)
  expect(first).toEqual(second);expect(first.slice(0,2).map(x=>x.args)).toEqual(data.samples.samples.map(x=>x.args));for(const row of first)waveDomain(id,row.args)
  for(const sample of data.samples.samples)expect(waveOracle(id,sample.args)).toEqual(sample.expected);expect(JSON.stringify(data)).toBe(before)
 })
 it('independently exhausts tiny binary rectangles and signed health paths',()=>{
  for(const [r,c]of [[1,1],[1,4],[4,1],[2,3],[3,2],[3,3]])for(const a of sequences([0,1],r*c)){const m=grid(r,c,(i,j)=>a[i*c+j]);expect(waveOracle('ch8-07',[m])).toBe(rectangleBrute(m))}
  for(const [r,c]of [[1,1],[1,4],[4,1],[2,3],[3,2]])for(const a of sequences([-2,0,3],r*c)){const m=grid(r,c,(i,j)=>a[i*c+j]);expect(waveOracle('ch8-09',[m])).toBe(healthBrute(m))}
 })
 it('checks coordinate bijections, spiral permutations, original-zero projection and center union',()=>{
  for(let r=1;r<=6;r++)for(let c=1;c<=6;c++){
   const m=grid(r,c,(i,j)=>i*c+j),transpose=waveOracle('ch8-02',[m]) as Matrix
   expect(waveOracle('ch8-02',[transpose])).toEqual(m)
   const spiral=waveOracle('ch8-04',[m]) as number[];expect([...spiral].sort((a,b)=>a-b)).toEqual(m.flat());expect(spiral.slice(0,c)).toEqual(m[0])
   const zeros=waveOracle('ch8-05',[m]) as Matrix;for(let i=0;i<r;i++)for(let j=0;j<c;j++)expect(zeros[i][j]).toBe(i===0||j===0?0:m[i][j])
   if(r===c){let rotated=m;for(let k=0;k<4;k++)rotated=waveOracle('ch8-06',[rotated]) as Matrix;expect(rotated).toEqual(m);const diagonal=m.flatMap((row,i)=>row.filter((_,j)=>j===i||j===r-1-i));expect(waveOracle('ch8-03',[m])).toBe(diagonal.reduce((s,x)=>s+x,0))}
  }
  expect(waveOracle('ch8-05',[[[1,2,3],[4,0,6],[7,8,9]]])).toEqual([[1,0,3],[0,0,0],[7,0,9]])
  expect(waveOracle('ch8-06',[[[1,2],[3,4]]])).toEqual([[3,1],[4,2]])
  expect(waveOracle('ch8-04',[[[1,2,3],[4,5,6],[7,8,9]]])).toEqual([1,2,3,6,9,8,7,4,5])
 })
 it('checks maximum shapes, exact arithmetic and output lengths',()=>{
  expect(waveOracle('ch8-03',[grid(50,50,()=>1000)])).toBe(100000);expect(waveOracle('ch8-03',[grid(49,49,()=>-1000)])).toBe(-97000)
  expect(waveOracle('ch8-07',[grid(50,50,()=>1)])).toBe(2500);expect(waveOracle('ch8-09',[grid(50,50,()=>-100)])).toBe(9901);expect(waveOracle('ch8-09',[grid(50,50,()=>100)])).toBe(1)
  expect(waveOracle('ch8-04',[grid(50,50,()=>1)])).toHaveLength(2500)
 })
 it('quarantines bad reference count, public Expected, oracle discrepancy and cancellation',async()=>{
  const id='ch8-02',data=await source(id),reference=async(_l:'csharp'|'javascript',rows:Args[])=>rows.map(a=>waveOracle(id,a))
  await expect(freezeWave(id,data,{reference:async()=>[],oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('REFERENCE_COUNT')
  await expect(freezeWave(id,data,{reference,oracle:()=>[[999]]},1)).rejects.toThrow('REFERENCE_ORACLE_DISAGREEMENT')
  const bad=structuredClone(data);bad.samples.samples[0].expected=[[999]]
  await expect(freezeWave(id,bad,{reference,oracle:a=>waveOracle(id,a)},1)).rejects.toThrow('PUBLIC_EXPECTED_DISAGREEMENT')
  await expect(authorWave(id,1,data.samples.samples,AbortSignal.abort())).rejects.toThrow('CANCELLED')
 })
})

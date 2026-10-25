// E2-S6 Wave A only. Authored from current statements/constraints, not samples.
import { demand, typed, type Args } from './model'
import type { Mutant } from './mutants'
import type { ExerciseType } from '../../src/shared/contracts/practice'

export const WAVE_A_IDS = ['ch2-01','ch2-02','ch2-03','ch2-05','ch2-06','ch2-07','ch2-08','ch2-09',
  'ch3-01','ch3-02','ch3-03','ch3-05','ch3-06','ch3-07','ch3-08','ch3-09',
  'ch4-01','ch4-02','ch4-03','ch4-04','ch4-05','ch4-06','ch4-07','ch4-08'] as const
export type WaveId = typeof WAVE_A_IDS[number]
type Range = readonly [number, number] | 'boolean'
type Predicate = (args: Args) => boolean
interface Spec { ranges: Range[]; result: ExerciseType; semantics: string; curated: Args[]; facets: Record<string, Predicate> }
const M=1_000_000, n=(a: Args,i=0)=>a[i] as number
export function monthDays(month: number, year: number) { return month===2 ? (year%400===0 || year%4===0 && year%100!==0 ? 29:28):[4,6,9,11].includes(month)?30:31 }
export const waveSpecs: Record<WaveId, Spec> = {
  'ch2-01': { ranges:[[-M,M],[-M,M]],result:'int32',semantics:'Exact signed sum; range [-2000000,2000000].',curated:[[0,0],[1,0],[0,-1],[-M,-M],[M,M],[-M,M],[-1,-2],[32767,1]],facets:{negative:a=>n(a)<0&&n(a,1)<0,mixed:a=>n(a)<0&&n(a,1)>0,zero:a=>a.includes(0)} },
  'ch2-02': { ranges:[[1,10000],[1,10000]],result:'int32',semantics:'2(width+height), including unequal sides; max40000.',curated:[[1,1],[1,10000],[10000,1],[10000,10000],[3,8]],facets:{unequal:a=>n(a)!==n(a,1),square:a=>n(a)===n(a,1)} },
  'ch2-03': { ranges:[[0,10000]],result:'int32',semantics:'minutes*60; max600000.',curated:[[0],[1],[59],[60],[10000]],facets:{unit:a=>n(a)===1,interior:a=>n(a)>1&&n(a)<10000} },
  'ch2-05': { ranges:[[100,999]],result:'int32',semantics:'Sum all three decimal positions, including zero positions; max27.',curated:[[100],[999],[101],[110],[909],[123],[111]],facets:{middleZero:a=>Math.floor(n(a)/10)%10===0,lastZero:a=>n(a)%10===0,distinct:a=>new Set(String(n(a))).size===3} },
  'ch2-06': { ranges:[[100,999]],result:'int32',semantics:'Reverse three positions, then integer value:100->1,120->21.',curated:[[100],[999],[120],[101],[102],[987]],facets:{twoTrailingZero:a=>n(a)%100===0,oneTrailingZero:a=>n(a)%10===0&&n(a)%100!==0,palindrome:a=>String(n(a))===[...String(n(a))].reverse().join('')} },
  'ch2-07': { ranges:[[0,86399],[0,M]],result:'int32',semantics:'(seconds+elapsed) modulo86400, including multiple days; sum<=1086399.',curated:[[0,0],[86399,0],[0,M],[86399,M],[86399,1],[0,86400],[17,172800],[42,3]],facets:{exactDay:a=>(n(a)+n(a,1))%86400===0&&n(a,1)>0,multipleDays:a=>n(a,1)>=172800,noWrap:a=>n(a)+n(a,1)<86400} },
  'ch2-08': { ranges:[[0,M],[1,1000]],result:'int32',semantics:'Minimum integer boxes b with b*capacity>=items; empty needs0.',curated:[[0,1],[0,1000],[M,1],[M,1000],[1,1000],[999,1000],[1000,1000],[1001,1000]],facets:{partial:a=>n(a)%n(a,1)!==0,exact:a=>n(a)>0&&n(a)%n(a,1)===0,empty:a=>n(a)===0} },
  'ch2-09': { ranges:[[0,100],[0,100],[1,1000]],result:'int32',semantics:'count*(2*first+(count-1)*step)/2; max50050000, intermediate100100000.',curated:[[0,0,1],[100,100,1000],[100,0,1000],[0,100,1000],[3,1,3],[0,1,2],[100,100,1]],facets:{oddCount:a=>n(a,2)%2===1,evenCount:a=>n(a,2)%2===0,constant:a=>n(a,1)===0,zeroFirst:a=>n(a)===0&&n(a,1)>0} },
  'ch3-01': { ranges:[[-M,M]],result:'boolean',semantics:'Divisible by2, including zero and negative even numbers.',curated:[[-M],[M],[0],[-3],[-2],[1],[2]],facets:{negativeEven:a=>n(a)<0&&n(a)%2===0,negativeOdd:a=>n(a)<0&&n(a)%2!==0,zero:a=>n(a)===0} },
  'ch3-02': { ranges:[[-M,M]],result:'int32',semantics:'Exactly -1,0,+1 by sign.',curated:[[-M],[M],[0],[-1],[1],[2]],facets:{zero:a=>n(a)===0,negative:a=>n(a)<0,positive:a=>n(a)>0} },
  'ch3-03': { ranges:[[-M,M],[-M,M],[-M,M]],result:'int32',semantics:'Maximum value; all ties valid; branch pedagogy not enforced by I/O.',curated:[[-M,-M,-M],[M,M,M],[M,0,-M],[0,M,-M],[-M,0,M],[5,5,1],[5,1,5],[1,5,5],[-3,-2,-1]],facets:{aWins:a=>n(a)>n(a,1)&&n(a)>n(a,2),bWins:a=>n(a,1)>n(a)&&n(a,1)>n(a,2),cWins:a=>n(a,2)>n(a)&&n(a,2)>n(a,1),tie:a=>new Set(a).size<3,allNegative:a=>a.every(v=>(v as number)<0)} },
  'ch3-05': { ranges:[[1,10000],[1,10000],[1,10000]],result:'string',semantics:'Strict triangle inequalities before equality class; degeneracy invalid.',curated:[[1,1,1],[10000,10000,10000],[1,1,10000],[10000,1,1],[1,10000,1],[2,3,5],[5,2,3],[3,5,2],[4,4,7],[4,7,4],[7,4,4],[3,4,5]],facets:{degenerate:a=>{const x=[...a as number[]].sort((a,b)=>a-b);return x[0]+x[1]===x[2]},invalid:a=>{const x=[...a as number[]].sort((a,b)=>a-b);return x[0]+x[1]<x[2]},equal:a=>new Set(a).size===1,isosceles:a=>new Set(a).size===2&&n(a)+n(a,1)>n(a,2)&&n(a)+n(a,2)>n(a,1)&&n(a,1)+n(a,2)>n(a),scalene:a=>new Set(a).size===3&&n(a)+n(a,1)>n(a,2)&&n(a)+n(a,2)>n(a,1)&&n(a,1)+n(a,2)>n(a)} },
  'ch3-06': { ranges:[[1,12],[1,9999]],result:'int32',semantics:'Gregorian month length; includes century100 exclusion/400 restoration.',curated:[[1,1],[12,9999],[2,1900],[2,2000],[2,2024],[2,2023],[8,1],[4,1],[12,1]],facets:{centuryCommon:a=>n(a)===2&&n(a,1)%100===0&&n(a,1)%400!==0,centuryLeap:a=>n(a)===2&&n(a,1)%400===0,febLeap:a=>n(a)===2&&monthDays(2,n(a,1))===29,febCommon:a=>n(a)===2&&monthDays(2,n(a,1))===28,thirty:a=>[4,6,9,11].includes(n(a)),thirtyOne:a=>![2,4,6,9,11].includes(n(a))} },
  'ch3-07': { ranges:[[0,120],'boolean'],result:'int32',semantics:'age<6 free;6..17=50;18..59=100;>=60=70; weekend+20 iff paid.',curated:[[0,false],[120,true],...[5,6,17,18,59,60].flatMap(age=>[[age,false],[age,true]])],facets:Object.fromEntries([5,6,17,18,59,60].map(v=>['age'+v,(a:Args)=>n(a)===v])) },
  'ch3-08': { ranges:[[1,31],[1,12],[1,9998]],result:'int32[]',semantics:'Valid Gregorian input date only; output [day,month,year], may reach9999.',curated:[[1,1,1],[31,12,9998],[28,2,1900],[28,2,2000],[29,2,2000],[30,4,2025],[30,1,2025],[31,1,2025],[15,6,2025],[28,2,2023],[28,2,2024]],facets:{yearEnd:a=>n(a)===31&&n(a,1)===12,month30:a=>n(a)===30&&[4,6,9,11].includes(n(a,1)),month31:a=>n(a)===31&&n(a,1)!==12,leapDay:a=>n(a)===29&&n(a,1)===2,centuryCommon:a=>n(a)===28&&n(a,1)===2&&n(a,2)%100===0&&n(a,2)%400!==0,leapEve:a=>n(a)===28&&n(a,1)===2&&monthDays(2,n(a,2))===29,ordinary:a=>n(a)<monthDays(n(a,1),n(a,2))} },
  'ch3-09': { ranges:[[0,100000]],result:'int32',semantics:'Cumulative marginal prices2 for units1..50,3 for51..100,5 thereafter; max499750.',curated:[[0],[1],[49],[50],[51],[99],[100],[101],[100000]],facets:Object.fromEntries([49,50,51,99,100,101].map(v=>['tier'+v,(a:Args)=>n(a)===v])) },
  'ch4-01': { ranges:[[0,10000]],result:'int32',semantics:'Inclusive sum1..n, empty0; max50005000; loop pedagogy not I/O-enforceable.',curated:[[0],[1],[2],[3],[9999],[10000]],facets:{singleton:a=>n(a)===1,odd:a=>n(a)%2===1,even:a=>n(a)>0&&n(a)%2===0} },
  'ch4-02': { ranges:[[0,12]],result:'int32',semantics:'0!=1;12!=479001600; checked integer arithmetic.',curated:[[0],[1],[2],[3],[10],[11],[12]],facets:{unit:a=>n(a)===1,wide:a=>n(a)>=10,interior:a=>n(a)>1&&n(a)<10} },
  'ch4-03': { ranges:[[0,1_000_000_000]],result:'int32',semantics:'Decimal digit count;0 has one digit; upper bound has10.',curated:[[0],[1],[9],[10],[11],[99],[100],[999],[1000],[999999999],[1000000000]],facets:{powerTen:a=>n(a)>0&&/^10*$/.test(String(n(a))),beforePower:a=>/^9+$/.test(String(n(a))),interior:a=>n(a)===11} },
  'ch4-04': { ranges:[[0,100_000_000]],result:'int32',semantics:'Reverse decimal positions, discard only leading output zeros; result<=99999999.',curated:[[0],[1],[10],[100],[100000000],[99999999],[1002],[12345678],[101],[12030]],facets:{trailingZero:a=>n(a)>0&&n(a)%10===0,internalZero:a=>/0[1-9]/.test(String(n(a))),manyDigits:a=>n(a)>=10000000&&n(a)%10!==0,palindrome:a=>n(a)>0&&String(n(a))===[...String(n(a))].reverse().join('')} },
  'ch4-05': { ranges:[[1,M],[1,M]],result:'int32',semantics:'Positive gcd; symmetric; equal/divisible/coprime and nontrivial common factor.',curated:[[1,1],[1,M],[M,1],[M,M],[48,18],[18,48],[35,64],[1000000,999999],[81,27]],facets:{coprime:a=>n(a)===35&&n(a,1)===64,equal:a=>n(a)===n(a,1),swapped:a=>n(a)<n(a,1),nontrivial:a=>n(a)===48&&n(a,1)===18} },
  'ch4-06': { ranges:[[0,M]],result:'boolean',semantics:'Exactly two positive divisors, n>1; inclusive square-root divisor.',curated:[[0],[1],[2],[3],[4],[5],[9],[25],[49],[999983],[1000000]],facets:{one:a=>n(a)===1,two:a=>n(a)===2,oddComposite:a=>[9,25,49].includes(n(a)),square:a=>n(a)>1&&Number.isInteger(Math.sqrt(n(a))),largePrime:a=>n(a)===999983} },
  'ch4-07': { ranges:[[0,100000]],result:'int32',semantics:'Count primes in closed interval[2,n]; n<2 ->0; max9592.',curated:[[0],[1],[2],[3],[4],[9],[10],[49],[97],[100000]],facets:{belowTwo:a=>n(a)<2,two:a=>n(a)===2,primeEnd:a=>[3,97].includes(n(a)),compositeEnd:a=>[4,9,10,49].includes(n(a))} },
  'ch4-08': { ranges:[[1,M]],result:'boolean',semantics:'Sum proper positive divisors equals n;1 false; divisor pair/square center handled once.',curated:[[1],[2],[6],[28],[496],[8128],[36],[49],[12],[999983],[1000000]],facets:{one:a=>n(a)===1,perfect:a=>[6,28,496,8128].includes(n(a)),largePerfect:a=>n(a)===8128,square:a=>[36,49].includes(n(a)),abundant:a=>n(a)===12,prime:a=>n(a)===999983} },
}
// Explicit finite-map/transition witnesses, evaluated from inputs after compaction.
for(let month=1;month<=12;month++){
  waveSpecs['ch3-06'].curated.push([month,2025]);
  waveSpecs['ch3-06'].facets['month:'+month]=a=>n(a)===month;
  waveSpecs['ch3-08'].curated.push([monthDays(month,2025),month,2025]);
  waveSpecs['ch3-08'].facets['month-end:'+month]=a=>n(a,1)===month&&n(a)===monthDays(month,n(a,2));
}
for(const [label,lo,hi]of [['free',0,5],['child',6,17],['adult',18,59],['senior',60,120]] as const)for(const weekend of [false,true])
  waveSpecs['ch3-07'].facets[label+':'+weekend]=a=>n(a)>=lo&&n(a)<=hi&&a[1]===weekend;
for(const [x,y,z]of [[0,1,2],[0,2,1],[1,2,0]]){
  waveSpecs['ch3-03'].facets['tie:'+x+y]=a=>n(a,x)===n(a,y)&&n(a,x)>n(a,z);
  waveSpecs['ch3-05'].facets['isosceles:'+x+y]=a=>n(a,x)===n(a,y)&&n(a,x)!==n(a,z)&&2*n(a,x)>n(a,z);
  waveSpecs['ch3-05'].facets['degenerate-largest:'+z]=a=>n(a,x)+n(a,y)===n(a,z);
  waveSpecs['ch3-05'].facets['invalid-largest:'+z]=a=>n(a,x)+n(a,y)<n(a,z);
}
waveSpecs['ch3-03'].facets['all-equal']=a=>new Set(a).size===1;
for(let v=0;v<=12;v++){
  waveSpecs['ch4-02'].curated.push([v]);waveSpecs['ch4-02'].facets['n:'+v]=a=>n(a)===v;
}
for(let power=1;power<=9;power++){
  const bound=10**power;
  for(const v of [bound-1,bound]){waveSpecs['ch4-03'].curated.push([v]);waveSpecs['ch4-03'].facets['decimal-bound:'+v]=a=>n(a)===v;}
}
waveSpecs['ch4-04'].facets['largest-reversed']=a=>n(a)===99999999;
for(const v of [6,28,496,8128])waveSpecs['ch4-08'].facets['perfect:'+v]=a=>n(a)===v;
export function waveDomain(exercise: string,args:Args): asserts exercise is WaveId {
  demand((WAVE_A_IDS as readonly string[]).includes(exercise),'WAVE_A_ID')
  const s=waveSpecs[exercise as WaveId];demand(Array.isArray(args)&&args.length===s.ranges.length,'WAVE_A_ARITY')
  for(const [i,r]of s.ranges.entries()){typed(args[i],r==='boolean'?'boolean':'int32');if(r!=='boolean')demand(n(args,i)>=r[0]&&n(args,i)<=r[1],'WAVE_A_DOMAIN')}
  if(exercise==='ch3-08')demand(n(args)<=monthDays(n(args,1),n(args,2)),'WAVE_A_VALID_DATE')
}
export function waveObligations(id:WaveId){return ['definition',...waveSpecs[id].ranges.flatMap((_,i)=>[`arg${i}:min`,`arg${i}:max`]),...Object.keys(waveSpecs[id].facets),...(id==='ch4-07'?['naive-prime-count-runtime']:[])]}
export function waveCoverage(id:WaveId,args:Args){waveDomain(id,args);const s=waveSpecs[id];return ['definition',...s.ranges.flatMap((r,i)=>r==='boolean'?[`arg${i}:${args[i]?'max':'min'}`]:[...(n(args,i)===r[0]?[`arg${i}:min`]:[]),...(n(args,i)===r[1]?[`arg${i}:max`]:[])]),...Object.entries(s.facets).filter(([,p])=>p(args)).map(([k])=>k),...(id==='ch4-07'&&n(args)===100000?['naive-prime-count-runtime']:[])]}
// Independent divisor-incidence enumeration, not a translated reference sieve.
let divisorCounts:Uint16Array|undefined,properSums:Int32Array|undefined,primePrefix:Uint32Array|undefined
function divisors(){if(divisorCounts)return;divisorCounts=new Uint16Array(M+1);properSums=new Int32Array(M+1);primePrefix=new Uint32Array(M+1);for(let d=1;d<=M;d++)for(let v=d;v<=M;v+=d){divisorCounts[v]++;if(v>d)properSums[v]+=d}for(let v=1;v<=M;v++)primePrefix[v]=primePrefix[v-1]+(divisorCounts[v]===2?1:0)}
function serial(y:number,m:number,d:number){const prev=y-1;let days=365*prev+Math.floor(prev/4)-Math.floor(prev/100)+Math.floor(prev/400);const offsets=[0,31,59,90,120,151,181,212,243,273,304,334];days+=offsets[m-1]+d-1;if(m>2)days+=Math.floor(y/4)-Math.floor(prev/4)-Math.floor(y/100)+Math.floor(prev/100)+Math.floor(y/400)-Math.floor(prev/400);return days}
const reverse=(v:number)=>Number([...String(v)].reverse().join(''))
export function waveOracle(id:WaveId,args:Args):unknown{
  waveDomain(id,args);const [a,b,c]=args as number[]
  switch(id){
    case'ch2-01':return Number(BigInt(a)+BigInt(b))
    case'ch2-02':return Number(BigInt(a)+BigInt(a)+BigInt(b)+BigInt(b))
    case'ch2-03':return Number(BigInt(a)*60n)
    case'ch2-05':{let k=BigInt(a),sum=0n;while(k){sum+=k%10n;k/=10n}return Number(sum)}
    case'ch2-06':case'ch4-04':{const digits=String(a);let v=0n;for(let i=0;i<digits.length;i++)v+=BigInt(digits.charCodeAt(i)-48)*10n**BigInt(i);return Number(v)}
    case'ch2-07':{let total=BigInt(a)+BigInt(b);while(total>=86400n)total-=86400n;return Number(total)}
    case'ch2-08':{let lo=0n,hi=BigInt(a);while(lo<hi){const mid=(lo+hi)/2n;if(mid*BigInt(b)>=BigInt(a))hi=mid;else lo=mid+1n}return Number(lo)}
    case'ch2-09':{let sum=0n;for(let i=0;i<c;i++)sum+=BigInt(a)+BigInt(i)*BigInt(b);return Number(sum)}
    case'ch3-01':return (BigInt(a)&1n)===0n
    case'ch3-02':return Number(BigInt(a)>0n)-Number(BigInt(a)<0n)
    case'ch3-03':return [...args as number[]].sort((a,b)=>a-b)[2]
    case'ch3-05':{const v=[...args as number[]].sort((a,b)=>a-b);if(v[2]>=v[0]+v[1])return'invalid';return ['','equilateral','isosceles','scalene'][new Set(v).size]}
    case'ch3-06':return (a===12?serial(b+1,1,1):serial(b,a+1,1))-serial(b,a,1)
    case'ch3-07':{let price=0;for(const [lo,hi,p]of [[6,17,50],[18,59,100],[60,120,70]])if(a>=lo&&a<=hi)price=p;return price+(price>0&&args[1]===true?20:0)}
    case'ch3-08':{const next=serial(c,b,a)+1;let y=c,m=1;while(serial(y+1,1,1)<=next)y++;while(m<12&&serial(y,m+1,1)<=next)m++;return [next-serial(y,m,1)+1,m,y]}
    case'ch3-09':{let total=0n;for(let i=1;i<=a;i++)total+=i<=50?2n:i<=100?3n:5n;return Number(total)}
    case'ch4-01':return Number(BigInt(a)*(BigInt(a)+1n)/2n)
    case'ch4-02':{let result=1n;for(const p of [2,3,5,7,11]){let e=0;for(let q=p;q<=a;q*=p)e+=Math.floor(a/q);result*=BigInt(p)**BigInt(e)}return Number(result)}
    case'ch4-03':{let power=1n,digits=0;do{digits++;power*=10n}while(BigInt(a)>=power);return digits}
    case'ch4-05':{const min=Math.min(a,b),max=Math.max(a,b),factors=[1];for(let d=2;d*d<=min;d++)if(min%d===0){factors.push(d,min/d)}factors.push(min);return Math.max(...factors.filter(d=>max%d===0))}
    case'ch4-06':divisors();return divisorCounts![a]===2
    case'ch4-07':divisors();return primePrefix![a]
    case'ch4-08':divisors();return properSums![a]===a
  }
}
type Fault=(a:Args,e:unknown)=>unknown
const bad=(name:string,run:Fault)=>({name,run})
export function waveMutants(id:WaveId):(Mutant&{tier:'critical'|'broader';rationale:string})[]{
  const digitSum=(v:number)=>[...String(v)].reduce((s,c)=>s+Number(c),0), gcd=(a:number,b:number):number=>b?gcd(b,a%b):a
  const faults:Record<WaveId,ReturnType<typeof bad>[]>={
    'ch2-01':[bad('subtract',(a)=>n(a)-n(a,1)),bad('absolute',a=>Math.abs(n(a))+Math.abs(n(a,1))),bad('int16',(_,e)=>(Number(e)<<16)>>16),bad('max-instead',a=>Math.max(...a as number[])),bad('zero-init-one',(a,e)=>n(a)===0?Number(e)+1:e)],
    'ch2-02':[bad('area',a=>n(a)*n(a,1)),bad('semiperimeter',a=>n(a)+n(a,1)),bad('square-only',a=>4*n(a)),bad('one-height',a=>2*n(a)+n(a,1)),bad('one-width',a=>n(a)+2*n(a,1))],
    'ch2-03':[bad('hundred',a=>100*n(a)),bad('hours',a=>3600*n(a)),bad('divide',a=>Math.floor(n(a)/60)),bad('factor59',a=>59*n(a)),bad('zero-minute',(a,e)=>n(a)===0?60:e)],
    'ch2-05':[bad('drop-hundreds',a=>digitSum(n(a)%100)),bad('digital-root',a=>1+(n(a)-1)%9),bad('last-only',a=>n(a)%10),bad('drop-tens',a=>Math.floor(n(a)/100)+n(a)%10),bad('digit-product',a=>[...String(n(a))].reduce((p,c)=>p*Number(c),1))],
    'ch2-06':[bad('unchanged',a=>n(a)),bad('swap-last-two',a=>Math.floor(n(a)/100)*100+n(a)%10*10+Math.floor(n(a)/10)%10),bad('trailing-zero-kept',(a,e)=>n(a)%10===0?Number(e)*10:e),bad('drop-middle',a=>n(a)%10*100+Math.floor(n(a)/100)),bad('palindrome-empty',(a,e)=>String(n(a))===[...String(n(a))].reverse().join('')?0:e)],
    'ch2-07':[bad('no-wrap',a=>n(a)+n(a,1)),bad('hour-mod',a=>(n(a)+n(a,1))%3600),bad('single-wrap',a=>n(a)+n(a,1)>=86400?n(a)+n(a,1)-86400:n(a)+n(a,1)),bad('ignore-origin',a=>n(a,1)%86400),bad('day-off-one',a=>(n(a)+n(a,1))%86399)],
    'ch2-08':[bad('floor',a=>Math.floor(n(a)/n(a,1))),bad('always-plus-one',a=>Math.floor(n(a)/n(a,1))+1),bad('swapped',a=>Math.ceil(n(a,1)/Math.max(1,n(a)))),bad('empty-one',(a,e)=>n(a)===0?1:e),bad('nearest',a=>Math.round(n(a)/n(a,1)))],
    'ch2-09':[bad('count-vs-count-minus-one',a=>Math.floor(n(a,2)*(2*n(a)+n(a,2)*n(a,1))/2)),bad('omit-first',a=>n(a,1)*n(a,2)*(n(a,2)-1)/2),bad('omit-last',a=>(n(a,2)-1)*(2*n(a)+(n(a,2)-2)*n(a,1))/2),bad('ignore-step',a=>n(a)*n(a,2)),bad('divide-count-first',a=>Math.floor(n(a,2)/2)*(2*n(a)+(n(a,2)-1)*n(a,1)))],
    'ch3-01':[bad('positive-only',a=>n(a)>=0&&n(a)%2===0),bad('odd',a=>n(a)%2!==0),bad('zero-false',a=>n(a)!==0&&n(a)%2===0),bad('negative-remainder',a=>n(a)%2!==1),bad('four-divisibility',a=>n(a)%4===0)],
    'ch3-02':[bad('zero-positive',a=>n(a)>=0?1:-1),bad('return-input',a=>n(a)),bad('absolute-sign',a=>n(a)===0?0:1),bad('negative-zero',a=>n(a)<0?0:n(a)===0?0:1),bad('positive-zero',a=>n(a)>0?0:n(a)<0?-1:0)],
    'ch3-03':[bad('ignore-c',a=>Math.max(n(a),n(a,1))),bad('zero-init',a=>Math.max(0,...a as number[])),bad('strict-tie',a=>n(a)>n(a,1)&&n(a)>n(a,2)?n(a):n(a,1)>n(a)&&n(a,1)>n(a,2)?n(a,1):n(a,2)),bad('minimum',a=>Math.min(...a as number[])),bad('ignore-b',a=>Math.max(n(a),n(a,2)))],
    'ch3-05':[bad('classify-before-valid',a=>new Set(a).size===1?'equilateral':new Set(a).size===2?'isosceles':'scalene'),bad('degenerate-valid',(a,e)=>{const v=[...a as number[]].sort((a,b)=>a-b);return v[0]+v[1]===v[2]?'scalene':e}),bad('single-inequality',(a,e)=>n(a)+n(a,1)>n(a,2)&&e==='invalid'?'scalene':e),bad('equal-as-isosceles',(_,e)=>e==='equilateral'?'isosceles':e),bad('iso-as-scalene',(_,e)=>e==='isosceles'?'scalene':e)],
    'ch3-06':[bad('feb28',(a,e)=>n(a)===2?28:e),bad('divisible-four',(a,e)=>n(a)===2?(n(a,1)%4===0?29:28):e),bad('august30',(a,e)=>n(a)===8?30:e),bad('december30',(a,e)=>n(a)===12?30:e),bad('feb-always29',(a,e)=>n(a)===2?29:e)],
    'ch3-07':[bad('age6-free',(a,e)=>n(a)===6?0:e),bad('age18-child',(a,e)=>n(a)===18?50+(a[1]?20:0):e),bad('free-weekend-fee',(a,e)=>n(a)<6&&a[1]?20:e),bad('age60-adult',(a,e)=>n(a)===60?100+(a[1]?20:0):e),bad('weekend-ten',(a,e)=>a[1]&&Number(e)>0?Number(e)-10:e)],
    'ch3-08':[bad('no-leap',(a,e)=>n(a,1)===2&&n(a)===28?[1,3,n(a,2)]:e),bad('thirty-day-months',(a,e)=>n(a)===30?[1,n(a,1)+1,n(a,2)]:e),bad('no-year-roll',(a,e)=>n(a)===31&&n(a,1)===12?[1,1,n(a,2)]:e),bad('leap-rule-four',(a,e)=>n(a)===28&&n(a,1)===2&&n(a,2)%100===0&&n(a,2)%400!==0?[29,2,n(a,2)]:e),bad('month-start-zero',(a,e)=>(e as number[])[0]===1?[0,(e as number[])[1],(e as number[])[2]]:e)],
    'ch3-09':[bad('whole-final-tier',a=>n(a)*(n(a)<=50?2:n(a)<=100?3:5)),bad('second-tier-base',(a,e)=>n(a)>50?Number(e)+50:e),bad('boundary50',(a,e)=>n(a)===50?101:e),bad('flat-two',a=>2*n(a)),bad('third-price-four',(a,e)=>n(a)>100?Number(e)-(n(a)-100):e)],
    'ch4-01':[bad('exclusive',a=>n(a)*(n(a)-1)/2),bad('zero-one',(a,e)=>n(a)===0?1:e),bad('omit-one',(a,e)=>n(a)>0?Number(e)-1:e),bad('int16',(_,e)=>(Number(e)<<16)>>16),bad('return-n',a=>n(a))],
    'ch4-02':[bad('zero-zero',(a,e)=>n(a)===0?0:e),bad('omit-n',(a,e)=>n(a)>0?Number(e)/n(a):e),bad('return-n',a=>n(a)),bad('add-instead',a=>n(a)*(n(a)+1)/2),bad('int16',(_,e)=>(Number(e)<<16)>>16)],
    'ch4-03':[bad('zero-zero',(a,e)=>n(a)===0?0:e),bad('ceil-log',a=>n(a)===0?1:Math.ceil(Math.log10(n(a)))),bad('limit-three',(a,e)=>Math.min(Number(e),3)),bad('leading-one',(a,e)=>n(a)>1&&/^10*$/.test(String(n(a)))?Number(e)-1:e),bad('binary-count',a=>n(a).toString(2).length)],
    'ch4-04':[bad('unchanged',a=>n(a)),bad('delete-internal-zeros',a=>reverse(Number(String(n(a)).replaceAll('0','')))),bad('drop-last',a=>reverse(Math.floor(n(a)/10))),bad('only-three',a=>reverse(n(a)%1000)),bad('zero-one',(a,e)=>n(a)===0?1:e)],
    'ch4-05':[bad('minimum',a=>Math.min(...a as number[])),bad('maximum',a=>Math.max(...a as number[])),bad('return-remainder',a=>n(a)%n(a,1)),bad('coprime-zero',a=>gcd(n(a),n(a,1))===1?0:gcd(n(a),n(a,1))),bad('swapped-large',(a,e)=>n(a)<n(a,1)?n(a,1):e)],
    'ch4-06':[bad('one-prime',(a,e)=>n(a)===1?true:e),bad('all-odd',a=>n(a)>1&&(n(a)===2||n(a)%2!==0)),bad('strict-sqrt',(a,e)=>n(a)>1&&Number.isInteger(Math.sqrt(n(a)))?true:e),bad('reject-two',(a,e)=>n(a)===2?false:e),bad('reject-five',(a,e)=>n(a)===5?false:e)],
    'ch4-07':[bad('exclusive',(a,e)=>{const v=n(a);let prime=v>1;for(let d=2;d*d<=v;d++)if(v%d===0)prime=false;return Number(e)-(prime?1:0)}),bad('one-prime',(a,e)=>n(a)>=1?Number(e)+1:e),bad('odd-count',a=>n(a)<2?0:Math.floor((n(a)-1)/2)+1),bad('omit-two',(a,e)=>n(a)>=2?Number(e)-1:e),bad('complement',(a,e)=>n(a)-1-Number(e))],
    'ch4-08':[bad('one-perfect',(a,e)=>n(a)===1?true:e),bad('include-self',()=>false),bad('unpaired-only',a=>{let s=0;for(let d=1;d*d<=n(a);d++)if(n(a)%d===0)s+=d;return s===n(a)}),bad('six-only',a=>n(a)===6),bad('twenty-eight-only',a=>n(a)===28)],
  }
  const models:(Mutant&{tier:'critical'|'broader';rationale:string})[]=faults[id].map((m,i)=>({...m,obligations:['definition'],kind:'value',tier:i<3?'critical':'broader',rationale:`${id}: ${m.name}; finite input/output fault model, not compiled AST coverage`}))
  if(id==='ch4-07')models.push({name:'trial-all-lower-divisors',obligations:['naive-prime-count-runtime'],kind:'performance',tier:'critical',rationale:'Functionally correct trial of every lower divisor for every candidate; maximum input witnesses risk, only real Runtime may establish timing.',run:()=>{throw Error('PERFORMANCE_REQUIRES_RUNTIME')}})
  return models
}

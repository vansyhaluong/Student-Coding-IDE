/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = grid=>{const r=grid.length,c=grid[0].length;function feasible(initial){const remaining=Array(c).fill(-Infinity);for(let i=0;i<r;i++)for(let j=0;j<c;j++){const prior=i===0&&j===0?initial:Math.max(i?remaining[j]:-Infinity,j?remaining[j-1]:-Infinity),now=prior+grid[i][j];remaining[j]=now>=1?now:-Infinity}return remaining[c-1]>=1}let lo=1,hi=1+100*(r+c-1);while(lo<hi){const mid=(lo+hi)>>1;if(feasible(mid))hi=mid;else lo=mid+1}return lo}

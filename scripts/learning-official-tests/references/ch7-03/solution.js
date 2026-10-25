/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = digits=>{const a=[...digits];let last=-1;for(let i=0;i<a.length;i++)if(a[i]!==9)last=i;if(last<0)return [1,...Array(a.length).fill(0)];a[last]++;for(let i=last+1;i<a.length;i++)a[i]=0;return a}

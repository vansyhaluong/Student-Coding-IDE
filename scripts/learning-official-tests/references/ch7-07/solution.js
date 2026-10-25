/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = nums=>{const a=[...nums],n=a.length;for(let i=0;i<n;i++)if(a[i]<=0||a[i]>n)a[i]=n+1;for(let i=0;i<n;i++){const x=Math.abs(a[i]);if(x<=n)a[x-1]=-Math.abs(a[x-1])}for(let i=0;i<n;i++)if(a[i]>0)return i+1;return n+1}

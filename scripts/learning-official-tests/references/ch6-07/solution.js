// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = (n,k)=>{k=Math.min(k,n-k);let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return r}

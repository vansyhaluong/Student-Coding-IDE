// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = n=>{function digitSum(v){return [...String(v)].reduce((s,c)=>s+Number(c),0)}while(n>9)n=digitSum(n);return n}

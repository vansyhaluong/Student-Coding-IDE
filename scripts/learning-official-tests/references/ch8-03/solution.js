/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = matrix=>matrix.flatMap((row,i)=>row.filter((_,j)=>i===j||i+j===matrix.length-1)).reduce((s,x)=>s+x,0)

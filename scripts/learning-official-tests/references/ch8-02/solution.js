/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = matrix=>{const out=Array.from({length:matrix[0].length},()=>[]);for(const row of matrix)row.forEach((x,j)=>out[j].push(x));return out}

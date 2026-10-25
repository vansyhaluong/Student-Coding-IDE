/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = matrix=>{const a=matrix.map(row=>[...row]).reverse();for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i][j];a[i][j]=a[j][i];a[j][i]=x}return a}

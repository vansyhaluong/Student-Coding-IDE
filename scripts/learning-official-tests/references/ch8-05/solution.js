/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = matrix=>{const a=matrix.map(row=>[...row]),r=a.length,c=a[0].length,firstRow=a[0].includes(0),firstCol=a.some(row=>row[0]===0);for(let i=1;i<r;i++)for(let j=1;j<c;j++)if(a[i][j]===0)a[i][0]=a[0][j]=0;for(let i=1;i<r;i++)for(let j=1;j<c;j++)if(a[i][0]===0||a[0][j]===0)a[i][j]=0;if(firstRow)a[0].fill(0);if(firstCol)for(const row of a)row[0]=0;return a}

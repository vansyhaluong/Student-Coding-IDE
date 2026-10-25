/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = matrix=>{const width=matrix.map(row=>row.map(()=>0));let best=0;for(let i=0;i<matrix.length;i++)for(let j=0;j<matrix[0].length;j++){if(!matrix[i][j])continue;width[i][j]=1+(j?width[i][j-1]:0);let w=width[i][j];for(let top=i;top>=0;top--){w=Math.min(w,width[top][j]);if(!w)break;best=Math.max(best,w*(i-top+1))}}return best}

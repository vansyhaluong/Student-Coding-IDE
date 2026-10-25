/* global module */
// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
module.exports = matrix=>{const r=matrix.length,c=matrix[0].length,seen=Array.from({length:r},()=>Array(c).fill(false)),directions=[[0,1],[1,0],[0,-1],[-1,0]],out=[];let i=0,j=0,d=0;for(let k=0;k<r*c;k++){out.push(matrix[i][j]);seen[i][j]=true;let x=i+directions[d][0],y=j+directions[d][1];if(x<0||x>=r||y<0||y>=c||seen[x][y]){d=(d+1)%4;x=i+directions[d][0];y=j+directions[d][1]}i=x;j=y}return out}

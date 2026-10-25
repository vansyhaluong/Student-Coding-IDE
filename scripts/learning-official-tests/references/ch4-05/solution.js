// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(a,b) { let shift=0;while(((a|b)&1)===0){a>>=1;b>>=1;shift++;}while((a&1)===0)a>>=1;do{while((b&1)===0)b>>=1;if(a>b)[a,b]=[b,a];b-=a;}while(b!==0);return a*2**shift; };

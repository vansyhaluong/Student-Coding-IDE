// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(n) { if(n<2)return false;const composite=new Uint8Array(n+1);for(let p=2;p*p<=n;p++)if(!composite[p])for(let j=p*p;j<=n;j+=p)composite[j]=1;return composite[n]===0; };

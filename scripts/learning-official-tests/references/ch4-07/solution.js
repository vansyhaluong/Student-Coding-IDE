// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(n) { const primes=[];for(let v=2;v<=n;v++){let ok=true;for(const p of primes){if(p*p>v)break;if(v%p===0){ok=false;break;}}if(ok)primes.push(v);}return primes.length; };

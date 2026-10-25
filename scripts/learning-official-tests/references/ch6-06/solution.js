// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
module.exports = n=>{const lo=[],hi=[];for(let d=1;d*d<=n;d++)if(n%d===0){lo.push(d);if(d*d!==n)hi.push(n/d)}return lo.concat(hi.reverse())}

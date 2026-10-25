// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(n) { let sum=0;for(let d=1;d<=Math.floor(n/2);d++)if(n%d===0)sum+=d;return sum===n; };

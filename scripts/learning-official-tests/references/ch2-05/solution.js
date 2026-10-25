// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(n) { return [...String(n)].reduce((s,c)=>s+Number(c),0); };

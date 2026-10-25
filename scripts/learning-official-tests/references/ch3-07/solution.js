// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(age,weekend) { const band=[[0,5,0],[6,17,50],[18,59,100],[60,120,70]].find(([lo,hi])=>age>=lo&&age<=hi);return band[2]+(weekend&&band[2]!==0?20:0); };

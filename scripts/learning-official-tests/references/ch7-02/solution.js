/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = prices=>{let high=prices.at(-1),best=0;for(let i=prices.length-2;i>=0;i--){best=Math.max(best,high-prices[i]);high=Math.max(high,prices[i])}return best}

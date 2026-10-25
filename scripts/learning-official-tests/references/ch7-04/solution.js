/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = nums=>{let prefix=0,least=0,best=-Infinity;for(const x of nums){prefix+=x;best=Math.max(best,prefix-least);least=Math.min(least,prefix)}return best}

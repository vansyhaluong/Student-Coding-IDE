/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = heights=>{const stack=[];let total=0;for(let i=0;i<heights.length;i++){while(stack.length&&heights[i]>heights[stack.at(-1)]){const bottom=stack.pop();if(!stack.length)break;const left=stack.at(-1);total+=(Math.min(heights[left],heights[i])-heights[bottom])*(i-left-1)}stack.push(i)}return total}

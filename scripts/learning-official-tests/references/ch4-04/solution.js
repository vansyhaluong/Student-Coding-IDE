// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(n) { const digits=String(n);let text='';for(let i=digits.length-1;i>=0;i--)text+=digits[i];return Number(text); };

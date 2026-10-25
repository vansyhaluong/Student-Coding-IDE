// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(month,year) { if(month===2)return year%400===0||(year%4===0&&year%100!==0)?29:28;return [4,6,9,11].includes(month)?30:31; };

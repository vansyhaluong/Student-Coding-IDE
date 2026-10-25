// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(day,month,year) { const leap=year%400===0||(year%4===0&&year%100!==0);const lens=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];if(day<lens[month-1])return [day+1,month,year];return month===12?[1,1,year+1]:[1,month+1,year]; };

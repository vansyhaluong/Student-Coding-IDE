// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(units) { let sum=0;for(let i=1;i<=units;i++)sum+=i<=50?2:i<=100?3:5;return sum; };

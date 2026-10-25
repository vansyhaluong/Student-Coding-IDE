// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(n) { let sum=0,lo=1,hi=n;while(lo<=hi){sum+=lo===hi?lo:lo+hi;lo++;hi--;}return sum; };

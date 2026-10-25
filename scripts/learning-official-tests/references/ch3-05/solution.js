// Developer-only independent JavaScript reference. Never shipped.
module.exports = function solve(a,b,c) { if(a+b<=c||a+c<=b||b+c<=a)return "invalid";const equal=Number(a===b)+Number(a===c)+Number(b===c);return equal===3?"equilateral":equal?"isosceles":"scalene"; };

/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function Fibonacci(n) { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a }
module.exports = Fibonacci

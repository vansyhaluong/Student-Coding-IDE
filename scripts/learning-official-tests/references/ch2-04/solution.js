/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function Divide(a, b) { const q = Math.floor(a / b); return [q, a - q * b] }
module.exports = Divide

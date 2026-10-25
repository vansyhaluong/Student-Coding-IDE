/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function Reshape(matrix, rows, cols) {
  const flat = matrix.flat(); if (flat.length !== rows * cols) return matrix.map(r => [...r])
  return Array.from({ length: rows }, (_, r) => flat.slice(r * cols, (r + 1) * cols))
}
module.exports = Reshape

/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function CommonPrefix(words) {
  const sorted = [...words].sort(), first = sorted[0], last = sorted[sorted.length - 1]
  let n = 0; while (n < first.length && first[n] === last[n]) n++
  return first.slice(0, n)
}
module.exports = CommonPrefix

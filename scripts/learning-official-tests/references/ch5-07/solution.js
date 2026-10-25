/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored; M1=A. Never ship.
function MinWindow(s, t) {
  const need = Array(26).fill(0); for (const c of t) need[c.charCodeAt(0) - 97]++
  let missing = t.length, left = 0, best = '', length = Infinity
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right) - 97; if (need[c] > 0) missing--; need[c]--
    while (!missing) {
      if (right - left + 1 < length) { length = right - left + 1; best = s.slice(left, right + 1) }
      const old = s.charCodeAt(left++) - 97; need[old]++; if (need[old] > 0) missing++
    }
  }
  return best
}
module.exports = MinWindow

/* global module */
// E2-PILOT-REFERENCE-ONLY: iterative postorder, independently authored; never ship.
function LongestPath(m) {
  const R = m.length, C = m[0].length, dp = Array(R * C).fill(0)
  function larger(k) {
    const r = Math.floor(k / C), c = k % C
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([i, j]) => i >= 0 && j >= 0 && i < R && j < C && m[i][j] > m[r][c]).map(([i, j]) => i * C + j)
  }
  for (let start = 0; start < dp.length; start++) {
    const stack = [start]
    while (stack.length) {
      const mark = stack.pop(), k = mark < 0 ? -mark - 1 : mark
      if (dp[k]) continue
      const next = larger(k)
      if (mark < 0) dp[k] = 1 + Math.max(0, ...next.map(i => dp[i]))
      else { stack.push(-k - 1); for (const i of next) if (!dp[i]) stack.push(i) }
    }
  }
  return Math.max(...dp)
}
module.exports = LongestPath

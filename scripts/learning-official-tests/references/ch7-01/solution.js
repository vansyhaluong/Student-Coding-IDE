/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function TwoSum(nums, target) {
  const sorted = nums.map((n, i) => [n, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let l = 0, r = sorted.length - 1
  while (l < r) {
    const sum = sorted[l][0] + sorted[r][0]
    if (sum === target) return [sorted[l][1], sorted[r][1]].sort((a, b) => a - b)
    if (sum < target) l++; else r--
  }
  throw new Error('DOMAIN')
}
module.exports = TwoSum

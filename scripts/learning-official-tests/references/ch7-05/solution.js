/* global module */
// E2-PILOT-REFERENCE-ONLY: independently authored from S1; never ship.
function ProductExceptSelf(nums) {
  const left = [1], right = Array(nums.length + 1).fill(1)
  for (let i = 0; i < nums.length; i++) left.push(left[i] * nums[i])
  for (let i = nums.length - 1; i >= 0; i--) right[i] = right[i + 1] * nums[i]
  return nums.map((_, i) => left[i] * right[i + 1])
}
module.exports = ProductExceptSelf

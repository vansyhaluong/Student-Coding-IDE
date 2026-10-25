// E2-PILOT-REFERENCE-ONLY. Independently authored from S1.
namespace Pilot.Ch7_01;
public static class Solution {
    public static int[] TwoSum(int[] nums, int target) {
        var seen = new System.Collections.Generic.Dictionary<int, int>();
        for (int j = 0; j < nums.Length; j++) {
            if (seen.TryGetValue(target - nums[j], out int i)) return new[] { i, j };
            seen.TryAdd(nums[j], j);
        }
        throw new System.InvalidOperationException("DOMAIN");
    }
}

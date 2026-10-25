// E2-PILOT-REFERENCE-ONLY. Independently authored from S1, no division.
namespace Pilot.Ch7_05;
public static class Solution {
    public static int[] ProductExceptSelf(int[] nums) {
        int[] result = new int[nums.Length]; int product = 1;
        for (int i = 0; i < nums.Length; i++) { result[i] = product; product = checked(product * nums[i]); }
        product = 1;
        for (int i = nums.Length - 1; i >= 0; i--) { result[i] = checked(result[i] * product); product = checked(product * nums[i]); }
        return result;
    }
}

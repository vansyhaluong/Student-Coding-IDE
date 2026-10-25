// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_04;
public static class Solution{public static int MaxSubarray(int[] nums){int current=nums[0],best=current;for(int i=1;i<nums.Length;i++){current=Math.Max(nums[i],checked(current+nums[i]));best=Math.Max(best,current);}return best;}}

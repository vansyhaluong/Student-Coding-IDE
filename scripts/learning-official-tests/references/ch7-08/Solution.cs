// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_08;
public static class Solution{public static int TrappedWater(int[] heights){int left=0,right=heights.Length-1,leftHigh=0,rightHigh=0,total=0;while(left<=right){if(leftHigh<=rightHigh){leftHigh=Math.Max(leftHigh,heights[left]);total=checked(total+leftHigh-heights[left++]);}else{rightHigh=Math.Max(rightHigh,heights[right]);total=checked(total+rightHigh-heights[right--]);}}return total;}}

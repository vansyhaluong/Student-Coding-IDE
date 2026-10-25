// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_06;
public static class Solution{public static int SearchRotated(int[] nums,int target){int lo=0,hi=nums.Length-1;while(lo<=hi){int mid=lo+(hi-lo)/2;if(nums[mid]==target)return mid;if(nums[lo]<=nums[mid]){if(nums[lo]<=target&&target<nums[mid])hi=mid-1;else lo=mid+1;}else{if(nums[mid]<target&&target<=nums[hi])lo=mid+1;else hi=mid-1;}}return -1;}}

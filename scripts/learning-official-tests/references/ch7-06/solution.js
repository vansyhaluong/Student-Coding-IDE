/* global module */
// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
module.exports = (nums,target)=>{if(!nums.length)return -1;let lo=0,hi=nums.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(nums[mid]>nums[hi])lo=mid+1;else hi=mid}const pivot=lo;lo=0;hi=nums.length-1;while(lo<=hi){const mid=(lo+hi)>>1,i=(mid+pivot)%nums.length;if(nums[i]===target)return i;if(nums[i]<target)lo=mid+1;else hi=mid-1}return -1}

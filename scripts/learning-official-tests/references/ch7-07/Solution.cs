// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_07;
public static class Solution{public static int FirstMissingPositive(int[] nums){var a=(int[])nums.Clone();for(int i=0;i<a.Length;i++)while(a[i]>0&&a[i]<=a.Length&&a[a[i]-1]!=a[i]){int destination=a[i]-1;int swap=a[destination];a[destination]=a[i];a[i]=swap;}for(int i=0;i<a.Length;i++)if(a[i]!=i+1)return i+1;return a.Length+1;}}

// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_03;
public static class Solution{public static int[] PlusOne(int[] digits){var a=(int[])digits.Clone();for(int i=a.Length-1;i>=0;i--){if(a[i]<9){a[i]++;return a;}a[i]=0;}var result=new int[a.Length+1];result[0]=1;return result;}}

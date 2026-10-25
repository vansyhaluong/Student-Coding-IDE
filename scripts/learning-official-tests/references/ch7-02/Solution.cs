// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_02;
public static class Solution{public static int MaxProfit(int[] prices){int low=prices[0],best=0;foreach(int p in prices){best=Math.Max(best,p-low);low=Math.Min(low,p);}return best;}}

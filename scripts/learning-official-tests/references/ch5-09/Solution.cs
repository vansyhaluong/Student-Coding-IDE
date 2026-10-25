// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch5_09;
public static class Solution{public static int SubsequenceCount(string s,string t){var dp=new int[t.Length+1];dp[0]=1;foreach(char c in s)for(int j=t.Length;j>=1;j--)if(c==t[j-1])dp[j]+=dp[j-1];return dp[t.Length];}}

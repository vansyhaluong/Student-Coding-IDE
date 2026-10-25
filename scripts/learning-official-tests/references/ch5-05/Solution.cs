// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch5_05;
public static class Solution{public static int LongestUnique(string s){var last=new int[26];Array.Fill(last,-1);int left=0,best=0;for(int i=0;i<s.Length;i++){int c=s[i]-'a';left=Math.Max(left,last[c]+1);last[c]=i;best=Math.Max(best,i-left+1);}return best;}}

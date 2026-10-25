// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch5_01;
public static class Solution{public static int LastWordLength(string s){int i=s.Length-1;while(s[i]==' ')i--;int end=i;while(i>=0&&s[i]!=' ')i--;return end-i;}}

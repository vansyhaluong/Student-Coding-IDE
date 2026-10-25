// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch5_04;
public static class Solution{public static string ReverseWords(string s)=>string.Join(" ",s.Split(' ',StringSplitOptions.RemoveEmptyEntries).Reverse());}

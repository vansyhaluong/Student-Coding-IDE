// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch6_05;
public static class Solution{public static bool PalindromeNumber(int n){string s=n.ToString(System.Globalization.CultureInfo.InvariantCulture);for(int i=0;i<s.Length/2;i++)if(s[i]!=s[s.Length-1-i])return false;return true;}}

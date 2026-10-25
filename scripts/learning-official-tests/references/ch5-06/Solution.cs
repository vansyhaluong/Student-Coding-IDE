// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch5_06;
public static class Solution{public static bool Anagram(string s,string t){var counts=new int[26];foreach(char c in s)counts[c-'a']++;foreach(char c in t)counts[c-'a']--;return counts.All(v=>v==0);}}

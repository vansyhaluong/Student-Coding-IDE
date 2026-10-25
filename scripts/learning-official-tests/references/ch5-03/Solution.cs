// E2-PILOT-REFERENCE-ONLY. Independently authored from S1.
namespace Pilot.Ch5_03;
public static class Solution {
    public static string CommonPrefix(string[] words) {
        for (int i = 0; i < words[0].Length; i++)
            foreach (string word in words) if (i >= word.Length || word[i] != words[0][i]) return words[0][..i];
        return words[0];
    }
}

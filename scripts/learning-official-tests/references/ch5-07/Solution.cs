// E2-PILOT-REFERENCE-ONLY. Independently authored, M1=A; never ship.
namespace Pilot.Ch5_07;
public static class Solution {
    public static string MinWindow(string s, string t) {
        var need = new System.Collections.Generic.Dictionary<char, int>();
        foreach (char c in t) need[c] = need.GetValueOrDefault(c) + 1;
        var got = new System.Collections.Generic.Dictionary<char, int>();
        int formed = 0, left = 0, start = 0, best = int.MaxValue;
        for (int right = 0; right < s.Length; right++) {
            char c = s[right]; got[c] = got.GetValueOrDefault(c) + 1;
            if (need.ContainsKey(c) && got[c] == need[c]) formed++;
            while (formed == need.Count) {
                if (right - left + 1 < best) { start = left; best = right - left + 1; }
                char old = s[left++]; got[old]--;
                if (need.ContainsKey(old) && got[old] < need[old]) formed--;
            }
        }
        return best == int.MaxValue ? "" : s.Substring(start, best);
    }
}

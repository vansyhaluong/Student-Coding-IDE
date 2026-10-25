// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch6_06;
public static class Solution{public static int[] Divisors(int n){var result=new List<int>();for(int d=1;d<=n;d++)if(n%d==0)result.Add(d);return result.ToArray();}}

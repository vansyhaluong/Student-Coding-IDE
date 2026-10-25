// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch4_06;
public static class Solution { public static bool IsPrime(int n) { if(n<2)return false;for(int d=2;d*d<=n;d++)if(n%d==0)return false;return true; } }

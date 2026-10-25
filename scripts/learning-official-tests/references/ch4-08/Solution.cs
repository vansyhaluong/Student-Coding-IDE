// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch4_08;
public static class Solution { public static bool IsPerfect(int n) { if(n==1)return false;long sum=1;for(int d=2;d*d<=n;d++)if(n%d==0){sum+=d;if(d!=n/d)sum+=n/d;}return sum==n; } }

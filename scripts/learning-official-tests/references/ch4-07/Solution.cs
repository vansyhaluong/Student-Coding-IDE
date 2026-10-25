// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch4_07;
public static class Solution { public static int PrimeCount(int n) { var composite=new bool[n+1];for(int p=2;p*p<=n;p++)if(!composite[p])for(int j=p*p;j<=n;j+=p)composite[j]=true;int count=0;for(int v=2;v<=n;v++)if(!composite[v])count++;return count; } }

// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch6_07;
public static class Solution{public static int Choose(int n,int k){var row=new int[n+1];row[0]=1;for(int i=1;i<=n;i++)for(int j=i;j>=1;j--)row[j]=checked(row[j]+row[j-1]);return row[k];}}

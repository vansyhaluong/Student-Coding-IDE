// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch6_09;
public static class Solution{private static bool IsPrime(int n){if(n<2)return false;for(int d=2;d*d<=n;d++)if(n%d==0)return false;return true;}public static int PrimesInRange(int left,int right){int count=0;for(int n=left;n<=right;n++)if(IsPrime(n))count++;return count;}}

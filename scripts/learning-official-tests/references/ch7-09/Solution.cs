// E2-WAVE-C-REFERENCE-ONLY. Trusted developer source.
namespace WaveC.ch7_09;
public static class Solution{public static int Candy(int[] ratings){var c=new int[ratings.Length];Array.Fill(c,1);for(int i=1;i<c.Length;i++)if(ratings[i]>ratings[i-1])c[i]=c[i-1]+1;for(int i=c.Length-2;i>=0;i--)if(ratings[i]>ratings[i+1])c[i]=Math.Max(c[i],c[i+1]+1);int sum=0;foreach(int x in c)sum=checked(sum+x);return sum;}}

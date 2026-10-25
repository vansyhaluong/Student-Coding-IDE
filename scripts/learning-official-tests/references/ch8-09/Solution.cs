// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_09;
public static class Solution{public static int MinimumHealth(int[][] grid){int r=grid.Length,c=grid[0].Length;var need=new int[c+1];Array.Fill(need,int.MaxValue);need[c-1]=1;for(int i=r-1;i>=0;i--)for(int j=c-1;j>=0;j--)need[j]=Math.Max(1,Math.Min(need[j],need[j+1])-grid[i][j]);return need[0];}}

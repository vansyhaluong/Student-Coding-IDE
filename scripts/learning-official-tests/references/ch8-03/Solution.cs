// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_03;
public static class Solution{public static int DiagonalSum(int[][] matrix){int total=0,n=matrix.Length;for(int i=0;i<n;i++){total+=matrix[i][i];if(i!=n-1-i)total+=matrix[i][n-1-i];}return total;}}

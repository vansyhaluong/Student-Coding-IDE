// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_02;
public static class Solution{public static int[][] Transpose(int[][] matrix){int r=matrix.Length,c=matrix[0].Length;var result=new int[c][];for(int j=0;j<c;j++){result[j]=new int[r];for(int i=0;i<r;i++)result[j][i]=matrix[i][j];}return result;}}

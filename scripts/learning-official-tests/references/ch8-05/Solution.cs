// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_05;
public static class Solution{public static int[][] ZeroRowsCols(int[][] matrix){int r=matrix.Length,c=matrix[0].Length;var rows=new bool[r];var cols=new bool[c];for(int i=0;i<r;i++)for(int j=0;j<c;j++)if(matrix[i][j]==0){rows[i]=true;cols[j]=true;}var result=new int[r][];for(int i=0;i<r;i++){result[i]=new int[c];for(int j=0;j<c;j++)result[i][j]=rows[i]||cols[j]?0:matrix[i][j];}return result;}}

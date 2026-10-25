// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_04;
public static class Solution{public static int[] Spiral(int[][] matrix){var output=new List<int>();int top=0,bottom=matrix.Length-1,left=0,right=matrix[0].Length-1;while(top<=bottom&&left<=right){for(int j=left;j<=right;j++)output.Add(matrix[top][j]);top++;for(int i=top;i<=bottom;i++)output.Add(matrix[i][right]);right--;if(top<=bottom){for(int j=right;j>=left;j--)output.Add(matrix[bottom][j]);bottom--;}if(left<=right){for(int i=bottom;i>=top;i--)output.Add(matrix[i][left]);left++;}}return output.ToArray();}}

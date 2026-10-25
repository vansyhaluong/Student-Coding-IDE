// E2-WAVE-D-REFERENCE-ONLY. Trusted developer source.
namespace WaveD.ch8_07;
public static class Solution{public static int MaxRectangle(int[][] matrix){int cols=matrix[0].Length,best=0;var h=new int[cols+1];foreach(var row in matrix){for(int j=0;j<cols;j++)h[j]=row[j]==0?0:h[j]+1;var stack=new Stack<int>();for(int j=0;j<=cols;j++){while(stack.Count>0&&h[stack.Peek()]>h[j]){int height=h[stack.Pop()],width=stack.Count==0?j:j-stack.Peek()-1;best=Math.Max(best,height*width);}stack.Push(j);}}return best;}}

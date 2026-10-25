// E2-PILOT-REFERENCE-ONLY. Independently authored from S1, returned values only.
namespace Pilot.Ch8_01;
public static class Solution {
    public static int[][] Reshape(int[][] matrix, int rows, int cols) {
        if (rows * cols != matrix.Length * matrix[0].Length) return matrix.Select(r => (int[])r.Clone()).ToArray();
        var result = new int[rows][]; for (int r = 0; r < rows; r++) result[r] = new int[cols];
        int offset = 0;
        foreach (var row in matrix) foreach (int value in row) { result[offset / cols][offset % cols] = value; offset++; }
        return result;
    }
}

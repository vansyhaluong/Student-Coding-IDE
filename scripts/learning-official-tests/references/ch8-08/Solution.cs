// E2-PILOT-REFERENCE-ONLY. Independently authored topological layers.
namespace Pilot.Ch8_08;
public static class Solution {
    public static int LongestPath(int[][] matrix) {
        int rows = matrix.Length, cols = matrix[0].Length; var degree = new int[rows, cols];
        var queue = new System.Collections.Generic.Queue<(int r, int c)>();
        var directions = new[] { (-1, 0), (1, 0), (0, -1), (0, 1) };
        bool Inside(int r, int c) => r >= 0 && c >= 0 && r < rows && c < cols;
        for (int r = 0; r < rows; r++) for (int c = 0; c < cols; c++) {
            foreach (var (dr, dc) in directions) if (Inside(r + dr, c + dc) && matrix[r + dr][c + dc] < matrix[r][c]) degree[r, c]++;
            if (degree[r, c] == 0) queue.Enqueue((r, c));
        }
        int layers = 0;
        while (queue.Count > 0) {
            int count = queue.Count; layers++;
            while (count-- > 0) {
                var (r, c) = queue.Dequeue();
                foreach (var (dr, dc) in directions) {
                    int nr = r + dr, nc = c + dc;
                    if (Inside(nr, nc) && matrix[nr][nc] > matrix[r][c] && --degree[nr, nc] == 0) queue.Enqueue((nr, nc));
                }
            }
        }
        return layers;
    }
}

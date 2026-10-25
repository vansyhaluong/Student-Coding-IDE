// E2-PILOT-REFERENCE-ONLY. Independently authored from S1.
namespace Pilot.Ch4_09;
public static class Solution {
    public static int Fibonacci(int n) {
        if (n < 2) return n;
        int previous = 0, current = 1;
        for (int i = 2; i <= n; i++) { int next = checked(previous + current); previous = current; current = next; }
        return current;
    }
}

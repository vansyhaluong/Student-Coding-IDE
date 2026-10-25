// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch3_09;
public static class Solution { public static int Bill(int units) { return Math.Min(units,50)*2+Math.Min(Math.Max(units-50,0),50)*3+Math.Max(units-100,0)*5; } }

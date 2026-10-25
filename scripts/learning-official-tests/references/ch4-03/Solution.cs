// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch4_03;
public static class Solution { public static int DigitCount(int n) { int count=0;do{count++;n/=10;}while(n>0);return count; } }

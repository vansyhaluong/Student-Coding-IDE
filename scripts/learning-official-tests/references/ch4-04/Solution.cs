// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch4_04;
public static class Solution { public static int ReverseNumber(int n) { int result=0;while(n>0){result=result*10+n%10;n/=10;}return result; } }

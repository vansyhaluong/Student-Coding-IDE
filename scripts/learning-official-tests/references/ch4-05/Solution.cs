// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch4_05;
public static class Solution { public static int Gcd(int a,int b) { while(b!=0){int r=a%b;a=b;b=r;}return a; } }

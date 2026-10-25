// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch3_05;
public static class Solution { public static string Triangle(int a,int b,int c) { var x=new int[]{a,b,c};Array.Sort(x);if(x[0]+x[1]<=x[2])return "invalid";return a==b&&b==c?"equilateral":a==b||a==c||b==c?"isosceles":"scalene"; } }

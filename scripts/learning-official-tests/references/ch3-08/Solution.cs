// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch3_08;
public static class Solution { public static int[] NextDate(int day,int month,int year) { var next=new DateTime(year,month,day).AddDays(1);return new int[]{next.Day,next.Month,next.Year}; } }

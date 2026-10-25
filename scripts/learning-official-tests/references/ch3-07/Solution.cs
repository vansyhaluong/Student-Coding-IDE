// Developer-only independent C# reference. Never shipped.
namespace WaveA.ch3_07;
public static class Solution { public static int Ticket(int age,bool weekend) { int price=age<6?0:age<18?50:age<60?100:70;return price+(weekend && price>0?20:0); } }

// E2-PILOT-REFERENCE-ONLY. BCL Gregorian calendar is independent of JS rule.
namespace Pilot.Ch3_04;
public static class Solution {
    public static bool LeapYear(int year) => System.DateTime.IsLeapYear(year);
}

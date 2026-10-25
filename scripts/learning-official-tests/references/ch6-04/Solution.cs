// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch6_04;
public static class Solution{private static int Gcd(int a,int b){while(b!=0){int t=a%b;a=b;b=t;}return a;}public static int Lcm(int a,int b)=>checked((a/Gcd(a,b))*b);}

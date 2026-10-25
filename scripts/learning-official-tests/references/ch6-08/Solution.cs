// E2-WAVE-B-REFERENCE-ONLY. Trusted developer source.
namespace WaveB.ch6_08;
public static class Solution{private static int SumDigits(int n){int sum=0;do{sum+=n%10;n/=10;}while(n>0);return sum;}public static int DigitalRoot(int n){while(n>=10)n=SumDigits(n);return n;}}

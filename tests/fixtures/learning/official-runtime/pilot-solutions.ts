/** E3-S5 TEST ONLY. Statically reviewed adaptations of the sixteen developer
 * references at scripts/learning-official-tests/references/<id>/{Solution.cs,solution.js}.
 * C#: global public instance Solution/method, explicit BCL access, no implicit
 * project usings. JS: named declaration, no CommonJS export. Never app resources. */
export const PILOT_IDS = ['ch2-04', 'ch3-04', 'ch3-07', 'ch5-03', 'ch5-07', 'ch7-01', 'ch8-01', 'ch4-03'] as const
export type PilotId = typeof PILOT_IDS[number]
export type PilotLanguage = 'csharp' | 'javascript'
export const SOLUTIONS: Readonly<Record<PilotId, Readonly<Record<PilotLanguage, string>>>> = {
  'ch2-04': {
    csharp: 'public class Solution { public int[] Divide(int a,int b) => new[]{a/b,a%b}; }',
    javascript: 'function Divide(a,b){const q=Math.floor(a/b);return [q,a-q*b];}',
  },
  'ch3-04': {
    csharp: 'public class Solution { public bool LeapYear(int year) => System.DateTime.IsLeapYear(year); }',
    javascript: 'function LeapYear(year){return year%400===0||(year%4===0&&year%100!==0);}',
  },
  'ch3-07': {
    csharp: 'public class Solution { public int Ticket(int age,bool weekend){int price=age<6?0:age<18?50:age<60?100:70;return price+(weekend&&price>0?20:0);} }',
    javascript: 'function Ticket(age,weekend){const band=[[0,5,0],[6,17,50],[18,59,100],[60,120,70]].find(([lo,hi])=>age>=lo&&age<=hi);return band[2]+(weekend&&band[2]!==0?20:0);}',
  },
  'ch5-03': {
    csharp: `public class Solution { public string CommonPrefix(string[] words) {
for(int i=0;i<words[0].Length;i++) foreach(string word in words) if(i>=word.Length||word[i]!=words[0][i]) return words[0][..i];
return words[0]; } }`,
    javascript: 'function CommonPrefix(words){const sorted=[...words].sort(),first=sorted[0],last=sorted[sorted.length-1];let n=0;while(n<first.length&&first[n]===last[n])n++;return first.slice(0,n);}',
  },
  'ch5-07': {
    csharp: `public class Solution { public string MinWindow(string s,string t) {
var need=new System.Collections.Generic.Dictionary<char,int>(); foreach(char c in t){need.TryGetValue(c,out int n);need[c]=n+1;}
var got=new System.Collections.Generic.Dictionary<char,int>(); int formed=0,left=0,start=0,best=int.MaxValue;
for(int right=0;right<s.Length;right++){char c=s[right];got.TryGetValue(c,out int n);got[c]=n+1;
if(need.ContainsKey(c)&&got[c]==need[c])formed++;
while(formed==need.Count){if(right-left+1<best){start=left;best=right-left+1;}char old=s[left++];got[old]--;if(need.ContainsKey(old)&&got[old]<need[old])formed--;}}
return best==int.MaxValue?"":s.Substring(start,best); } }`,
    javascript: `function MinWindow(s,t){const need=Array(26).fill(0);for(const c of t)need[c.charCodeAt(0)-97]++;
let missing=t.length,left=0,best='',length=Infinity;
for(let right=0;right<s.length;right++){const c=s.charCodeAt(right)-97;if(need[c]>0)missing--;need[c]--;
while(!missing){if(right-left+1<length){length=right-left+1;best=s.slice(left,right+1);}const old=s.charCodeAt(left++)-97;need[old]++;if(need[old]>0)missing++;}}
return best;}`,
  },
  'ch7-01': {
    csharp: `public class Solution { public int[] TwoSum(int[] nums,int target) {
var seen=new System.Collections.Generic.Dictionary<int,int>();for(int j=0;j<nums.Length;j++){if(seen.TryGetValue(target-nums[j],out int i))return new[]{i,j};seen.TryAdd(nums[j],j);}
throw new System.InvalidOperationException("DOMAIN"); } }`,
    javascript: `function TwoSum(nums,target){const sorted=nums.map((n,i)=>[n,i]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let l=0,r=sorted.length-1;
while(l<r){const sum=sorted[l][0]+sorted[r][0];if(sum===target)return [sorted[l][1],sorted[r][1]].sort((a,b)=>a-b);if(sum<target)l++;else r--;}
throw Error('DOMAIN');}`,
  },
  'ch8-01': {
    csharp: `public class Solution { public int[][] Reshape(int[][] matrix,int rows,int cols) {
if(rows*cols!=matrix.Length*matrix[0].Length){var copy=new int[matrix.Length][];for(int i=0;i<matrix.Length;i++)copy[i]=(int[])matrix[i].Clone();return copy;}
var result=new int[rows][];for(int r=0;r<rows;r++)result[r]=new int[cols];int offset=0;
foreach(var row in matrix)foreach(int value in row){result[offset/cols][offset%cols]=value;offset++;}return result; } }`,
    javascript: 'function Reshape(matrix,rows,cols){const flat=matrix.flat();if(flat.length!==rows*cols)return matrix.map(r=>[...r]);return Array.from({length:rows},(_,r)=>flat.slice(r*cols,(r+1)*cols));}',
  },
  'ch4-03': {
    csharp: 'public class Solution { public int DigitCount(int n){int count=0;do{count++;n/=10;}while(n>0);return count;} }',
    javascript: 'function DigitCount(n){return String(n).length;}',
  },
}

export const FAULTS = ['stop', 'hook-throw', 'compile-syntax', 'user', 'invalid-result', 'protocol', 'timeout', 'cancel', 'output'] as const
export type PilotFault = typeof FAULTS[number]
/** Fixed actual Node child for a TEST-ONLY transport fault. Not a VM escape or
 * altered production harness. Still launched under the real existing native Job. */
export const JS_TRANSPORT_FAULT = 'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("{malformed"));'
export function faultSource(language: PilotLanguage, fault: PilotFault): string {
  if (fault === 'stop' || fault === 'hook-throw' || fault === 'protocol' && language === 'javascript') return SOLUTIONS['ch2-04'][language]
  if (language === 'csharp') {
    const body = fault === 'compile-syntax' ? 'return new[]{a/};'
      : fault === 'user' ? 'throw new System.Exception("S5_USER");'
      : fault === 'invalid-result' ? 'return null!;'
      : fault === 'protocol' ? 'using var raw=System.Console.OpenStandardOutput();var bytes=System.Text.Encoding.UTF8.GetBytes("{malformed");raw.Write(bytes);raw.Flush();return new[]{a/b,a%b};'
      : fault === 'output' ? 'System.Console.Write(new string(\'x\',600000));return new[]{a/b,a%b};'
      : 'while(true){}'
    return `public class Solution { public int[] Divide(int a,int b){${body}} }`
  }
  return fault === 'compile-syntax' ? 'function Divide( {'
    : fault === 'user' ? 'function Divide(){throw Error("S5_USER");}'
    : fault === 'invalid-result' ? 'function Divide(){return undefined;}'
    : fault === 'output' ? 'function Divide(a,b){console.log("x".repeat(600000));return [Math.floor(a/b),a%b];}'
    : 'function Divide(){for(;;){}}'
}

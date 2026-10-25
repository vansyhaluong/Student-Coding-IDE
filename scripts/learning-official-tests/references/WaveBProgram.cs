// Fixed developer-only Wave B driver; no Runtime or arbitrary dispatch.
using System.Text.Json;
if(args.Length!=1)throw new InvalidOperationException("ARGUMENTS");
string input=Console.In.ReadToEnd();if(input.Length>1024*1024)throw new InvalidOperationException("INPUT_LIMIT");
using var doc=JsonDocument.Parse(input);if(doc.RootElement.GetArrayLength()>64)throw new InvalidOperationException("COUNT");
T Get<T>(JsonElement a,int i)=>a[i].Deserialize<T>()!;var outputs=new List<object>();
foreach(var a in doc.RootElement.EnumerateArray()){object result=args[0] switch {
"ch5-01" => WaveB.ch5_01.Solution.LastWordLength(Get<string>(a,0)),
"ch5-02" => WaveB.ch5_02.Solution.FindFirst(Get<string>(a,0),Get<string>(a,1)),
"ch5-04" => WaveB.ch5_04.Solution.ReverseWords(Get<string>(a,0)),
"ch5-05" => WaveB.ch5_05.Solution.LongestUnique(Get<string>(a,0)),
"ch5-06" => WaveB.ch5_06.Solution.Anagram(Get<string>(a,0),Get<string>(a,1)),
"ch5-08" => WaveB.ch5_08.Solution.EditDistance(Get<string>(a,0),Get<string>(a,1)),
"ch5-09" => WaveB.ch5_09.Solution.SubsequenceCount(Get<string>(a,0),Get<string>(a,1)),
"ch6-01" => WaveB.ch6_01.Solution.Absolute(Get<int>(a,0)),
"ch6-02" => WaveB.ch6_02.Solution.Power(Get<int>(a,0),Get<int>(a,1)),
"ch6-03" => WaveB.ch6_03.Solution.Minimum(Get<int>(a,0),Get<int>(a,1)),
"ch6-04" => WaveB.ch6_04.Solution.Lcm(Get<int>(a,0),Get<int>(a,1)),
"ch6-05" => WaveB.ch6_05.Solution.PalindromeNumber(Get<int>(a,0)),
"ch6-06" => WaveB.ch6_06.Solution.Divisors(Get<int>(a,0)),
"ch6-07" => WaveB.ch6_07.Solution.Choose(Get<int>(a,0),Get<int>(a,1)),
"ch6-08" => WaveB.ch6_08.Solution.DigitalRoot(Get<int>(a,0)),
"ch6-09" => WaveB.ch6_09.Solution.PrimesInRange(Get<int>(a,0),Get<int>(a,1)),
_=>throw new InvalidOperationException("UNKNOWN_ID")};outputs.Add(result);}
Console.Write(JsonSerializer.Serialize(outputs));

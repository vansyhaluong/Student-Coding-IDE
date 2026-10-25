// Fixed developer-only Wave C driver; no Runtime or arbitrary dispatch.
using System.Text.Json;
if(args.Length!=1)throw new InvalidOperationException("ARGUMENTS");
string input=Console.In.ReadToEnd();if(input.Length>1024*1024)throw new InvalidOperationException("INPUT_LIMIT");
using var doc=JsonDocument.Parse(input);if(doc.RootElement.GetArrayLength()>64)throw new InvalidOperationException("COUNT");
T Get<T>(JsonElement a,int i)=>a[i].Deserialize<T>()!;var outputs=new List<object>();
foreach(var a in doc.RootElement.EnumerateArray()){object result=args[0] switch {
"ch7-02" => WaveC.ch7_02.Solution.MaxProfit(Get<int[]>(a,0)),
"ch7-03" => WaveC.ch7_03.Solution.PlusOne(Get<int[]>(a,0)),
"ch7-04" => WaveC.ch7_04.Solution.MaxSubarray(Get<int[]>(a,0)),
"ch7-06" => WaveC.ch7_06.Solution.SearchRotated(Get<int[]>(a,0),Get<int>(a,1)),
"ch7-07" => WaveC.ch7_07.Solution.FirstMissingPositive(Get<int[]>(a,0)),
"ch7-08" => WaveC.ch7_08.Solution.TrappedWater(Get<int[]>(a,0)),
"ch7-09" => WaveC.ch7_09.Solution.Candy(Get<int[]>(a,0)),
_=>throw new InvalidOperationException("UNKNOWN_ID")};outputs.Add(result);}
Console.Write(JsonSerializer.Serialize(outputs));

// Fixed developer-only Wave D driver; no Runtime or arbitrary dispatch.
using System.Text.Json;
if(args.Length!=1)throw new InvalidOperationException("ARGUMENTS");
string input=Console.In.ReadToEnd();if(input.Length>1024*1024)throw new InvalidOperationException("INPUT_LIMIT");
using var doc=JsonDocument.Parse(input);if(doc.RootElement.GetArrayLength()>64)throw new InvalidOperationException("COUNT");
T Get<T>(JsonElement a,int i)=>a[i].Deserialize<T>()!;var outputs=new List<object>();
foreach(var a in doc.RootElement.EnumerateArray()){object result=args[0] switch {
"ch8-02" => WaveD.ch8_02.Solution.Transpose(Get<int[][]>(a,0)),
"ch8-03" => WaveD.ch8_03.Solution.DiagonalSum(Get<int[][]>(a,0)),
"ch8-04" => WaveD.ch8_04.Solution.Spiral(Get<int[][]>(a,0)),
"ch8-05" => WaveD.ch8_05.Solution.ZeroRowsCols(Get<int[][]>(a,0)),
"ch8-06" => WaveD.ch8_06.Solution.Rotate(Get<int[][]>(a,0)),
"ch8-07" => WaveD.ch8_07.Solution.MaxRectangle(Get<int[][]>(a,0)),
"ch8-09" => WaveD.ch8_09.Solution.MinimumHealth(Get<int[][]>(a,0)),
_=>throw new InvalidOperationException("UNKNOWN_ID")};outputs.Add(result);}
Console.Write(JsonSerializer.Serialize(outputs));

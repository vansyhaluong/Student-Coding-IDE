// Fixed developer-only Wave A driver; no Runtime or arbitrary dispatch.
using System.Text.Json;
if(args.Length!=1)throw new InvalidOperationException("ARGUMENTS");
string input=Console.In.ReadToEnd();if(input.Length>1024*1024)throw new InvalidOperationException("INPUT_LIMIT");
using var doc=JsonDocument.Parse(input);if(doc.RootElement.GetArrayLength()>64)throw new InvalidOperationException("COUNT");
T Get<T>(JsonElement a,int i)=>a[i].Deserialize<T>()!;var outputs=new List<object>();
foreach(var a in doc.RootElement.EnumerateArray()){object result=args[0] switch {
"ch2-01" => WaveA.ch2_01.Solution.Sum(Get<int>(a,0),Get<int>(a,1)),
"ch2-02" => WaveA.ch2_02.Solution.Perimeter(Get<int>(a,0),Get<int>(a,1)),
"ch2-03" => WaveA.ch2_03.Solution.Seconds(Get<int>(a,0)),
"ch2-05" => WaveA.ch2_05.Solution.DigitSum3(Get<int>(a,0)),
"ch2-06" => WaveA.ch2_06.Solution.Reverse3(Get<int>(a,0)),
"ch2-07" => WaveA.ch2_07.Solution.Clock(Get<int>(a,0),Get<int>(a,1)),
"ch2-08" => WaveA.ch2_08.Solution.Boxes(Get<int>(a,0),Get<int>(a,1)),
"ch2-09" => WaveA.ch2_09.Solution.ProgressionSum(Get<int>(a,0),Get<int>(a,1),Get<int>(a,2)),
"ch3-01" => WaveA.ch3_01.Solution.IsEven(Get<int>(a,0)),
"ch3-02" => WaveA.ch3_02.Solution.Sign(Get<int>(a,0)),
"ch3-03" => WaveA.ch3_03.Solution.Max3(Get<int>(a,0),Get<int>(a,1),Get<int>(a,2)),
"ch3-05" => WaveA.ch3_05.Solution.Triangle(Get<int>(a,0),Get<int>(a,1),Get<int>(a,2)),
"ch3-06" => WaveA.ch3_06.Solution.DaysInMonth(Get<int>(a,0),Get<int>(a,1)),
"ch3-07" => WaveA.ch3_07.Solution.Ticket(Get<int>(a,0),Get<bool>(a,1)),
"ch3-08" => WaveA.ch3_08.Solution.NextDate(Get<int>(a,0),Get<int>(a,1),Get<int>(a,2)),
"ch3-09" => WaveA.ch3_09.Solution.Bill(Get<int>(a,0)),
"ch4-01" => WaveA.ch4_01.Solution.SumToN(Get<int>(a,0)),
"ch4-02" => WaveA.ch4_02.Solution.Factorial(Get<int>(a,0)),
"ch4-03" => WaveA.ch4_03.Solution.DigitCount(Get<int>(a,0)),
"ch4-04" => WaveA.ch4_04.Solution.ReverseNumber(Get<int>(a,0)),
"ch4-05" => WaveA.ch4_05.Solution.Gcd(Get<int>(a,0),Get<int>(a,1)),
"ch4-06" => WaveA.ch4_06.Solution.IsPrime(Get<int>(a,0)),
"ch4-07" => WaveA.ch4_07.Solution.PrimeCount(Get<int>(a,0)),
"ch4-08" => WaveA.ch4_08.Solution.IsPerfect(Get<int>(a,0)),
_=>throw new InvalidOperationException("UNKNOWN_ID")};outputs.Add(result);}
Console.Write(JsonSerializer.Serialize(outputs));

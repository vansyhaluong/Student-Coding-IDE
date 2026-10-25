// Fixed developer-only driver. No solution text, command, path or assemblies from input.
using System.Text.Json;
if (args.Length != 1) throw new InvalidOperationException("ARGUMENTS");
string input = Console.In.ReadToEnd();
if (input.Length > 1024 * 1024) throw new InvalidOperationException("INPUT_LIMIT");
using var document = JsonDocument.Parse(input);
var batch = document.RootElement;
if (batch.GetArrayLength() > 64) throw new InvalidOperationException("COUNT");
var outputs = new List<object>();
T Get<T>(JsonElement a, int i) => a[i].Deserialize<T>()!;
foreach (var a in batch.EnumerateArray()) {
    object result = args[0] switch {
        "ch2-04" => Pilot.Ch2_04.Solution.Divide(Get<int>(a, 0), Get<int>(a, 1)),
        "ch3-04" => Pilot.Ch3_04.Solution.LeapYear(Get<int>(a, 0)),
        "ch4-09" => Pilot.Ch4_09.Solution.Fibonacci(Get<int>(a, 0)),
        "ch5-03" => Pilot.Ch5_03.Solution.CommonPrefix(Get<string[]>(a, 0)),
        "ch5-07" => Pilot.Ch5_07.Solution.MinWindow(Get<string>(a, 0), Get<string>(a, 1)),
        "ch7-01" => Pilot.Ch7_01.Solution.TwoSum(Get<int[]>(a, 0), Get<int>(a, 1)),
        "ch7-05" => Pilot.Ch7_05.Solution.ProductExceptSelf(Get<int[]>(a, 0)),
        "ch8-01" => Pilot.Ch8_01.Solution.Reshape(Get<int[][]>(a, 0), Get<int>(a, 1), Get<int>(a, 2)),
        "ch8-08" => Pilot.Ch8_08.Solution.LongestPath(Get<int[][]>(a, 0)),
        _ => throw new InvalidOperationException("UNKNOWN_ID")
    };
    outputs.Add(result);
}
Console.Write(JsonSerializer.Serialize(outputs));

using System.Diagnostics;
using System.Text;
using System.Text.Json;

Console.InputEncoding = new UTF8Encoding(false);
Console.OutputEncoding = new UTF8Encoding(false);
var mode = args.FirstOrDefault() ?? "basic";
Console.WriteLine($"APP:{Environment.ProcessId}:{mode}");
switch (mode)
{
    case "basic":
        Console.WriteLine("stdout: Việt Nam 😀");
        Console.Error.WriteLine("stderr: evidence");
        Console.WriteLine("PROFILE:" + (Environment.GetEnvironmentVariable("GATE_PROFILE") ?? "absent"));
        Console.WriteLine("ARGS:" + JsonSerializer.Serialize(args.Skip(1).ToArray()));
        break;
    case "nonzero": return 23;
    case "read":
        Console.Write("Name: ");
        var name = Console.ReadLine();
        Console.WriteLine($"Hello {name}");
        while ((name = Console.ReadLine()) != null) Console.WriteLine("LINE:" + name);
        Console.WriteLine("EOF");
        break;
    case "wait":
    case "child":
        Console.WriteLine("WAITING");
        Thread.Sleep(60000);
        break;
    case "control":
        Console.WriteLine("WAITING");
        Thread.Sleep(600000);
        break;
    case "tree":
    case "root-first":
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true };
        if (Path.GetFileNameWithoutExtension(Environment.ProcessPath!).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
            start.ArgumentList.Add(System.Reflection.Assembly.GetExecutingAssembly().Location);
        start.ArgumentList.Add("child");
        using (var child = Process.Start(start)!)
        {
            Console.WriteLine($"CHILD:{child.Id}");
            if (mode == "tree") Thread.Sleep(60000);
        }
        break;
}
return 0;

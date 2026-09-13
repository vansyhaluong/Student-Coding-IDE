namespace SpikeApp;

public static class Greeter
{
    public static string Greet(string name, int count = 1)
        => string.Join(", ", Enumerable.Repeat($"Hello {name}", count));
}

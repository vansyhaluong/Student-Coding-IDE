// Trusted G0 probe only: compile this helper, NEVER the supplied fixture source.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

sealed class ParserProbe
{
    static JsonElement Field(JsonElement input, string key) => input.GetProperty(key);
    static string Text(JsonElement input, string key) => Field(input, key).GetString()!;
    static Exception Bad(string reason) => new InvalidOperationException(reason);
    static CompilationUnitSyntax Parse(string source)
    {
        var tree = CSharpSyntaxTree.ParseText(source, new CSharpParseOptions(LanguageVersion.CSharp14));
        if (tree.GetDiagnostics().Any(d => d.Severity == DiagnosticSeverity.Error)) throw Bad("SYNTAX");
        var root = tree.GetCompilationUnitRoot();
        if (root.DescendantTrivia(descendIntoTrivia: true).Any(t => t.GetStructure() is DirectiveTriviaSyntax)) throw Bad("UNSUPPORTED_GRAMMAR");
        return root;
    }
    static MethodDeclarationSyntax Entry(CompilationUnitSyntax root, JsonElement input)
    {
        // Narrow pilot grammar: exactly one non-generic top-level public Solution class.
        var classes = root.Members.OfType<ClassDeclarationSyntax>().ToArray();
        if (classes.Length != 1 || root.Members.Count != 1 || classes[0].Identifier.ValueText != "Solution"
            || classes[0].TypeParameterList != null || classes[0].BaseList != null
            || string.Join(" ", classes[0].Modifiers.Select(t => t.Text)) != "public") throw Bad("SIGNATURE");
        var matches = classes[0].Members.OfType<MethodDeclarationSyntax>()
            .Where(m => m.Identifier.ValueText == Text(input, "entry")).ToArray();
        if (matches.Length != 1) throw Bad("SIGNATURE");
        var method = matches[0]; var parameters = Field(input, "parameters").EnumerateArray().ToArray();
        if (method.Body == null || method.TypeParameterList != null || method.AttributeLists.Count != 0
            || string.Join(" ", method.Modifiers.Select(t => t.Text)) != "public"
            || method.ReturnType.ToString() != Text(input, "returnType")
            || method.ParameterList.Parameters.Count != parameters.Length) throw Bad("SIGNATURE");
        for (int i = 0; i < parameters.Length; ++i)
        {
            var p = method.ParameterList.Parameters[i];
            if (p.Identifier.ValueText != Text(parameters[i], "name") || p.Type?.ToString() != Text(parameters[i], "type")
                || p.Modifiers.Count != 0 || p.Default != null || p.AttributeLists.Count != 0) throw Bad("SIGNATURE");
        }
        return method;
    }
    static bool Target(MethodDeclarationSyntax entry, int start, int end)
    {
        if (entry.SpanStart == start && entry.Span.End == end) return true;
        if (start < entry.Body!.OpenBraceToken.Span.End || end > entry.Body.CloseBraceToken.SpanStart) return false;
        if (entry.Body.DescendantNodes().Any(n => n.SpanStart == start && n.Span.End == end
            && (n is ExpressionSyntax || n is StatementSyntax))) return true;
        foreach (var block in entry.Body.DescendantNodesAndSelf().OfType<BlockSyntax>())
        {
            var nodes = block.Statements.Where(s => s.SpanStart >= start && s.Span.End <= end).ToArray();
            if (nodes.Length > 0 && nodes[0].SpanStart == start && nodes[^1].Span.End == end) return true;
        }
        return false;
    }
    static string Shape(SyntaxNodeOrToken node, int start, int end)
    {
        if (node.Span.End <= start || node.SpanStart >= end) return JsonSerializer.Serialize(new object[] { node.RawKind, node.ToString() });
        if (node.SpanStart >= start && node.Span.End <= end) return "HOLE";
        var children = new System.Collections.Generic.List<string>();
        if (node.IsNode) foreach (var child in node.AsNode()!.ChildNodesAndTokens())
        {
            var next = Shape(child, start, end);
            if (next != "HOLE" || children.Count == 0 || children[^1] != "HOLE") children.Add(next);
        }
        return JsonSerializer.Serialize(new object[] { node.RawKind, children });
    }
    static bool Boundary(string source, int offset) => !(offset > 0 && offset < source.Length
        && (source[offset - 1] == '\r' && source[offset] == '\n'
            || char.IsHighSurrogate(source[offset - 1]) && char.IsLowSurrogate(source[offset])));
    static string Check(JsonElement input)
    {
        try
        {
            string source = Text(input, "source"), replacement = Text(input, "replacement");
            int start = Field(input, "start").GetInt32(), end = Field(input, "end").GetInt32();
            if (Encoding.UTF8.GetByteCount(source) > 16384 || start < 0 || end <= start || end > source.Length
                || !Boundary(source, start) || !Boundary(source, end)) throw Bad("RANGE");
            if (start == 0 && end == source.Length) throw Bad("WHOLE_FILE");
            var before = Parse(source); var oldEntry = Entry(before, input);
            if (!before.Members.OfType<ClassDeclarationSyntax>().Single().Members.OfType<MethodDeclarationSyntax>()
                .Any(m => m.Body != null && Target(m, start, end))) throw Bad("TARGET");
            string candidate = source[..start] + replacement + source[end..];
            var after = Parse(candidate); var newEntry = Entry(after, input);
            string Header(MethodDeclarationSyntax m) => string.Join("|", m.DescendantTokens().Where(t => t.Span.End <= m.Body!.OpenBraceToken.SpanStart).Select(t => t.Text));
            if (Header(oldEntry) != Header(newEntry)) throw Bad("SIGNATURE");
            if (Shape(before, start, end) != Shape(after, start, start + replacement.Length)) throw Bad("STRUCTURE");
            return "ACCEPT";
        }
        catch (InvalidOperationException e) when (new[] { "SYNTAX", "SIGNATURE", "TARGET", "RANGE", "WHOLE_FILE", "STRUCTURE", "UNSUPPORTED_GRAMMAR" }.Contains(e.Message)) { return e.Message; }
        catch { return "INTERNAL"; }
    }
    static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--hang") { Console.WriteLine("READY"); Console.Out.Flush(); Thread.Sleep(Timeout.Infinite); return 0; }
        using var memory = new MemoryStream(); var block = new byte[4096]; int read;
        using var stdin = Console.OpenStandardInput();
        while ((read = stdin.Read(block, 0, block.Length)) > 0) { if (memory.Length + read > 262144) return 2; memory.Write(block, 0, read); }
        using var document = JsonDocument.Parse(memory.ToArray(), new JsonDocumentOptions { MaxDepth = 12 });
        Console.WriteLine(JsonSerializer.Serialize(new { roslyn = typeof(CSharpSyntaxTree).Assembly.GetName().Version!.ToString(),
            results = document.RootElement.EnumerateArray().Select(input => new { id = Text(input, "id"), reason = Check(input) }).ToArray() }));
        return 0;
    }
}

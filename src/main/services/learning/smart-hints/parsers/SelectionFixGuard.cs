// App-owned parse-only helper. Only this trusted file is compiled at developer build time.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Runtime.Loader;
using System.Runtime.CompilerServices;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

static class Program
{
    static int Main(string[] args)
    {
        try
        {
            if (args.Length != 1 || !Path.IsPathFullyQualified(args[0])
                || new DirectoryInfo(args[0]).Parent?.Parent?.Name != "10.0.112") return 2;
            string roslyn = args[0];
            AssemblyLoadContext.Default.Resolving += (_, name) =>
                name.Name is "Microsoft.CodeAnalysis" or "Microsoft.CodeAnalysis.CSharp"
                    ? AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(roslyn, name.Name + ".dll")) : null;
            return Guard.Run();
        }
        catch { return 2; }
    }
}
static class Guard
{
    static Exception Bad(string reason) => new InvalidOperationException(reason);
    static string Text(JsonElement e, string field) => e.GetProperty(field).GetString()!;
    static readonly string[] Reasons = { "SYNTAX", "SIGNATURE", "TARGET", "WHOLE_FILE", "STRUCTURE", "UNSUPPORTED_GRAMMAR" };
    static string TypeName(string type) => type switch {
        "int32" => "int", "boolean" => "bool", "string" => "string", "int32[]" => "int[]",
        "string[]" => "string[]", "int32[][]" => "int[][]", _ => throw Bad("SIGNATURE") };
    static string Tokens(SyntaxNode node) => string.Join("|", node.DescendantTokens().Select(t => t.Text));
    static string TypeTokens(TypeSyntax type) => string.Concat(type.DescendantTokens().Select(t => t.Text));
    static bool OrdinaryType(TypeSyntax? type) => type != null && new[] { "int", "bool", "string", "int[]", "string[]", "int[][]", "void" }.Contains(TypeTokens(type));
    static CompilationUnitSyntax Parse(string source, int start = -1, int end = -1)
    {
        var tree = CSharpSyntaxTree.ParseText(source, new CSharpParseOptions(LanguageVersion.CSharp14));
        var root = tree.GetCompilationUnitRoot();
        bool SelectedMissingSemicolon(SyntaxToken t)
        {
            if (start < 0 || !t.IsMissing || !t.IsKind(SyntaxKind.SemicolonToken) || t.Parent is not StatementSyntax statement) return false;
            var first = statement.GetFirstToken(); var last = statement.GetLastToken();
            return first.SpanStart >= start && last.Span.End <= end && last.Span.Length > 0
                && t.SpanStart >= last.Span.End && string.IsNullOrWhiteSpace(source[last.Span.End..t.SpanStart]);
        }
        foreach (var d in tree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error))
        {
            var span = d.Location.SourceSpan;
            var semicolon = root.DescendantTokens().FirstOrDefault(t => SelectedMissingSemicolon(t) && d.Id == "CS1002" && t.SpanStart == span.Start);
            bool edgeSemicolon = semicolon.RawKind != 0;
            if (d.Id == "CS1002" && !edgeSemicolon) throw Bad("SYNTAX");
            if (start < 0 || !d.Location.IsInSource || (!edgeSemicolon && (span.Start < start || span.End > end))) throw Bad("SYNTAX");
            // A recoverable error must belong to a physical function body, not
            // its signature, a class boundary, or a parser-invented delimiter.
            if (!root.DescendantNodes().OfType<MethodDeclarationSyntax>().Any(m => m.Body != null
                && !m.Body.OpenBraceToken.IsMissing && !m.Body.CloseBraceToken.IsMissing
                && span.Start >= m.Body.OpenBraceToken.Span.End
                && (edgeSemicolon ? semicolon.Parent!.Ancestors().Contains(m.Body) : span.End <= m.Body.CloseBraceToken.SpanStart))) throw Bad("SYNTAX");
        }
        if (root.ContainsSkippedText || root.DescendantTokens().Any(t => t.IsMissing
            && (start < 0 || (t.SpanStart < start || t.SpanStart > end) && !SelectedMissingSemicolon(t)
                || t.IsKind(SyntaxKind.OpenBraceToken) || t.IsKind(SyntaxKind.CloseBraceToken)
                || t.Parent == null || !t.Parent.AncestorsAndSelf().Any(n => n is StatementSyntax or ExpressionSyntax
                    && n.GetFirstToken().Span.Length > 0 && n.SpanStart >= start && PhysicalEnd(n) <= end)))) throw Bad("SYNTAX");
        if (root.Externs.Count != 0 || root.AttributeLists.Count != 0
            || root.DescendantTrivia(descendIntoTrivia: true).Any(t => t.GetStructure() is DirectiveTriviaSyntax)) throw Bad("UNSUPPORTED_GRAMMAR");
        if (root.Usings.Any(u => u.Alias != null || u.StaticKeyword.RawKind != 0 || u.GlobalKeyword.RawKind != 0)) throw Bad("UNSUPPORTED_GRAMMAR");
        int count = 0;
        foreach (var n in root.DescendantNodesAndSelf())
        {
            if (++count > 20000 || n.Ancestors().Take(129).Count() > 128) throw Bad("UNSUPPORTED_GRAMMAR");
            if (n is GenericNameSyntax || n is ArrayRankSpecifierSyntax rank && rank.Sizes.Count != 1) throw Bad("UNSUPPORTED_GRAMMAR");
            bool allowed = n is CompilationUnitSyntax or UsingDirectiveSyntax or IdentifierNameSyntax or QualifiedNameSyntax
                or ClassDeclarationSyntax or MethodDeclarationSyntax or ParameterListSyntax or ParameterSyntax
                or PredefinedTypeSyntax or ArrayTypeSyntax or ArrayRankSpecifierSyntax or OmittedArraySizeExpressionSyntax
                or BlockSyntax or LocalDeclarationStatementSyntax or VariableDeclarationSyntax or VariableDeclaratorSyntax or EqualsValueClauseSyntax
                or ReturnStatementSyntax or ExpressionStatementSyntax or IfStatementSyntax or ElseClauseSyntax
                or ForStatementSyntax or ForEachStatementSyntax or WhileStatementSyntax or DoStatementSyntax
                or BreakStatementSyntax or ContinueStatementSyntax or EmptyStatementSyntax or ThrowStatementSyntax
                or TryStatementSyntax or CatchClauseSyntax or CatchDeclarationSyntax or CatchFilterClauseSyntax or FinallyClauseSyntax
                or SwitchStatementSyntax or SwitchSectionSyntax or CaseSwitchLabelSyntax or DefaultSwitchLabelSyntax
                or LiteralExpressionSyntax or ParenthesizedExpressionSyntax or BinaryExpressionSyntax or AssignmentExpressionSyntax
                or PrefixUnaryExpressionSyntax or PostfixUnaryExpressionSyntax or ConditionalExpressionSyntax
                or InvocationExpressionSyntax or MemberAccessExpressionSyntax or ElementAccessExpressionSyntax
                or ArgumentListSyntax or BracketedArgumentListSyntax or ArgumentSyntax
                or ArrayCreationExpressionSyntax or ImplicitArrayCreationExpressionSyntax or InitializerExpressionSyntax
                or ObjectCreationExpressionSyntax or CastExpressionSyntax
                or InterpolatedStringExpressionSyntax or InterpolatedStringTextSyntax or InterpolationSyntax
                or InterpolationAlignmentClauseSyntax or InterpolationFormatClauseSyntax;
            if (!allowed) throw Bad("UNSUPPORTED_GRAMMAR");
        }
        return root;
    }
    static MethodDeclarationSyntax[] Methods(CompilationUnitSyntax root, JsonElement signature)
    {
        if (root.Members.Count != 1 || root.Members[0] is not ClassDeclarationSyntax cls || cls.Identifier.ValueText != "Solution"
            || cls.TypeParameterList != null || cls.BaseList != null || cls.AttributeLists.Count != 0
            || string.Join(" ", cls.Modifiers.Select(t => t.Text)) != "public") throw Bad("SIGNATURE");
        var methods = cls.Members.OfType<MethodDeclarationSyntax>().ToArray();
        if (methods.Length != cls.Members.Count || methods.Select(m => m.Identifier.ValueText).Distinct().Count() != methods.Length) throw Bad("UNSUPPORTED_GRAMMAR");
        foreach (var m in methods)
        {
            string modifiers = string.Join(" ", m.Modifiers.Select(t => t.Text));
            if (m.Body == null || m.TypeParameterList != null || m.AttributeLists.Count != 0 || m.ConstraintClauses.Count != 0
                || !new[] { "public", "private", "public static", "private static" }.Contains(modifiers) || !OrdinaryType(m.ReturnType)
                || m.ParameterList.Parameters.Any(p => !OrdinaryType(p.Type) || p.Modifiers.Count != 0 || p.Default != null || p.AttributeLists.Count != 0)) throw Bad("UNSUPPORTED_GRAMMAR");
        }
        var matches = methods.Where(m => m.Identifier.ValueText == Text(signature, "functionName")).ToArray();
        var parameters = signature.GetProperty("parameters").EnumerateArray().ToArray();
        if (matches.Length != 1) throw Bad("SIGNATURE");
        var entry = matches[0];
        if (string.Join(" ", entry.Modifiers.Select(t => t.Text)) != "public" || TypeTokens(entry.ReturnType) != TypeName(Text(signature, "returnType"))
            || entry.ParameterList.Parameters.Count != parameters.Length) throw Bad("SIGNATURE");
        for (int i = 0; i < parameters.Length; ++i)
            if (entry.ParameterList.Parameters[i].Identifier.ValueText != Text(parameters[i], "name")
                || TypeTokens(entry.ParameterList.Parameters[i].Type!) != TypeName(Text(parameters[i], "type"))) throw Bad("SIGNATURE");
        return methods;
    }
    static bool Trivia(string text)
    {
        var trivia = SyntaxFactory.ParseLeadingTrivia(text);
        return trivia.FullSpan.Length == text.Length
            && trivia.All(t => !t.ContainsDiagnostics && (t.IsKind(SyntaxKind.WhitespaceTrivia) || t.IsKind(SyntaxKind.EndOfLineTrivia)
                || t.IsKind(SyntaxKind.SingleLineCommentTrivia) || t.IsKind(SyntaxKind.MultiLineCommentTrivia)
                || t.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia) || t.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia)));
    }
    sealed record Target(string Kind, MethodDeclarationSyntax Owner);
    // Recovery tokens have zero width and can be placed at the next physical
    // token. They must not extend a selected statement into an outside token.
    static int PhysicalEnd(SyntaxNode n) => n.GetLastToken().Span.End;
    static Target? Select(CompilationUnitSyntax root, MethodDeclarationSyntax[] methods, string source, int start, int end)
    {
        var tokens = root.DescendantTokens().Where(t => t.Span.Length > 0).ToArray();
        var inside = tokens.Where(t => t.SpanStart >= start && t.Span.End <= end).ToArray();
        if (tokens.Any(t => t.SpanStart < end && t.Span.End > start && (t.SpanStart < start || t.Span.End > end))) throw Bad("TARGET");
        if (inside.Length == 0) { if (!Trivia(source[start..end])) throw Bad("TARGET"); return null; }
        int a = inside[0].SpanStart, b = inside[^1].Span.End;
        if (!Trivia(source[start..a]) || !Trivia(source[b..end])) throw Bad("TARGET");
        foreach (var method in methods)
        {
            if (method.SpanStart == a && method.Span.End == b) return new Target("FUNCTION", method);
            if (start < method.Body!.OpenBraceToken.Span.End || end > method.Body.CloseBraceToken.SpanStart) continue;
            if (method.Body.DescendantNodes().Any(n => n.SpanStart == a && PhysicalEnd(n) == b && n is StatementSyntax)) return new Target("STATEMENTS", method);
            foreach (var block in method.Body.DescendantNodesAndSelf().OfType<BlockSyntax>())
            {
                var statements = block.Statements.Where(n => n.SpanStart >= a && PhysicalEnd(n) <= b).ToArray();
                if (statements.Length > 0 && statements[0].SpanStart == a && PhysicalEnd(statements[^1]) == b) return new Target("STATEMENTS", method);
            }
            if (method.Body.DescendantNodes().Any(n => n.SpanStart == a && n.Span.End == b && n is ExpressionSyntax)) return new Target("EXPRESSION", method);
        }
        return null;
    }
    static object? Shape(SyntaxNodeOrToken n, int start, int end)
    {
        int a = n.SpanStart, b = n.IsNode ? PhysicalEnd(n.AsNode()!) : n.Span.End;
        if (a >= start && b <= end && b > a) return null;
        if (b <= start || a >= end) return new object[] { n.RawKind, n.ToString() };
        return new object[] { n.RawKind, n.IsNode ? n.AsNode()!.ChildNodesAndTokens().Select(c => Shape(c, start, end)).Where(c => c != null).ToArray() : Array.Empty<object>() };
    }
    static string Header(MethodDeclarationSyntax m) => string.Join("|", m.DescendantTokens().Where(t => t.Span.End <= m.Body!.OpenBraceToken.SpanStart).Select(t => t.Text));
    static bool Boundary(string s, int n) => !(n > 0 && n < s.Length && (s[n - 1] == '\r' && s[n] == '\n' || char.IsHighSurrogate(s[n - 1]) && char.IsLowSurrogate(s[n])));
    static string Check(JsonElement input)
    {
        try
        {
            if (input.GetProperty("protocol").GetInt32() != 1) return "INTERNAL";
            string source = Text(input, "source"), phase = Text(input, "phase");
            int start = input.GetProperty("start").GetInt32(), end = input.GetProperty("end").GetInt32();
            if (Encoding.UTF8.GetByteCount(source) > 16384 || start < 0 || end <= start || end > source.Length || !Boundary(source, start) || !Boundary(source, end)) return "TARGET";
            if (start == 0 && end == source.Length) return "WHOLE_FILE";
            var signature = input.GetProperty("signature");
            var before = Parse(source, start, end); var methods = Methods(before, signature); var selected = Select(before, methods, source, start, end);
            if (selected == null) return "TARGET";
            if (phase == "PREFLIGHT") return "ACCEPT";
            if (phase != "POSTFLIGHT") return "INTERNAL";
            string candidate = Text(input, "candidate");
            if (Encoding.UTF8.GetByteCount(candidate) > 16384) return "TARGET";
            int nextEnd = candidate.Length - (source.Length - end);
            if (nextEnd < start || candidate[..start] != source[..start] || candidate[nextEnd..] != source[end..]) return "STRUCTURE";
            var after = Parse(candidate); var nextMethods = Methods(after, signature);
            var entry = methods.Single(m => m.Identifier.ValueText == Text(signature, "functionName"));
            var nextEntry = nextMethods.Single(m => m.Identifier.ValueText == Text(signature, "functionName"));
            if (Header(entry) != Header(nextEntry)) return "SIGNATURE";
            Target? next;
            try { next = Select(after, nextMethods, candidate, start, nextEnd); }
            catch (InvalidOperationException e) when (e.Message == "TARGET") { return "STRUCTURE"; }
            if (!(selected.Kind == "STATEMENTS" && Trivia(candidate[start..nextEnd]))
                && (next == null || selected.Kind != next.Kind || selected.Owner.Identifier.ValueText != next.Owner.Identifier.ValueText
                    || Header(selected.Owner) != Header(next.Owner))) return "STRUCTURE";
            return JsonSerializer.Serialize(Shape(before, start, end)) == JsonSerializer.Serialize(Shape(after, start, nextEnd)) ? "ACCEPT" : "STRUCTURE";
        }
        catch (InvalidOperationException e) when (Reasons.Contains(e.Message)) { return e.Message; }
        catch { return "INTERNAL"; }
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    public static int Run()
    {
        if (typeof(CSharpSyntaxTree).Assembly.GetName().Version!.ToString() != "5.0.0.0"
            || typeof(SyntaxTree).Assembly.GetName().Version!.ToString() != "5.0.0.0") return 2;
        using var memory = new MemoryStream(); using var stdin = Console.OpenStandardInput(); var block = new byte[4096]; int read;
        while ((read = stdin.Read(block, 0, block.Length)) > 0) { if (memory.Length + read > 262144) return 2; memory.Write(block, 0, read); }
        using var document = JsonDocument.Parse(memory.ToArray(), new JsonDocumentOptions { MaxDepth = 16 });
        string reason = document.RootElement.TryGetProperty("probe", out var probe) && probe.ValueKind == JsonValueKind.True ? "ACCEPT" : Check(document.RootElement);
        Console.WriteLine(JsonSerializer.Serialize(new { protocol = 1, version = "5.0.0.0", reason }));
        return 0;
    }
}

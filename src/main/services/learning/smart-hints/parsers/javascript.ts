import ts from 'typescript'
import { parentPort, workerData } from 'node:worker_threads'
import { FIX_PARSER_PROTOCOL, FIX_PARSER_TYPESCRIPT, isFixParserInput, type FixParserInput, type FixParserReason } from '../selection-fix-protocol'

// Parse-only, one bounded job per owned worker. No program/emit/eval/project APIs.
const allowed = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.SourceFile, ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.Parameter, ts.SyntaxKind.Block,
  ts.SyntaxKind.VariableStatement, ts.SyntaxKind.VariableDeclarationList, ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.ReturnStatement, ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement, ts.SyntaxKind.BreakStatement, ts.SyntaxKind.ContinueStatement, ts.SyntaxKind.EmptyStatement,
  ts.SyntaxKind.ThrowStatement, ts.SyntaxKind.TryStatement, ts.SyntaxKind.CatchClause, ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.CaseBlock, ts.SyntaxKind.CaseClause, ts.SyntaxKind.DefaultClause,
  ts.SyntaxKind.BinaryExpression, ts.SyntaxKind.PrefixUnaryExpression, ts.SyntaxKind.PostfixUnaryExpression,
  ts.SyntaxKind.ParenthesizedExpression, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.CallExpression,
  ts.SyntaxKind.PropertyAccessExpression, ts.SyntaxKind.ElementAccessExpression, ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ObjectLiteralExpression, ts.SyntaxKind.PropertyAssignment, ts.SyntaxKind.ShorthandPropertyAssignment,
  ts.SyntaxKind.TemplateExpression, ts.SyntaxKind.TemplateSpan,
])
const bad = (reason: FixParserReason): never => { throw reason }
function trivia(text: string): boolean {
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, text)
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (![ts.SyntaxKind.WhitespaceTrivia, ts.SyntaxKind.NewLineTrivia, ts.SyntaxKind.SingleLineCommentTrivia,
      ts.SyntaxKind.MultiLineCommentTrivia].includes(token) || scanner.isUnterminated()) return false
  }
  return true
}
function tokens(node: ts.Node, tree: ts.SourceFile): ts.Node[] {
  if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return []
  const children = node.getChildren(tree)
  return children.length ? children.flatMap(n => tokens(n, tree)) : node.end > node.getStart(tree) ? [node] : []
}
function parse(source: string, input: FixParserInput, recover = false) {
  const tree = ts.createSourceFile('selection.js', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  const diagnostics = (tree as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  if (!Array.isArray(diagnostics)) bad('SYNTAX')
  function selectedSemicolonOwner(position: number): boolean {
    let found = false
    function visit(n: ts.Node): void {
      if (ts.isStatement(n) && n.end <= position && n.end > n.getStart(tree)
        && !source.slice(n.end, position).trim() && n.getStart(tree) >= input.start && n.end <= input.end) found = true
      ts.forEachChild(n, visit)
    }
    visit(tree)
    return found
  }
  for (const d of diagnostics) {
    if (!recover || d.start === undefined || d.length === undefined || d.start < input.start
      || d.start + d.length > input.end) bad('SYNTAX')
    // A missing semicolon is reported on the *next* token. That token being
    // selected does not make an error in the preceding statement selectable.
    if (d.code === 1005 && d.messageText === "';' expected." && !selectedSemicolonOwner(d.start!)) bad('SYNTAX')
    // Keep recovery in a physically delimited top-level function body only.
    if (!tree.statements.filter(ts.isFunctionDeclaration).some(f => f.body
      && d.start! >= f.body.getStart(tree) + 1 && d.start! + d.length! <= f.body.end - 1
      && source[f.body.getStart(tree)] === '{' && source[f.body.end - 1] === '}')) bad('SYNTAX')
  }
  let nodes = 0
  function visit(node: ts.Node, depth: number): void {
    if (++nodes > 20000 || depth > 128) bad('UNSUPPORTED_GRAMMAR')
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
    if (node.kind !== ts.SyntaxKind.SourceFile && node.kind !== ts.SyntaxKind.EndOfFileToken && node.end === node.getStart(tree)) {
      let owner: ts.Node | undefined = node.parent
      while (owner && (!(ts.isExpression(owner) || ts.isStatement(owner)) || owner.getWidth(tree) === 0
        || owner.getStart(tree) < input.start || owner.end > input.end)) owner = owner.parent
      if (!recover || node.end < input.start || node.end > input.end || !owner) bad('SYNTAX')
    }
    if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword
      || node.kind === ts.SyntaxKind.RegularExpressionLiteral) bad('UNSUPPORTED_GRAMMAR')
    if (node.kind > ts.SyntaxKind.LastToken && !allowed.has(node.kind)) bad('UNSUPPORTED_GRAMMAR')
    if (ts.isFunctionDeclaration(node) && (node.parent !== tree || !node.name || !node.body || node.asteriskToken || node.modifiers?.length
      || node.type || node.typeParameters?.length || node.parameters.some(p => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken
        || p.type || p.questionToken || p.modifiers?.length))) bad('UNSUPPORTED_GRAMMAR')
    if (ts.isVariableDeclaration(node) && (!ts.isIdentifier(node.name) || node.type || node.exclamationToken)) bad('UNSUPPORTED_GRAMMAR')
    if (ts.isCallExpression(node) && node.typeArguments?.length) bad('UNSUPPORTED_GRAMMAR')
    if (ts.isIdentifier(node) && ['eval', 'Function', 'globalThis', 'window', 'self', 'require', 'exports', 'module'].includes(node.text)) bad('UNSUPPORTED_GRAMMAR')
    const written = (n: ts.Node): boolean => ts.isIdentifier(n) && n.text === input.signature.functionName
      || ts.isPropertyAccessExpression(n) && n.name.text === input.signature.functionName
      || ts.isElementAccessExpression(n) && !!n.argumentExpression && ts.isStringLiteral(n.argumentExpression) && n.argumentExpression.text === input.signature.functionName
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && written(node.left)
      || (ts.isForOfStatement(node) || ts.isForInStatement(node)) && written(node.initializer)
      || (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator) && written(node.operand)
      || ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === input.signature.functionName
      || ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === input.signature.functionName) bad('SIGNATURE')
    ts.forEachChild(node, child => { visit(child, depth + 1) })
  }
  visit(tree, 0)
  for (const node of tree.statements) if (!ts.isFunctionDeclaration(node) && !ts.isVariableStatement(node)
    && !(ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression))) bad('UNSUPPORTED_GRAMMAR')
  const functions = tree.statements.filter(ts.isFunctionDeclaration)
  for (const f of functions) {
    const body = f.body!, children = body.getChildren(tree)
    if (children[0]?.kind !== ts.SyntaxKind.OpenBraceToken || children[0].getWidth(tree) !== 1
      || children.at(-1)?.kind !== ts.SyntaxKind.CloseBraceToken || children.at(-1)!.getWidth(tree) !== 1) bad('SYNTAX')
  }
  if (new Set(functions.map(f => f.name!.text)).size !== functions.length) bad('SIGNATURE')
  const entries = functions.filter(f => f.name!.text === input.signature.functionName)
  if (entries.length !== 1 || entries[0].parameters.length !== input.signature.parameters.length
    || entries[0].parameters.some((p, i) => !ts.isIdentifier(p.name) || p.name.text !== input.signature.parameters[i].name)) bad('SIGNATURE')
  return { tree, functions, entry: entries[0] }
}
type Parsed = ReturnType<typeof parse>
function header(f: ts.FunctionDeclaration, tree: ts.SourceFile): string {
  return tokens(f, tree).filter(t => t.end <= f.body!.getStart(tree)).map(t => t.getText(tree)).join('|')
}
function normalized(parsed: Parsed, source: string, start: number, end: number) {
  const all = tokens(parsed.tree, parsed.tree), inside = all.filter(t => t.getStart(parsed.tree) >= start && t.end <= end)
  if (all.some(t => t.getStart(parsed.tree) < end && t.end > start && !inside.includes(t))) bad('TARGET')
  if (!inside.length) return trivia(source.slice(start, end)) ? undefined : bad('TARGET')
  const a = inside[0].getStart(parsed.tree), b = inside.at(-1)!.end
  if (!trivia(source.slice(start, a)) || !trivia(source.slice(b, end))) bad('TARGET')
  return { a, b }
}
function target(p: Parsed, source: string, start: number, end: number) {
  const range = normalized(p, source, start, end)
  if (!range) return undefined
  for (const f of p.functions) {
    if (f.getStart(p.tree) === range.a && f.end === range.b) return { kind: 'FUNCTION' as const, owner: f }
    if (start < f.body!.getStart(p.tree) + 1 || end > f.body!.end - 1) continue
    let kind: 'EXPRESSION' | 'STATEMENTS' | undefined
    function visit(n: ts.Node): void {
      if (n.getStart(p.tree) === range!.a && n.end === range!.b) {
        if (ts.isStatement(n)) kind = 'STATEMENTS'
        else if (!kind && ts.isExpression(n)) kind = 'EXPRESSION'
      }
      if (ts.isBlock(n)) {
        const statements = n.statements.filter(s => s.getStart(p.tree) >= range!.a && s.end <= range!.b)
        if (statements.length && statements[0].getStart(p.tree) === range!.a && statements.at(-1)!.end === range!.b) kind = 'STATEMENTS'
      }
      ts.forEachChild(n, visit)
    }
    visit(f.body!)
    if (kind) return { kind, owner: f }
  }
  return undefined
}
function shape(n: ts.Node, tree: ts.SourceFile, start: number, end: number): unknown {
  if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return null
  const children = n.getChildren(tree)
  // Lists can move from intersecting to outside an empty range after deletion.
  // Compare their children consistently instead of collapsing one side to text.
  if (n.kind === ts.SyntaxKind.SyntaxList) return [n.kind, children.map(c => shape(c, tree, start, end)).filter(c => c !== null)]
  const a = n.getStart(tree), b = n.end
  if (a >= start && b <= end && b > a) return null
  if (b <= start || a >= end) return [n.kind, n.getText(tree)]
  return [n.kind, children.map(c => shape(c, tree, start, end)).filter(c => c !== null)]
}
function check(input: FixParserInput): FixParserReason {
  try {
    const { source, start, end, candidate } = input
    if (start === 0 && end === source.length) return 'WHOLE_FILE'
    const before = parse(source, input, true), selected = target(before, source, start, end)
    if (!selected) return 'TARGET'
    if (before.tree.statements.length === 1 && selected.kind === 'FUNCTION') return 'WHOLE_FILE'
    if (input.phase === 'PREFLIGHT') return 'ACCEPT'
    const after = parse(candidate!, input), nextEnd = candidate!.length - (source.length - end)
    if (nextEnd < start || candidate!.slice(0, start) !== source.slice(0, start) || candidate!.slice(nextEnd) !== source.slice(end)) return 'STRUCTURE'
    if (header(before.entry, before.tree) !== header(after.entry, after.tree)) return 'SIGNATURE'
    let next: ReturnType<typeof target>
    try { next = target(after, candidate!, start, nextEnd) }
    catch (reason) { if (reason === 'TARGET') return 'STRUCTURE'; throw reason }
    if (selected.kind === 'STATEMENTS' && trivia(candidate!.slice(start, nextEnd))) {
      // Removing complete statements is supported. The surrounding AST must still match.
    } else if (!next || next.kind !== selected.kind || next.owner.name!.text !== selected.owner.name!.text
      || header(selected.owner, before.tree) !== header(next.owner, after.tree)) return 'STRUCTURE'
    return JSON.stringify(shape(before.tree, before.tree, start, end)) === JSON.stringify(shape(after.tree, after.tree, start, nextEnd)) ? 'ACCEPT' : 'STRUCTURE'
  } catch (reason) { return FIX_REASONS.has(reason) ? reason as FixParserReason : 'INTERNAL' }
}
const FIX_REASONS = new Set<unknown>(['SYNTAX', 'SIGNATURE', 'TARGET', 'WHOLE_FILE', 'STRUCTURE', 'UNSUPPORTED_GRAMMAR'])
if (parentPort) {
  parentPort.postMessage({ protocol: FIX_PARSER_PROTOCOL, ready: true, version: ts.version })
  const reason = ts.version !== FIX_PARSER_TYPESCRIPT ? 'INTERNAL' : workerData?.probe === true ? 'ACCEPT'
    : isFixParserInput(workerData) ? check(workerData) : 'INTERNAL'
  parentPort.postMessage({ protocol: FIX_PARSER_PROTOCOL, reason })
  parentPort.close()
}

import ts from 'typescript'
import type { HintParserInput, HintParserResult } from '../hint-context'

/** Exact existing scaffold policy, shared only with the Hint baseline parser. */
export const isJavascriptHintPlaceholder = (s: ts.Statement): boolean => ts.isEmptyStatement(s) || ts.isBlock(s) && s.statements.every(isJavascriptHintPlaceholder) || ts.isThrowStatement(s)
  && ts.isNewExpression(s.expression) && ts.isIdentifier(s.expression.expression) && s.expression.expression.text === 'Error'
  && !!s.expression.arguments && s.expression.arguments.length <= 1
  && s.expression.arguments.every(a => ts.isStringLiteral(a) && /^(?:not implemented[.!]?|todo(?::.*)?|chưa triển khai[.!]?)$/iu.test(a.text.trim()))

/** Parse-only classification. No checker, evaluation, module loading or source execution. */
export function javascriptHintContext(input: HintParserInput): HintParserResult {
  const parse = (source: string) => ts.createSourceFile('hint.js', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  const tokens = (node: ts.Node, tree: ts.SourceFile): string => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return ''
    const children = node.getChildren(tree)
    return children.length ? children.map(n => tokens(n, tree)).join('') : JSON.stringify([node.kind, node.getText(tree)])
  }
  const entry = (tree: ts.SourceFile) => {
    if ((tree as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length) return
    if (tree.statements.length !== 1 || !ts.isFunctionDeclaration(tree.statements[0])) return
    const f = tree.statements[0]
    if (!f.body || f.name?.text !== input.signature.functionName || f.modifiers?.length || f.asteriskToken
      || f.parameters.length !== input.signature.parameters.length || f.typeParameters || f.type
      || f.parameters.some((p, i) => !ts.isIdentifier(p.name) || p.name.text !== input.signature.parameters[i].name
        || p.initializer || p.dotDotDotToken || p.questionToken || p.type || p.modifiers?.length)) return
    return f
  }
  const placeholder = isJavascriptHintPlaceholder
  try {
    const starterTree = parse(input.starter), starter = entry(starterTree)
    // A starter with actual algorithmic statements is not proof of an empty template.
    if (!starter || !starter.body!.statements.every(placeholder)) return input.hint === 'VALIDATE' ? 'INVALID_HINT_CODE' : 'UNCERTAIN'
    const sourceTree = parse(input.source)
    if (input.hint === 'CLASSIFY' && !sourceTree.statements.length
      && !(sourceTree as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length) return 'NO_IMPLEMENTATION'
    if (input.hint === 'CLASSIFY') {
      // A signature alone cannot contain student logic. Compare parser tokens to
      // the trusted header, never infer progress from nonempty source text.
      const scan = (text: string) => {
        let failed = false
        const scanner = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, text, () => { failed = true })
        const result: string[] = []
        for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
          if (scanner.isUnterminated()) return undefined
          result.push(JSON.stringify([k, scanner.getTokenText()]))
        }
        return failed || scanner.isUnterminated() ? undefined : JSON.stringify(result)
      }
      const header = input.starter.slice(starter.getStart(starterTree), starter.body!.getStart(starterTree))
      if (scan(input.source) === scan(header) || scan(input.source) === scan(header + ';')) return 'NO_IMPLEMENTATION'
    }
    const current = entry(sourceTree)
    if (!current) return input.hint === 'VALIDATE' ? 'INVALID_HINT_CODE' : 'UNCERTAIN'
    if (input.hint === 'VALIDATE') {
      let unfinished = false
      const visit = (n: ts.Node): void => {
        if (ts.isThrowStatement(n) && placeholder(n)) unfinished = true
        ts.forEachChild(n, visit)
      }
      visit(current.body!)
      return !unfinished && current.body!.statements.some(s => !placeholder(s)) ? 'VALID_HINT_CODE' : 'INVALID_HINT_CODE'
    }
    if (tokens(current.body!, sourceTree) === tokens(starter.body!, starterTree)
      || current.body!.statements.every(placeholder)) return 'NO_IMPLEMENTATION'
    return 'HAS_IMPLEMENTATION'
  } catch { return input.hint === 'VALIDATE' ? 'INVALID_HINT_CODE' : 'UNCERTAIN' }
}

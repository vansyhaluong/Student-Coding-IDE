// G0 feasibility only. Not imported by production and not a complete SH-1 guard.
import ts from 'typescript'
import { parentPort, workerData } from 'node:worker_threads'
import { Buffer } from 'node:buffer'
import process from 'node:process'

function signature(source, input) {
  const tree = ts.createSourceFile('fixture.js', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  if (tree.parseDiagnostics.length) throw new Error('SYNTAX')
  let unsupported = false
  function visit(node) {
    if (node.type || node.typeParameters?.length || node.questionToken
      || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)
      || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) unsupported = true
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (unsupported) throw new Error('UNSUPPORTED_GRAMMAR')
  const entries = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === input.entry)
  if (entries.length !== 1) throw new Error('SIGNATURE')
  const entry = entries[0]
  if (!entry.body || entry.asteriskToken || entry.modifiers?.length || entry.parameters.length !== input.parameters.length
    || entry.parameters.some((p, i) => !ts.isIdentifier(p.name) || p.name.text !== input.parameters[i].name
      || p.dotDotDotToken || p.initializer)) throw new Error('SIGNATURE')
  const header = source.slice(entry.getStart(tree), entry.body.getStart(tree))
  return { tree, entry, header }
}

function shape(node, tree, start, end) {
  const a = node.getStart(tree), b = node.end
  if (b <= start || a >= end) return [node.kind, node.getText(tree)]
  if (a >= start && b <= end) return 'HOLE'
  const children = []
  for (const child of node.getChildren(tree)) {
    const item = shape(child, tree, start, end)
    if (item !== 'HOLE' || children.at(-1) !== 'HOLE') children.push(item)
  }
  return [node.kind, children]
}

function targetFunction(parsed, entry, start, end) {
  const { tree } = parsed
  if (!entry.body || entry.modifiers?.length || entry.asteriskToken
    || entry.parameters.some(p => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken)) return false
  const whole = entry.getStart(tree) === start && entry.end === end
  if (whole) return true
  if (start < entry.body.getStart(tree) + 1 || end > entry.body.end - 1) return false
  let exact = false
  function visit(node) {
    if (node.getStart(tree) === start && node.end === end && (ts.isExpression(node) || ts.isStatement(node))) exact = true
    if (ts.isBlock(node)) {
      const statements = node.statements.filter(s => s.getStart(tree) >= start && s.end <= end)
      if (statements.length && statements[0].getStart(tree) === start && statements.at(-1).end === end) exact = true
    }
    ts.forEachChild(node, visit)
  }
  visit(entry.body)
  return exact
}

function target(parsed, start, end) {
  return parsed.tree.statements.some(node => ts.isFunctionDeclaration(node) && targetFunction(parsed, node, start, end))
}

function boundary(text, offset) {
  const a = text.charCodeAt(offset - 1), b = text.charCodeAt(offset)
  return !(a === 13 && b === 10) && !(a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff)
}

function check(input) {
  try {
    const { source, start, end, replacement } = input
    if (Buffer.byteLength(source) > 16384 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end <= start || end > source.length || !boundary(source, start) || !boundary(source, end)) throw new Error('RANGE')
    if (start === 0 && end === source.length) throw new Error('WHOLE_FILE')
    const before = signature(source, input)
    if (before.tree.statements.length === 1 && before.entry.getStart(before.tree) === start && before.entry.end === end) throw new Error('WHOLE_FILE')
    if (!target(before, start, end)) throw new Error('TARGET')
    const candidate = source.slice(0, start) + replacement + source.slice(end)
    const after = signature(candidate, input)
    if (after.header !== before.header) throw new Error('SIGNATURE')
    const a = shape(before.tree, before.tree, start, end)
    const b = shape(after.tree, after.tree, start, start + replacement.length)
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('STRUCTURE')
    return 'ACCEPT'
  } catch (error) {
    return ['SYNTAX', 'UNSUPPORTED_GRAMMAR', 'SIGNATURE', 'RANGE', 'WHOLE_FILE', 'TARGET', 'STRUCTURE'].includes(error.message)
      ? error.message : 'INTERNAL'
  }
}

parentPort.postMessage({ ready: true, typescript: ts.version, node: process.versions.node, electron: process.versions.electron ?? null })
if (workerData?.hang) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
else parentPort.once('message', inputs => {
  parentPort.postMessage(inputs.map(input => ({ id: input.id, reason: check(input) })))
  parentPort.close()
})

/** Generate an isolated copy from the CURRENT production kernel, fail closed on drift. */
import ts from 'typescript'
export function prototypeSource(source, poolPath) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Prototype source anchor mismatch: ' + before.slice(0, 65))
    source = source.replace(before, after)
  }
  const tree = ts.createSourceFile('resolver.ts', source, ts.ScriptTarget.Latest, true)
  const edits = []
  const visit = node => {
    if (ts.isForOfStatement(node) && ts.isBlock(node.statement)) {
      const text = node.getText(tree), body = node.statement.getText(tree).slice(1, -1)
      if (text.startsWith('for (const [asset, description] of Object.entries(object(object(node).runtime)))')) {
        edits.push([node.getStart(tree), node.end, 'await prototype.ordered(Object.entries(object(object(node).runtime)), async ([asset, description]) => {' + body.replace('assemblies.set(assembly.name, assembly)', 'return assembly') + '}, assembly => { assemblies.set(assembly.name, assembly) })'])
      } else if (text.startsWith('for (const asset of Object.keys(object(object(node).runtime)))')) {
        edits.push([node.getStart(tree), node.end, 'await prototype.ordered(Object.keys(object(object(node).runtime)), async asset => {' + body.replace('local.set(assembly.name, assembly)', 'return assembly') + '}, assembly => { local.set(assembly.name, assembly) })'])
      } else if (text.startsWith('for (const tag of xml[2].matchAll(tags))')) {
        const callback = body.replace("if (item.Type !== 'Managed') continue", "if (item.Type !== 'Managed') return undefined")
          .replace(' || assemblies.has(assembly.name)', '')
          .replace('references.push(file); assemblies.set(assembly.name, assembly)', 'return { file, assembly }')
        edits.push([node.getStart(tree), node.end, 'await prototype.ordered(xml[2].matchAll(tags), async tag => {' + callback + '}, result => { if (result) { const { file, assembly } = result; if (assemblies.has(assembly.name)) throw new InvalidInstallation(); references.push(file); assemblies.set(assembly.name, assembly) } })'])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree); if (edits.length !== 3) throw Error('Expected exactly three independent asset loops')
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end)
  source = 'import { PrototypeVerifier } from ' + JSON.stringify(poolPath.replaceAll('\\', '/')) + '\n' + source
  replace('    const io = async <T>', '    const prototype = new PrototypeVerifier(check)\n    const io = async <T>')
  replace('      const data = await io(() => files.readFile(file, before))', '      await prototype.reserve(before.size)\n      const data = await io(() => files.readFile(file, before))')
  // Scope the sequential reads too; nested scopes inside a file task reuse its
  // reservation lifetime. No buffer proof is cached or released before parsing.
  source = source.replace(/pe\(await read\(([^\n]+?)\), (true|false)\)/g, 'await prototype.single(async () => pe(await read($1), $2))')
  replace("const sdkInfo = (await read(root, path.join(sdkDirectory, '.version'))).toString('utf8').trim().split(/\\r?\\n/)", "const sdkInfo = await prototype.single(async () => (await read(root, path.join(sdkDirectory, '.version'))).toString('utf8').trim().split(/\\r?\\n/))")
  replace("const manifest = (await read(root, path.join(packDirectory, 'data', 'FrameworkList.xml'))).toString('utf8')", "const manifest = await prototype.single(async () => (await read(root, path.join(packDirectory, 'data', 'FrameworkList.xml'))).toString('utf8'))")
  replace('const json = async (root: string, file: string): Promise<Record<string, unknown>> => {', 'const json = async (root: string, file: string): Promise<Record<string, unknown>> => prototype.single(async () => {')
  replace("catch { throw new InvalidInstallation() }\n    }\n    const list", "catch { throw new InvalidInstallation() }\n    })\n    const list")
  // Capture proof at final settlement; all scopes/handles must already be gone.
  replace("      if (error instanceof DomainError) throw error", "      if (error instanceof DomainError) throw error")
  const tail = source.lastIndexOf('\n    }\n  }\n}')
  if (tail < 0) throw Error('Resolver finalization anchor mismatch')
  source = source.slice(0, tail) + source.slice(tail).replace('\n    }\n  }\n}', '\n    } finally {\n      globalThis.__sdkPrototypeMetrics?.push({ ...prototype.metrics })\n    }\n  }\n}')
  return source
}

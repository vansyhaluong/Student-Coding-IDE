// Read-only tokenization: never creates a Monaco model or executes a sample.
export async function highlightCsharp(code: string) {
  const { monaco } = await import('../editor/monaco')
  // colorize loads Monaco's existing lazy C# tokenizer. Its HTML is not inserted.
  await monaco.editor.colorize(code, 'csharp', {})
  return monaco.editor.tokenize(code, 'csharp')
}

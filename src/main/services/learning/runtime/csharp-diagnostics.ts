import type { CsharpCompilerDiagnostic } from '../../../../shared/contracts/csharp-execution'

/** Presentation is codes and aliases only; never messages, paths, source text or stack. */
export class CsharpDiagnostics {
  readonly diagnostics: CsharpCompilerDiagnostic[] = []
  private readonly pending = { stdout: '', stderr: '' }
  private readonly discard = { stdout: false, stderr: false }
  private readonly presentation = { stdout: '', stderr: '' }
  sourceError = false
  infrastructureError = false
  truncated = false
  constructor(private readonly solution: string, private readonly harness: string) {}
  write(stream: 'stdout' | 'stderr', text: string): void {
    // Bound even a single compiler line with no newline. Input itself is streamed.
    for (const character of text) {
      if (character === '\n') {
        if (!this.discard[stream]) this.line(stream, this.pending[stream].replace(/\r$/, ''))
        this.pending[stream] = ''; this.discard[stream] = false
      } else if (!this.discard[stream]) {
        if (this.pending[stream].length >= 16_384) { this.pending[stream] = ''; this.discard[stream] = true; this.truncated = true }
        else this.pending[stream] += character
      }
    }
  }
  finish(): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      if (!this.discard[stream] && this.pending[stream]) this.line(stream, this.pending[stream])
      this.pending[stream] = ''; this.discard[stream] = false
    }
  }
  private line(stream: 'stdout' | 'stderr', line: string): void {
    const location = /^(.*?)\((\d+),(\d+)(?:,\d+,\d+)?\):\s*(error|warning) (CS\d{4,5}):/.exec(line)
    const global = /^(?:.*?:\s*)?(error|warning) (CS\d{4,5}):/.exec(line)
    if (!location && !global) return
    let source: CsharpCompilerDiagnostic['source'] = 'compiler', row: number | null = null, column: number | null = null
    if (location) {
      const file = location[1].replace(/^"|"$/g, '').replace(/\//g, '\\').toLowerCase()
      if ([this.solution.toLowerCase().replace(/\//g, '\\'), 'solution.cs'].includes(file)) source = 'solution'
      if ([this.harness.toLowerCase().replace(/\//g, '\\'), 'harness.cs'].includes(file)) source = 'harness'
      if (source !== 'compiler') { row = Number(location[2]); column = Number(location[3]) }
      if (row !== null && (!Number.isSafeInteger(row) || row < 1 || !Number.isSafeInteger(column) || column! < 1)) { row = column = null; source = 'compiler' }
    }
    const severity = (location?.[4] ?? global![1]) as 'error' | 'warning', code = location?.[5] ?? global![2]
    // Harness failures are user signature errors only for explicit binding/accessibility diagnostics.
    const binding = ['CS0246', 'CS0400', 'CS0305', 'CS0144', 'CS0117', 'CS1061', 'CS0122', 'CS0123', 'CS0176', 'CS0029', 'CS0407',
      'CS0050', 'CS0051', 'CS1501', 'CS1503', 'CS7036', 'CS0121', 'CS0452', 'CS0712', 'CS0721', 'CS0722', 'CS1729']
    const dependency = ['CS0006', 'CS0009', 'CS0012', 'CS0518', 'CS0656']
    if (severity === 'error') {
      if (!dependency.includes(code) && (source === 'solution' || source === 'harness' && binding.includes(code)
        || source === 'compiler' && ['CS8804', 'CS8802'].includes(code))) this.sourceError = true
      else this.infrastructureError = true
    }
    const diagnostic: CsharpCompilerDiagnostic = { code, severity, source, line: row, column }
    if (this.diagnostics.length >= 128) {
      this.truncated = true
      // Preserve an observed error even after a warning flood, as required by the result DTO.
      if (severity !== 'error' || this.diagnostics.some(d => d.severity === 'error')) return
      this.diagnostics[this.diagnostics.length - 1] = diagnostic
    } else this.diagnostics.push(diagnostic)
    this.presentation[stream] += `${source}${row === null ? '' : `(${row},${column})`}: ${severity} ${code}\n`
  }
  streams(): { stdout: string; stderr: string } {
    return { stdout: this.presentation.stdout, stderr: this.presentation.stderr }
  }
}

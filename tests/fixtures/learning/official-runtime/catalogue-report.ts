/** Read-only Main test evidence join. No execution, verdict or public entry. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { catalogue, frozen, checkFullReceipt, languages, sha } from './catalogue-evidence'
import { PILOT_IDS, SOLUTIONS } from './pilot-solutions'
import type { PilotReceipt } from './pilot-native'

const { ids, sources } = await catalogue()
const rows = await Promise.all(ids.flatMap(id => languages.map(async language => {
  const pilot = PILOT_IDS.find(p => p === id), origin = pilot ? 'S5' : 'S6'
  const path = `out/e3-${pilot ? 's5' : 's6'}/native/${id}-${language}-full.json`
  const code = pilot ? SOLUTIONS[pilot][language] : sources[id][language]
  const { identity, judge } = await frozen(id)
  let r: PilotReceipt | undefined, receiptHash: string | undefined
  let status: 'PASS' | 'FAIL' | 'SKIP' | 'UNVERIFIED' | 'NOT MEASURED', issue: string | undefined
  try {
    const raw = await readFile(path); receiptHash = sha(raw); r = JSON.parse(raw.toString()) as PilotReceipt
    if (r.assertion !== 'PASS') throw Error(r.assertionError ?? JSON.stringify(r))
    await checkFullReceipt(r, code); status = 'PASS'
  } catch (error) { status = r?.result ? 'FAIL' : 'UNVERIFIED'; issue = String(error) }
  const result = r?.result
  return { id, language, origin, status, issue, receipt: path, receiptHash, sourceSha256: sha(code), identity,
    caseCount: judge.cases.length, attempted: result?.cases.length ?? null,
    returned: result?.cases.filter(c => c.kind === 'RETURNED').length ?? null,
    suffix: result?.notRunCaseIndices ?? null, disposition: result?.disposition, endReason: result?.endReason, failure: result?.failure,
    environment: r?.environment, executionMs: r?.executionMs, elapsedMs: r?.elapsedMs, rawBytes: r?.rawBytes,
    resultBytes: result ? Buffer.byteLength(JSON.stringify(result)) : null,
    maxRequestBytes: r?.requests?.length ? Math.max(...r.requests.map(c => c.bytes)) : null,
    jobs: r?.jobs?.length ?? 0, barriers: r?.barriers,
    peakSampledJobCommitBytes: r?.jobs?.length ? Math.max(...r.jobs.map(j => j.peakJobCommitBytes)) : null,
    runtimePaths: [...new Set(r?.jobs?.flatMap(j => [j.executable, ...j.args.filter(a => a.endsWith('csc.dll'))]) ?? [])],
    phases: r?.phases, cleanup: result?.cleanup, ledger: r?.ledger,
  }
})))
const stats = (selected: typeof rows) => ({ operations: selected.length,
  statuses: Object.fromEntries(['PASS', 'FAIL', 'SKIP', 'UNVERIFIED', 'NOT MEASURED'].map(s => [s, selected.filter(r => r.status === s).length])),
  casesExpected: selected.reduce((n, r) => n + r.caseCount, 0), casesAttempted: selected.reduce((n, r) => n + (r.attempted ?? 0), 0),
  casesReturned: selected.reduce((n, r) => n + (r.returned ?? 0), 0), jobs: selected.reduce((n, r) => n + r.jobs, 0),
})
const extremes = languages.map(language => {
  const selected = rows.filter(r => r.language === language && r.status === 'PASS')
  return { language, maxOperationMs: Math.max(...selected.map(r => r.executionMs ?? 0)),
    maxRawBytes: Math.max(...selected.map(r => r.rawBytes ?? 0)), maxResultBytes: Math.max(...selected.map(r => r.resultBytes ?? 0)),
    maxRequestBytes: Math.max(...selected.map(r => r.maxRequestBytes ?? 0)),
    maxSampledJobCommitBytes: Math.max(...selected.map(r => r.peakSampledJobCommitBytes ?? 0)),
    phases: ['prepare', 'compile', 'execute'].map(phase => ({ phase,
      maxDurationMs: Math.max(...selected.flatMap(r => r.phases?.filter(p => p.phase === phase).map(p => p.durationMs ?? 0) ?? [])),
    })) }
})
const matrix = { generated: new Date().toISOString(), manifest: 7, total: stats(rows),
  fresh: stats(rows.filter(r => r.origin === 'S6')), reused: stats(rows.filter(r => r.origin === 'S5')), extremes, rows }
await mkdir('out/e3-s6', { recursive: true })
await writeFile('out/e3-s6/matrix.json', JSON.stringify(matrix, null, 2))
const markdown = ['| ID | Language | Origin | Status | Cases | Time ms | Raw bytes | Cleanup |', '|---|---|---|---|---:|---:|---:|---|',
  ...rows.map(r => `| ${r.id} | ${r.language === 'csharp' ? 'C#' : 'JavaScript'} | ${r.origin} | ${r.status} | ${r.attempted ?? '?'}/${r.caseCount} | ${r.executionMs === undefined ? 'UNVERIFIED' : Math.round(r.executionMs)} | ${r.rawBytes ?? 'UNVERIFIED'} | ${r.cleanup?.proof ?? 'UNVERIFIED'} |`)].join('\n') + '\n'
await writeFile('out/e3-s6/matrix.md', markdown)
console.log(JSON.stringify({ total: matrix.total, fresh: matrix.fresh, reused: matrix.reused, extremes, issues: rows.filter(r => r.status !== 'PASS') }, null, 2))
if (matrix.total.statuses.PASS !== 126) process.exitCode = 1

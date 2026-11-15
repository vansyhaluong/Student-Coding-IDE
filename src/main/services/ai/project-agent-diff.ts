import { PROJECT_AGENT_LIMITS as LIMITS } from '../../../shared/contracts/project-agent'
import type { ProjectAgentDiffLine } from '../../../shared/contracts/project-agent'

const CONTEXT = 3
const MAX_CELLS = 250_000

interface Row {
  type: ProjectAgentDiffLine['type']
  content: string
  oldLine?: number
  newLine?: number
}

/** Line diff for a File Diff. Large rewrites are capped so the chat payload stays bounded. */
export function diffProjectText(before: string, after: string): ProjectAgentDiffLine[] {
  const oldLines = splitLines(before)
  const newLines = splitLines(after)
  const rows = align(oldLines, newLines)
  const kept = withContext(rows)
  return cap(kept)
}

function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const lines = normalized.split('\n')
  if (normalized.endsWith('\n')) lines.pop()
  return lines
}

function align(oldLines: readonly string[], newLines: readonly string[]): Row[] {
  let start = 0
  const limit = Math.min(oldLines.length, newLines.length)
  while (start < limit && oldLines[start] === newLines[start]) start += 1
  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1
    newEnd -= 1
  }
  const middleOld = oldLines.slice(start, oldEnd)
  const middleNew = newLines.slice(start, newEnd)
  const edits = middleOld.length * middleNew.length > MAX_CELLS
    ? replaceEdits(middleOld, middleNew)
    : lcsEdits(middleOld, middleNew)
  const rows: Row[] = []
  let oldLine = 1
  let newLine = 1
  const pushEqual = (text: string) => {
    rows.push({ type: 'context', content: text, oldLine, newLine })
    oldLine += 1
    newLine += 1
  }
  for (const text of oldLines.slice(0, start)) pushEqual(text)
  for (const edit of edits) {
    if (edit.type === 'equal') pushEqual(edit.text)
    else if (edit.type === 'delete') {
      rows.push({ type: 'removed', content: edit.text, oldLine })
      oldLine += 1
    } else {
      rows.push({ type: 'added', content: edit.text, newLine })
      newLine += 1
    }
  }
  for (const text of oldLines.slice(oldEnd)) pushEqual(text)
  return rows
}

function withContext(rows: readonly Row[]): Row[] {
  const keep = rows.map(() => false)
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.type === 'context') continue
    const from = Math.max(0, index - CONTEXT)
    const to = Math.min(rows.length - 1, index + CONTEXT)
    for (let cursor = from; cursor <= to; cursor += 1) keep[cursor] = true
  }
  return rows.filter((_, index) => keep[index])
}

function cap(rows: readonly Row[]): ProjectAgentDiffLine[] {
  const visible = rows.length > LIMITS.diffLines ? rows.slice(0, LIMITS.diffLines - 1) : rows
  const lines = visible.map((row, index) => toLine(`l${index}`, row))
  if (rows.length > LIMITS.diffLines) {
    lines.push({ id: 'truncated', type: 'context', content: 'The rest of this diff is hidden.' })
  }
  return lines
}

function toLine(id: string, row: Row): ProjectAgentDiffLine {
  const line: ProjectAgentDiffLine = { id, type: row.type, content: row.content }
  if (row.oldLine !== undefined) line.oldLine = row.oldLine
  if (row.newLine !== undefined) line.newLine = row.newLine
  return line
}

interface Edit {
  type: 'equal' | 'delete' | 'insert'
  text: string
}

function lcsEdits(before: readonly string[], after: readonly string[]): Edit[] {
  const width = after.length + 1
  const scores = new Uint32Array((before.length + 1) * width)
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      const index = row * width + column
      scores[index] = before[row] === after[column]
        ? (scores[index + width + 1] ?? 0) + 1
        : Math.max(scores[index + width] ?? 0, scores[index + 1] ?? 0)
    }
  }
  const edits: Edit[] = []
  let row = 0
  let column = 0
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      edits.push({ type: 'equal', text: before[row] ?? '' })
      row += 1
      column += 1
      continue
    }
    const down = scores[(row + 1) * width + column] ?? 0
    const right = scores[row * width + column + 1] ?? 0
    if (down >= right) {
      edits.push({ type: 'delete', text: before[row] ?? '' })
      row += 1
    } else {
      edits.push({ type: 'insert', text: after[column] ?? '' })
      column += 1
    }
  }
  while (row < before.length) {
    edits.push({ type: 'delete', text: before[row] ?? '' })
    row += 1
  }
  while (column < after.length) {
    edits.push({ type: 'insert', text: after[column] ?? '' })
    column += 1
  }
  return edits
}

function replaceEdits(before: readonly string[], after: readonly string[]): Edit[] {
  const removed = before.slice(0, LIMITS.diffLines)
  const added = after.slice(0, LIMITS.diffLines)
  return [
    ...removed.map((text) => ({ type: 'delete' as const, text })),
    ...added.map((text) => ({ type: 'insert' as const, text })),
  ]
}

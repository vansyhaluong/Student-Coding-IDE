import { TextDecoder } from 'node:util'
import {
  MAX_GIT_STATUS_ENTRIES,
  validateGitStatusEntry,
  type GitChange,
  type GitStatus,
  type GitStatusEntry,
} from '../../../shared/contracts'
import { DomainError } from '../../errors/app-error'

export const MAX_GIT_STATUS_TOKEN_BYTES = 128 * 1024

export interface ParsedGitStatus {
  readonly status: GitStatus
  readonly unborn: boolean
}

/** One NUL token at a time. The second rename path is part of the same entry. */
export class GitStatusParser {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true })
  private pending = ''
  private pendingBytes = 0
  private rename: { path: string; xy: string } | undefined
  private readonly entries: GitStatusEntry[] = []
  private readonly paths = new Set<string>()
  private readonly headers = new Set<string>()
  private unborn = false
  private bodyStarted = false
  private limited = false
  private finished = false

  /** true requests early process termination after a complete 1001st entry. */
  push(chunk: Uint8Array): boolean {
    if (this.finished) throw malformedStatus()
    if (this.limited) return true
    let start = 0
    for (let offset = 0; offset < chunk.length; offset += 1) {
      if (chunk[offset] !== 0) continue
      this.append(chunk.subarray(start, offset), false)
      const token = this.pending
      this.pending = ''
      this.pendingBytes = 0
      this.consume(token)
      if (this.limited) return true
      start = offset + 1
    }
    this.append(chunk.subarray(start), true)
    return false
  }

  finish(): ParsedGitStatus {
    if (this.finished || this.pendingBytes !== 0 || this.rename
      || !this.headers.has('branch.oid') || !this.headers.has('branch.head')) throw malformedStatus()
    this.finished = true
    return { status: { entries: this.entries, didHitLimit: this.limited }, unborn: this.unborn }
  }

  private append(bytes: Uint8Array, stream: boolean): void {
    this.pendingBytes += bytes.byteLength
    if (this.pendingBytes > MAX_GIT_STATUS_TOKEN_BYTES) throw malformedStatus()
    try {
      this.pending += this.decoder.decode(bytes, { stream })
    } catch {
      throw malformedStatus()
    }
  }

  private consume(token: string): void {
    if (this.rename) {
      const { path, xy } = this.rename
      this.rename = undefined
      this.accept({ path, staged: change(xy[0], token), unstaged: change(xy[1], token), untracked: false })
      return
    }
    if (token.startsWith('# ')) {
      if (this.bodyStarted) throw malformedStatus()
      const match = /^# (branch\.oid|branch\.head|branch\.upstream|branch\.ab) (.+)$/.exec(token)
      if (!match || this.headers.has(match[1])) throw malformedStatus()
      const [, name, value] = match
      if (name === 'branch.oid') {
        if (value !== '(initial)' && !isOid(value)) throw malformedStatus()
        this.unborn = value === '(initial)'
      } else if (name === 'branch.ab') {
        if (!/^\+\d+ -\d+$/.test(value)) throw malformedStatus()
      } else if (/\s/.test(value)) throw malformedStatus()
      this.headers.add(name)
      return
    }
    if (!this.headers.has('branch.oid') || !this.headers.has('branch.head')) throw malformedStatus()
    this.bodyStarted = true
    if (token.startsWith('? ')) {
      this.accept({ path: token.slice(2), staged: null, unstaged: null, untracked: true })
      return
    }
    const type = token[0]
    if (type !== '1' && type !== '2' && type !== 'u') throw malformedStatus()
    const fields = takeFields(token, type === '1' ? 8 : type === '2' ? 9 : 10)
    const [record, xy, sub] = fields
    if (record !== type || sub !== 'N...') throw malformedStatus()
    const modeEnd = type === 'u' ? 7 : 6
    for (let index = 3; index < modeEnd; index += 1) {
      if (!/^(000000|100644|100755|120000)$/.test(fields[index])) throw malformedStatus()
    }
    const oidEnd = type === 'u' ? 10 : 8
    for (let index = modeEnd; index < oidEnd; index += 1) {
      if (!isOid(fields[index]) || fields[index].length !== fields[modeEnd].length) throw malformedStatus()
    }
    const path = fields.at(-1)!
    if (type === 'u') {
      if (!['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(xy)) throw malformedStatus()
      this.accept({ path, staged: { kind: 'CONFLICTED' }, unstaged: { kind: 'CONFLICTED' }, untracked: false })
    } else {
      if (!/^[.MTADRC][.MTADRC]$/.test(xy) || xy === '..') throw malformedStatus()
      if (type === '2') {
        const score = /^([RC])(100|[0-9]{1,2})$/.exec(fields[8])
        if (!score || !xy.includes(score[1]) || /[RC]/g.test(xy.replace(score[1], ''))) throw malformedStatus()
        this.rename = { path, xy }
      } else {
        if (/[RC]/.test(xy)) throw malformedStatus()
        this.accept({ path, staged: change(xy[0]), unstaged: change(xy[1]), untracked: false })
      }
    }
  }

  private accept(entry: GitStatusEntry): void {
    const result = validateGitStatusEntry(entry)
    const identity = entry.path.toLocaleLowerCase('en-US')
    if (!result.ok || this.paths.has(identity)) throw malformedStatus()
    if (this.entries.length === MAX_GIT_STATUS_ENTRIES) {
      this.limited = true
      return
    }
    this.paths.add(identity)
    this.entries.push(result.value)
  }
}

function takeFields(token: string, count: number): string[] {
  const fields: string[] = []
  let start = 0
  for (let index = 0; index < count; index += 1) {
    const end = token.indexOf(' ', start)
    if (end <= start) throw malformedStatus()
    fields.push(token.slice(start, end))
    start = end + 1
  }
  fields.push(token.slice(start))
  return fields
}

function isOid(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)
}

function change(code: string, previousPath?: string): GitChange | null {
  switch (code) {
    case '.': return null
    case 'M': case 'T': return { kind: 'MODIFIED' }
    case 'A': return { kind: 'ADDED' }
    case 'D': return { kind: 'DELETED' }
    case 'R': case 'C':
      if (previousPath === undefined) throw malformedStatus()
      return { kind: code === 'R' ? 'RENAMED' : 'COPIED', previousPath }
    default: throw malformedStatus()
  }
}

export function malformedStatus(): DomainError {
  return new DomainError({
    code: 'PROCESS_FAILED', message: 'Git returned an invalid or unsupported status.',
    operation: 'git:get-status', retryable: false,
  })
}

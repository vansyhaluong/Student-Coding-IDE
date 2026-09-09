import { isGitBranchName, isGitCommitId, validateGitHistory, type GitHistoryItem } from '../../../shared/contracts'
import { DomainError } from '../../errors/app-error'

/** Fixed tformat + -z: four NUL-terminated fields per commit, no body. */
export function parseGitHistory(stdout: string, limit: number): readonly GitHistoryItem[] {
  if (stdout === '') return []
  if (!stdout.endsWith('\0')) throw malformedLocalGit()
  const fields = stdout.slice(0, -1).split('\0')
  if (fields.length % 4 !== 0 || fields.length / 4 > limit) throw malformedLocalGit()
  const items = []
  for (let i = 0; i < fields.length; i += 4) {
    items.push({ id: fields[i], subject: fields[i + 1], authorName: fields[i + 2], authoredAt: fields[i + 3] })
  }
  const result = validateGitHistory(items)
  if (!result.ok) throw malformedLocalGit()
  return result.value
}

/** for-each-ref supplies full local refs internally; IPC receives names only. */
export function parseGitLocalBranches(stdout: string): Map<string, string> {
  const branches = new Map<string, string>()
  if (stdout === '') return branches
  if (!stdout.endsWith('\n')) throw malformedLocalGit()
  for (const line of stdout.slice(0, -1).split('\n')) {
    const fields = line.split('\0')
    if (fields.length !== 4 || fields[3] !== '' || fields[2] !== 'commit'
      || !fields[0].startsWith('refs/heads/') || !isGitCommitId(fields[1])) throw malformedLocalGit()
    const name = fields[0].slice('refs/heads/'.length)
    if (!isGitBranchName(name) || branches.has(name)) throw malformedLocalGit()
    branches.set(name, fields[1])
  }
  return branches
}

export function malformedLocalGit(): DomainError {
  return new DomainError({ code: 'PROCESS_FAILED', message: 'Git returned an invalid local repository result.',
    details: { reason: 'malformed-output' }, retryable: false })
}

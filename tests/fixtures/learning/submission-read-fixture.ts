import * as fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { LearningStore } from '../../../src/main/services/learning/learning-store'
import { SubmissionStoreFiles, nodeStoreFilePort, type StoreFilePort } from '../../../src/main/services/learning/storage/store-files'
import { SharedSubmissionStoreLease } from '../../../src/main/services/learning/storage/store-lease'
import { SUBMISSION_STORE_POLICY as P, type SubmissionDocument, type SubmissionLanguage, type SubmissionRecord, type SubmissionStoreKind, type SubmissionValidation } from '../../../src/main/services/learning/storage/submission-contracts'
import { encodeSubmissionDocument, sealSubmissionDocument } from '../../../src/main/services/learning/storage/submission-validation'

export const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
export const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
const when = '2026-10-26T12:00:00.000Z'
export function unwrap<T>(v: SubmissionValidation<T>): T { if (!v.ok) throw Error(v.reason); return v.value }
export function record(kind: SubmissionStoreKind = 'ACCEPTED', options: {
  id?: string; submissionId?: string; exerciseId?: string; code?: string; language?: SubmissionLanguage;
  submittedAt?: string; packageVersion?: number; sourceRevision?: number;
} = {}): SubmissionRecord {
  const code = options.code ?? 'synthetic source\r\n'
  const capture = { schemaVersion: 1 as const, id: options.id ?? randomUUID(), submissionId: options.submissionId ?? randomUUID(),
    exerciseId: options.exerciseId ?? 'synthetic', language: options.language ?? 'javascript', code, sourceRevision: options.sourceRevision ?? 1,
    codeHash: hash(code), submittedAt: options.submittedAt ?? when, packageVersion: options.packageVersion ?? 1,
    signatureVersion: 1, signatureHash: hash('private-signature'),
    testSet: { id: 'private-official', version: 1, hash: hash('private-test-set') }, comparator: { id: 'exact-typed' as const, version: 1 as const } }
  return kind === 'ACCEPTED' ? { ...capture, result: 'Accepted', acceptedAt: when, cleanupProof: 'VERIFIED',
    testSet: { ...capture.testSet, total: 1, passed: 1 } } : { ...capture, verdict: 'WrongAnswer', gradedAt: when, recordedAt: when }
}
export function document(records: readonly SubmissionRecord[], prior?: SubmissionDocument): SubmissionDocument {
  const sequence = prior ? prior.commitSequence + 1 : records.length
  return unwrap(sealSubmissionDocument({ schemaVersion: 1, storeKind: 'result' in records[0] ? 'ACCEPTED' : 'FAILED',
    commitSequence: sequence, lastCommitId: randomUUID(), previousCommit: sequence === 1 ? null
      : { commitSequence: sequence - 1, commitId: prior?.lastCommitId ?? randomUUID(), digest: prior?.checksum ?? hash('synthetic predecessor') }, records }))
}
export const fault = (code = 'EACCES') => Object.assign(Error('private injected diagnostic must not escape'), { code })
export function sourceRequest(r: SubmissionRecord, offset = 0, limit?: number) {
  return { key: { storeKind: 'result' in r ? 'ACCEPTED' as const : 'FAILED' as const, recordId: r.id },
    submissionId: r.submissionId, sourceHash: r.codeHash, sourceRevision: r.sourceRevision, offset,
    ...(limit !== undefined ? { limit } : {}) }
}
export async function fixture(io: StoreFilePort = nodeStoreFilePort) {
  const root = await fs.mkdtemp(join(resolve(tmpdir()), 'student-submission-s4-'))
  const files = await SubmissionStoreFiles.open(root, io)
  await fs.writeFile(files.lockPath, '')
  let held = false, closeFault = false, closes = 0, acquisitions = 0
  const lease = new SharedSubmissionStoreLease(files, { capability: 'student-ide-learning-job-v1',
    acquireLease() { if (held) return null; held = true; acquisitions++; return {} },
    observation() { if (closeFault) throw fault('EIO'); held = false; closes++ } })
  const store = new LearningStore({ files, lease })
  return { root, files, lease, store, get closes() { return closes }, get acquisitions() { return acquisitions },
    set closeFault(value: boolean) { closeFault = value },
    path: (kind: SubmissionStoreKind, backup = false) => join(root, P[kind].filename + (backup ? '.bak' : '')),
    async write(doc: SubmissionDocument, backup = false) { await fs.writeFile(join(root, P[doc.storeKind].filename + (backup ? '.bak' : '')), unwrap(encodeSubmissionDocument(doc))) },
    async dispose() {
      await store.settleReads()
      if (held) throw Error('Test left owned lease unsettled')
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('student-submission-s4-')) throw Error('Fixture scope')
      await fs.rm(root, { recursive: true })
    } }
}
export type ReadFixture = Awaited<ReturnType<typeof fixture>>

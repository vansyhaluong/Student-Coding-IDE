import { createHash } from 'node:crypto'
import type { ExerciseSnapshot } from '../../../../shared/contracts/exercise'
import type { ExerciseType } from '../../../../shared/contracts/practice'
import type { PackagePublicSample } from '../../../../shared/contracts/exercise-package'
import { isSmartRunContext, smartBytes, smartExerciseValue } from '../../../../shared/contracts/smart-hints-validation'
import { SMART_HINT_POLICY as P, type SmartRunContext } from '../../../../shared/contracts/smart-hints'
import type { ValidatedPublicPackage } from '../content/exercise-package-contracts'

/** Main-private detached provenance. Only public sample assets, never Official plans. */
export interface PublicRunPackage {
  exerciseId: string; packageVersion: number; parameterTypes: ExerciseType[]; returnType: ExerciseType; samples: PackagePublicSample[]
}
export const sourceFingerprint = (source: string): string => createHash('sha256').update(source, 'utf8').digest('hex')
export function publicRunPackage(data: ValidatedPublicPackage): PublicRunPackage | undefined {
  const m = data.metadata
  if (data.samples.exerciseId !== m.exerciseId || data.samples.signatureVersion !== m.signature.version
    || data.samples.signatureHash !== m.signature.hash || !Number.isSafeInteger(m.packageVersion) || m.packageVersion < 1
    || !data.samples.samples.length || data.samples.samples.length > 16) return undefined
  const ids = new Set<string>()
  for (const s of data.samples.samples) {
    if (typeof s.id !== 'string' || !s.id.length || s.id.length > 128 || ids.has(s.id) || !Array.isArray(s.args)
      || s.args.length !== m.signature.parameters.length || !s.args.every((v, i) => smartExerciseValue(v, m.signature.parameters[i].type))
      || !smartExerciseValue(s.expected, m.signature.returnType)) return undefined
    ids.add(s.id)
  }
  const value: PublicRunPackage = { exerciseId: m.exerciseId, packageVersion: m.packageVersion,
    parameterTypes: m.signature.parameters.map(x => x.type), returnType: m.signature.returnType,
    samples: data.samples.samples.map(x => ({ id: x.id, args: x.args, expected: x.expected })) }
  if (smartBytes(value) > P.runBytes) return undefined
  return structuredClone(value)
}
export interface PublicRunReceipt {
  sessionId: string; generation: number; sequence: number; exerciseId: string; language: ExerciseSnapshot['language']
  sourceRevision: number; fingerprint: string; packageFingerprint: string; capturedAt: number; context: SmartRunContext
}
export function createPublicRunReceipt(fingerprint: string, snapshot: ExerciseSnapshot, pkg?: PublicRunPackage): PublicRunReceipt | undefined {
  const c = snapshot.cleanup
  if (!pkg || pkg.exerciseId !== snapshot.exerciseId || snapshot.phase !== 'finished' || c.state !== 'FINALIZED' || c.proof !== 'VERIFIED'
    || !c.cleanupComplete || !c.processClean || c.pendingIo || c.workspace !== 'REMOVED'
    || !['COMPLETED', 'COMPILATION_FAILED', 'RUNTIME_FAILED'].includes(snapshot.reason ?? '')) return undefined
  const payload = snapshot.language === 'csharp' ? snapshot.csharp : snapshot.javascript
  if (!payload || JSON.stringify(payload.schema.parameterTypes) !== JSON.stringify(pkg.parameterTypes)
    || payload.schema.returnType !== pkg.returnType || payload.schema.sampleCount !== pkg.samples.length) return undefined
  const r = payload.result, failure = r.failure?.kind ?? null
  if (failure !== null && !['COMPILE_ERROR', 'SYNTAX_ERROR', 'RUNTIME_ERROR'].includes(failure)) return undefined
  if (snapshot.reason === 'COMPLETED' && failure !== null || snapshot.reason === 'COMPILATION_FAILED' && !['COMPILE_ERROR', 'SYNTAX_ERROR'].includes(failure ?? '')
    || snapshot.reason === 'RUNTIME_FAILED' && failure !== 'RUNTIME_ERROR') return undefined
  const diagnostic = 'compile' in r ? r.compile?.diagnostics : r.syntax?.diagnostics
  const context: SmartRunContext = { kind: 'RUN_PUBLIC', parameterTypes: pkg.parameterTypes, returnType: pkg.returnType,
    observations: [], failure: failure as 'COMPILE_ERROR' | 'SYNTAX_ERROR' | 'RUNTIME_ERROR' | null,
    locations: (diagnostic ?? []).filter(d => d.source === 'solution' && d.line !== null && d.column !== null)
      .slice(0, 16).map(d => ({ line: d.line!, column: d.column! })) }
  for (let i = 0; i < r.cases.length; i++) {
    const result = r.cases[i], sample = pkg.samples[i]
    if (!sample || result.caseIndex !== i) return undefined
    if (result.outcome === 'RETURNED' && result.actual !== null) context.observations.push({ evidenceId: `R${i + 1}`,
      sampleOrdinal: i + 1, input: sample.args, expected: sample.expected, actual: result.actual })
  }
  if (!isSmartRunContext(context)) return undefined
  return { sessionId: snapshot.sessionId, generation: snapshot.generation, sequence: snapshot.sequence,
    exerciseId: snapshot.exerciseId, language: snapshot.language, sourceRevision: snapshot.sourceRevision, fingerprint,
    packageFingerprint: sourceFingerprint(JSON.stringify(pkg)), capturedAt: Date.now(), context: structuredClone(context) }
}

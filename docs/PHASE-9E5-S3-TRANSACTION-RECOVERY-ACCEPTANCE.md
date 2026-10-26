# Phase 9E-5 / E5-S3 — Transaction & Recovery Acceptance

2026-10-26. **COMPLETE — PASS WITH LIMITATIONS — USER ACCEPTED** (tracking `COMPLETE`).
User formally accepts40 S3 PASS,28 S2 regression PASS/1 native live SKIP and scoped
typecheck/lint/diff PASS; atomic commit, idempotency, backup and controlled recovery
meet the accepted scope. All historical evidence, corrections and limitations below
remain unchanged; no full S3/S2/native rerun accompanies this acceptance.
S1/S2 remain COMPLETE — PASS WITH LIMITATIONS; Phase9E-5 IN_PROGRESS. S4 is separately
authorized and its current delivery is recorded in the [S4 packet](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md);
S5/S6 NOT_STARTED. Delivery-time pending/stop statements below are historical where
superseded by this formal acceptance. S4's selected directly affected façade
regressions are separate evidence, not a rewrite of this packet's original results.

## 1. Authorized scope and task-start review

- Package: E5-S3 only, under approved E5-D1–D6/P9-STORAGE/H1–H5 and accepted S1/S2.
- Goal: one-target atomic snapshot append, immutable idempotency, retained unknown
  reconciliation and classified primary/backup recovery. No new decision resolved.
- Architecture: Main-private store, fixed paths and checked files, one shared lease;
  injected synchronous guard at replacement, without authenticating owners or
  issuing commit authority. Actual service ownership/publication belongs to S5.
- Verification: synthetic records, temporary directories, controlled I/O faults,
  scoped TypeScript/imported closure, targeted ESLint and whitespace checks only.
  S2 regression is directly relevant because its file/error helpers changed.
- Initial tree: existing modified map/decisions/master-plan/changelog and untracked
  E5 design/plan/S1/S2 docs, storage contracts/helpers and tests/lease peer preserved.
  Branch `feature/phase-9a-learning-mode`; no commit/push/merge or cleanup of user work.
- No service, Judge, Runtime/Core, Official asset, native binary, renderer, public
  Run, dependency, IPC/preload, completion/read-model, UI, History or E6/E7 work.

## 2. Files delivered or extended

| File | Actual responsibility |
|---|---|
| `src/main/services/learning/storage/snapshot-transaction.ts` | One retained transaction task, policy expiry/backoff/reserve/warnings, staged append/backup, guarded primary dispatch, verified saved state, explicit settlement and lease-authenticated recovery |
| `src/main/services/learning/learning-store.ts` | Main-private façade; one unsettled continuation at a time, same-ID join, immutable-payload/route conflict, no exercise queue or production wiring |
| `src/main/services/learning/storage/store-files.ts` | Checked free-space capability, orphan staging-name evidence scan and post-settlement replacement reconciliation; no new rename in reconciliation |
| `src/main/services/learning/storage/store-lease.ts` | Finite FULL/CONFLICT vocabulary and ENOSPC/EDQUOT classification; existing native lease lifecycle unchanged |
| `tests/main/submission-store.test.ts` |40 new controlled transaction/recovery tests, temporary roots and synthetic records only |
| This report, E5 plan/design, master plan, Codebase Map, thesis changelog | Current S3 evidence/status; prior S1/S2 evidence preserved |

S1 contracts/validation and S2 test/peer sources unchanged. Existing S2 files were
untracked before this task; ordinary tracked `git diff` does not show those source
changes, so new-file whitespace checks are also required.

## 3. Implemented protocol and evidence

1. Capture and validate a detached frozen record/target. Anchor monotonic expiry
   at the first continuation entry: Accepted15s/Failed10s. Caller `wait()` joins
   the original task and never cancels it or renews write authority. Slow state
   uses5s/3s policy values; default caller joins use15s/10s.
2. Acquire the existing shared family lease. Independently classify both stores.
   A healthy target tolerates an unavailable opposite store; readable opposite
   records detect cross-store ID conflicts. Same immutable record returns an
   existing verified commit; changed payload/target conflicts without rewrite.
3. Build a new canonical envelope preserving all records, sequence/UUID and
   predecessor digest. Enforce64MiB/32MiB snapshots and unchanged2MiB record /
   16KiB metadata validators; require free space >=2×candidate+16MiB. No prune,
   fallback target or capacity borrowing. Warning selection uses48/56MiB and24/28MiB.
4. Exclusive staging performs write/sync/close/checked byte read-back. Stage the
   verified previous primary separately and atomically replace backup before any
   primary admission. Backup faults prevent primary dispatch. No corrupt primary
   is copied over a good backup; unreadable/corrupt backup evidence is preserved.
5. Checked replacement rechecks target identity. Synchronous injected guard sees
   exact immutable binding/base/next; async/throwing guards refuse. Expiry is
   checked at dispatch, including after the guard. No await separates guard from
   rename dispatch; there is no unlink-first or copy-over-primary fallback.
6. `saved` requires checked canonical primary read-back matching the exact expected
   checksum/commit identity (therefore records, payload and lineage). Failure after
   admission, including lost ACK, yields `unknown` and retains exclusion. `settle()`
   first joins original I/O, then reconciles exact committed primary or proves
   previous primary plus an intact owned source stage. It never reruns the guard,
   appends or launches a competing rename. Unverifiable outcome remains unknown.
7. File handles/stages and native handle must settle before `settled=true` and
   façade reuse. Verified `saved` can coexist with retained close failure; retries
   then only settle resources. At most3 safe pre-admission attempts,250/1000ms
   backoffs within the original window. Admitted/ambiguous replacement is not retried.

Controlled tests demonstrate both targets, exact append/backup lineage, frozen
same-task retry, restart dedupe, changed-payload/route conflicts, reserve refusal,
actual encoded snapshot-full refusal, expiry across backoffs and delayed writes,
guard refusal/expiry, write/sync/close/stage-read failures, backup rename errors
before/after replacement, primary rename rejection before/after replacement,
read-back denial, lost ACK, delayed admitted rename beyond caller timeout, and
retained native-close failure. Assertions preserve old snapshots and count primary
dispatches/guard calls/lease releases to detect duplicate commit or premature release.

## 4. Recovery classification and preservation

Recovery authenticates the shared lease token. A valid primary is authoritative;
valid backup must be identical or its exact direct predecessor (including retained
record prefix). Equal-sequence differing documents/incoherent lineage conflict.
Missing differs from unavailable, corrupt, unsupported schema and oversized
read-only evidence. ENOSPC/EDQUOT and reserve/capacity exhaustion are FULL refusals.
If primary verifies but backup is corrupt/unsupported/unavailable, primary remains
the committed authority in READ_ONLY mode with explicit `backupAvailability`.
An exact existing-ID retry can still be saved; new append cannot overwrite backup
evidence. A focused regression proves both behaviors without primary mutation.

When primary is missing/corrupt and backup validates, recovery exposes only that
older committed document as `RECOVERED` with `POSSIBLE_DATA_LOSS`. **Automatic
primary repair is not performed. Mutation remains refused** until a separately
safe repair is available; original corrupt bytes and good backup stay intact.
Both-corrupt evidence is reported CORRUPT and preserved. Unsupported/unsafe/locked
copies are not treated as missing or overwritten. New empty state requires both
copies missing and a successful evidence scan with no orphan staging names.

Valid orphan staging beside old primary does not supersede primary. Orphan staging
without snapshots yields RECOVERY_PENDING, never a grade. There is no checkpoint
read, candidate replay, persisted operation journal or highest-temp-sequence guess.
Restart tests reopen files/lease/store objects over controlled disk states, including
saved-but-unacknowledged primary. They are simulated restart/recovery tests, not
actual process-kill, machine crash or power-loss trials.

## 5. Executed checks and history

| Check | Final result |
|---|---|
| New `submission-store.test.ts` | **40 PASS /0 FAIL /0 SKIP** |
| Directly affected S2 `submission-store-files.test.ts` | **18 PASS /0 FAIL /0 SKIP** |
| Directly affected S2 `submission-store-lease.test.ts` | **10 PASS /0 FAIL /1 SKIP** |
| Combined targeted run | **68 PASS /0 FAIL /1 SKIP**,3 files,14.91s; test duration is not a benchmark |
| Scoped TypeScript | PASS: `node node_modules/typescript/bin/tsc --noEmit -p out/e5-s3/tsconfig.json` |
| Targeted ESLint | PASS: façade, transaction, changed file/lease helpers and new test only |
| Tracked/new-file `git diff --check` | PASS; explicit changed paths and new files checked with `--no-index --check`; only LF→CRLF notices |

Final command: `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/submission-store.test.ts tests/main/submission-store-files.test.ts tests/main/submission-store-lease.test.ts --reporter=default --reporter=json --outputFile=out/e5-s3/targeted-results.json`.
Ignored `out/e5-s3/` contains scoped config and final JSON receipt. No production
build/config or native artifact was emitted. Native live S2 case was intentionally
not enabled (`LEARNING_SUBMISSION_STORE_LIVE` unset); its1 SKIP is not new native
evidence. The historical accepted S2 **29 PASS/0 FAIL/0 SKIP** live run remains
unchanged. Historical accepted S1 **81 PASS** remains unchanged, without rerun.

Initial command could not start because Windows restricted-token sandbox could
not enforce split writable roots; approved execution was used, without bypass.
Two early file reads used proposed names instead of actual `store-files.ts` /
`store-lease.ts`; corrected before edits. Initial scoped tsc found a literal-union
default inference for `wait(1)`; explicit numeric parameter fixed it. No test or
lint failure occurred. First targeted run60 PASS/1 SKIP; expanded run66 PASS/1 SKIP;
then67 PASS/1 SKIP; final40 new +28 regression PASS/1 SKIP is distinct coverage, not a sum
of repeated runs. Review also corrected refusal classification through byte-helper
error wrapping, unsafe opposite evidence-scan propagation, premature retry-time
`settled` visibility, and retained old snapshot/guard references before final checks.
Final review added verified-primary/corrupt-backup read-only authority and its
regression; all final scoped checks were rerun after this source change.

## 6. Limitations and unverified conditions

- New S3 tests use real temporary Windows filesystem operations with injected
  faults and simulated native handle/close behavior. No new native capability,
  cross-process transaction or native provenance certification; S2's accepted
  Windows native lease evidence is inherited only within its original scope.
- No actual crash/power-cut/directory-sync durability claim, antivirus/ACL/UNC/
  Windows10/11 matrix, installed/offline/release, long-run reliability or general
  filesystem atomicity certification. Sync plus read-back is a controlled protocol,
  not universal power-loss durability. Node TOCTOU/cooperative-lease limitations
  and lack of authentication/anti-rollback against local editing remain.
- Backup fallback preserves evidence and blocks mutation; no forensic quarantine,
  destructive reset or automatic repair/migration is introduced. Unsafe/missing
  owned-stage identity or persistent close failure can intentionally retain the
  lease and block reuse; settlement does not weaken the safety contract.
- Storage performance and Main responsiveness are NOT MEASURED. S1 canonical
  validation/encoding remains synchronous and bounded by policy sizes; no new
  worker topology is introduced. Warning emission and natural real-time15s/10s
  waits are not separately host-certified; expiry/backoff tests use an injected
  monotonic clock, and short caller waits test retained work.
- Façade retains immutable continuation receipts for its lifetime to prevent
  renewed expiry/authority on retry; no persisted retry queue or new service
  lifecycle. Long-session receipt memory is not measured. Settled transactions
  release base/next documents and guard/ACK closures.
- S5 must supply actual live owner/admission/publication authority, retain the
  exercise slot and wire shutdown joins. S4 reads/completion and S6 transport are
  absent. No production Submit commit is certified by these isolated tests.
- E4 remains COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope); current-artifact
  handoff NOT PASS, general native/current artifact/Official60s/target-host/release
  UNVERIFIED,12 models PENDING_RUNTIME and deferred gates unchanged.
- Full suite, repository typecheck/lint/build, native Judge/Runtime, UI smoke,
  benchmarks and unrelated phase tests were not run, as explicitly requested.

## 7. Task review and STOP — historical delivery-time status

**TASK REVIEW: PASS within controlled S3 scope, with the limitations above; user
acceptance pending.** Decisions resolved: NONE. Architecture deviations: NONE.
No blocker observed for the tested protocol; production durability/ownership and
the listed host/release cases remain UNVERIFIED, not silently passed.

**S1/S2 COMPLETE — PASS WITH LIMITATIONS. S3 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS). S4–S6 NOT_STARTED. Phase9E-5 IN_PROGRESS.**
Ready to begin S4: **NO — await user acceptance and separate authorization**.
STOP after E5-S3; no automatic S4/E6/E7 or Git publication.

# Phase 9E-5 — Submission Storage & Persistence Design

**Current S6 final review / S5 accepted — 2026-10-26:** User formally accepts S5
COMPLETE — PASS WITH LIMITATIONS (35 integration PASS/96 regression PASS/1 filtered/
scoped checks), preserving original evidence/failures/limitations. Only S6 authorized.
[Final packet](PHASE-9E5-FINAL-ACCEPTANCE.md):42 new S6 PASS/29 direct regression PASS/
0 FAIL/30 filtered, scoped checks. Safe shared contracts/Main ExerciseIpcService/
preload `learning.submission`, private projections/opaque read bindings and shared
Run/Submit transport ordering now exist; Run remains four-method/sample-only.
No storage/Judge/Runtime/Registry/native/Official/policy change, UI or new lifecycle.
**S1–S5 COMPLETE — PASS WITH LIMITATIONS; S6 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE; Phase9E-5 IN_PROGRESS — AWAITING FINAL ACCEPTANCE; E6/E7 NOT_STARTED.**
This supersedes earlier execution-status/unimplemented notes below, without
changing E5-D1–D6 or upgrading native/current-artifact/durability/performance/release
evidence. **STOP for S6/whole-phase acceptance and separate E6 authorization.**

**Current S5 delivery / S4 accepted — 2026-10-26:** User formally accepts S4
**COMPLETE — PASS WITH LIMITATIONS** (72 S4 PASS,3 focused regression PASS/scoped
checks); historical evidence/limitations preserved, no S4 rerun. Only S5 authorized.
[S5 packet](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md):35 new PASS/96 direct
regression PASS/0 FAIL/1 factory/probe filtered; scoped checks. Existing ExerciseService
now captures Submit before execute, selects current plan in owned Prepare and retains
the same operation through guarded commit/settlement and separate shutdown joins.
No changes to storage schema/semantics/policies, Judge/Runtime/Core/Registry/Official/
native or public Run behavior. Initial regressions and service-only fixes are recorded.
**S1–S4 COMPLETE — PASS WITH LIMITATIONS; S5 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
This supersedes earlier execution-status/unimplemented notes below without reopening
E5-D1–D6. Actual native/host/durability/public Submit transport certification remains
unverified as scoped. **STOP for S5 acceptance and separate S6 authorization.**

**Current S4 delivery / S3 accepted — 2026-10-26:** User formally accepts S3
**COMPLETE — PASS WITH LIMITATIONS** (40 S3 PASS,28 S2 regression PASS/1 native live
SKIP and scoped checks; history/limitations unchanged). Only S4 was newly authorized.
[S4 packet](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md):72 new PASS/0 FAIL/0 SKIP,
3 selected directly affected façade regression PASS, scoped checks. Verified
snapshot-derived history/cursors/source chunks and Accepted-only completion now
exist; completion does not probe Failed. No schema/transaction/recovery/policy
change, persisted progress/index, service/IPC/UI/native integration or new durability
claim. **S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; S4 REVIEW COMPLETED — AWAITING
USER ACCEPTANCE (tracking IN_PROGRESS); S5/S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
This supersedes earlier execution-status wording below, without changing E5-D1–D6.
**STOP for S4 user acceptance and separate S5 authorization.**

**Current S3 delivery — 2026-10-26:** E5-S3 only was authorized and implemented.
[S3 packet](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md):40 new PASS/28 affected
regression PASS/0 FAIL/1 native live SKIP; scoped checks. **S3 REVIEW COMPLETED —
AWAITING USER ACCEPTANCE (tracking IN_PROGRESS); S1/S2 COMPLETE — PASS WITH
LIMITATIONS; S4–S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.** This supersedes earlier
execution-status wording below, without changing approved E5-D1–D6 or policies.
Transaction/recovery now exists behind a Main-private façade with injected guard;
actual owner/service/publication wiring remains S5. Backup recovery returns a
verified older view/data-loss warning and refuses mutation, preserving evidence;
no automatic repair or temp promotion. Controlled reopen/fault tests are not
crash/power-loss/production durability certification. **STOP for user acceptance.**

2026-10-26. **DESIGN / SIX-STEP PLAN / E5-D1–D6 APPROVED by user. Phase9E-5 IN_PROGRESS; S1/S2 COMPLETE — PASS WITH LIMITATIONS.**
[S1](PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md) and [S2](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md) are formally user accepted. S1 retains81 PASS; S2 retains29 PASS/0 FAIL/0 SKIP, filesystem/lease/scoped checks, Windows contention/reacquisition and unchanged native hash; history/corrections/limitations unchanged, no rerun. S3–S6 NOT_STARTED and not authorized. Final S2 acceptance changes documentation only, with consistency/diff checks. Original execution notes below are historical where superseded; no transaction/recovery/release certification.

**S2 actual scope:** `store-files.ts` and `store-lease.ts` now implement checked byte primitives and one shared retained native lease. Fixture-only writes/replacements/discards and dedicated child lease tests use temporary roots; no real submission transaction/recovery, user data or service integration. S2 scoped verification is separately approved; native methods tested only acquireLease/close, no Job/Runtime/Judge. Current-artifact/overall native certification stays UNVERIFIED/NOT PASS as recorded for E4.

**Historical S1 verification amendment APPROVED:** targeted S1 tests/scoped TypeScript/imported closure/targeted ESLint/diff only, no full checks/build/native/filesystem/restart/smoke/benchmark work. S1 actual modules remain `storage/submission-contracts.ts` and `storage/submission-validation.ts`, unchanged in S2. File/lease primitives are now delivered by S2; transaction/read/service/IPC modules remain unimplemented. No real user-data writes or Saved/Completed results.

**FACT — baseline:** Phase9E-4 COMPLETE — PASS WITH LIMITATIONS, recorded-hash acceptance under Option A. [E4 final acceptance](PHASE-9E4-FINAL-ACCEPTANCE.md) Sections8–9 remains authoritative: current-artifact handoff NOT PASS; different current native binary UNVERIFIED; post-run Main index lacks full-app verification. Recorded4/4 native PASS is not current-artifact/release certification.12 performance models PENDING_RUNTIME; general Official60s/target-host/reliability/release UNVERIFIED; loader B1a/B1b, installed/offline/filesystem and other deferred gates unchanged. This survey does not reassess E4 acceptance or touch its receipts/hashes/drift audit.9E-6/7 implementation is not authorized.

Labels: **FACT** = source observation or explicitly approved policy, with references. **PROPOSED** = executable design/allocation needing approval. **UNVERIFIED** = no execution/durability/performance claim. A source observation is not a runtime test result.

## Tóm tắt bài toán

Preserve the exact code judged and the verified verdict while committing one immutable record to the approved Accepted or Failed snapshot. Keep the existing ExerciseService operation reserved until its storage work is safely settled or retained for reconciliation. Historical Judge eligibility is evidence, never a reusable write capability. Completion must follow committed Accepted records, independently of Failed history health and IPC acknowledgement.

## Mục tiêu và tiêu chí thành công

- Same source/source hash/revision/language and bound Official identity from admission through commit; no later draft read.
- One operation, one immutable submission ID/target, one retained transaction; no duplicate append on internal retry/lost ACK.
- Final synchronous owner/validity/expiry guard immediately dispatches primary replacement. Pre-admission invalidation prevents replacement; post-admission invalidation suppresses stale replies while the original I/O settles.
- Saved requires verified primary commit identity/content; unknown never becomes saved by timeout. Recovery reads committed records, never promotes a staged candidate or Runtime checkpoint to a grade.
- No Expected/hidden case data/private diagnostics/raw Judge evidence in records or history. Run and execution behavior remain unchanged.
- **UNVERIFIED:** these are future acceptance criteria, not achieved implementation outcomes.

## Thông tin đã biết

### 1. Authority, available documents and existing policies — FACT

All nine documents requested for this survey are present and were consulted. Relevant authority: [Requirements](REQUIREMENT.md) Section13 Learning/Submit/persistence; [Architecture](ARCHITECTURE.md) Learning persistence, Submission History and runtime boundaries; [Decisions](DECISIONS.md) ADR-025/9E0-A1–A4/B1–B3, P9-STORAGE, approved H1–H5 and E4-D4; [master plan](IMPLEMENTATION-PLAN.md) Section13.6/9E sequence; [baseline Judge/Submit design](PHASE-9E-JUDGE-SUBMIT-DESIGN.md) Sections9/11/16; E4 [design](PHASE-9E4-GENERIC-JUDGE-DESIGN.md), [plan](PHASE-9E4-IMPLEMENTATION-PLAN.md) and final acceptance; [Codebase Map](CODEBASE-MAP.md). Language capability boundaries in LANGUAGE-SUPPORT.md remain unchanged. Deleted older phase documents were not restored, reconstructed or investigated.

| Approved contract | Binding policy, not a new E5 choice |
|---|---|
| Storage topology | Learning-only versioned snapshot writer; Accepted and Failed are separate authoritative documents under shared store-family OS lease. One submission targets one store; no two-store transaction/global persisted history index |
| Accepted |64MiB encoded snapshot,2MiB encoded record,16KiB metadata; warnings48/56MiB; caller/shutdown wait15s, slow notice5s |
| Failed H1/H2 | `userData/learning/failed-submissions.json`;32MiB snapshot,2MiB record,16KiB metadata; warnings24/28MiB; wait10s, slow notice3s |
| Both stores | Free space at least2×candidate encoded bytes+16MiB; no version-count cap, automatic prune/truncate/overwrite or borrowing Accepted capacity. Preserve legacy oversized data read-only/recovery |
| Retry/authority | Max3 safe transient attempts total,250ms/1000ms backoffs within original precommit window; ambiguous outcome reconciles first; caller timeout retains task/I/O/lease |
| Eligibility | Final Accepted candidate or trusted WA/CompilationError/SyntaxError/RuntimeError/TLE/MLE/OLE candidate after VERIFIED complete cleanup/current owner. Trusted compile/syntax can have zero cases; infrastructure/protocol/invalidated/untrusted outcomes excluded |
| Committed reads | Default32/max100 summaries; row1KiB/response256KiB/cursor512bytes; source chunks32KiB UTF-8 plus encoded response bound. Generation-vector cursor; explicit partial availability |
| Completion | Only verified committed Accepted; earlier completion survives subsequent failure. Unreadable Accepted means unknown, not proven incomplete. Failed never creates completion |
| Execution | Existing single ExerciseService/Core/Registry/driver, deadlines/quotas/Policy B/native isolation unchanged; runtime cleanup wait12s is separate from storage waits |

Accepted performance targets remain p95≤5s/max≤10s; Failed p95≤3s/max≤7s at candidate0/8/24/32MiB; Main stalls p95≤50ms/max≤100ms; monitor Accepted snapshot>16MiB and review RSS delta>256MiB. All are **NOT MEASURED**. Physical peaks Accepted256MiB/Failed128MiB are analytical pre-forensic bounds, not disk reservation or measurements. No capacity/performance policy is reopened here.

### 2. Current Judge-to-storage handoff — FACT

| Actual source/symbol | Observation and reuse |
|---|---|
| [exercise-service.ts](../src/main/services/learning/exercise-service.ts), `runJudge`, `admit` | Main-private Judge admits through the same `active` slot as Run/Official. Validated request is captured/frozen for binding; Judge identity contains Main SHA256 over request code UTF-8, sourceRevision, language, owner-entry alias, session/generation and supplied plan identity |
| Same file, `isCurrent`, `currentJudge`, `observe`, `invalidate` | Owner-entry identity, owner acceptance/destruction, generation, sealed/invalidated state and documentEpoch guard navigation/leave/reload/owner loss; epoch also revokes idle receipts |
| Same file, `execute`, `cleanup`, `reduceJudge` | Driver settles; `executionDone=true`; Expected view revoked. Cleanup requires actual resource settlement and VERIFIED complete cleanup before content release; reducer uses actual task/borrow/release/owner facts. Reduction is synchronous before slot release |
| Same file, `cleanup` final block | After final reduction, `this.active = undefined` executes immediately. No storage continuation/task/commit-admission guard exists. A later `await handle.judgeResult(); store.save(...)` would run after slot release and is unsuitable |
| Same file, `retryCleanup`, `beginShutdown`, `stop` | Cleanup retries use the same op. Shutdown seals/invalidates and retries cleanup; `stop()` currently wraps recovery/cleanup in `waitForExerciseCleanup`12s. It cannot yet manage15s/10s post-runtime storage waits separately |
| [judge-contracts.ts](../src/main/services/learning/judge/judge-contracts.ts) | Candidate flags are mutually exclusive, not save authority. JudgeResult includes private decisions, suffix indices, cleanup/failure identity facts; it must not be spread/serialized into a submission record or public DTO |
| [judge-service.ts](../src/main/services/learning/judge-service.ts) | Existing operation-local comparator accumulator/reducer; no lifecycle. Reuse unchanged comparator/reducer/verdict semantics |
| [official-case-plan.ts](../src/main/services/learning/official-case-plan.ts) | `OfficialPlanIdentity` binds exercise/package/test-set/signature/comparator hashes/versions. `acquireOfficialCasePlan` validates actual package against expected identity in owned Prepare, with one Registry lease and existing cleanup/release |

**Additional FACT — trusted identity gap:** `runJudge` accepts a full identity from a trusted Main caller. The production Registry exposes `has/ids/readiness/acquire/acquirePublic`, not a public Submit selector returning complete Official identity. Manifest descriptors contain package version and asset hashes, not all test-set/signature fields. Production public Submit cannot supply its own plan or hardcode Divide identity from tests. Full Official acquisition must stay in owned Prepare. This requires a narrow binding/admission seam, not another package loader/Registry.

### 3. Existing storage capability inventory — FACT

| Category | Existing capability | Reuse/limit |
|---|---|---|
|1 — reusable | [index.ts](../src/main/index.ts) derives app-state, drafts and exercise-runtime roots from Electron `userData`; [practice-store.ts](../src/main/services/learning/practice-store.ts) stores independent exercise/language drafts | Reuse Main root composition and keep drafts independent. Never use Project roots/install folders or read mutable drafts for Submit |
|1 — reusable patterns | [persistence-service.ts](../src/main/services/persistence/persistence-service.ts), `updateWith` | Serialized updates, schema validation, clones, temp/backup/rename and in-memory update after write. Useful patterns/test injection only |
|2 — insufficient | Same service, `writeDocument/load/readCandidate/save` | No exclusive temp open/sync/read-back/checksum/commit lineage/OS writer lease/final owner guard; read errors collapse to invalid then backup/default. `save()` does not update `currentValue`. Unchanged reuse cannot meet the approved transaction or unavailable-versus-empty semantics |
|1/2 — reusable primitive, new wrapper needed | [windows-exercise-native.ts](../src/main/services/learning/runtime/windows-exercise-native.ts), `LearningNativeBinding.acquireLease/observation(close)`; [native source](../src/main/services/learning/runtime/native/learning-job.cpp), `acquireLease`; [windows-exercise-lease.ts](../src/main/services/learning/runtime/windows-exercise-lease.ts) | Existing native FILE_SHARE_NONE handle, OPEN_ALWAYS and OPEN_REPARSE_POINT; final directory/reparse rejected; sharing violation returns busy. Runtime wrapper validates session IDs and uses runtime leases directory, so do not repurpose it as store lease. Use same primitive through a new small Learning-store wrapper; no native change. Current binary behavior remains UNVERIFIED |
|1/2 — reusable patterns | [exercise-checkpoint.ts](../src/main/services/learning/runtime/exercise-checkpoint.ts), `FileExerciseCheckpointStore.write`; [exercise-workspace.ts](../src/main/services/learning/runtime/exercise-workspace.ts) | Exclusive `wx`, sync/close/rename/read-back, directory/identity checks and retained leases demonstrate patterns. Runtime checkpoint schema/recovery is process cleanup authority, never grade/commit authority. Do not edit Core or repurpose checkpoints |
|1/2 — containment patterns | [exercise-package-resources.ts](../src/main/services/learning/content/exercise-package-resources.ts), `ExerciseResourceRoot` | Read-only package identity/realpath/lstat/nlink/handle checks. Reuse design principles; class is asset/Registry-specific and not a user-data writer. Do not add another asset reader or widen it |
|2 — domain-specific | [csharp-workspace-store.ts](../src/main/services/language/csharp-workspace-store.ts) | Per-project validated ID and PersistenceService selection snapshots; no additional durable submission transaction/recovery capability |
|3 — absent in surveyed Learning domain | `learning-store.ts` is planned in CODEBASE-MAP but not present; no Accepted/Failed writer, submission schema/identity, store-family wrapper, crash/unknown reconciliation or committed completion store | Design/implement narrowly in E5 after approval. `PracticeState` has drafts/languages only; no authoritative durable completion to migrate |
|4 — outside E5 |9F quiz/chapter progress/last position/draft scheduling; E6 UI/Restore; Runtime checkpoint recovery; Project/Terminal/Run stores | Do not generalize or redesign these domains. E5 supplies committed history/completion reads for later consumers |

Existing tests `persistence-service.test.ts`, `practice-persistence.test.ts`, `exercise-workspace.test.ts`, `exercise-service.test.ts`, `generic-judge-service.test.ts`, `official-runtime-service.test.ts` and `exercise-ipc.test.ts` are relevant regression locations, not tests run in this survey.

**Documentation consistency:** CODEBASE-MAP's older Learning overview still says failed submissions are transient; older phase notes may say transport belonged to E4. These historical/lower-priority descriptions are superseded by approved H1–H5 and E4-D4. They do not reopen approved policy. No conflict among the current approved Accepted/Failed policies was found. Implementation must stop if evidence exposes a real normative conflict.

## Giả định

**UNVERIFIED filesystem assumptions:** application-created store paths remain inside a trusted, identity-checked userData Learning directory; storage is local Windows filesystem with supported atomic sibling replacement. UNC/reparse/unsupported-filesystem cases must fail safely or remain UNVERIFIED until explicitly evidenced; no general filesystem certification is assumed. Existing native lease ABI is reusable as source architecture only. If it cannot safely protect the store on a finalized binary, stop for review rather than add native primitives or a second writer.

## Câu hỏi quan trọng

E5-D1–D6 are now explicitly user APPROVED, including source Unicode, precommit expiry anchor, trusted Prepare identity selection and S6 transport allocation. No normative conflict was found during S1. Further policy/architecture changes require change control; every next step still needs separate authorization/acceptance.

## Các phương án

1. **APPROVED selection: Learning-only two-snapshot writer behind `learning-store.ts`.** Preserve approved topology and use existing validation/safe-I/O/lease patterns with an injectable narrow file port. Future transaction implementation adds logic only for Learning; leaves generic persistence unchanged. Snapshot writes remain O(total bytes), with bounded/cooperative work required and measured feasibility still unknown. No writer exists in S1.
2. **Alternative implementation: extend an injected PersistenceService port/wrapper.** Shares generic code, but current write/load contract cannot express guarded dispatch, classified unavailable state, retained unknown transactions, sync/read-back or family lease. Broad changes risk drafts/app-state consumers; acceptable only if a narrow adapter proves every invariant without changing shared behavior. Not selected for the proposed plan.

Per-record/index/journal, SQLite/new dependency, mixed Accepted/Failed document and independent store locks are not open alternatives: approved snapshot/H1/H4 topology already excludes them. Evidence demanding topology change must use change control, not an E5 implementation shortcut.

## So sánh trade-off

| Option | Scope/maintenance | Authority/recovery fit | Cost/risk |
|---|---|---|---|
| Learning-only writer | Small domain-owned modules; no shared consumer migration | Directly models approved one-target lineage, lease and synchronous service guard | Some deliberate domain I/O logic; snapshot encoding/read-back memory/stalls UNVERIFIED |
| Generic wrapper/extension | More shared surface and regressions | Requires material new port semantics before guarantees can hold | Less apparent duplication but greater risk of treating existing fallback as verified recovery |

## Giải pháp đề xuất

### 4. Module ownership and data flow — APPROVED design

Keep planned `src/main/services/learning/learning-store.ts` as the sole Learning storage façade, with small cohesive helpers under `learning/storage/`: `submission-contracts.ts`, `submission-validation.ts`, `store-files.ts`, `store-lease.ts`, `snapshot-transaction.ts`, `submission-read-model.ts`. The first four exist from S1/S2; façade/transaction/read modules remain planned, not actual. No generic storage framework, new dependencies, admission manager, queue of submissions, Runtime or Registry. Future store transaction task is owned by the existing service operation; the façade serializes file mutations/recovery, not exercise admission. S2 handles file/lease resources only, not service admission.

Flow: authorized Submit input → existing ExerciseService admission/captured source → current Official plan bound in existing owned Prepare → unchanged driver/Judge → existing VERIFIED cleanup/content release → sealed scalar eligibility → same op storage transaction → guarded replacement/read-back → committed read model → allowlisted Submit state. Drafts and Runtime checkpoints are separate throughout.

### 5. Immutable capture and persisted schemas — APPROVED / E5-D1

At successful Submit admission, Main issues cryptographic UUID `submissionId`, `recordId` and UTC ISO `submittedAt`, captures exact validated `code`, `sourceRevision`, language/exercise ID and computes codeHash with the existing Judge SHA256 UTF-8 convention. Deliberate Submit creates a new ID even for identical code. Validation rejection/busy does not create a historical submission. IDs do not derive filesystem paths. Store target is sealed once from final eligibility; no Renderer-provided target/grade/owner/cleanup facts.

Bind packageVersion, signatureVersion/hash, test-set ID/version/hash and comparator ID/version once from the actual trusted acquired package during Prepare. Verify source hash/revision/language/session/owner binding again against service-owned facts at handoff. Never fetch a current draft or newer package during commit. Pre-Prepare invalidation/no trusted plan cannot create a stored grade. Trusted compile/syntax errors after plan acquisition can create Failed records with zero attempted cases.

| Proposed field group | Persisted policy |
|---|---|
| Common immutable identity | Schema version, record UUID, submission UUID, exerciseId, language, exact code, sourceRevision, codeHash, submittedAt, packageVersion, signatureVersion/hash, test-set ID/version/hash, comparator ID/version |
| Accepted record | Baseline AcceptedRecord shape: `result: Accepted`, acceptedAt, test-set total/passed with passed=total>0, `cleanupProof: VERIFIED`. Code/identity immutable; no session/owner authority retained |
| Failed record | Separate FailedSubmissionRecord: gradedAt/recordedAt, exact approved graded verdict enum. No fabricated per-case rows/counts required for zero-case compiler failure. No completion flag |
| Document envelope | Separate Accepted/Failed schemaVersion; store-kind discriminator; commitSequence, lastCommitId, previous verified commit identity/digest (null for genesis), immutable records and checksum over deterministic encoding excluding checksum |
| Derived-only state | Completion, list indexes, availability and cursor generations are derived from committed snapshots, never another progress/index file |

Record allowlists reject extra keys, unsafe integers/versions, invalid IDs/hashes/timestamps, mismatched source hash, duplicate IDs, route/verdict inconsistency and malformed envelope/lineage. Metadata≤16KiB includes all encoded non-code fields; record≤2MiB and document limits use actual encoded UTF-8 bytes, including escaping/envelope/newline. Completion does not trust a user-edited `cleanupProof` string as live authority. A persisted checksum detects corruption, not malicious local tampering.

**Source encoding resolution — E5-D1 APPROVED:** current `validateExerciseDraft` bounds code by256Ki UTF-16 code units; it does not reject lone surrogates. Existing Judge hashes UTF-8, so hash alone cannot distinguish every malformed JS string. Submit-only contract requires well-formed Unicode, keeps the existing code-unit ceiling and independently enforces encoded record limits; no normalization/line-ending conversion. Run/drafts remain unchanged. S1 implements the pure source validator/hash and encoding only; actual Submit admission is later. No silent UTF-8 replacement or claim that revision/hash is ownership authority. Future recovery preserves unsupported legacy evidence rather than rewriting it.

Submission ID is the idempotency key. Stable target+recordId+exact immutable record bytes define the retry payload; document commit ID/sequence identifies each append transaction, not a new submission. Capture timestamps once, reuse them on retries. Same ID with differing source/metadata/verdict/route is conflict, even if a code hash matches. When both stores are readable, cross-store duplicate IDs are a conflict, never merged/overwritten. A healthy target commit does not require reading an unavailable other store; this is the approved H4 partial-availability trade-off. No new ID or route can be supplied to revive an old receipt.

### 6. Same-operation hold-through-commit — APPROVED / E5-D5, unimplemented

Extend the private Operation with an optional Submit capture and one retained storage task/stage/result. Preserve `kind: OFFICIAL` public-Run rejection; add an internal mode discriminator only where needed. Existing private `runJudge` evidence-only behavior remains available for E4 tests without automatically writing history. A proposed `submit` service entry admits through the same `admit` path and attaches storage intent **synchronously before** `execute` can reach a continuation; do not call `runJudge` and add storage afterward.

**Trusted plan selection seam:** extend `bindOfficialCasePlan`/acquisition with a Main-only current-package selection mode for Submit. Reuse the existing Registry `acquire` in owned Prepare; derive scalar identity from its anchored/validated metadata/judge, validate existing consistency/signature rules, then seal identity before Judge initialization/driver execution. Existing expected-identity `runJudge/runOfficial` path keeps its exact comparison. Split immutable source capture from once-bound plan fields; missing plan is never an eligible placeholder. No new pre-admission Official read, second lease/loader or language factory change. This is a new service/binding seam needing approval, not implemented fact.

Refactor the end of `cleanup` into idempotent same-op runtime settlement/final Judge reduction and optional storage continuation. Attach/create the one continuation while `active===op`, before any await or release. Concurrent `execute/cleanup/invalidate/retryCleanup/stop` callers join that task; none may clear the slot merely because Core is finalized. No circular wait: continuation consumes already sealed Judge facts; it does not await `op.completion`, which may itself await storage caller settlement.

| Existing operation stage, proposed storage substate | Ownership/release rule |
|---|---|
| Executing / runtime cleanup pending | Existing Core/Registry resources and operation retained; no store candidate yet |
| VERIFIED cleaned, content released, Judge final | Keep scalar capture/eligibility in the same op. Registry pin/Expected view stay released; no reacquisition during commit |
| Storage precommit pending | Keep active slot and exact task/lease. Recheck validity after every await and at final admission; runtime's close-aborted signal is not storage cancellation |
| Replacement admitted / verifying / unknown | Keep slot/task/lease and frozen record; post-admission owner loss prevents publication, not I/O settlement/reconciliation |
| Saved or known failed/cancelled, all I/O/staging/lease closes settled | Release active slot exactly once. A full Failed store is a known refusal, not permanent Run/Submit disablement |
| Unresolved task/handle/lease or unknown outcome | Retain slot/retry handle even after caller deadline; no replacement operation, rerun or blind write |

Final admission runs in the service-owned closure with the exact op/entry/session/generation/documentEpoch, `active===op`, current owner, not sealed/invalidated/expired, immutable capture/target match, candidate eligibility, VERIFIED resource/task/borrow/content release facts, owned store-family lease and matching expected committed base. Store must invoke this guard synchronously at the primary replacement site and dispatch rename in that same stack with no await/Promise scheduling/callback gap after approval. A copied `ownerCurrent=true` or serializable receipt is insufficient. No public callback/generic execution channel.

Cancellation before that dispatch prevents new primary replacement/completion, drains original staging I/O, and deletes only verified owned staging or retains it for recovery. After dispatch, no rollback promise: reconcile original commit. Preserve the verified Judge verdict and store state separately; owner loss removes authority for a not-yet-admitted write and suppresses stale UI replies. Do not rewrite reducer/verdict semantics to represent a storage error. If invalidation precedes final eligibility, existing Judge invalidation rules remain intact.

**Shutdown seam:** update ExerciseService `stop` to join existing runtime cleanup with12s wait and then only the active target's retained storage with15s Accepted/10s Failed wait; no outer12s wrapper around storage. `beginShutdown` seals new admissions/publication and invalidates precommit authority; admitted I/O still settles. Keep dependencies/native lease loader alive. In `index.ts`, place storage dependency before ExerciseService so managed reverse shutdown stops the service first; [DesktopApplication](../src/main/app/desktop-application.ts) already stops on a failed mandatory service cleanup and permits retry. Do not create a second submission lifecycle manager. Restart recovery has no live execution operation: shared store lease serializes verification of existing snapshots, without creating/reviving a Judge candidate.

### 7. Filesystem and lease boundary — APPROVED / E5-D2, S2 accepted COMPLETE — PASS WITH LIMITATIONS

Pin `userData/learning/accepted.json` (previously proposed filename) and the approved Failed path; choose fixed `userData/learning/submissions.lock` shared by both. Backups/staging names are fixed siblings or Main UUID siblings, not derived from Renderer input or persisted paths. No generic fs API. The Learning-only wrapper uses existing `acquireLease` and retains the strong handle until successful native close. OS sharing exclusion is authority; lock-file existence/PID/age is not. Never delete an allegedly stale lock or adopt a historical PID. Lease contention is typed busy/unavailable; retry is bounded/managed, not a queue of operations.

Validate trusted root/ancestors and recheck identity/realpath around I/O; reject symlink/junction/reparse changes and unexpected hardlinks/nonregular files, including lock/backup/temp/primary candidates. Exclusive sibling creation, handle/path identity checks, bounded reads, strict UTF-8/JSON/schema/checksum and fixed filenames prevent traversal and partial-file authority. Reuse existing directory helpers only where their guarantees suffice; add domain-specific file checks here without modifying Runtime helpers. A lease coordinates cooperative app instances; it does not secure the tree against a malicious local actor. Node path/handle checks retain TOCTOU limits. If required safe replacement cannot be established on a filesystem, report unavailable and preserve data; do not fall back to unlink-then-rename or copy-over-primary.

No full-tree recursive cleanup: staging cleanup requires ownership/name/identity checks under the lease. An orphan temp is never promoted, even if perfectly valid. Quarantine/preserve conflicting or corrupt evidence with unique names, without overwriting a prior forensic copy or good backup. Inaccessible/unsupported is not missing. First empty state is allowed only when never-existing primary/backup and no contradictory staging/recovery evidence can be established; otherwise recovery status remains explicit.

### 8. Transaction, atomicity and idempotency — APPROVED / E5-D3, execution unimplemented

1. On the live same-op eligible target, retain one task; acquire shared lease and validate latest committed target. Run classified recovery first. Verify matching ID/payload returns the existing record without rewriting; conflict stops. No external caller can create new authority by presenting an ID.
2. Freeze proposed record bytes/timestamps and expected base commit; validate target limits and disk reserve. No prune or truncation. Legacy over-capacity stays read-only/recovery; avoid unbounded read/parse and report unavailable/unsupported read-only status if safe bounded validation cannot complete. Never convert it to empty.
3. Deterministically encode/validate next document, increment safe commit sequence and create UUID commit ID with previous digest. Exclusive sibling staging → write → sync → close → read-back/schema/hash/identity verification. Bound/cooperate CPU work; reuse existing work/checkpoint principles rather than add Workers by default.
4. Preserve verified previous primary as verified backup via its own exclusive staging/sync/read-back/atomic backup replacement. Do not overwrite a good backup from an invalid primary. A backup failure prevents new primary commit. Retain old primary/base lineage and all prior records.
5. Recheck filesystem/base/lease and service guard; synchronously dispatch sibling primary replacement. This is commit admission, not the later acknowledgement. Rename success is the filesystem commit point. No delete-first workaround.
6. Read back primary with checked identity; verify exact commit ID/sequence/checksum/payload/lineage and the submission mapping. Only then update committed in-memory read model. Saved acknowledgement needs current publication authority; durable record remains even if ACK is lost or owner changes.
7. Close/settle all retained I/O and lease. On error after dispatch, classify outcome as unknown until serialized reconciliation proves saved or known not committed. Publish no new completion from an unknown transaction; retain slot/lease/recovery attempt. A confirmed saved record with a close failure stays committed but does not allow new operations until resource settlement.

**Proposed expiry detail:** target-specific precommit window starts at first entry to storage continuation (15s Accepted/10s Failed), includes lease/read/encode/staging/backoffs, and never resets on caller retry. This concretizes the approved B1 expiry/B2/H2 original-window rule and needs approval. It is independent of Core60s and runtime close signal. If expiry occurs before admission, drain original I/O then refuse replacement; if after admission, finish/reconcile original I/O. Each caller/shutdown attempt has its approved bounded wait; another wait joins retained work and cannot extend write authority. Slow notice5s/3s is informational. Only proven-safe transient, non-admitted failures may retry (max3 total); ambiguous dispatch is never retried as a fresh append. Backoffs consume original window.

Checksums/previous digest/backup identify consistency, not anti-rollback protection against local editing or proof of unseen latest writes. A valid primary is the commit authority; do not select the highest sequence temp. Flush/read-back is a verification protocol, **not universal power-loss/directory-sync durability certification**. Windows replace/AV/locked-file behavior and source-versus-current binary provenance require later authorized evidence.

### 9. Crash/recovery decisions — APPROVED design, execution unimplemented

| Observed state | Recovery/operation consequence |
|---|---|
| Crash during Judge/cleanup or after all-pass before admission | No grade reconstructed from Runtime checkpoint/receipt. Preserve existing committed records; explicit resubmit is new ID/new operation |
| Valid temp + old valid primary | Primary remains authoritative; temp is not proof of commit admission. Do not promote; safe owned staging disposal/quarantine only |
| Backup staged/replaced, primary still old | Old valid primary is authoritative; backup must match a coherent verified lineage, not force a new append |
| Primary has exact admitted ID/payload, ACK lost | One saved record; completion derives from Accepted on load. Internal same-ID join returns it; deliberate later Submit gets new ID |
| Primary exact known previous commit after a proven nonreplacement | No new saved/completion. Live op may retry only if non-admission/validity/window permits; restart does not retry a candidate |
| Outcome/lineage cannot be established, delayed original rename | Unknown/recovery pending; retain live task/lease/slot, do not launch competing rename or infer failure from a read racing pending I/O |
| Corrupt primary, verified coherent backup | Preserve corrupt bytes; recover older committed view with explicit recovered/data-loss warning, no claim the newest record survived. Any repair is verified under lease before future mutation |
| Locked/permission/unsupported schema/unsafe path | Unavailable/read-only status, no default/overwrite. Accepted unknown completion if unreadable; preserve readable Failed/Accepted independence |
| Both corrupt, conflicting IDs/equal-sequence differing digests or incoherent lineage | Preserve evidence, report recovery conflict; no silent reset/highest-sequence guess |
| Stale lock file after crash | OS reacquisition decides ownership; never PID adoption/age-based unlink. Revalidate files under newly held lease |

Recover each document independently under shared lease. No restart promotion of pending submissions and no persistent operation queue/journal. Exact fallback/repair rules, envelope encoding and genesis validation are specified/tested in E5-S1/S3 before integration. Schema1 implementation is proposed; unknown future schema remains preserved/unavailable, not auto-migrated. A future migration must be separately approved and stage/verify one target without destructive Accepted changes.

### 10. Completion and committed history reads — APPROVED / E5-D4, unimplemented

Derive `completed` for an exercise from at least one validated committed Accepted record (language/version filters affect history, not a new completion policy). Do not add a boolean progress file or overwrite earlier completion on WA/save failure. A known saved previous Accepted remains evidence while a new write is pending; if current Accepted storage cannot be read/verified, expose availability/unknown rather than invent a negative or an unverified positive from a draft. Recovered older backup only supports records it actually contains, with data-loss warning.

`submission-read-model.ts` provides Main-private bounded summaries/source chunks and completion reads over committed document generations. Typed `(storeKind, recordId)` keys are validated identities, not paths. Merge sort is descending submittedAt/submissionId/typed key, deterministic under wall-clock rollback (no claim of strict physical chronology). Cursor binds filter, both store generations/checksums and availability with bounded opaque validated encoding; changed generation/availability yields STALE_CURSOR. Source chunks bind immutable record/hash and byte offset at safe UTF-8 boundaries; enforce raw and JSON response limits. No full code in summary rows.

All/Accepted/Failed availability is explicit. Partial All counts only readable scope and cannot claim a complete total/empty history. Healthy Accepted reads/writes/completion do not depend on Failed readability. Cross-store ID conflict is reported when detectable; never merge conflicting records. Read models are derived and refreshed only after verified committed loads/reconciliation, not optimistic candidate insertion. E6 owns UI/source view/confirmation/Restore through existing draft replacement, E5 does not touch drafts or UI.

### 11. Public transport allocation — APPROVED / E5-D6, unimplemented

E4-D4 and E5-D6 are approved: public Submit remains required and unimplemented, now allocated to **E5-S6**, after storage and same-op integration acceptance, for semantic Submit/status observation plus committed history/completion/source-read API/IPC/Preload; no UI. User approval explicitly amends the roadmap's historical E4-transport dependency. E6 requires accepted S6 safe transport and committed reads; no S6 implementation is authorized by S1.

Reuse ExerciseIpcService authorizer/main-frame/sender/epoch/session/generation/sequence principles and preload disposal/bounded buffering. Propose shared `submission.ts`/`submission-validation.ts` and narrow preload `submission.ts`, with additive wiring into existing ExerciseIpcService/ExerciseApi only after contracts are approved. Existing `boundary/safeSnapshot` are Run-specific and cannot serialize Submit; use typed mode-specific projections. Public snapshot/stop/poll routes must still reject Official refs; internal context/leave invalidation must reach the active Submit without granting raw result access. Explicitly test cross-Run/Submit generation ordering and old-route rejection.

Submit input allowlist: exerciseId, language, exact code, sourceRevision only; Main resolves trusted plan. Output allowlist: Main-issued submission/reference, exercise/language/revision, monotonic status sequence, coarse verdict/aggregate counts where meaningful, storage state and safe reason, committed record key and completion/availability. Do not expose plan hashes/private identities, owner entry, case IDs/indices/suffix, Expected/actual/console/compiler text/stack, cleanup receipts, paths or raw logs. Storage status is `pending | saved | failed | unknown` (with recoveryPending where appropriate); ineligible/cancelled outcomes have explicitly not-requested storage rather than a fabricated save failure.

Status retry uses a Main-issued reference for the current same op, not a new Submit or arbitrary ID write. After owner loss/restart, authorized committed reads can discover saved records but cannot resurrect commit capability. E6 must not automatically replay a lost Submit invocation as a new Submit; deliberate re-submit is new identity, status/history lookup is not. Admission errors return safe AppError, not a fake Judge verdict. No public generic execute/fs API or persistence callback. There is no new Stop/Cancel UI.

### 12. Decisions explicitly APPROVED by user — 2026-10-26

| ID | APPROVED decision | Implementation boundary (only S1 authorized) |
|---|---|---|
| E5-D1 | Exact immutable schema/allowlists/canonical byte encoding/hash rules, Submit-only well-formed Unicode, timestamp/ID binding; pin Accepted filename | Before E5-S1; policy budgets/verdict set unchanged |
| E5-D2 | Learning-only writer/helper boundary and shared fixed store-lease wrapper over existing native primitive; safe checked file port | Before E5-S2; no native/Core or shared PersistenceService changes |
| E5-D3 | Versioned two-document envelope/lineage, staged backup+guarded primary protocol, retry/unknown/recovery rules and target-specific first-storage-entry expiry anchor | Contracts before S1, executable transaction before S3; no capacity/timeout increases or temp promotion |
| E5-D4 | Main committed merge/source/completion read contracts, generations/availability/cursor and conflict behavior implementing H4 | Before E5-S4; no UI or independent progress authority |
| E5-D5 | Operation-local Submit capture/retained task, once-bound trusted identity in existing Prepare, synchronous service commit guard and separate shutdown joins | Before E5-S5; evidence-only runJudge remains, Run/Runtime/comparator/reducer unchanged |
| E5-D6 | Allocate public Submit and committed-read IPC/Preload to E5-S6; six-step sequence and per-step stop gates | Before S6; update roadmap dependency only after approval; no E6/7 authorization |

All E5-D1–D6 are formally APPROVED; this supersedes proposal-only wording in the original survey. D6 now allocates safe Submit/status/committed-read transport to E5-S6, not E4 or E6 UI. Detailed future implementation remains unimplemented. New evidence requiring a changed accepted ADR/topology/Policy B stops affected work for change control.

## Phạm vi MVP

- **Bắt buộc có:** immutable pure schemas; checked store-family files/lease; independent snapshot transactions/recovery; bounded committed reads/completion; same-operation integration; explicitly allocated safe transport before E6. Each depends on approval and independent acceptance.
- **Nên có:** injectable file/clock/fault ports, deterministic interruption/unknown/owner tests, classified availability/redacted errors. These support correctness, not a general framework.
- **Làm sau:** E6 UI/filters/confirmed Restore;9F extended progress/quiz/draft scheduling;9E-7 finalized-artifact/installed/offline/reliability/performance acceptance.
- **Không nên làm:** production code in this task; historical document restoration; E4 reruns/artifact repair; new Runtime/Registry/queue/admission manager, database/journal/dependency, changed Official assets/verdicts/deadlines/quotas/native isolation, public Run behavior or filesystem-wide certification.

## Rủi ro

| Risk / status | Mitigation and future evidence |
|---|---|
| Stale eligibility or cancellation between async stages | Service-owned synchronous guard at replacement dispatch; exact active op/epoch checks; controlled before/after-admission owner/expiry tests |
| Concurrent cleanup clears slot or duplicate continuation; self-await | Attach task before yield, join exact task, separate runtime settlement; controlled execute/invalidate/retry/stop interleavings |
| ACK loss/rename exception/late I/O yields duplicate or false failure | Frozen IDs/payload, no competing attempt while original pending, serialized exact-primary reconciliation |
| Link/path/AV/lock/partial backup race | Fixed names/checked roots/handles/lease; fail closed, preserve evidence; later temporary-directory Windows fault/restart tests; TOCTOU limitations explicit |
| Snapshot CPU/memory/free-space limits | Byte caps before allocation where possible, bounded reads/cooperative encoding/validation, no unbounded JSON.parse or duplicated trees as a shortcut. Performance/stalls/durability NOT MEASURED; stop for evidence-backed remedy if targets cannot be met |
| Corrupt/unavailable store interpreted as empty/incomplete | Classified independent availability, no default reset, backup warning and Accepted-only completion authority |
| Source encoding or identity selector unspecified | E5-D1/D5 must resolve before code; no hash-only equality, hardcoded Official identity or Renderer plan facts |
| Local malicious modification / power loss | Checksums/lease are not authentication/sandbox/power-loss guarantees. Preserve accepted threat model and deferred verification |
| Current native/Main drift | E4 recorded acceptance stays intact; new lease/integration runtime claims require separately authorized provenance/verification. No implicit current-artifact certification |

## Bước tiếp theo

**Current next step:** await separate authorization for S3 — Atomic Commit & Recovery. S1/S2 are accepted; only records/files/lease exist. This acceptance performs documentation consistency/diff checks only; all prior test/native evidence and unverified durability/crash/performance/provenance/release gates remain unchanged.

**STOP. Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope). Phase9E-5 IN_PROGRESS. S1/S2 COMPLETE — PASS WITH LIMITATIONS; S3–S6 NOT_STARTED. Await S3 authorization;9E-6/7 not authorized.**

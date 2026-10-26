# Phase 9E-5 — Submission Storage & Persistence Implementation Plan

## Official Phase 9E-5 final acceptance — 2026-10-26

User formally accepts **Phase 9E-5 and E5-S1–S6: COMPLETE — PASS WITH LIMITATIONS**.
[Final acceptance](PHASE-9E5-FINAL-ACCEPTANCE.md) retains S6's42 targeted PASS,
29 focused regression PASS and30 filtered S5 tests (not PASS), plus previously
passing scoped typecheck/lint/diff evidence. No tests or code checks were rerun for
this documentation-only closure; step-local evidence/failures/corrections remain
intact without aggregating counts across steps.

E4 current-artifact handoff stays NOT PASS; native/target-host/release certification,
storage durability/performance and other deferred verification gates remain
unverified/uncertified as recorded.12 performance models remain PENDING_RUNTIME.
**E6/E7 NOT_STARTED; STOP pending separate explicit E6 authorization.** No
end-to-end production/release certification or automatic advancement. Older
execution/review-pending statements below are historical.

## Historical E5-S6 final review / S5 accepted — 2026-10-26

User formally accepts **S5 COMPLETE — PASS WITH LIMITATIONS**:35 integration PASS,
96 focused regression PASS/1 filtered and scoped checks; immutable capture/live
guard/same-op hold/shutdown/retry accepted, historical failures/limits preserved.
Only S6 was newly authorized; the full S5/unrelated campaigns were not rerun.

**S1–S5 COMPLETE — PASS WITH LIMITATIONS; S6 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); Phase9E-5 IN_PROGRESS — AWAITING FINAL ACCEPTANCE;
E6/E7 NOT_STARTED.** [Final acceptance packet](PHASE-9E5-FINAL-ACCEPTANCE.md):42 new
S6 PASS/29 direct regression PASS/0 FAIL,30 S5 cases filtered; scoped checks. Shared
safe contracts, existing Main IPC, separate `learning.submission` preload API,
opaque committed read identities and cross-Run/Submit ordering/lifetime delivered.
No UI/Restore, storage/Judge/Runtime/native/policy change or actual host/durability/
performance/release certification. The packet consolidates step-local history and
E6 dependencies without summing repeated runs into a current-artifact certificate.
**STOP for S6 and whole-phase user acceptance; no automatic E6/E7.** Earlier
execution-status statements below are historical where superseded by this section.

## Historical E5-S5 delivery / S4 accepted — 2026-10-26

User formally accepts **S4 COMPLETE — PASS WITH LIMITATIONS**:72 S4 PASS,
3 focused regression PASS and scoped checks; committed History/partial availability/
pagination/source/completion accepted with historical evidence/limitations preserved,
no S4 rerun. Only E5-S5 was newly authorized.

**S1–S4 COMPLETE — PASS WITH LIMITATIONS; S5 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
[S5 packet](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md):35 new S5 PASS,
96 directly affected regression PASS/0 FAIL,1 factory/probe case filtered; scoped
tsc/targeted lint/diff checks. Same-operation immutable Submit/current plan binding,
VERIFIED cleanup/release/guarded storage, retained retry and separate shutdown joins;
evidence-only runJudge and sample-only public Run preserved. No storage/Judge/Runtime/
Registry/native/Official/public-transport changes. Initial test/real regression
failures, service-only corrections and all limitations are recorded, not hidden.
**STOP for S5 acceptance and separate S6 authorization.** Earlier execution statuses
below are historical where superseded by this section; policies/decisions unchanged.

## Historical E5-S4 delivery / S3 accepted — 2026-10-26

User formally accepts **E5-S3 COMPLETE — PASS WITH LIMITATIONS**:40 S3 PASS,
28 S2 regression PASS/1 native live SKIP and scoped checks retained without a full
rerun. Atomic commit/idempotency/backup/controlled recovery accepted; historical
limitations unchanged. Only E5-S4 was newly authorized.

**S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; S4 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS); S5/S6 NOT_STARTED; Phase9E-5 IN_PROGRESS.**
[S4 acceptance](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md) records72 new PASS/0 FAIL/
0 SKIP,3 selected directly affected façade regression PASS (37 S3 cases filtered),
scoped tsc/targeted lint/diff checks. Main-private verified committed history,
generation/availability cursors, bounded exact source reads and Accepted-only
completion; no Failed I/O for completion, no persisted progress/index or S5/S6
wiring. No schema/transaction/recovery/policy changes or actual native execution.
**STOP for S4 user acceptance and separate S5 authorization.** All earlier
execution-status notes below are historical where superseded by this section.

## Historical E5-S3 delivery — 2026-10-26

User authorizes E5-S3 only. **S1/S2 COMPLETE — PASS WITH LIMITATIONS; S3 REVIEW
COMPLETED — AWAITING USER ACCEPTANCE (tracking IN_PROGRESS); S4–S6 NOT_STARTED;
Phase9E-5 IN_PROGRESS.** [S3 acceptance](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md)
records40 new transaction/recovery PASS,28 directly affected S2 regression PASS,
0 FAIL/1 native live SKIP, scoped tsc/targeted lint and whitespace checks. No full
checks/build/native Judge/Runtime/UI/benchmark or real student data. Injected guard
only; no production owner authority, completion, service or transport integration.
Controlled reopen/fault tests do not certify crash/power-loss durability or release.
Backup fallback is explicitly recovered/read-only, preserving corrupt evidence;
no automatic repair. Task-start scope/dependencies/security/tree and exact command
history/limitations are in the acceptance packet. **STOP pending user S3 acceptance
and separate S4 authorization.** Earlier execution-status notes below are historical
where superseded by this section; original S1/S2 evidence remains unchanged.

2026-10-26. **DESIGN / SIX-STEP PLAN / E5-D1–D6 APPROVED by user. Phase9E-5 IN_PROGRESS; S1/S2 COMPLETE — PASS WITH LIMITATIONS.**

User approves [Storage design](PHASE-9E5-SUBMISSION-STORAGE-DESIGN.md), this six-step plan and E5-D1–D6, and formally accepts [S1](PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md) and [S2](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md) **COMPLETE — PASS WITH LIMITATIONS**. S1 retains81 PASS; S2 retains29 PASS/0 FAIL/0 SKIP, filesystem/lease/native-fingerprint/scoped checks and all failures/corrections/limitations without rerun. S3–S6 NOT_STARTED; no implementation is currently authorized. Sequence remains pure contracts → checked files/lease → transaction/recovery → committed reads/completion → same-operation service integration → safe transport/final review. Each next step needs separate authorization/acceptance. Original execution notes below are historical where superseded.

**S2 final acceptance task:** documentation consistency/diff only; no source/evidence changes or tests/build/typecheck/lint/native/smoke execution. Transaction/recovery/durability/performance/general native provenance/release claims remain unverified as recorded. STOP pending S3 authorization.

**S2 verification explicitly APPROVED:** new targeted filesystem/lease tests, including actual Windows cross-process native lease contention/release/reacquisition in temporary fixture directories, native fingerprints before/after, scoped TypeScript/targeted lint/diff only. No full checks/build/Job/Runtime/Judge/E4 acceptance/benchmark/UI/user-data operations. Current native fingerprint is tested for lease methods only, not general native/current-artifact certification.

**S1 verification amendment APPROVED:** new targeted S1 test, scoped TypeScript for source/tests/imported closure, targeted ESLint and scoped diff checks only. No full checks/build/native/filesystem integration/restart/Official Runtime/UI/smoke/performance work. This explicit S1-only authorization supersedes the general quality-command paragraph below; no production configuration changed.

## 1. Task-start checklist and baseline

| Checklist | Survey answer |
|---|---|
| Authorized package | Documentation-only final S2 acceptance; S1/S2 formally accepted; S3–S6 not authorized |
| Goal/scope | Main fixed-root paths, identity/containment, bounded reads/exclusive staging/sync/close/guarded byte replacement and retained shared lease; no submission commit/recovery engine/service/public API/completion |
| Dependencies | E4 COMPLETE — PASS WITH LIMITATIONS, recorded-hash scope only; approved9E0-A1–A4/B1–B3 and H1–H5, E4-D4. Source contracts surveyed, not runtime reaccepted |
| Open gates | E5-D1–D6 APPROVED; S1/S2 accepted; S3–S6 require separate authorization. No new blocker found in document review |
| Architecture/security | Main owns store and commit guard; existing ExerciseService slot/Core/Registry; no second operation/queue/lifecycle, raw public Judge serialization or changed Run |
| Verification now | Documentation consistency and document-scoped diff checks only; earlier S2 test/native/scoped results preserved, not rerun |
| Existing working tree | S1 source/test and E5 design/plan/acceptance docs remain untracked, master plan/decisions/map/changelog modified from earlier authorized work. Preserve all; no S1 source/test edits or reruns, no E4 artifact/history restoration |

All nine requested survey documents were present. Existing storage findings and exact source symbols are in design Sections2–3. `learning-store.ts` is a planned path, not an existing store. Codebase Map's older transient-failure/history/transport wording is superseded by approved H1–H5/E4-D4, not used as a new policy. No production conflict is silently resolved. Unknown future incompatibility stops the affected step.

## 2. Decision/dependency map — S1/S2 accepted; next-step authorization pending

| Step | Gate / prerequisite | Deliverable | Tracking status |
|---|---|---|---|
| E5-S1 — Pure records and storage vocabulary | Formally user accepted | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S1-SUBMISSION-CONTRACTS-ACCEPTANCE.md):81 synthetic PASS/0 FAIL/0 SKIP/scoped checks; no rerun or commit authority | COMPLETE |
| E5-S2 — Checked files and store-family lease | Formally user accepted; E5-D2 approved | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S2-FILES-LEASE-ACCEPTANCE.md):29 targeted PASS/0 FAIL/0 SKIP, Windows native lease/fingerprint and temporary-file evidence, scoped tsc/lint/diff; history/limits preserved without rerun; no commit engine | COMPLETE |
| E5-S3 — One-target commit and recovery | Formally user accepted; E5-D3 approved | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S3-TRANSACTION-RECOVERY-ACCEPTANCE.md);40 S3 PASS,28 S2 regression PASS/1 native live SKIP; scoped checks; controlled transaction/recovery evidence and limitations preserved | COMPLETE |
| E5-S4 — Committed reads and completion | Formally user accepted; E5-D4 approved | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md);72 S4 PASS,3 focused regression PASS/scoped checks; original evidence/limitations preserved, no rerun | COMPLETE |
| E5-S5 — Same-operation service integration | Formally user accepted; E5-D5 approved | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S5-SERVICE-INTEGRATION-ACCEPTANCE.md);35 integration PASS/96 regression PASS/1 filtered/scoped checks; original evidence/failures/limits preserved | COMPLETE |
| E5-S6 — Public transport and E5 final review | S5 accepted; E5-D6 approved; S6 formally user accepted | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-FINAL-ACCEPTANCE.md);42 new PASS/29 direct regression PASS/0 FAIL/30 filtered (not PASS); safe contracts/Main IPC/preload/projections/ordering/bounds and final packet, no UI | COMPLETE |

Existing P9-STORAGE/H1–H5 policies are not reopened. E5-D1–D6 details are APPROVED; no dependency installation, native source change or framework. D6 explicitly allocates safe public Submit/status/committed-read transport to S6, not E6 UI; actual implementation remains unauthorized until that step.

## 3. E5-S1 — Pure records, validation and transaction vocabulary

### Goal and scope

Define immutable Accepted/Failed records, document envelopes, commit/availability/status vocabulary and policy constants. Preserve every approved budget, one-target route and completion rule. Resolve Submit source encoding and exact envelope format before implementation, not during code review. No files/I/O/service/IPC/Runtime work.

### Proposed modules and contracts

- `src/main/services/learning/storage/submission-contracts.ts`, `submission-validation.ts` (new, Main-private).
- Proposed focused `tests/main/submission-records.test.ts`.
- No public re-export of Judge types. Use type-only imports for existing language/identity/verdict vocabulary where appropriate; do not change comparator/reducer.

Flow: Main-capture-shaped test values + final scalar candidate projection → exact immutable route record → deterministic encoded document/checksum. Validation accepts unknown; types/casts alone are insufficient. Encode exact source without normalization; Submit-only well-formed Unicode is approved by D1. Distinguish sourceRevision correlation from Main authority. Main IDs/timestamps remain fixed across retry. S1 defines/checks envelope previous-digest/genesis/sequence and encoded metadata/record/snapshot accounting, not trusted candidate origin or filesystem commit.

### Acceptance criteria

- Accepted only all-pass scalar candidate shape, Failed only approved trusted enum; neither supplied booleans nor record validation mint commit authority.
- Exact allowlists; no hidden fields, decisions/suffix/private diagnostics/raw logs or session/owner authority. Capture/source/hash/language/Official identity mismatches rejected.
- Duplicate IDs, differing same-ID payload/route, overflow/unsafe integers, malformed timestamps/hashes/Unicode and unsupported schema handled explicitly. Hash match alone never proves identical payload.
- Correct2MiB record/16KiB metadata and64MiB/32MiB document encoded boundaries; approved warnings/reserve/read bounds/status vocabulary recorded. No silent pruning/migration/default-reset.
- Canonical encoding/checksum stable across property insertion order; source whitespace/CRLF/astral characters preserved; checksum excluded only from its own hash. Monotonic expiry uses an injected clock in later stages, never wall-clock timestamps.

### Targeted tests, risks and stop

Pure boundary tables, malformed/extra fields, canonical encoding/idempotency conflicts and exact-source/hash round trips; synthetic data only, no Official fixtures. Validate route/zero-case compile records and absent completion flag on Failed. Main risks: accidental private projection, encoding inconsistencies and passing schema validation as authorization.

**STOP GATE S1:** report actual focused results and required quality checks, schema/decision traceability and remaining limitations. Wait for user acceptance and separate S2 authorization. No storage files or service changes.

## 4. E5-S2 — Learning checked filesystem and shared lease

### Goal, proposed modules and flow

New `storage/store-files.ts`, `storage/store-lease.ts`; minimal `learning-store.ts` shell only if needed to own configuration. Proposed `tests/main/submission-store-files.test.ts`, `submission-store-lease.test.ts`. Existing `windows-exercise-native.ts` interface and loader are reused without mutation/native rebuild; runtime session-lease wrapper is not the store wrapper.

Trusted Main root/config → fixed Accepted/Failed/backup/staging/lock paths → identity-checked directory/file handles and retained shared lease. Lease handle has release-retry ownership. File port exposes only narrow read/stage/sync/replace/verify operations to the Learning writer, never to Renderer. Domain filesystem errors are typed/redacted. No schema fallback or production startup wiring/real user-data mutation in test fixtures.

### Acceptance criteria

- No path from Renderer or persisted record; no traversal/absolute escalation, links/junctions/unexpected hardlinks/nonregular files. Root/parent/handle identity checked around operations; no broad recursive cleanup.
- Exclusive sibling stages, bounded reads, sync/close and stable identity checks. No unlink-primary workaround. Unsupported safe replacement reports unavailable.
- OS handle is exclusion authority; same family for both stores, null=busy; no independent Accepted/Failed locks, PID adoption or stale-file deletion. Retain handle on failed close and block further mutation.
- Native load/ABI failure is unavailable/UNVERIFIED, never an in-memory-lock fallback. Source primitive reuse does not certify current native binary. No new native API or process ownership.

### Targeted tests, risks and stop

Injected file/native-lease ports for containment, busy, partial open/write/sync/close and release retry; temporary-directory link/root replacement/rename/locked-file tests on an explicitly authorized Windows fixture host. Cross-process lease contention/crash-release verification needs separately approved focused fixture operations at this step; no student Judge/native Job or E4 acceptance rerun. If not authorized/available, report that acceptance component UNVERIFIED and do not claim full S2 completion.

Risks: TOCTOU/reparse limitations, native provenance, locks/AV/UNC semantics and cleanup leaks. Stop for review if existing primitive is insufficient; do not modify native/Core as a shortcut.

**STOP GATE S2:** present file/lease evidence and platform exclusions; wait for acceptance/S3 authorization. No submission transaction or ExerciseService wiring yet.

## 5. E5-S3 — Atomic one-target commit, idempotency and crash recovery

### Goal, modules, contracts and data flow

Implement `storage/snapshot-transaction.ts` behind `learning-store.ts`, building on S1/S2. Proposed `tests/main/submission-store.test.ts`, `submission-store-recovery.test.ts`. No service/transport/Runtime changes. One configurable writer algorithm serves separate validated Accepted/Failed documents and policy values; one retained file mutation task/shared lease, no queued exercise operations or persistent retry journal.

Narrow Main-only input: frozen record/immutable target, expected base and service guard/dispatch port. The port is an integration requirement, not actual authority in isolated storage tests. Pending caller waits join the original task. A final synchronous guard invokes primary rename immediately; do not return a boolean and schedule rename later. Read/encode/stage/verified-backup → guarded primary dispatch → read-back commit verification → settled state. No callback that awaits op.completion or starts another operation.

### Acceptance criteria

- Staging is not committed; preserve verified backup before replacement; validate primary content/ID/digest/lineage before saved/read-model update. No data loss via good-backup overwrite from corrupt primary.
- Same-ID identical retries join/dedupe; differing payload/target conflicts. New deliberate Submit ID would append a version; automatic recovery never issues one.
- Classify pending, saved, known failed and unknown/recovery pending. Late rename/ambiguous exceptions cannot trigger blind append or false storage failure/completion.
- Preserve64MiB/32MiB capacities, warnings, free-space reserve, no pruning, and legacy read-only/recovery. File-not-found differs from permission/lock/unsupported/corrupt; never reset those to empty.
- Apply approved15s/10s caller/shutdown waits and5s/3s slow notices; max3 safe transient attempts with250ms/1000ms within original precommit window. Expiry anchored at first storage entry per proposed D3; no renewal by caller retry. Post-admission work settles despite expiry/owner cancellation.
- Retain all tasks/handles/lease until safe settlement; a close failure can block reuse even after verified commit. Unknown retains exclusion until resolved.
- Crash states in design Section9 have deterministic preservation/recovery outcomes. Restart verifies committed snapshots only; no temp/checkpoint-to-grade promotion. Backup recovery reports possible lost newest data.

### Targeted tests, risks and stop

Fault-injection at exclusive create/write/sync/close, backup staging/replace, primary dispatch, read-back and ACK; delayed original I/O after caller timeout; safe versus ambiguous retry; source/payload conflict; each-store full/legacy/locked/corrupt/unsupported; partial primary/backup lineage; staged-orphan preservation. Real temporary-directory restart tests require explicit fixture authorization and do not access production userData. Cover both policies; no benchmarks implied.

Risks: sync/read-back confused with power-loss proof, backup rollback, competing writes after timeout, large snapshot blocking Main. UNVERIFIED performance/durability must remain explicit; an evidence-required topology change needs user approval.

**STOP GATE S3:** report transaction/recovery evidence, initial failures and unresolved OS/durability cases. Wait for acceptance/S4 authorization; no ExerciseService commit integration.

## 6. E5-S4 — Committed history reads and Accepted completion

### Goal, modules and contracts

New `storage/submission-read-model.ts`, extend façade read methods; proposed `tests/main/submission-read-model.test.ts`, `submission-completion.test.ts`. No IPC/UI/draft/9F changes. Input is independently verified committed snapshots/availability, never JudgeResult or a provisional row. Output is bounded summaries, immutable source chunks, committed generations and completion authority for later Main projections.

### Acceptance criteria

- Completion derives only from committed Accepted; earlier completion survives later WA/storage failure. Unreadable Accepted is unknown; Failed health never supplies/clears completion.
- All/Accepted/Failed deterministic merge with typed keys, explicit partial availability/count scope, no false empty/total, cross-store conflicts when both readable.
- Default32/max100 rows;1KiB row/256KiB encoded response/512byte cursor; source32KiB raw UTF-8 safe chunks plus response bound and immutable hash/offset binding. Generation/availability changes invalidate cursor.
- No hidden Official identity hashes/private evidence in public-intended summary/source metadata; use explicit projections. Old valid records do not require current package availability or a rerun.
- Derived indexes refresh only from verified snapshots; no global persisted index/progress file or optimistic completion insertion.

### Targeted tests, risks and stop

Healthy/missing/unavailable/corrupt/backup-recovered combinations, Accepted-only completion with Failed full/unreadable, unknown Accepted, lost-ACK committed read, duplicate/cross-store conflicts, stale cursor/filter/availability, timestamp rollback ties, encoded boundary/Unicode chunks and hidden-field rejection. Risks: presenting partial as complete, stale source injection, allocating full source in summaries. E6 owns confirmed Restore and UI behavior.

**STOP GATE S4:** report committed read/completion tests and bounds; wait for acceptance/S5 authorization. No public transport yet.

## 7. E5-S5 — Same-operation ExerciseService integration

### Goal and proposed modules

Modify `exercise-service.ts`, narrowly `official-case-plan.ts` for trusted current-package selection/identity binding, and `index.ts` for storage dependency composition/order. Main-private types may extend `storage/submission-contracts.ts` or `runtime/official-execution-contracts.ts` only for typed integration; do not change language execution contracts/behavior. Proposed `tests/main/submission-service.test.ts`; directly affected `generic-judge-service.test.ts`, `exercise-service.test.ts`, `official-runtime-service.test.ts` regressions. `DesktopApplication` stop ordering is reused; modify it only if a directly evidenced requirement is approved, not pre-emptively.

### Contracts and flow

Capture Submit intent synchronously inside existing admission, before execution continuation. Use same Registry acquire in owned Prepare to bind actual package/test-set/signature/comparator identity once; no Renderer identity or test-pinned Divide fallback. Preserve the explicit expected-identity evidence-only Judge path. Reuse existing driver/comparator/reducer and all runtime cleanup facts unchanged.

At `cleanup` after VERIFIED resource settlement/content release and scalar finalization, attach/join one retained storage task before any await or active-slot release. Persist scalar allowlist plus immutable captured source only. Store invokes service-owned commit guard at primary replacement dispatch. Keep source/operation entry/generation/epoch and target binding checked; never use historical handle.judgeResult as authority. Avoid continuation self-await and duplicate reduction/commit under concurrent cleanup calls.

### Acceptance criteria

- Run/Official/Judge/Submit share the existing busy slot; no extra queue/admission/Registry/Core. No new operation launches while any original runtime/store I/O/lease is unresolved.
- Correct source-at-Submit despite later edits/draft saves; trusted plan bound within Prepare without pre-acquisition or hidden payload clone. Missing/invalid package fails closed before grade storage.
- Only eligible final Accepted/graded failure routes; zero-case trusted compilation/syntax supported. Infrastructure/protocol/unverified cleanup/HISTORY_UNVERIFIED/PROCESS_UNRESOLVED never persist grades.
- Cancel/context/leave/navigation/owner replacement/shutdown before dispatch prevents new commit; after dispatch settle/reconcile, suppress stale publication and keep saved record visible later. Closed Core signal never cancels store I/O.
- Race `execute/cleanup/invalidate/retryCleanup/stop`: one task/record/slot release; no recompare/reacquire/relaunch; finalizer/release failures preserve original ownership.
- `stop()` uses separate12s runtime and15s/10s target-storage joins. On timeout keep op/dependencies/lease; retry joins, no forced quit. Reverse managed dependency shutdown keeps storage/native wrapper alive until service settlement.
- Full Failed refusal releases same operation only after safe I/O/lease settlement and permits later operations under existing guards; no fallback to Accepted store. Judge verdict unaffected by storage outcome.
- Existing public Run remains sample-only; private results still rejected by public Run snapshot/completion/stop paths.

### Targeted tests, risks and stop

Controlled service/file/clock tests for all routing families, wrong source/version identity, edits during Judge, before/after-guard invalidation, expiry after async work, retained cleanup/release errors, delayed/unknown commits, lost ACK and shutdown retry ordering. Count actual launches/comparisons/finalization/commit/release to prove no duplicates. Test expected-identity evidence-only Judge still writes nothing. No E4 native rerun or broad smokes; new source behavior is verified only by authorized focused tests, not inherited recorded E4 binaries.

Risk: clearing slot in any legacy cleanup path, guard-to-dispatch yield, identity initialization race and shutdown's old outer12s wrapper. Any required Runtime/provider/native/Policy B change stops for review.

**STOP GATE S5:** present ownership/commit race evidence, public Run regressions and remaining native/platform limits. Wait for acceptance and explicit S6 authorization/allocation. Do not wire UI or transport automatically.

## 8. E5-S6 — Safe public Submit/committed-read transport and final review

### Allocation gate and modules

**APPROVED E4-D4 allocation via E5-D6:** transport belongs to E5-S6; implementation remains NOT_STARTED and not authorized by S1. Planned `src/shared/contracts/submission.ts`, `submission-validation.ts`, Main-private allowlisted projection beside storage façade/service, additive `src/main/ipc/exercise-ipc-service.ts`, `src/preload/bridge/submission.ts`, existing preload/shared API composition and `index.ts` callbacks as necessary. Existing generic IPC registry/result helpers are reused. No Renderer UI changes, Submit enablement in PracticeWorkspace, History panel or Restore implementation.

Proposed `tests/contracts/submission.test.ts`, `tests/main/submission-ipc.test.ts`, `tests/preload/submission-bridge.test.ts` (confirm repository test subtree convention when implementing). Final report `docs/PHASE-9E5-FINAL-ACCEPTANCE.md` exists only after authorized work/evidence; do not create an acceptance claim now.

### Contracts/data flow and acceptance

- Strict semantic Submit input code/exercise/language/revision; Main issues identity/selects plan. Reject extra verdict/cleanup/owner/plan/Expected/path/command fields before dispatch.
- Current main frame/sender/epoch and exact operation references authorize Submit observation/status retry. Bounded preload listeners/buffering disposed on unload; monotonic status sequences and cross-Run/Submit generation ordering suppress stale responses/events.
- Projection permits coarse verified verdict/counts and separate storage pending/saved/failed/unknown/not-requested, safe reason, committed key and completion availability. It never copies private JudgeResult; hidden IDs/indices/values/stdout/stderr/diagnostics/hash provenance/cleanup receipts/raw logs stay Main-only.
- Run routes stay Run-only. Internal context/leave invalidation reaches Submit, but semantic status/history APIs cannot revive commit authority. Lost invocation response is not automatically replayed as a new Submit.
- History/list/source/completion requests use S4 validated IDs/filters/cursors/offsets, not paths. Enforce H4 byte bounds at Main and Preload. No public generic execute/fs/callback.
- Final scoped E5 review traces S1–S6 evidence, failures/skips, approved policies/decisions, storage/ownership/privacy and all remaining verification gaps. No promotion of E4 artifacts or deferred release gates.

### Targeted tests, risks and stop

Contract tampering, forged refs/owner facts, stale frame/epoch/generation, hidden echo on all invoke/event/error/poll/legacy routes, status retry without duplicate submission, cross-mode ordering, bounded events/read chunks and listener disposal. Controlled service+real temporary-store integration can verify eligibility→commit→completion without executing student code. Any extra native or app-level acceptance requires a separately scoped user authorization; no E4 rerun/build remedy is implied.

Risks: reusing Run snapshot projection, stale post-ACK callbacks, renderer-simulated saved state and silent responsibility transfer to E6. If transport remains unallocated/unaccepted, E6 is blocked on that dependency even if storage internals pass.

**STOP GATE S6 / PHASE:** deliver final actual evidence for user acceptance; do not mark Phase COMPLETE automatically. No E6/7, UI/History/Restore or release work begins. Keep limitations explicit rather than label unexecuted gates PASS.

## 9. Verification policy — current task versus future implementation

**Current survey:** only read relevant source/docs, read-only dependency tracing, document consistency and `git status --short`/document-scoped `git diff --check`. No tests/typecheck/lint/build/native operations, UI/Project/PTY/Monaco/drafts/Electron smoke, benchmarks/release work, user-data writes, artifact rebuild/restore, historical document recovery, production fixes or Git publication.

**Future implementation, only after step authorization:** repository scripts actually present are `npm test` (Vitest), `npm run typecheck`, `npm run lint`, `npm run build`. Use focused installed Vitest file selections, e.g. `npm test -- <explicit affected files>`, and the three mandatory quality commands plus document/source-scoped `git diff --check` per AGENTS.md. These commands are not authorized or run now. No inherited E4 scoped-check waiver applies to E5. Narrower gates or commands that affect artifacts need explicit approval; do not rebuild E4 just to satisfy a design task. Missing platform/fault evidence remains UNVERIFIED, no silent skips as PASS.

Tests must target record/privacy/bounds, filesystem/lease ownership, crash/recovery/unknown, guard races, completion and API isolation. Use synthetic records/temp fixture roots/injected faults, not real user storage/Official sets. Do not invent a native/restart command until its scoped fixture and host are explicitly authorized. Retain first failures/corrections/exclusions and prevent overlapping test counts from becoming inflated phase totals.

## 10. Exit gate, documentation and deferred obligations

Phase9E-5 may be proposed for completion only after all authorized steps and required focused functional/security/ownership/storage/recovery/quality gates pass and the user accepts their actual results. Every new decision must be explicitly resolved; all step statuses reflect execution, not this plan. Document actual paths in CODEBASE-MAP only when files exist; update approved decisions/status and CHANGELOG only with genuine approved/verified work. This task creates the two design/plan documents and a proposal note in the master plan only.

Deferred conditions remain **UNVERIFIED**, not waived: finalized binary/current artifact verification and full-app handoff; Windows target-host/reliability/release matrices; installed/offline/filesystem gates, loader B1a/B1b; storage power-loss/rename/AV durability where untested; all performance targets NOT MEASURED;12 models PENDING_RUNTIME and general Official60s UNVERIFIED. Proposed unit/temporary-directory tests do not certify these. Any future amended acceptance scope needs explicit user approval, as E4 required.

E5 hands E6 committed reads plus accepted safe transport only after allocation/implementation acceptance; E6 owns UI/History/confirmed Restore.9E-7 owns authorized integration/release verification, including storage-full/locked/corrupt/crash/ACK/context/quit/retry/partial-store regressions on appropriate artifacts.9F owns extended progress/quiz/draft scheduling, consuming committed Accepted authority without a competing completion store.

**STOP. Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope). Phase9E-5 IN_PROGRESS. S1/S2 COMPLETE — PASS WITH LIMITATIONS, user accepted. E5-S3–S6 NOT_STARTED. Await separate S3 authorization; no transaction/recovery/read/service/transport/E6/7 implementation or release certification follows from this acceptance.**

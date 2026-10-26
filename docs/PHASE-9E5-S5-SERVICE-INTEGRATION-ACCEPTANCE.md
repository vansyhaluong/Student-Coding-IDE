# Phase 9E-5 / E5-S5 — Same-operation Service Integration Acceptance

2026-10-26. **COMPLETE — PASS WITH LIMITATIONS — USER ACCEPTED** (tracking `COMPLETE`).
User formally accepts35 integration PASS,96 focused regression PASS/1 filtered
exclusion and scoped typecheck/lint/diff PASS. Immutable capture, commit-time guard,
same-operation hold-through-commit and shutdown/retry are accepted with all original
evidence, failures/corrections and limitations preserved. No full S5 rerun accompanies
this acceptance. S6's directly affected status/projection regressions are separate
evidence in the [final packet](PHASE-9E5-FINAL-ACCEPTANCE.md), not rewritten receipts.
**S1–S5 COMPLETE — PASS WITH LIMITATIONS; Phase9E-5 IN_PROGRESS — AWAITING FINAL
ACCEPTANCE.** S6 is separately authorized/delivered for review in that final packet;
E6/E7 NOT_STARTED. Earlier pending/stop statements below are historical where superseded.

## 1. Authorization, prerequisites and task-start review

User formally accepts [S4 COMPLETE — PASS WITH LIMITATIONS](PHASE-9E5-S4-COMMITTED-READS-ACCEPTANCE.md):
72 S4 PASS,3 focused regressions PASS and scoped typecheck/lint/diff PASS.
Committed History, partial availability, pagination, source chunks and
Accepted-derived completion are accepted. Historical evidence, corrections and
limitations remain intact; S4/S1–S3 tests were not rerun during S5.

| Task-start item | Survey / execution boundary |
|---|---|
| Authorized package | E5-S5 only; approved E5-D5/design/plan with accepted S1–S4 prerequisite |
| Goal/scope | Private Submit admission/capture/current plan, same-operation Judge→storage hold, synchronous live commit guard, retained retry/cleanup and separate shutdown joins |
| Exclusions | S6 IPC/preload, UI/History/Restore/E6/E7; storage policy/schema/transaction changes; Judge/reducer/comparator/Runtime/Core/Registry/native/Official/public Run changes |
| Decision gates | E5-D1–D6 and P9-STORAGE/H1–H5 approved; no new gate or ADR resolution; S5 acceptance and separate S6 authorization still required |
| Architecture/security | Existing ExerciseService singleton/active slot; existing owned Prepare/Registry/Core and S1–S4 store; no new execution queue/operation/lifecycle manager, copied receipt authority or generic executor |
| Verification | Controlled input-only adapters, real TypeScript Core/Registry coordinators and temporary storage; targeted S5/direct regressions/scoped tsc/lint/diff only; no native/student execution |
| Initial working tree | Existing modified docs and untracked S1–S4 storage/tests/design/plan/acceptance preserved; branch `feature/phase-9a-learning-mode`; no commit/push/merge |

## 2. Files changed

| File | Implemented change |
|---|---|
| `src/main/services/learning/exercise-service.ts` | Private Submit handle/status/contracts, synchronous immutable intent before execute, once-bound capture, same-operation runtime finalization/storage continuation/guard, retained settlement and15s/10s storage waits outside runtime12s |
| `src/main/services/learning/official-case-plan.ts` | Main-only CURRENT selection deriving scalar identity from the existing owned Prepare lease; exact expected-identity path remains checked |
| `src/main/index.ts` | Existing DesktopApplication dependency composition: initialize checked store/shared lease before ExerciseService, retain dependency through reverse shutdown; unavailable store refuses saves separately from Run; native binding remains lazy |
| `tests/main/submission-service.test.ts` |35 controlled integration tests with temporary storage, Registry fixture and simulated language/process/native-handle ports |
| S4 acceptance, this S5 report, E5 design/plan, master plan, Codebase Map, thesis changelog | Formal S4 acceptance and current S5 evidence/status/stop; historical evidence preserved |

Private integration contracts are embedded in `exercise-service.ts`; no shared
public DTO/channel/preload was added. S1–S4 store/contracts/validation/read model/
transaction sources, existing test sources, Judge/reducer/comparator, Runtime/Core,
Registry implementation, Official assets and native binaries are unchanged.
No dependency or storage schema/policy/budget change.

## 3. Submission → Judge → Storage data flow

1. `submit` validates the existing exact Run-shaped source input plus Submit-only
   well-formed Unicode. Main issues record/submission UUIDs and submittedAt, freezes
   exact code/revision/language/hash intent, and passes intent through **the same
   `admit`** before execute can continue. Run/Official/Judge/Submit share one active
   slot; no calling runJudge then attaching storage afterward, draft reread or queue.
2. Submit supplies only a private CURRENT/exercise selection to binding. The
   existing Registry acquisition occurs in owned Prepare. Anchored metadata/Judge
   consistency, signature and comparator rules determine identity. A validated
   full capture and owner/session/generation/epoch/source-bound Judge identity are
   sealed before Judge initialization/case execution. No pre-admission package
   read, second Registry lease/loader or fake eligible identity exists. Missing
   plan settles without a grade (`not-requested / PLAN_UNAVAILABLE`).
3. Existing driver/Judge performs comparisons, verdict and eligibility unchanged.
   Core must finish VERIFIED cleanup, release runtime resources and content/input
   borrows/pin, and revoke Expected view. Runtime finalization is idempotent; a
   joined close finishing before execute's finally rechecks executionDone on the
   same operation. Content-release/finalizer failures retain that slot for retry.
4. A same-operation continuation projects one S1-validated immutable record only
   from the sealed final eligible result plus bound capture. Accepted targets only
   Accepted; trusted WA/compile/syntax/runtime/TLE/MLE/OLE target only Failed. No
   case rows/counts are fabricated for zero-case compiler failures. Ineligible
   protocol/infrastructure/unqualified results request no save.
5. S3 `LearningStore.begin` receives that one record and the service-owned guard.
   One retained continuation/transaction owns pending write/unknown/close state.
   Retry observes/settles it; it never reexecutes, recompares, reacquires content,
   supplies a new submission ID or appends a second record. Only S3 verified saved
   Accepted supplies completion through existing S4 reads.

`runJudge` remains evidence-only, and runOfficial/runJudge preserve exact supplied
identity matching. An injected CURRENT flag on those paths is rejected rather
than turning them into the Submit selection seam. Public Run remains sample-only.

## 4. Commit-time authority and privacy

The guard runs synchronously at S3's checked primary-replacement dispatch site.
It checks the **live exact operation**, active slot, owner-entry object/owner state,
session/generation/documentEpoch, not sealed/invalidated, immutable source/revision/
hash/record/capture, bound Official plan and sealed Judge identity/eligibility.
It also checks real VERIFIED FINALIZED/processClean/REMOVED/no-pending-I/O facts,
executionDone/no Core ownership, zero retained package tasks/input borrows,
content released, no release/finalizer/cleanup failure, and actual shared store
lease ownership through a Main closure over that lease. Record/route/digest/next
lineage must match S3's expected committed base and final appended record.

No await separates guard and primary rename. S3 enforces the original target
precommit window and checked filesystem/lease/base identity at this same boundary;
S5 does not renew or replace that policy. The guard's one-use bit prevents reissued
authority. A historical JudgeResult/owner boolean/serializable receipt cannot start
another transaction: retry and status handles close over the original operation,
and owner/epoch/generation changes revoke observation as well as precommit authority.

Before dispatch, context/leave/owner replacement/loss/shutdown prevents primary
replacement and drains owned staging. Owner loss during content release cannot
grant storage authority. After dispatch, original I/O still settles/reconciles;
no rollback/blind append is attempted and stale status/completion publication is
refused. Verified saved bytes remain discoverable later from committed storage.

Submit stays `kind: OFFICIAL`, so existing public Run snapshot/completion/stop
routes reject its reference before and after settlement. No Submit snapshot/event
is published through Run. The private Submit status projection contains only its
reference/submission/exercise/language/revision/stage/coarse verdict/storage state,
safe reason and verified saved record key. No source, plan hashes/identity, Expected,
actual, hidden cases/indices, console/compiler diagnostics, raw JudgeResult, cleanup
receipt, path, raw error or payloadDigest enters those status/error/public routes.
There is no Submit IPC/preload or new public capability in S5.

## 5. Retained cleanup, unknown outcomes and shutdown

The active operation remains held beyond runtime finalization until the transaction
is saved/known failed/ineligible **and** every retained resource has settled.
`pending`, `saved`, `failed` and `unknown` are separate from Judge verdict. A full
Failed store gives WrongAnswer plus failed/FULL, not an altered Judge verdict or
fallback Accepted write; safe settlement allows later Run. Unavailable managed
storage similarly reports failed/UNAVAILABLE without disabling sample Run.

Concurrent execute/cleanup/invalidate/retry/stop callers join the same storage task;
that continuation never waits on op.completion (which may itself wait for it).
Unknown outcome retains slot/lease. Serialized S3 reconciliation can prove saved
or known failed without a competing rename. Verified saved with failed native
handle close remains active until explicit safe settlement. Lost ACK resolves
against the one committed record. Delayed staging expiry does not reset on retry;
caller timeout does not cancel the original task/lease or prove write failure.

`beginShutdown` synchronously seals admissions/publication and precommit authority.
`stop` joins runtime cleanup with12s, then only the active storage target with its
separate shutdown wait Accepted15s/Failed10s. There is no outer12s wrapper around
storage. Timeout or unresolved/unknown ownership keeps active/dependencies tracked
and refuses successful stop. Retry joins retained work, not a new operation.

`index.ts` composes LearningSubmissionStorage before ExerciseService in the
existing DesktopApplication list, so reverse shutdown stops ExerciseService first.
The native binding/lease dependency stays available while service cleanup fails;
existing DesktopApplication mandatory-stop behavior blocks dependent/window final
shutdown. A controlled managed-dependency test proves this barrier for both targets;
actual Electron bootstrap/quit/native behavior is not newly certified.

## 6. Targeted evidence and executed checks

| Check | Final evidence |
|---|---|
| `submission-service.test.ts` | **35 PASS /0 FAIL /0 SKIP** |
| `generic-judge-service.test.ts` | **37 PASS /0 FAIL /0 SKIP**; direct finalization/cancellation/privacy dependency |
| `official-runtime-service.test.ts` | **20 PASS /0 FAIL /0 SKIP**; direct binding/cleanup/owner dependency |
| `official-case-plan.test.ts` | **17 PASS /0 FAIL /0 SKIP**; exact expected-identity compatibility of modified acquisition |
| Selected `exercise-service.test.ts` | **22 PASS /0 FAIL /1 filtered**; existing controlled admission/owner/deadline/cleanup/shutdown/recovery groups; production JavaScript factory/probe case excluded by name filter |
| Distinct final executed total | **131 PASS /0 FAIL**;1 deliberately unexecuted filtered test, not a new native-live SKIP |
| Scoped tsc | PASS: `node node_modules/typescript/bin/tsc --noEmit -p out/e5-s5/tsconfig.json` |
| Targeted ESLint | PASS: the three changed source modules and new S5 test only |
| Scoped tracked/new-file `git diff --check` | PASS; explicit changed tracked paths and untracked files checked using `--no-index --check`; only Git LF→CRLF notices |

Targeted S5 cases cover both languages' Accepted, all seven graded-failure routes,
zero-case compile/syntax, immutable edited-source capture/current Prepare identity,
evidence-only Judge, private Run ref rejection, missing plan/protocol failure,
pre-Prepare cancellation/delayed real Registry handoff, concurrent cleanup joins,
pre/post-dispatch owner loss and numeric-ID replacement, release-time revocation,
shutdown-before-dispatch, original-window expiry, unknown read-back, lost ACK,
saved-but-close-failed, full/unavailable storage, retained content release,
PROCESS_UNRESOLVED, pending FINALIZED12s, and independent shutdown15s/10s joins.
Assertions count launches/comparisons/finalizations/commit dispatch/release and
check committed snapshots, absence of the opposite target and zero leaked Registry
ledger allocations after fixture cleanup.

Commands use `node node_modules/vitest/vitest.mjs run --maxWorkers=1` with:

- `tests/main/submission-service.test.ts --reporter=default --reporter=json --outputFile=out/e5-s5/targeted-results.json`
- `tests/main/generic-judge-service.test.ts tests/main/official-runtime-service.test.ts tests/main/official-case-plan.test.ts --reporter=default --reporter=json --outputFile=out/e5-s5/official-regressions.json`
- `tests/main/exercise-service.test.ts -t 'ExerciseService admission and Main identity|Owner loss and stale work|Service deadlines, retained cleanup and shutdown barrier|Managed startup recovery' --reporter=default --reporter=json --outputFile=out/e5-s5/service-regressions.json`

The ignored scoped config lists modified entry modules/new and directly affected
test sources plus existing bundler declarations; imported closure includes index's
Main dependencies. No broad include glob, repository-wide check, emission/build,
new production config, native load/fingerprint/Job/student process, integration
`.integration.test.ts`, UI smoke or benchmark was run. S1–S4 storage suites were
not rerun; they are unchanged dependencies. Source Registry fixtures read existing
anchored checked-in test packages; no Official asset edits/regeneration/reacceptance.

## 7. Historical failures and corrections

Initial reads used two proposed runtime-subdirectory paths instead of actual
Learning module locations; corrected before editing. A later eligibility helper
lookup did not exist; eligibility is in the existing reducer, which was not edited.
Initial scoped index typecheck omitted existing raw/virtual bundler declarations
and reported11 missing-module errors. The ignored config now explicitly includes
the repository's existing raw-content/anchor/raw-harness declarations; no production
source/config was changed to hide those errors.

First S5 run:26 PASS/5 FAIL and one test-assertion unhandled rejection warning.
Three tests incorrectly passed full public snapshots where exact session/generation
references are required; two shutdown assertions assumed exact floating clock
subtraction/direct errors instead of DesktopApplication's AggregateError cause.
Those fixtures were corrected, and the asynchronous assertion handler was made
safe; the second31-test S5 run passed. No production behavior was relaxed for them.

Direct regressions then exposed **five real S5-introduced lifecycle failures**:
4 Official/Judge tests and1 service test. Deferring close through a new microtask
changed Core's first cancellation reason; coalescing runtime closes could also
leave a delayed acquisition's pin/slot unreleased or rejoin an already failed
legacy cleanup. The correction stays entirely in ExerciseService: preserve legacy
Run/Official/Judge close/retry ordering, call Submit close synchronously, and recheck
same-operation finalization after joined runtime close. Runtime/Registry/tests were
not modified. Two explicit Submit delayed-Prepare/acquisition regressions were added.

After that correction,33 S5/74 Official-Judge-plan/22 service tests passed. A new
test-spy typing error was corrected using `vi.mocked` (no runtime behavior change).
Final review added release-time owner loss and shutdown-before-dispatch tests,
structured retained-task reporting and explicit shutdown policy field selection.
Final results above are35 +74 +22 distinct PASS, not sums of repeated31/33/35 runs.
All final scoped checks ran after those source changes; initial failures remain
reported here rather than being rewritten as historical unrelated failures.

## 8. Limitations and UNVERIFIED conditions

- Tests exercise real TypeScript Core/Registry coordination with controlled
  input-only adapters and temporary filesystem storage. Learning native handles,
  process execution, compiler/syntax outputs, owner events and faults are simulated.
  No student code/SDK/native Job/actual native lease or installed app was executed.
- index composition is source/type-checked plus a controlled managed-stop barrier;
  actual Electron startup/owner replacement/quit/native shutdown timings and
  loader/current-binary provenance are UNVERIFIED. No full build or app smoke.
- The integration preserves S3 safe-retry/expiry/unknown/backup/recovery policies
  and S4 committed completion authority. There is no repair, temp promotion,
  rollback promise, prune, schema migration, new store/queue or persisted progress.
- Main-private Submit status/handle exists, but S6 authorization/IPC/preload/public
  observation/disposal/bounds remain NOT_STARTED. Controlled private projection
  tests do not certify a public Submit transport that does not yet exist.
- Natural host15s/10s waits,60s runtime, long I/O, memory/Main responsiveness,
  storage performance/p95 and long-run concurrency reliability are NOT MEASURED;
  deadlines use injected monotonic clocks. Repeated unknown/close failure can
  intentionally retain the active slot/dependency until safe settlement.
- Native/OS/Windows10/11/UNC/AV/ACL/installed/offline/power-loss/directory-sync,
  malicious-local-edit/TOCTOU and release certification limits remain inherited.
  Controlled commit/recovery/integration is not production durability certification.
- E4 remains recorded-hash COMPLETE — PASS WITH LIMITATIONS; current-artifact
  handoff NOT PASS/general native and current-artifact/release UNVERIFIED;
  12 performance models PENDING_RUNTIME and all prior deferred gates unchanged.
- Full suite, repository-wide checks, build/native Judge/Runtime, UI smoke,
  benchmarks and unrelated phase tests were not run. No user student-data access,
  historical artifact restoration, native/Official mutation or Git publication.

## 9. Task review and STOP — historical delivery-time status

**TASK REVIEW: PASS within controlled S5 scope; user acceptance pending.**
Decisions resolved: NONE. Architecture deviations: NONE. No remaining blocker for
the tested integration; the host/native/public-transport/release limitations above
remain explicit and are not passed by compilation or simulated tests.

**S1–S4 COMPLETE — PASS WITH LIMITATIONS. S5 REVIEW COMPLETED — AWAITING USER
ACCEPTANCE (tracking IN_PROGRESS). S6 NOT_STARTED. Phase9E-5 IN_PROGRESS.**
Ready to begin S6: **NO — await user acceptance and separate authorization**.
STOP after S5; no automatic S6/UI/History/Restore/E6/E7 or commit/push/merge.

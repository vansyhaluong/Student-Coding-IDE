# Phase 9E-4 E4-S3 — Main-private Judge Integration Acceptance

2026-10-26. **E4-S3 COMPLETE — PASS WITH LIMITATIONS; formally user accepted.**

E4-S1/S2/S3 **COMPLETE — PASS WITH LIMITATIONS**, formally user accepted. Phase9E-3 **COMPLETE — PASS WITH LIMITATIONS**; Phase9E-4 **IN_PROGRESS**. User separately authorizes S4 only;9E-5 NOT_STARTED. This report preserves controlled service/Registry/Core evidence, **not native Judge acceptance, a completed Judge Engine/Submit or official persistence authorization**.

## 1. Scope and actual files changed

| Path | S3 change |
|---|---|
| `src/main/services/learning/judge-service.ts` | New operation-local comparator accumulator and reducer composition; no independent service/admission/lifecycle |
| `src/main/services/learning/official-case-plan.ts` | Prepare-only narrow Judge view, live guards, input-borrow count and successful release facts |
| `src/main/services/learning/exercise-service.ts` | Main-only runJudge on existing slot, actual identity/cleanup facts, final sealing and retained retry, guarded private result/raw completion |
| `src/main/services/learning/runtime/official-execution-contracts.ts` | Additive OfficialJudgeOperationHandle extending existing raw completion; type-only JudgeResult import |
| `tests/main/generic-judge-service.test.ts` |37 controlled integration/ownership/lifetime/privacy tests |
| `docs/PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md` | This review/evidence/stop gate |
| `docs/PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md` | Formal S2 acceptance, preserving original evidence/failures/limitations |
| `docs/PHASE-9E4-GENERIC-JUDGE-DESIGN.md`, `docs/PHASE-9E4-IMPLEMENTATION-PLAN.md`, `docs/IMPLEMENTATION-PLAN.md` | S2 closure, S3 review and stop status |
| `docs/CODEBASE-MAP.md`, `docs/CHANGELOG-THESIS.md` | Actual modules and scoped delivery |

Ignored local check config: `out/e4-s3/tsconfig.json` extends existing tsconfig.node.json, clears broad include and roots changed modules, new Judge test, three directly affected existing test files and required existing ambient declarations. It checks their imported dependency closure, not repository-wide root globs. No dependency/production configuration added.

Pre-existing S1/S2/design edits and seven user-intended historical document deletions were preserved. No history restore/investigation, unrelated cleanup, commit, push or merge. S1 comparator, S2 reducer and judge-contracts source/semantics remain unchanged in S3; accepted110/93 pure evidence is retained, not rerun or counted as new S3 evidence.

## 2. Integration and data flow

`ExerciseService.runJudge(owner, request, identity)` admits through the existing `admit`/active slot. The caller supplies source/plan identity only; it cannot supply ownerCurrent, cleanup qualification, comparisons or verdict. Public Run, raw Official and Judge compete for this same slot, without queue/replacement.

The operation-local engine is constructed synchronously before execution starts. In owned Prepare, existing full Registry acquisition validates the Official identity/signature/count and initializes a frozen narrow Judge view before returning the unchanged input-only execution/representInput descriptor to the existing language adapter. No pre-admission package I/O/acquisition or initialization race.

Existing driver -> execute -> required VERIFIED barrier -> synchronous Judge consumer -> exact-typed@1 -> PASS/CONTINUE or DIFFERENT/STOP. Core/driver then close normally or handle the actual runtime failure. Existing cleanup verifies resources and settles phase work. The service releases content, invokes the accepted reducer using real facts, seals a scalar result and only then clears the active slot, all in the same synchronous handoff segment after awaited Core cleanup.

The private handle keeps `completion()` for legitimate raw Official evidence and adds `judgeResult()` for Main-only scalar results. Neither is registered on public IPC/Preload/Renderer routes. Reads join the original operation promise; they do not start another cleanup wait, execute cases or create a second completion lifecycle.

## 3. Expected view, ownership and lifetime

OfficialJudgeView contains identity, return type, count and expectedAt(index), without args/visibility/case IDs. It borrows the one Registry tree, without full-set/Expected clone. Expected access requires execute phase and the existing caseAt index, owner, signal, lease and current-deadline guards. At the existing Core barrier, binding records Core's operation-budget context so a finished execute/compile phase deadline does not govern later comparison. No phase/operation deadline is reset or quota changed; Core/driver remain unchanged.

No Judge view/Expected/visibility/metadata is added to OfficialAdapterFactory's returned descriptor or child input. Expected values are temporary comparator arguments; only indexed scalar comparison results are retained. When execution/driver close settles or its existing cleanup wait fails, the engine drops the view; an aborted signal already prohibits reads after close, even while content remains pinned. Reads also fail after release/invalidation. Final reduction does not access Expected.

Plan input representation wrappers count actual outstanding borrows and forward the existing Registry data/release capability idempotently. This is observation of existing ownership, not a second ledger: Registry release can otherwise defer unpinning while derived copies remain. Existing content-release guards now also require zero plan input borrows; service-owned task count and Core resource settlement remain required. Successful contentReleased is recorded only after the retained release handle returns successfully. Failed/partial Prepare still keeps its original release handle.

Source hash is computed in Main from the validated immutable admitted request, the same frozen request passed to Core/adapter; caller-provided hashes/facts do not establish authority. Owner entry, session/generation, source revision/language and actual acquired plan identity are compared at handoff. An epoch on the existing owner entry is incremented by existing invalidate notifications, including loss/navigation, context switch and leaving Learning, so a sealed Judge receipt/raw completion cannot revive after idle navigation/reload or a context/leave event after slot release. No new listener, ownership domain or lifecycle is introduced; public Run contracts/behavior remain unchanged.

## 4. CONTINUE/STOP, failures and final handoff

The existing driver is unchanged and invokes the consumer only for the sequential RETURNED row after VERIFIED barrier, with its existing before/after operation/owner checks. The consumer checks initialization/index/count, reads the guarded Expected, records existing ComparatorResult plus barrier evidence, and returns CONTINUE or STOP. Invalid config/Expected/actual inconsistency or thrown view/consumer errors follow the existing sanitized infrastructure failure path, never student blame. Runtime/compile/syntax failures bypass comparison; no fake WA or case row is manufactured.

First/middle/final WA retains exact attempted prefix/unattempted suffix, including empty suffix for final-case WA. No extra execute after STOP/failure. Core operation timeout before/after comparison, including after provisional DIFFERENT, overrides success/WA through unchanged trusted cause handling and reducer semantics.

The service supplies owner/session/generation/source/language/plan facts from its admitted operation and snapshot, actual driver failure/consumer state, retained task/borrow counts, Core ownsResources and actual cleanup/release state. Secured-decision evidence comes from completed driver checks or a recorded Core phase failure, not a caller flag. Required cleanup includes FINALIZED/VERIFIED, clean process, removed workspace, no pending I/O, execution done and no remaining owned work. Release must succeed before an eligible final result is sealed; actual facts are then checked by the unchanged reducer. There is no await between the final owner check/reduction and slot release.

Release failure retains the same active slot and pin; a sanitized failure and ineligible result are observable. Retry joins existing cleanup and retries the retained release, without reacquisition, case launch or comparison. A retained input borrow blocks content release even after Core cleanup completes. Once it is released, the same operation can safely finalize.

An unexpected finalizer exception retains the slot with a private failure marker. Result reads reject safely instead of invoking a preview that could issue an unsealed candidate; managed retry can complete the scalar handoff without releasing/comparing again. Only successful sealing is cached once. Later valid reads return detached scalar copies; stale/lost-owner reads reduce to ineligible invalidation, not another final seal. Pending/unverified cleanup cannot create a candidate; legitimate unsettled RESULT_PENDING evidence is represented without an invented prefix.

Judge eligibility is not saved/completed/commit authority. S5 still needs separate authorization, same-operation retention/commit design and commit-time owner checks. This step creates no Accepted/Failed record or History.

## 5. Controlled verification and actual evidence

New fixture uses real service, ExerciseSession/Core, Registry/reader/accounting and temporary filesystem checkpoints, with controlled lease/process ports. Fake adapters implement the public Divide math independently from indexed args; they do not receive Expected. Private process/compile observations are synthetic, not actual C#/Node/Windows Job evidence. All test-owned Registry ledgers return to zero on disposal, and test deletion targets are checked under the intended temporary prefix.

| Command / scope | Actual result |
|---|---|
| Initial `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/generic-judge-service.test.ts` |27 PASS/2 FAIL in29 tests; historical fixture failures explained below |
| Same file, `-t "public Run owning\|timeout before comparison"` |1 PASS/1 FAIL/27 name-filtered exclusions; scalar-only diagnostic identified trusted INTERNAL_ERROR from the mis-targeted clock fixture |
| Corrected/expanded new file |32 PASS/0 FAIL/0 SKIP |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/generic-judge-service.test.ts tests/main/official-case-plan.test.ts tests/main/official-runtime-service.test.ts tests/main/exercise-service.test.ts` |94 PASS/0 FAIL/0 SKIP across4 files: then34 new Judge tests +60 direct existing regressions;15.51s total |
| After raw release-completion/lifetime additions: new Judge file + `official-runtime-service.test.ts` |55 PASS/0 FAIL/0 SKIP: final35 Judge +20 affected private-completion regressions; other40 direct regressions reused from preceding PASS because unchanged paths |
| Final Judge file, `-t "idle navigation\|new generation\|legacy Official"` |3 PASS/32 name-filtered exclusions after applying document-epoch guard to Judge raw completion; no other changed behavior requiring a full repeat |
| Final idle-context/leave addition, same file `-t "idle navigation\|idle context\|new generation\|eligibility on context\|eligibility on leave\|legacy Official"` |7 PASS/30 name-filtered exclusions in final37-test file. These cover the2 new post-slot-release context/leave tests and affected owner/raw-completion paths; other previously passing cases remain reused. No behavioral FAIL or native SKIP. |
| `node node_modules/typescript/bin/tsc --noEmit -p out/e4-s3/tsconfig.json` |Final PASS; changed source/tests and imported closure, no diagnostics |
| Targeted ESLint: judge-service.ts, official-case-plan.ts, exercise-service.ts, runtime/official-execution-contracts.ts, generic-judge-service.test.ts |All5 files PASS. Last service/test edits rechecked as the explicit affected2-file list, PASS; other3 unchanged from their PASS |
| Scoped build/emission |NOT RUN: no bootstrap/bundler/harness/native/ABI/resource composition configuration change requiring emission; TS imports checked by scoped tsc. No emitted-artifact/native acceptance claim |
| Static public-boundary/prohibited-path audit and git diff --check, including new files |PASS; no public Judge imports/transport or prohibited production/resource changes |

**97 unique relevant tests PASS after corrections:37 new Judge integration +60 direct regressions.** Do not sum reruns, filtered exclusions, S1/S2 historical counts or E3 native evidence. Final targeted excerpts validate only their affected additions. There are no unresolved executed S3 acceptance failures or native skips hidden as PASS. Name-filtered exclusions are not missing/untested native cells.

Historical failures preserved:

- Public Run fixture incorrectly passed a complete snapshot to the exact session-reference contract; corrected to sessionId/generation only. No public contract change.
- Before-comparison clock fixture jumped60s during a barrier, also crossing its existing caller12s wait; Core truthfully closed INTERNAL_ERROR, so TLE expectation was wrong. Fixture now advances within Prepare/compile/barrier budgets and reaches Core operation deadline before the barrier caller deadline. Core/driver/reducer unchanged. This is a synthetic boundary test, not a runtime benchmark or a new timeout policy.
- Restricted-token Windows execution requires approved scoped shell commands; no app security bypass, dependency install or configuration change.

No S3 typecheck/lint failure occurred. S1/S2 historical typing/lint failures remain in their unchanged evidence sections; they are not reclassified or rerun here.

## 6. Acceptance criteria covered

- C#/JS controlled all-pass yields candidate only after actual cleanup/release; reducer spy observes active slot still owned and Registry unpinned at seal.
- First/middle/final WA: exact STOP prefix/suffix, no extra case; raw runtime rows remain RETURNED.
- Trusted USER_EXCEPTION/INVALID_RESULT versus protocol infrastructure; C#/JS compile/syntax with zero cases; no comparison for failed cases.
- Pre/post comparison Core expiry, including WA, retains trusted precedence; no guessed wall-clock TLE.
- Missing/stale plan, invalid Expected/config/view exception and failed Prepare initialization produce infrastructure/ineligibility, no fallback or source/Expected leak.
- Admission/Prepare ordering, Run/Official/Judge single slot, delayed Registry handoff across invalidation, navigation/context/leave/shutdown/destroyed owner, stale generation and idle navigation/reload suppression.
- VERIFIED barrier before Expected reads; no Expected reads after close while still pinned, after release or during cleanup retry.
- PROCESS_UNRESOLVED barrier fault, caller-wait/pending FINALIZED checkpoint, failed content release, actual retained input borrow and finalizer exception preserve ownership and prohibit premature candidates. Managed retry never reacquires/relaunches/recompares or seals success twice.
- Existing raw Official completion still reports release failure and recovers after same-operation retry; Judge handle raw completion also observes owner invalidation.
- Public routing regression rejects Judge references/flags, retains only existing channels, emits no Judge event/snapshot, and sends no private payload through errors/replies. Public Run can still execute after safe release; no public contracts modified.

## 7. Limitations and stop gate

| Area | Status |
|---|---|
| E4-S1/S2 |COMPLETE — PASS WITH LIMITATIONS, user accepted; original93/110 evidence retained|
| E4-S3 controlled integration |COMPLETE — PASS WITH LIMITATIONS, user accepted|
| Core acceptance failures in the executed controlled S3 scope |NONE unresolved|
| Native Judge/correct-source/WA operations through actual changed C#/JS adapters |UNVERIFIED; E4-S4 NOT_STARTED|
| Emitted Main artifact/Windows Jobs/installed/offline acceptance |Not certified by S3; later separately authorized gates|
| Generic Judge phase completion / Submit / official save / History |Not claimed; E4-S4/9E-5 and unallocated public transport remain separate|
|12 inherited performance models |PENDING_RUNTIME|
| General Official60s / target-host / reliability / release certification |UNVERIFIED|

No native integration/63×2 screen/full suite/repository-wide typecheck or lint/production build/UI/Project/PTY/Monaco/drafts/Electron smoke/benchmark/profiling. No compiler/reducer semantics, C#/JS Runtime, native isolation, shared driver/Core, Registry ownership/policy, security, deadlines/quotas/Policy B,63 frozen Official sets/Expected/manifest/anchor/public Run/.gitattributes/Git configuration changes. Existing9E1-AC1/S5-AC1 loader/Windows/filesystem/offline/installed/source-lineage/historical FAIL/SKIP limitations and unmeasured forced native memory exhaustion remain. No absolute hostile-result authenticity guarantee.

Decisions requiring new approval: **NONE**. Architecture deviations/dependency additions: **NONE**. Public Submit transport/IPC/UI is still a required unimplemented obligation under approved E4-D4, to be allocated explicitly before UI work; it was not silently added or discarded.

**E4-S3 formally accepted COMPLETE — PASS WITH LIMITATIONS.** Original37 controlled integration +60 focused regressions (97 unique PASS), scoped checks,2 historical fixture failures, filtered exclusions and limitations preserved without rerun. [S4 native review](PHASE-9E4-FINAL-ACCEPTANCE.md) is separately authorized; later-step rows above retain the original S3 handoff scope, not current phase status. No automatic Phase9E-4 closure or9E-5 authorization.

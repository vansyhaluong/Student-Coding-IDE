# Phase 9E-4 — Generic Judge Engine Implementation Plan

2026-10-26. **DESIGN / FOUR-STEP PLAN / E4-D1–D4 APPROVED by user.**

Phase 9E-3: **COMPLETE — PASS WITH LIMITATIONS**. Phase 9E-4: **COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope)**. E4-S1/S2/S3 **COMPLETE — PASS WITH LIMITATIONS**; E4-S4 **COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only)**, formally user accepted under Option A on2026-10-26.9E-5 NOT_STARTED. Original planning/execution records below are historical where superseded. Historical deletions remain user-intended; no restore/investigation.

**Option A — Recorded-hash Acceptance APPROVED:** functional Generic Judge acceptance uses the existing native-run artifact hashes only:4/4 operations PASS, C#/JS correct Accepted candidate7/7, wrong WA at case0/STOP with6 unattempted cases,22 Jobs, VERIFIED cleanup/content release/zero Registry ledger, and historical scoped typecheck/lint/Main emission/diff PASS. Current-artifact handoff remains **NOT PASS**; current native binary is a different hash and UNVERIFIED, and `out/main/index.js` changed after the run without full-app verification. No current-artifact/release certification. Finalized binary/current artifacts require appropriate release verification.12 models PENDING_RUNTIME; general Official60s/target-host/reliability/release UNVERIFIED; deferred loader/installed/offline/filesystem gates unchanged. No limitation becomes PASS. Historical receipts/hashes/drift audit are preserved.

This closure task is documentation-only: consistency review and scoped `git diff --check`, no tests/native operations/build/restore or production changes.9E-5 must design commit-time owner validation, same-operation hold-through-commit and storage/recovery using Judge eligibility. Public Submit transport remains unimplemented and needs explicit allocation under E4-D4. No9E-5 work is authorized.

**E4-S1 verification amendment APPROVED:** new comparator/contracts targeted tests, scoped typecheck/lint and git diff --check only. No repository-wide typecheck/lint, build, E3 tests/native integration/benchmark/UI smoke. This explicit authorization supersedes the general implementation quality-command paragraph for S1 only.

Normative companion: [Generic Judge design](PHASE-9E4-GENERIC-JUDGE-DESIGN.md). S1–S3 evidence user accepted and not rerun. [S4/final review](PHASE-9E4-FINAL-ACCEPTANCE.md) delivers exactly four native Divide Judge operations, scoped tsc/lint, separate Main emission/privacy audit and diff checks. No full suite/build,63×2 screen, UI/smoke/benchmark/performance-model/release-matrix work. Scope remains Main-private Judge only.

## 1. Task-start checklist and scope

| Checklist | Answer |
|---|---|
| Authorized package | E4-S4 four targeted native Divide Judge operations and final review/handoff only; S3 accepted |
| Goal/scope | Real service/C#/JS/native/comparator/reducer/cleanup proof; no production correction, extra native controls, storage or public API |
| Dependencies | E2 frozen full sets and E3 accepted S1–S6; E3-D1–D4 approved; 9E-0/H1–H5/L1–L12 remain binding |
| Decision gates | E4-D1–D4 APPROVED; S3 accepted, only S4 authorized; phase closure and9E-5 require separate user acceptance/authorization |
| Architecture/security | One ExerciseService/Core/Registry/driver; input-only language descriptor; Expected/actual/diagnostics private; no public API or second lifecycle |
| Required verification now | Four native Judge operations, scoped tsc/lint/emission/privacy/diff; no unchanged S1–S3 reruns or broader checks |
| Existing working tree | Existing S1–S3/design/docs, S3 diffs and seven intentional deletions preserved. Native-run22 fingerprints match, but final audit finds2 post-run ignored artifact changes outside S4 write paths; no source/data drift or artifact restoration. |

Out of scope for S4: production corrections without user-approved remedy, public Run comparison/wiring, Submit API/IPC/Preload/UI, Accepted/Failed persistence, Official data/fixtures modification, Runtime/Core/driver/native/protocol changes, extra dependencies, custom checker/language, release certification, broader native/performance operations or unrelated IDE checks.

The old roadmap's E4 safe Submit transport scope is excluded by approved E4-D4; it remains required but unimplemented and needs separately approved allocation before UI. Do not omit this obligation or claim later UI is ready because E4 completes.

## 2. Four-step sequence

Four steps separate pure behavior, reduction policy, privileged integration and new end-to-end evidence. A separate C#/JS implementation stage is unnecessary because E3 already delivers both runtimes. A repeat of the 63×2 E3 catalogue screen is unnecessary for this package.

| Step | Dependency / approval | Independently reviewable output | Status |
|---|---|---|---|
| E4-S1 — Pure comparator and private vocabulary | Design/E4-D2 accepted; S1 formally user accepted | [Accepted COMPLETE — PASS WITH LIMITATIONS](PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md):93 tests/0 FAIL/0 SKIP/scoped checks and historical lint failures retained | COMPLETE |
| E4-S2 — Pure verdict and eligibility reducer | S2 formally user accepted | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md):110 reducer +93 regression PASS, scoped checks and historical typing/lint failures retained; no rerun | COMPLETE |
| E4-S3 — Same-operation Judge integration | S3 formally user accepted | [COMPLETE — PASS WITH LIMITATIONS](PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md):37 controlled +60 regressions/97 unique PASS, original failures/exclusions/limitations retained; no rerun | COMPLETE |
| E4-S4 — Targeted Judge acceptance and handoff | S3 accepted; Option A formally user approved | [COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only)](PHASE-9E4-FINAL-ACCEPTANCE.md):4 recorded native operations PASS/16 comparisons/22 Jobs; current-artifact handoff remains NOT PASS after2 post-run artifact changes; no rerun | COMPLETE |

Every step stops for user review. Approval of a step's result is not permission to implement the next step.

The original survey recorded missing history/service. The user subsequently confirmed historical deletions are intentional and restored ExerciseService. Brief S1 check confirms service matches Git baseline and required E3 seams/dependencies exist; the source blocker is cleared without restoring/investigating history. Earlier observation is historical, not a current missing-service claim.

## 3. E4-S1 — Pure comparator and private vocabulary

### Objective and planned modules

Create `src/main/services/learning/judge/exact-typed-comparator.ts` and `judge/judge-contracts.ts`; focused proposed test `tests/main/exact-typed-comparator.test.ts`. These are planned locations under the documented Main Judge domain; update CODEBASE-MAP only once files exist. No dependency installation or public shared-contract export.

### Dependencies and data flow

Approved exact-typed@1 and L1–L12 semantics; existing ExerciseType/ExecutionValue vocabulary, runtime Unicode/density/bounded-value semantics. Pure input `(type, actual, expected, comparator identity)` -> PASS/DIFFERENT/INVALID_ACTUAL/INVALID_EXPECTED/INVALID_CONFIGURATION. Configuration/Expected validated before actual. No Registry/process/time/I/O in the comparator; deadline ownership remains in the caller.

Define private scalar case decision, verdict family, provisional/final state and eligibility input/result types. No persistence schema or public DTO. Preserve Compilation/Syntax subtype without fixing future UI spelling.

### Acceptance criteria

- All six types, exact order/shape/value semantics, -0 equals 0; no normalization/coercion/rounding/sorting.
- Rectangular wrong shape/length is DIFFERENT; ragged/sparse/wrong type/invalid Unicode are invalid data. Empty matrix shapes remain distinct.
- Expected package validation and actual runtime bounds remain separate; no L6 cap silently imposed on otherwise runtime-valid actual output.
- Unknown comparator ID/version fails closed, no dynamic checker. Comparator does not mutate inputs, allocate retained payload clones, invoke hooks or stringify/reparse actuals.
- Distinguish pure INVALID_ACTUAL from trusted harness INVALID_RESULT; the former does not itself authorize student Runtime Error.

### Targeted tests planned

Table-driven equality/difference/invalid tests for each type: int32 limits/fractions/overflow/NaN/Infinity/-0, boolean/string coercions, lone surrogates/astral text/composed versus decomposed Unicode/whitespace/CRLF, array order/length/empty/sparse, matrix row/width/cell/order and zero-width shapes. Configuration and invalid Expected precedence, frozen input immutability, no mutation after comparison. Include runtime-valid actual exceeding package typed-value limits to prove it stays DIFFERENT rather than a new quota failure. Use new synthetic test-local values; do not edit frozen sets or existing fixtures.

### Risks and limitations

`matchesExerciseType` alone is insufficient; any private helper must preserve established parser semantics without widening public Run changes. Do not add another package parser or generalized validation framework. Synchronous cost is bounded, not benchmark-certified here.

**STOP GATE S1:** report actual targeted test/quality evidence and changed paths, then wait for user acceptance. No reducer implementation or Runtime integration yet.

## 4. E4-S2 — Pure verdict and eligibility reducer

### Objective and planned modules

Create `judge/verdict-reducer.ts`, extend private `judge-contracts.ts` only as required; proposed `tests/main/judge-verdict-reducer.test.ts`. Consume existing Official evidence types as type-only dependencies. No service/driver/adapter behavior changes.

### Dependencies and data flow

S1 accepted. Pure reducer takes bound identity/source/operation facts, acquired plan count, scalar comparisons, real Official completion/failure evidence, current-owner and cleanup/release facts explicitly supplied by the later service integration. It produces provisional cause, final category/state and mutually exclusive Accepted/graded-failure candidate eligibility. It cannot manufacture authority from a TypeScript cast or from Renderer data. Tests construct synthetic private evidence; S3 must prove the facts are actually supplied by the service.

Use private observations to distinguish trusted USER_EXCEPTION/INVALID_RESULT from transport faults; use compiler's existing attributed COMPILE_ERROR/JS SYNTAX_ERROR, not duplicated diagnostic text parsing. Trust Core first reason for deadline/quota/lifecycle events. No new numerical ranking of simultaneous faults.

### Acceptance criteria

- Evidence table and precedence in design Sections 3–5 implemented exactly; all approved verdict families reachable with sufficient evidence.
- Identity/count/index/language/disposition/failure consistency checked; no-plan acquisition is not zero-test Accepted. Contiguous attempted prefix plus exact suffix; no overlap/duplicates/gaps/out-of-range indices.
- N distinct post-barrier PASS decisions plus coherent EXHAUSTED/COMPLETED and full eligibility are required for Accepted. CONSUMER_STOP must match WA, including final-case WA with empty suffix.
- Failure cases/Prepare/compile/operation failures retain real evidence, no fabricated case rows. Trusted compile/syntax with zero cases may qualify as graded failure after safe cleanup.
- Cleanup pending/failed/HISTORY_UNVERIFIED/PROCESS_UNRESOLVED or retained workspace/pending I/O/release failure blocks both candidate flags. FINALIZED alone and a resolved promise are insufficient.
- Owner invalidation prevents official eligibility/publication; provisional cause retained internally. Later storage outcomes do not exist in this reducer.

### Targeted tests planned

Synthetic evidence matrix: all-pass, first/middle/last WA, each valid harness failure, malformed/missing/unexpected-exit protocol, infrastructure/missing dependency, attributed compile/signature/syntax errors versus ambiguous compiler failures, timeout in each supported phase, trusted MLE/OLE. Assert raw OOM text/nonzero exit cannot create student attribution. Trusted timeout/quota versus RETURNED; post-hook expiry versus provisional WA; owner loss versus all-pass; cleanup caller timeout versus TLE. Mismatched identity/owner generation/language, incorrect suffix/count/disposition, duplicate/missing comparison, planAcquired=false and pending completion. Cleanup truth-table checks every required field and explicit release/work-settlement facts. No native process or data revalidation needed for this pure step.

### Risks and limitations

Coarse adapter failure kinds can hide protocol cause; reducer must consult private row and trusted endReason. Synthetic release/current-owner facts prove reducer behavior only, not actual service authority. Forced native memory exhaustion and malicious result authenticity remain inherited limitations.

**STOP GATE S2:** user reviews pure contracts/reducer tests and policy traceability. No service integration starts automatically.

## 5. E4-S3 — Same-operation Main-private Judge integration

### Objective and planned modules

Create planned `src/main/services/learning/judge-service.ts`. Narrow changes to `official-case-plan.ts`, `exercise-service.ts` and `runtime/official-execution-contracts.ts`; reuse `execution-driver.ts` unchanged unless a directly evidenced contract need is approved. No adapter/native/parser/protocol changes are planned. Proposed test `tests/main/generic-judge-service.test.ts`; focused extensions to `official-case-plan.test.ts` / `official-runtime-service.test.ts` only where the new seams touch them.

### Dependencies and data flow

S2 accepted and E4-D1 approved. In existing admitted Prepare, binding builds narrow identity/count/returnType/Expected-at-index view and initializes an operation-local Judge closure. The existing driver calls its stable synchronous consumer only after VERIFIED RETURNED. Compare -> record scalar PASS/WA -> CONTINUE/STOP. Runtime failures flow through existing completion without invoking the consumer.

Service retains accumulator on the same operation. Once execution and package tasks settle and VERIFIED final cleanup/content release succeed, it performs current-owner guard and pure final reduction synchronously before clearing the active slot. Judge completion contains no borrowed view/values; preserve private Runtime evidence access without expanding public channels. Pending/rejected completion and managed cleanup retry join the same operation, never rerun cases.

### Acceptance criteria

- No acquisition/initialization I/O before owned Prepare; no consumer-install race with immediately started execution. Failed initialization retains release authority and closes via existing lifecycle.
- Expected cannot appear in language factory/input descriptor/observation/public contract. View index/current-phase/owner checks use the existing lease and current Core deadline; no read after close/release/invalidation.
- Exactly one comparison per settled RETURNED case, before next launch; WA stops immediately with authentic prefix/suffix. Failure bypasses hook; consumer throw/invalid return produces infrastructure with existing cleanup.
- Existing operation deadline/owner checks surround comparison; no async hook, timers, queue, AbortController, second Core/admission/cleanup or package clone.
- Final receipt bound to real owner-entry/generation/session/source/language/plan; release succeeded, tasks/borrows empty, original cleanup facts checked. No late success after invalidation or post-hook expiry.
- Retry retained cleanup does not compare, reacquire, relaunch or finalize twice. Pending state never creates an eligible grade. Release/finalizer errors do not strand cleanup or fabricate successful handoff.
- Public Run requests/results/routes/events remain sample-only; public reference calls cannot select Official Judge evidence. No new API/IPC/Preload/channel/event or source/hidden-value logging.

### Targeted tests planned

Controlled service/Registry integration: all-pass, WA first/middle/last, trusted runtime and compile/syntax failure, invalid config, consumer error, timeout before/after comparison, owner replacement/navigation/leave/shutdown, before-release invalidation, missing plan, identity mismatch, barrier failure, release failure and retained task/representation settlement. Advance the existing injectable clock to prove Core precedence; no real timer policy. Delay cleanup beyond caller wait, retry it and assert launch/comparison/finalization counts unchanged, slot/lease retained until allowed release and ledger zero after safe completion. Assert no post-close Expected read. Targeted public routing/privacy parity checks for the changed service boundary; no UI/Project/PTY/Monaco/draft smoke.

### Risks and limitations

The E3 completion is evidence, not a sufficient authorization receipt. New attestation must be minted by service-owned state, not a caller-provided `ownerCurrent=true`. The private result is valid at handoff; 9E-5 still must perform commit-time checks/operation retention under its own approved work. If integration requires process/protocol/security/Policy B changes, stop affected work for review instead of widening S3.

**STOP GATE S3:** report actual controlled integration/privacy/lifecycle evidence and remaining native gaps; wait for acceptance before S4. No Submit/storage/UI wiring.

## 6. E4-S4 — Targeted Judge acceptance and handoff

### Objective and planned modules

Add bounded Judge acceptance tests/receipts, proposed `tests/main/generic-judge-service.integration.test.ts` and `docs/PHASE-9E4-FINAL-ACCEPTANCE.md` only when authorized/executed. Test-local harness code may reuse accepted existing native/owner test helpers without modifying frozen fixtures/sets. Update applicable CODEBASE-MAP/IMPLEMENTATION-PLAN/CHANGELOG only after verified implementation. No new test-only output is a production Judge API.

### Dependencies and data flow

S3 accepted, supported Windows/native environment and E4-D3 approved. Exercise the actual new Judge through existing service, Official plan, C#/JS driver, comparison and cleanup. Reuse E3 bridge evidence for unchanged transport/runtime paths; collect new receipts only for new Judge behavior. Missing host/dependency is UNVERIFIED, never silently skipped as PASS.

### Targeted tests planned

- Reuse E3's representative Divide (`ch2-04`) full Official set, once per language with a pinned correct test-local source and once with a deterministic wrong-value source. Four new Judge operations prove actual compare/all-pass and early-WA STOP integration without a full catalogue rerun. Confirm the wrong source produces a real mismatch and untouched suffix; if it does not, record the failure and correct the test-local source, never Expected/data.
- Record exact identity, comparison counts/decisions, disposition and cleanup/release facts privately. Six-type boundaries and full verdict/eligibility combinations rely on S1/S2 tests; do not multiply native runs to pad coverage already provided by E3.
- Changed-boundary regressions for student compile/syntax attribution, trusted runtime failure versus protocol infrastructure, owner loss and cleanup retry use S3 controlled tests and inherited E3 native fault evidence. If source changes actually alter one of those native mappings, stop and seek a specifically scoped extension before claiming it verified.
- Scoped privacy review of Judge imports, errors/results/logs and existing public Run routing. For new emitted modules, inspect affected build artifacts to confirm no Renderer/Preload reachability or private payload projection. No HTTP server/UI smoke or broad bundle/benchmark campaign is implied.

### Acceptance criteria

Four explicitly identified new Judge operations have complete receipts or their failure/unverified status is reported; each success has correct comparison, genuine attempted/suffix facts, current-owner handoff, VERIFIED/FINALIZED cleanup, workspace removed, settled tasks and released Registry ownership. A WA receipt is an expected successfully verified failure outcome, not an all-pass run. No student grade saved or exercise completion claim.

All S1–S3 focused tests and required implementation quality checks pass; record first failures/corrections, skips and evidence reuse without double counting. Boundaries match design, no unauthorized files changed, no data/Runtime/protocol/lifecycle deviation. Phase COMPLETE requires user acceptance of the full exit gate; limitations never become PASS by documentation.

### Risks and limitations

Correct-source four-operation evidence does not certify six-type native transport anew, all 63 algorithms, repeated reliability, forced native memory exhaustion or pending performance kills. Preserve E3's current-host-only limitations; no resource/deadline/case-count change to obtain a pass.

**STOP GATE S4:** deliver final TASK REVIEW and stop for user acceptance. No automatic 9E-5, public transport, Submit or persistence start.

## 7. Verification and exit gates

**Original design task:** only reads/tracing/consistency/diff checks. **Current S1:** targeted tests/scoped typecheck/lint/diff checks are separately approved and recorded in the S1 report. Historical E3 evidence is not new Judge evidence.

**Future implementation, only when separately authorized:** use installed Vitest with explicit affected files, e.g. `npx vitest run --maxWorkers=1 <affected-files>`, and the documented `npm run typecheck`, `npm run lint`, `npm run build`, plus `git diff --check` required by repository instructions. Final command lists depend on actual changed files. Record existing unrelated lint failures honestly; do not fix them in this package or claim full PASS. Any narrower quality-check scope needs explicit authorization; this design task does not silently inherit an implementation waiver from E3. No full test suite or unrelated smoke is proposed.

Final exit gate: all four steps separately accepted; comparator/verdict tests, real same-operation integration and new bounded native Judge acceptance support the stated claims; private boundaries and exact frozen identities preserved; no pending/unsafe-cleanup/stale Accepted; applicable docs reflect actual modules/status. New public API and persistence remain absent. E4 completion means eligibility implementation accepted within explicit limitations, not 9E-7/release certification or completed student exercises.

Inherited limitations remain: 12 models PENDING_RUNTIME; general Official60s, target-host/reliability/release UNVERIFIED; mandatory loader B1a/B1b gates under 9E1-AC1/S5-AC1; filesystem/symlink/UNC/reparse/offline/installed/source-lineage/line-ending and historical FAIL/SKIP evidence; forced native memory exhaustion NOT MEASURED. The accepted current-host 126-pair E3 screen is not rerun or upgraded by this plan.

## 8. Decision gate and handoff

E4-D1: narrow leased-view initialization/final handoff. E4-D2: private pure contracts/reducer shape. E4-D3: four-step sequence and bounded new Judge acceptance. E4-D4: explicit exclusion/future allocation of public transport. All **APPROVED by user**; existing verdict/security/Runtime policies unchanged. S1 defines types/comparator only.

**STOP: S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only). Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope);9E-5 NOT_STARTED.** Option A supersedes historical pending acceptance/closure wording above, without changing failed correspondence or deferred gates. No Submit completion, official-save authority or9E-5 implementation authorization.

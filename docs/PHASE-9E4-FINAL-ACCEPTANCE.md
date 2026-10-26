# Phase 9E-4 — Generic Judge Final Acceptance Review

2026-10-26. **TASK REVIEW: PASS WITH LIMITATIONS — Option A, recorded-hash acceptance APPROVED by user. Current-artifact handoff: NOT PASS.**

**Native run:4/4 PASS on the recorded artifacts.** A later final audit found2 post-run artifact changes; those current artifacts are UNVERIFIED. The observed native success is preserved, not promoted to certification of different binaries.

**E4-S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only).**
**Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope). Phase9E-5 NOT_STARTED.**
E4-S1/S2/S3 and Phase9E-3 remain formally user accepted **COMPLETE — PASS WITH LIMITATIONS**. The user explicitly approves Option A: functional Generic Judge acceptance applies only to the recorded artifact hashes of the native run. This closes S4/Phase9E-4 within that amended scope; it does not certify current artifacts, current-artifact handoff or a release, or authorize persistence/Submit/UI/History/completion marking. Historical receipts, hashes and drift audit remain unchanged.

## 1. Summary and evidence provenance

The actual Main-private Judge completes the four authorized current-host Divide operations through existing ExerciseService, compiled resource opener/Official Registry plan, unchanged C#/JavaScript adapters and real Windows Jobs, exact comparator, reducer and VERIFIED cleanup/release. Correct source executes all7 frozen Official cases per language and yields Accepted candidate. Deliberately wrong source returns a valid typed value with a real first-case mismatch, yields Wrong Answer and stops without attempting the remaining6 cases.

Exactly **4 native tests PASS /0 FAIL /0 SKIP**,4 admitted Judge operations,16 RETURNED/comparison rows and22 native Jobs. No additional native fault/control/public Run operation, native retry or dataset change. Test-only observers forward original source/native/comparator/reducer calls and contexts; they do not supply fake process success, override verdicts or manually request STOP.

| Step | Current status and accepted evidence |
|---|---|
| E4-S1 |COMPLETE — PASS WITH LIMITATIONS;93 targeted PASS/0 FAIL/0 SKIP, six-type exact-typed comparator/private contracts, scoped checks; historical sparse-literal lint failures retained in [S1 report](PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md)|
| E4-S2 |COMPLETE — PASS WITH LIMITATIONS;110 reducer PASS +93 affected contract regression PASS, scoped checks; synthetic precedence/consistency/eligibility, historical typing/lint failures retained in [S2 report](PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md)|
| E4-S3 |COMPLETE — PASS WITH LIMITATIONS, now formally accepted;37 controlled Judge +60 direct regressions/97 unique PASS, scoped tsc/lint/diff;2 fixture failures and filtered exclusions retained in [S3 report](PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md)|
| E4-S4 |COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only), formally user accepted under Option A;4 native operations PASS on recorded hashes. Current-artifact correspondence remains NOT PASS due to2 post-run changes; details below|

S1–S3 implementations/boundaries are unchanged in S4; no old tests were rerun. Do not sum overlapping historical93-test regressions or repeated runs into a phase-wide unique total. Existing controlled owner-loss/cancellation/protocol/infrastructure/cleanup-retry evidence and accepted E3 native runtime fault evidence are reused, not represented as new S4 operations.

## 2. Files actually changed in S4

Historical S4 execution changes below precede this documentation-only Option A acceptance. The acceptance updates only this report, the E4 plan/design, master implementation plan, decisions, codebase map and thesis changelog; it does not modify the test or any production/evidence artifact.

| Path | Change |
|---|---|
| `tests/main/generic-judge-service.integration.test.ts` | New four-operation native acceptance test and test-only forwarding instrumentation/receipts/fingerprint checks |
| `docs/PHASE-9E4-FINAL-ACCEPTANCE.md` | This final review, matrix and handoff |
| `docs/PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md` | Formal S3 acceptance; original results/failures/exclusions/limits preserved |
| `docs/PHASE-9E4-GENERIC-JUDGE-DESIGN.md`, `docs/PHASE-9E4-IMPLEMENTATION-PLAN.md`, `docs/IMPLEMENTATION-PLAN.md` | Current S3 closure/S4 review/phase-awaiting-acceptance status |
| `docs/CODEBASE-MAP.md`, `docs/CHANGELOG-THESIS.md` | Actual S4 test/evidence location and verified delivery |

Ignored artifacts only: `out/e4-s4/tsconfig.json`, `emit-check.mjs`, `exercise-service.cjs`, `metafile.json`, `emission.json` and `native/` receipts/summary. No production file, existing fixture, dependency/configuration, Official set/Expected/signature/manifest/anchor, native binary, Runtime/Core/driver/Registry/comparator/reducer/public Run/security/quotas/deadlines/Policy B change. Pre-existing working-tree edits and seven user-intended historical document deletions were preserved; none restored/investigated. No commit/push/merge.

## 3. Host, frozen data and artifacts

Preflight: Windows x64, kernel build **10.0.26200**, Node host **v24.16.0**, ABI **137**, .NET SDK10.0.112 available. Existing native capability `student-ide-learning-job-v1` loads successfully. Actual adapters retain installed stable SDK10.x/Node24.x discovery/probe policies; no install, patch lock, fallback or native rebuild.

The existing compiled resource opener validates its anchored package root. Main-private plan identity matches frozen source `ch2-04`, packageVersion2, testSet `ch2-04-official` version1, signatureVersion1, comparator exact-typed@1. Source Official bytes SHA256 **`1f328129d578c95354034581e356420d521ec8705f92beeee0dbbf21a0959a5a`**, signature SHA256 **`973256d8657cb889e277e4e5e515cc75211ac264dee1e49b57bd5262bfab4708`**. The actual comparator's Expected argument is checked against the frozen set in Main/test memory, without copying values into receipts/reports/children.

Recorded native-run artifact SHA256 (historical; current drift is listed below):

- Native binary: `af4e1262a7999900236e6554adf5e0ce8235b4cbcbcffa84fe657048340bfaf5`.
- Compiled opener: `0e806cb18f21262f69077cc381cdc64348d6895b26a1c0b6d647d6f56fb4cf1f`.
- Separate scoped Main-service emission: `73bd52ef94b0de438fddb5d6177cdbe29fdfa143cb543cdd4e30cb720110a863`.

**22 before/after fingerprints match within the native execution interval**, covering the actual Judge/service/plan/driver/Core/runtime source dependencies, manifest, all5 Divide assets, compiled opener/native/Main index. A later handoff audit finds20/22 still matching, with2 ignored artifacts changed after that run. S4 commands write only the new test/docs and `out/e4-s4`; they did not replace/regenerate `out/main`. The cause of the other changes was not investigated and they were not reverted. This is scoped evidence, not a fresh63-set audit or certification of the changed artifacts. Native tests execute source services via the test host with the recorded native binding/compiled opener; separate emission does not certify an installed/full-app build.

### Post-run artifact drift — unresolved handoff gate

The native run was recorded at02:40 UTC; final audit at03:20:28 UTC observes:

| Artifact | Tested SHA256 | Current SHA256 | Modification UTC |
|---|---|---|---|
| `out/main/native/learning/learning-job.node` |`af4e1262a7999900236e6554adf5e0ce8235b4cbcbcffa84fe657048340bfaf5`|`5d776bef407cde64a08eef92093e69d0d68ba80a2361c87cbdb6ea0873ef2d60`|03:00:04.999|
| `out/main/index.js` |`691ed4b331ea91acc984f18290f30a4aa362af7951f81be1fa4f2af1a4ef9abf`|`cf674974fdbc51031409762761e5ccb34ef6cba64401933027081e32f79edb57`|02:59:53.783|

All tracked source/data dependencies in the22-file audit and the compiled opener remain equal to the native run. The [current audit](../out/e4-s4/audit.json) records nativeRunStatus=PASS but status=NOT_PASS. No fifth/repeated native operation, binary restoration/rebuild or production remedy was attempted. The recorded four-operation result remains valid for its exact provenance; current native/Main artifact certification cannot be concluded.

## 4. Four actual native operations

Times are single observations in milliseconds, not release benchmark/percentile certification. Elapsed includes final cleanup/handoff; Core execution-to-close is separately recorded in receipts.

| Language/source | Actual verdict / eligibility | Attempted / compared / PASS | Disposition | Untouched suffix | Jobs / barriers | Raw bytes | Elapsed ms |
|---|---|---|---|---:|---|---:|---:|
| C# correct |Accepted / ACCEPTED_CANDIDATE|7 /7 /7|EXHAUSTED|0|8 /8|674|11888|
| C# wrong |WrongAnswer / GRADED_FAILURE_CANDIDATE|1 /1 /0|CONSUMER_STOP|6|2 /2|95|8535|
| JavaScript correct |Accepted / ACCEPTED_CANDIDATE|7 /7 /7|EXHAUSTED|0|9 /9|885|1449|
| JavaScript wrong |WrongAnswer / GRADED_FAILURE_CANDIDATE|1 /1 /0|CONSUMER_STOP|6|3 /3|306|714|

All4 compile/syntax results SUCCEEDED, execution observations RETURNED, runtime failure null and endReason COMPLETED. WA is a successful runtime return plus comparator DIFFERENT, not Runtime Error. Correct runs attempt indices0..6 and compare PASS exactly once each. Wrong runs attempt/compare only index0, keep indices1..6 genuinely unattempted and retain no fabricated case verdict rows. Each case's child request has exactly protocolVersion/caseIndex/args with frozen indexed args; no Expected/visibility/Judge metadata is transmitted.

Sources are fixed test-only implementations of the public Divide signature: correct quotient/remainder; wrong source adds1 to the returned remainder. SHA256 pins, in matrix order:

| Source | SHA256 |
|---|---|
| C# correct |`6cc23a26015b48063317a7aec7d6f472066604157037c4f7cd01032d84076634`|
| C# wrong |`149d1fe673fc11649f4798a20a34dbd09b7d6a8173cec702ef7c888533cd110b`|
| JavaScript correct |`45fc4de7e8cf7519e542a492d7647ad5ba5fc0ad48c4acd274a51511db542b0a`|
| JavaScript wrong |`dca13827ca2f17eddc5db1e9539d4f0741489e64a4671e5d7d3062dc2279c34c`|

Exactly22 Jobs:16 execute,4 compile/syntax,2 JavaScript Prepare probes. Every Job has trusted quota readback, complete coverage, settled process/observers/stdin and signaled retained identities before release; every native Job is released and handles closed exactly once. No new native runtime-failure operation is performed: distinction from protocol/infrastructure errors relies on unchanged accepted E3 fault observations and S2/S3 reduction/controlled integration, as authorized.

## 5. Ownership, final handoff and cleanup

Each sequential fixture has one existing service/Registry owner and one admitted operation. Test-only native module-location redirection forwards all calls to the existing binary. No new production Runtime/Registry/cache/queue/timer/lifecycle implementation. The four fixtures do not overlap; unresolved native ownership would retain its original owner and block later launches instead of replacing it.

Native evidence verifies:

- Exactly one owned Prepare and compile/syntax path, one monotonic operation deadline, phase-entry allowances within unchanged10s/30s/2s budgets and Core execution-to-close under60s. Caller cleanup wait remains12s. Test80s cap and retry0 do not alter Runtime limits.
- Judge initialized once in Prepare. Comparator sees only indexed RETURNED observations with settled process streams and matching successful VERIFIED barrier. All expectedMatched/afterVerifiedBarrier checks true; finalization occurs once per operation, while service slot is still active.
- Captured/observed owner entry, session/generation, language/source hash and Official identity match. Source hash is derived from the actual immutable request, not supplied ownership/cleanup flags.
- At reducer handoff: content release succeeded, Registry unpinned, task/borrow counts zero, executionDone true, ownsResources false; all native Jobs already released/closed. Actual workspace path is absent before sealing.
- Every result has FINALIZED + VERIFIED, processClean=true, cleanupComplete=true, workspace REMOVED, pendingIo=false; no release failure. Slot is released only after final scalar handoff.
- All4 fixtures end with Registry STOPPED, parsedBytes=0/nodes=0/rawBytes=0 after managed service/Registry teardown. Unpin occurs before handoff; zero ledger is measured after teardown because canonical resident data may legitimately remain cached until Registry.stop. No pending owner/root/borrow/I/O remains.

Negative eligibility conditions, owner loss, context/leave/reload/generation changes, retained cleanup/borrow/release/finalizer failure and no duplicate finalization are reused from accepted S2/S3 without rerun. Four positive native operations do not independently retest every negative native state. Stored receipts are historical snapshots of eligibility at handoff; fixture shutdown invalidates their owner and they confer no later commit authority.

## 6. Main-private isolation and public Run compatibility

Actual native stdin requests are input-only. C# generated harness excludes Expected/visibility/Official hash; JavaScript Source.json contains only code/functionName/schema with the full frozen count and fixed request source. Expected stays in leased Judge/test assertions. Receipt runtime projections contain only indices/kinds/booleans/cleanup/provenance, never actual/Expected/console/diagnostics.

Private scalar result retains approved operation/Official identity and scalar decisions, with no hidden case IDs/visibility/payloads/console/diagnostics. These provenance fields remain Main-only. Public snapshot/completion/stop requests reject Judge references; public Run is busy during the same admitted operation and never starts an additional native Job. No snapshots/events are published:0 observed per operation,0 service errors and0 boundary violations.

Separate emission bundles only the Main ExerciseService dependency closure: **50 inputs,272826 bytes**, including Judge/comparator/reducer; no Renderer, Preload, test or Official asset input. Source/public routing surfaces remain unchanged; accepted S3 IPC/channel/private-ref controls and E3 public Run compatibility are reused, without another native public Run operation or UI/HTTP smoke. No Submit/Judge IPC/Preload/Renderer route, source/hidden log or saved/completion acknowledgement is introduced.

## 7. Executed checks and preserved failures

| Command / check | Actual result |
|---|---|
| Native capability load + `dotnet --list-sdks` |Available; no Job/install/configuration change in preflight|
| `node node_modules/typescript/bin/tsc --noEmit -p out/e4-s4/tsconfig.json` |Final PASS, only new test and imported closure/required ambient declarations|
| `node node_modules/eslint/bin/eslint.js tests/main/generic-judge-service.integration.test.ts` |PASS, new test only|
| `node out/e4-s4/emit-check.mjs` |Final PASS; separate Main artifact/metafile, no production build or anchor replacement|
| `LEARNING_GENERIC_JUDGE_LIVE=1 node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/generic-judge-service.integration.test.ts` |**4 PASS/0 FAIL/0 SKIP**,1 file,25.01s total/22.94s tests; exactly4 operations, retry0, no native rerun|
| Native-run before/after22 fingerprints / receipts |PASS, unchanged=true within run,4 PASS receipts,0 retained ownership/errors/violations|
| Final `node out/e4-s4/audit.mjs` |NOT PASS for current artifact correspondence:2 changed artifacts after native run;20/22 match. Receipt counts/cleanup/native-run facts remain PASS. No native rerun.|
| Static public-boundary/S4 production-change audit and tracked/new-file diff checks |PASS; prior S3 production edits preserved, no S4 production edit|

Pre-native tooling history is retained:

- Initial scoped tsc rejected the new table test's Vitest context/options signature. Changed only new test collection to four sequential named tests with typed context and options; final tsc PASS. No native operation had started.
- Initial test-only esbuild loader did not intercept the existing `?raw` suffix, so no default export was found. Corrected only ignored emit-check.mjs resolution/namespace to load the unchanged raw harness text. Final emission PASS; no production loader/harness/configuration change or native execution during this correction.
- Windows restricted-token shell execution required approved scoped commands. No runtime/security policy bypass or dependency installation.

No native test FAIL/SKIP occurred. All original S1/S2 typing/lint failures, S3 fixture failures/name-filtered exclusions and E3/earlier historical failures/deferred gates remain in their reports; no historical recovery/deletion/reclassification. No S1–S3 tests, old fault controls, full suite/repository-wide lint/typecheck, full63×2 screen, broad profiling/benchmarks,12-model campaign, release repeats/target-host, UI/Project/PTY/Monaco/drafts/Electron smoke were run.

Private ignored evidence: [summary](../out/e4-s4/native/summary-2026-10-26T02-40-23-802Z.json), four language/mode receipts with the same run stamp, [post-run drift audit](../out/e4-s4/audit.json), scoped tsconfig and Main emission/metafile under `out/e4-s4/`. Original native receipts were not rewritten to hide drift; they describe their execution interval. Receipts use unique run-stamped names; they are not production resources/public APIs.

## 8. Limitations and remaining acceptance decisions

| Item | Status / obligation |
|---|---|
| Four recorded-host Divide native Judge operations |PASS on recorded artifacts; no observed core failure in those4 operations|
| Current-artifact handoff |NOT PASS; native binary/Main index changed post-run, their native certification UNVERIFIED|
| E4-S4 user acceptance |COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only); Option A explicitly APPROVED|
| Phase9E-4 closure |COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope); functional acceptance of recorded evidence only|
|12 performance models |PENDING_RUNTIME; none executed or graded as performance kills|
| General Official Runtime60s/all exercises/representative implementations |UNVERIFIED; single Divide screen is not general headroom proof|
| Target-host/reliability/release certification |UNVERIFIED; no20warm+5fresh/expanded borderline matrix|
| Deferred loader B1a/B1b, filesystem/symlink/UNC/reparse, offline/installed/Windows coverage |Inherited9E1-AC1/S5-AC1 and release gates remain mandatory where deferred|
| Native quota exhaustion/student fault matrix under new Judge |Not newly run; quota readback is not forced MLE proof; existing accepted evidence reused only in its original scope|
| Public transport/Submit/UI/History/persistence/completion |Unimplemented; E4-D4 allocation and later authorizations still required|

No new architecture/verdict/security/timeout/quota decision or production remedy is introduced. **The user resolves the acceptance baseline by approving Option A — Recorded-hash Acceptance.** This explicit amended scope supersedes the former pending baseline decision and closes the functional acceptance gate using existing evidence only. Current-artifact handoff remains NOT PASS; the current native binary with a different hash remains UNVERIFIED, and `out/main/index.js` changed after the native run and has not received full-app verification. Finalized binary/current artifacts must be verified in appropriate release verification; that obligation is not completed or waived here. No current artifact or release is certified. No extra native operation, rebuild or restoration is authorized. Phase9E-5 remains NOT_STARTED.

This documentation-only acceptance performs document consistency review and scoped `git diff --check` only. All test/typecheck/lint/emission/native results above are historical evidence, not new executions. Earlier S4 review and failed correspondence findings remain historical evidence, superseded only as to the amended phase acceptance decision.

## 9. Handoff conditions for9E-5 — description only

- Require an eligible Judge candidate and immutable Main-captured source/source hash/revision plus exact owner/session/generation/language/package/signature/test-set/comparator identity. Do not reconstruct a stored source from a later mutable draft or accept Renderer-supplied grade/cleanup facts.
- Revalidate current owner/operation and all commit-admission conditions before the approved irrevocable dispatch. A historical Judge receipt, completion promise or pre-teardown eligibility is not a commit capability. Cancellation before admission prevents a new write; later storage settlement follows already approved policy.
- Preserve the same ExerciseService operation/admission discipline through any future commit hold/join. Current S3 releases the active slot after Judge handoff;9E-5 must explicitly design/authorize the required same-operation hold-through-commit behavior, rather than use a stale result or add another lifecycle/Registry/cache. No such retention is implemented here.
- Storage/recovery owns immutable record construction, one-target Accepted versus eligible Failed routing, capacity, shared store lease, idempotency, staged/verified commit, retries/unknown outcomes and crash/shutdown reconciliation under approved A/B/H1–H5. Keep verdict, storage pending/saved/failed/unknown and completion separate. Only verified committed Accepted creates completion; history excludes hidden evidence.
- Public Submit transport/IPC/UI remains required but unallocated under E4-D4; assign it to an explicitly approved package before UI work.9E-5 remains NOT_STARTED, with no automatic transport or persistence implementation authorization from this handoff.

**STOP after recording this acceptance. S1/S2/S3 COMPLETE — PASS WITH LIMITATIONS; S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only); Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope);9E-5 NOT_STARTED. No9E-5 implementation is authorized.**

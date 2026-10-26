# Phase 9E-4 E4-S2 — Pure Verdict and Eligibility Reducer Acceptance

2026-10-26. **E4-S2 COMPLETE — PASS WITH LIMITATIONS; formally user accepted.**

Phase9E-3 **COMPLETE — PASS WITH LIMITATIONS**; E4-S1/S2 **COMPLETE — PASS WITH LIMITATIONS**, formally user accepted; Phase9E-4 **IN_PROGRESS**. The user separately authorizes S3 only; S4 NOT_STARTED. This report preserves S2 pure synthetic evidence, not native certification. Design/E4-D1–D4 and verdict/security/Runtime policies unchanged.

## 1. Scope and preserved baseline

Implemented pure reduction of typed Main-private comparator and Official execution facts. No case execution, comparison of values, clock/timer, I/O, Registry, cache, lifecycle, service attestation or persistence. Owner checks are consistency checks against input facts, not proof of actual owner authority.

S1 original evidence preserved:93 targeted tests PASS/0 FAIL/0 SKIP, exact-typed@1 six types, private contracts, scoped typecheck/lint/diff PASS and intermediate sparse-literal lint failures. Comparator source/semantics unchanged. S1 contract regressions were rerun solely because S2 directly extends private contracts; their results below do not add to S1's original count or constitute native certification.

Working tree already contained earlier S1/design files/status edits and seven user-intended historical document deletions. They were preserved; no historical recovery/investigation. No unrelated changes were reverted or cleaned up.

## 2. Actual changes

| Path | Change |
|---|---|
| `src/main/services/learning/judge/verdict-reducer.ts` | New `reduceJudgeVerdict`, pure evidence/precedence/case/overall/eligibility reduction |
| `src/main/services/learning/judge/judge-contracts.ts` | Necessary private input/output fact extensions; comparator/result/verdict semantics retained |
| `tests/main/judge-verdict-reducer.test.ts` | New synthetic fact tests only |
| `docs/PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md` | This review/evidence/stop gate |
| `docs/PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md` | User acceptance/closure of S1; historical results/failures retained |
| `docs/PHASE-9E4-GENERIC-JUDGE-DESIGN.md`, `docs/PHASE-9E4-IMPLEMENTATION-PLAN.md`, `docs/IMPLEMENTATION-PLAN.md` | Current S1 closure/S2 review and S3/S4 stop status |
| `docs/CODEBASE-MAP.md`, `docs/CHANGELOG-THESIS.md` | Actual reducer path and verified scoped delivery |

Ignored verification artifact `out/e4-s2/tsconfig.json` extends existing tsconfig.node.json, clears repository-wide include and roots the changed reducer/contracts, new test, directly affected S1 contract test and three existing required ambient declaration files. Imported TypeScript dependency closure is checked. No package/dependency/production configuration changed.

## 3. Contracts and data flow

New input facts: `operationIdentity` for comparison to captured identity, and indexed `comparisons` carrying the existing five-value ComparatorResult plus `barrierVerified`. Input comparisons replace the earlier input-only decisions field; scalar output decisions remain the existing compared/failure vocabulary. These are internal contracts with no production caller yet.

`contentReleaseFailed` distinguishes known failure from still-pending content release. Outputs retain first Core `endReason` and a fixed-field typed Runtime failure projection (kind/phase/caseIndex); they contain no private actual/Expected/console/diagnostics, source code, owner-entry object or storage result. The reducer copies only bounded scalar metadata/decisions/suffix/cleanup facts; it does not retain raw Runtime payloads or invoke the comparator/driver.

Input precondition: typed plain Main-private evidence from the existing validated Runtime/comparator and, later, service-owned facts. S2 validates cross-fact consistency, not arbitrary IPC JSON/proxies or result authenticity. In particular, no function in this step authenticates WebContents, issues a capability, asserts a real VERIFIED barrier or releases resources. S3 must construct these inputs from the same actual service operation.

## 4. Reduction and precedence

1. Owner-current, owner-entry identity, owner ID and session/generation consistency plus lifecycle invalidation suppress any eligible result. Source revision/hash/language and exact plan binding are also checked; owner loss cannot become WA/Accepted.
2. Validate acquired plan/count, exact exercise/package/test-set/signature/comparator versions/hashes and Runtime/comparison/prefix/suffix/disposition integrity. Missing plan is not empty success; malformed/inconsistent facts cannot create a student grade.
3. Core's trusted first timeout/quota reason supersedes parsed success/provisional WA and secondary process quotas. If no specific Core cause selects one, contradictory specific Runtime causes become infrastructure; no MLE/TLE/OLE ranking is invented. Preserve Core reason and Runtime phase separately.
4. WA requires a matching sequential RETURNED row, correct settled language process/exit facts, VERIFIED comparison barrier and DIFFERENT. A later trusted Core interruption wins; WA row remains scalar comparison evidence. Pure INVALID_ACTUAL/INVALID_EXPECTED/INVALID_CONFIGURATION is infrastructure, never trusted student INVALID_RESULT.
5. USER_EXCEPTION/INVALID_RESULT require private valid-envelope/process facts (C# FAILED exit0, JavaScript FAILED exit1/NONZERO_EXIT). Missing/malformed/wrong-exit protocol, untrusted crash/nonzero/stderr/JSON/diagnostic text never establishes student Runtime Error/MLE. Compile/Syntax grades reuse existing typed source/signature attribution; JS requires source syntax diagnostic, and C# does not duplicate compiler diagnostic-code policy. Mixed/ambiguous typed compiler failure stays infrastructure.
6. Final eligibility depends on valid ownership/binding/completion and qualified cleanup/release. Cleanup caller waits are not execution TLE. Retain earlier trusted WA/compile/runtime evidence provisionally when cleanup fails or is pending; no grade is fabricated from the cleanup fault.

The reducer recognizes existing prepare/compile/execute/operation timeouts, trusted compile/execute quotas and JavaScript Prepare-probe quotas where the existing contract permits them. It never measures elapsed time or guesses a quota from text. `decisionSecuredBeforeClose=false` without trusted interruption does not invent TLE; it prevents a candidate.

## 5. Evidence validation and eligibility

- Count must be 1..128 for an acquired plan. No acquired plan requires null count and no invented compile/cases/suffix/comparisons, and cannot yield a candidate even with a trusted Prepare interruption.
- Case indices are exactly the attempted contiguous prefix, language matches, only the final row can be failed, and the suffix is exact, increasing, dense and untouched. Comparison indices are a contiguous prefix, match RETURNED rows and VERIFIED barriers, and stop at the first DIFFERENT or invalid comparison. No missing/duplicate/out-of-range row or case after STOP/failure is accepted.
- CONSUMER_STOP requires a final WA with coherent prefix/suffix and no contradictory failure. EXHAUSTED requires successful compile/syntax, all N RETURNED and compared PASS, empty suffix, normal COMPLETED and no failures. EXECUTION_FAILURE/INVALIDATED are not exhaustion. A failed execute points to a real final attempted row; Prepare/compile/operation failures do not create case verdict rows.
- Accepted candidate requires current matching owner/session/generation/source/language/plan, acquired Official set, coherent complete all-pass evidence, secured decision, no interruption and full qualification.
- Graded-failure candidate requires trusted WA/Compilation-Syntax/Runtime/TLE/MLE/OLE with the same binding and final cleanup/release qualification. It need not attempt all cases, and trusted compile/syntax failure can have zero attempted cases.
- Required cleanup facts: FINALIZED + VERIFIED, process clean, cleanup complete, workspace REMOVED, no pending I/O, execution done, no owned resources, zero retained Registry tasks/borrows, successful content release and no release failure. Completion and qualification cleanup snapshots must match; stale snapshots cannot be combined.
- Pending completion/cleanup/release yields no candidate. Failed/unverified cleanup, HISTORY_UNVERIFIED/PROCESS_UNRESOLVED, release failure, invalidation and inconsistencies block both flags. Mutually exclusive result/eligibility unions preserve the separation between provisional state, final category and later storage outcome.

No candidate returned by this pure function is an official persistence authorization. S3 must attest real operation facts; later approved S5 commit admission must recheck ownership and storage conditions. No Accepted/Failed record or exercise completion is created here.

## 6. Executed verification

| Check / command | Actual evidence |
|---|---|
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/judge-verdict-reducer.test.ts tests/main/exact-typed-comparator.test.ts` | Initial102 reducer +93 affected contract tests PASS. Later109 reducer +93 PASS/0 FAIL/0 SKIP after added boundary checks and final contract updates. |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/judge-verdict-reducer.test.ts` | Final **110 reducer PASS/0 FAIL/0 SKIP**,1 file,1.34s overall/109ms tests, after late process quota/Core regression. S1 code/contracts unchanged since prior93 regression PASS. **203 unique relevant tests**, not sum of repeated runs. |
| `node node_modules/typescript/bin/tsc --noEmit -p out/e4-s2/tsconfig.json` | Final **PASS**, changed files/test/affected S1 assertions and imported closure. Initial fixture readonly/union errors corrected using precise mutable synthetic rows/language-specific constructors. Subsequent scalar failure projection union typing corrected with a private Pick projection, not by loosening Runtime contracts or skipping diagnostics. Both failed checks remain historical. |
| `node node_modules/eslint/bin/eslint.js src/main/services/learning/judge/verdict-reducer.ts src/main/services/learning/judge/judge-contracts.ts tests/main/judge-verdict-reducer.test.ts` | Final three-file pass before last reducer regression. Initial unused type import FAIL corrected. Final changed reducer/test recheck with explicit two-file list **PASS**; contracts unchanged since their PASS. |
| Read-only changed-boundary/import/diff audit | New reducer imports only a pure shared end-reason list and type-only private contracts. No public boundary export/wiring, no privileged execution import, no comparator edit. Prohibited production/asset paths have no S2 edits. |
| `git diff --check` plus new-file `git diff --no-index --check` | **PASS**, tracked changes and every new S2 deliverable; existing intentional deletions preserved. LF→CRLF warnings do not alter Git configuration/.gitattributes. |

No behavioral test FAIL or SKIP. Historical two scoped TypeScript failures and one unused-import ESLint failure are retained above. No suppression/disabled test/dependency installation. Vitest runtime assertions plus scoped TypeScript contract checks are separate evidence; neither is native verification.

## 7. Targeted coverage

All-pass C#/JS; first/middle/final WA including final-case empty suffix; USER_EXCEPTION and trusted INVALID_RESULT per language; typed source/signature compile/syntax failure with zero cases; ambiguous/mixed compiler diagnostics; all trusted timeout phases/compile/execute quotas and JS Prepare quota; protocol/infrastructure versus coarse runtime failure; post-hook timeout/quota superseding provisional WA/parsed RETURNED; Core first reason versus secondary quota without new ranking.

Owner/context/leave/shutdown loss and stale owner-entry/session/generation; exact acquired plan fields and observed source/language binding; planAcquired=false and invalid counts; missing/duplicate/reordered/out-of-range/sparse cases and comparisons; incorrect/sparse/overlapping suffix; unverified barrier; STOP/EXHAUSTED/failure inconsistency; missing/unsettled/wrong-exit process evidence; comparator invalid categories; missing completion; cleanup/release/retained-work truth table for both Accepted and WA, including failed/unverified proofs and snapshot mismatch. Frozen input/result privacy/determinism checks verify no input mutation or retained private payload.

## 8. Limitations and handoff

| Area | Status |
|---|---|
| E4-S1 | COMPLETE — PASS WITH LIMITATIONS, user accepted |
| E4-S2 pure reduction/checks | COMPLETE — PASS WITH LIMITATIONS, user accepted |
| Real owner authority / service attestation / leased consumer / final handoff | NOT_STARTED; E4-S3 only |
| Native Judge acceptance | NOT_STARTED / UNVERIFIED; E4-S4 only |
| Judge Engine completion / official storage authority | Not claimed; integration/persistence not implemented |
| Public Submit transport/IPC/UI | Required but unimplemented; E4-D4 still requires an explicitly approved package allocation before UI |
|12 performance models | PENDING_RUNTIME |
| General Official60s / target-host / reliability / release certification | UNVERIFIED |

No E3/old-phase tests, full suite/repository-wide lint/typecheck, production build, native C#/JS integration,63×2 screen, UI/Project/PTY/Monaco/drafts/Electron smoke or broad benchmark/profiling run. Existing9E1-AC1/S5-AC1 loader/Windows/filesystem/offline/installed/reliability/source-lineage/historical FAIL/SKIP limits remain; no memory-exhaustion or malicious-result authenticity certification. Runtime/driver/Core/Registry/Policy B/security/deadlines/quotas/63 frozen Official sets/Expected/manifest/anchor/public Run unchanged. No lifecycle/cache/dependency added. No commit/push/merge.

New decisions requiring approval: **NONE**. Architecture deviations: **NONE**. S3 must provide observed binding, real post-VERIFIED comparisons, secured-decision and cleanup/release facts from the actual service; S2 does not manufacture them. Review acceptance is requested for this scoped pure result, not for a completed Judge Engine.

**E4-S2 formally accepted COMPLETE — PASS WITH LIMITATIONS.** Original110 reducer PASS,93 affected comparator/contracts PASS, scoped checks, intermediate typing/lint failures and limitations preserved without rerun. [S3 integration](PHASE-9E4-S3-JUDGE-INTEGRATION-ACCEPTANCE.md) is separately authorized; its controlled evidence does not promote S2 synthetic facts to native certification. Earlier handoff rows above describe the S2 delivery scope; current phase status is in the implementation plan. No official storage/commit authority.

# Phase 9E-4 E4-S1 — Comparator and Private Contracts Acceptance

2026-10-26. **E4-S1 COMPLETE — PASS WITH LIMITATIONS; formally user accepted.**

Phase9E-3 **COMPLETE — PASS WITH LIMITATIONS**. Phase9E-4 **IN_PROGRESS**. The user accepts S1 and separately authorizes S2 only; S3/S4 NOT_STARTED. Design/four-step plan/E4-D1–D4 user-approved. This report preserves S1 pure comparator/contracts evidence, **not native Judge integration certification**.

## 1. Authorization and baseline

Only S1 comparator/private types/new targeted tests and applicable documentation updates. User explicitly approves scoped tests/typecheck/lint/diff checks instead of repository-wide checks/build. No reducer, precedence execution, Judge service, integration, Submit, persistence, History or Runtime change.

Existing planning docs/main-plan edits and seven historical document deletions were present at start. User confirms deletions are intentional; no restore/investigation. User-restored `src/main/services/learning/exercise-service.ts` exists, has no Git diff, and retains `runOfficial`, `bindOfficialCasePlan`, `runExecutionDriver`, private completion and content-release seams. Required E3 plan/driver/private contract dependencies exist. This brief compatibility check does not rerun E3 acceptance.

## 2. Files changed by S1

| File | Change |
|---|---|
| `src/main/services/learning/judge/exact-typed-comparator.ts` | New pure comparator |
| `src/main/services/learning/judge/judge-contracts.ts` | New Main-private types only |
| `tests/main/exact-typed-comparator.test.ts` | New focused behavioral/type contract tests |
| `docs/PHASE-9E4-S1-COMPARATOR-ACCEPTANCE.md` | This evidence/report |
| `docs/PHASE-9E4-GENERIC-JUDGE-DESIGN.md`, `docs/PHASE-9E4-IMPLEMENTATION-PLAN.md` | Approval/S1 status and superseded baseline blocker |
| `docs/IMPLEMENTATION-PLAN.md`, `docs/DECISIONS.md` | Approved decisions, authorization/scoped verification/status |
| `docs/CODEBASE-MAP.md`, `docs/CHANGELOG-THESIS.md` | Actual paths and verified scoped delivery |

Ignored local artifact `out/e4-s1/tsconfig.json` extends existing `tsconfig.node.json`, clears broad include and roots only the two modules/test plus three required existing content/harness ambient declarations. TypeScript checks their imported dependency closure. No dependency/package/production configuration changes.

## 3. Implemented behavior

`compareExactTyped(type, actual, expected, comparator)` returns PASS, DIFFERENT, INVALID_ACTUAL, INVALID_EXPECTED or INVALID_CONFIGURATION. Configuration/Expected validated first. Six existing types use exact typed value/shape/order; -0 equals 0. Arrays dense and ordinary; matrices rectangular with distinct empty shapes. Strings require valid surrogate pairing; no coercion, rounding, sorting, trimming, case/newline/Unicode normalization. Unknown ID/version/type fails closed.

Existing PACKAGE_POLICY L6 constants bound Expected. Actual uses existing Runtime output-byte/node bounds, without package-authoring caps. Canonical JSON byte cost is counted directly, including UTF-8, escapes and delimiters; no stringify/reparse, encoding buffer or whole-value clone. Traversal/equality are bounded; no mutation, per-language/exercise branch, I/O, process, scheduling, timer or retained state. Parser-origin plain JSON is the input precondition: this is not a hostile live-proxy sanitizer or replacement transport/envelope validator. Data descriptors reject accessor/hole elements without calling getters; conversion hooks are not invoked.

Contracts reuse Exercise/Official types through type-only imports. Scalar case/result fields exclude values, console, diagnostics, source and storage outcomes; result identity excludes owner-entry object. Owner/cleanup inputs are service facts for S2/S3, not runtime validation or minted authority. Eligibility uses mutually exclusive candidates and result-state discriminants. No reducer/precedence logic. Pure INVALID_ACTUAL does not establish trusted harness INVALID_RESULT or student Runtime Error.

## 4. Actual verification

| Check | Evidence |
|---|---|
| `node node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/main/exact-typed-comparator.test.ts` | Initial91 PASS; after2 boundary additions93 PASS; final corrected file **93 PASS/0 FAIL/0 SKIP**,1 file,441ms total/72ms tests.93 unique final tests, not sum of runs. |
| `node node_modules/typescript/bin/tsc --noEmit -p out/e4-s1/tsconfig.json` | **PASS**, final source/test/type assertions plus imported dependency closure; no diagnostics |
| `node node_modules/eslint/bin/eslint.js src/main/services/learning/judge/exact-typed-comparator.ts src/main/services/learning/judge/judge-contracts.ts tests/main/exact-typed-comparator.test.ts` | Initial3 files PASS. Added sparse literals caused **2 no-sparse-arrays errors** in test file only. Replaced with explicit hole construction; final `node node_modules/eslint/bin/eslint.js tests/main/exact-typed-comparator.test.ts` **PASS**. Production files unchanged since their PASS. |
| Read-only public-boundary search | No references/imports of new modules from shared contracts, Preload, Renderer or Main IPC; private contract imports are type-only. No public DTO/export/channel added. |
| Diff/whitespace | Tracked diff plus each new deliverable checked with git diff --check / git diff --no-index --check: **PASS**. LF→CRLF notices are warnings; .gitattributes/Git configuration untouched. |

Intermediate lint FAIL retained above. No test FAIL or SKIP. Vitest runs behavioral checks; scoped TypeScript separately validates `expectTypeOf` assertions. No test-only production hook. Test infrastructure/config already installed; nothing downloaded.

## 5. Verified edges

- Six types: equal/different/wrong type and invalid Expected/Actual; unknown comparator/type/config.
- Int32 endpoints/overflow/fraction/NaN/±Infinity; no boolean/string/object coercion; -0 in scalar/vector/matrix.
- Empty/whitespace/control strings, CRLF versus LF, Vietnamese/astral Unicode, composed/decomposed sequences, lone/invalid surrogates including string-array elements.
- Order/length/empty arrays, typed-array/array-like impostors, holes at start/after valid prefix, matrix outer/inner holes, null/ragged/wrong typed rows and valid wrong dimensions. `[]`, `[[]]`, `[[],[]]` distinct.
- Expected precedence before Actual access; accessor configuration/elements and conversion hooks never invoked. Frozen nested values unmodified, including -0.
- Expected encoded **exact256KiB PASS**, next byte INVALID_EXPECTED; corresponding Actual remains DIFFERENT. Escaped/control/multibyte byte accounting.
- Runtime-valid Actual beyond L6: scalar/per-element string size, integer-array count, string-array count/total units, matrix rows/columns/cells and serialized typed-value bytes. Reversing into Expected invalid. Direct-call oversized Runtime values bounded without inventing quota verdicts.
- Type assertions separate comparator inconsistencies from trusted harness observations; scalar result payload exclusion, no owner-entry output, mutually exclusive eligibility and pending/Accepted/infrastructure state contracts.

## 6. Status and limitations

| Item | Status |
|---|---|
| S1 comparator/private vocabulary/scoped verification | PASS within authorized scope |
| Formal E4-S1 user acceptance | COMPLETE — PASS WITH LIMITATIONS |
| E4-S2 reduction/precedence/eligibility validation | NOT_STARTED; contracts only |
| E4-S3 service authority/leased Expected view/hook/final handoff | NOT_STARTED / UNVERIFIED |
| E4-S4 native Judge acceptance | NOT_STARTED / UNVERIFIED |
| Public Submit transport/IPC/UI | Required/unimplemented; approved package allocation still needed under E4-D4 before UI |
|12 inherited performance models | PENDING_RUNTIME |
| General Official60s, target-host/reliability/release certification | UNVERIFIED |

No full suite/repository-wide lint/typecheck/build, E3 tests, native integration, benchmark or UI/Project/PTY/Monaco/draft smoke. No native memory-exhaustion or hostile-code authenticity claim. Preserve 9E1-AC1/S5-AC1 deferred loader/Windows/filesystem/installed/offline/reliability/historical FAIL/SKIP limits. No frozen Official asset/Expected/manifest/anchor, Runtime/Core/shared driver/public Run/ownership/quotas/deadlines/Policy B or old phase document edited. Architecture deviations/dependency additions: NONE. No commit/push/merge.

S2 must implement and test evidence validation/approved reduction policy. S3 must prove owner/operation authority and service-owned cleanup qualification; structural TypeScript types do not prove them. S1 cannot conclude official Accepted, authorize persistence or complete an exercise.

**S1 formally accepted COMPLETE — PASS WITH LIMITATIONS.**93 original targeted tests PASS/0 FAIL/0 SKIP, scoped checks, intermediate lint failures and limitations remain unchanged. [S2 work](PHASE-9E4-S2-VERDICT-REDUCER-ACCEPTANCE.md) is separately authorized; its private-contract extensions do not change accepted comparator semantics. Relevant S1 contract regressions are reported separately in S2, not added to the original93. No native integration certification or new official grade/storage authority.

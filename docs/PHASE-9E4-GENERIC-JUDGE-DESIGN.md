# Phase 9E-4 — Generic Judge Engine Design

2026-10-26. **DESIGN / FOUR-STEP PLAN / E4-D1–D4 APPROVED by user.**

- Phase 9E-3: **COMPLETE — PASS WITH LIMITATIONS**, formally user accepted.
- Phase 9E-4: **COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope)**. S1/S2/S3 **COMPLETE — PASS WITH LIMITATIONS**; S4 **COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only)**, formally accepted under user-approved Option A.9E-5 NOT_STARTED. [Final acceptance](PHASE-9E4-FINAL-ACCEPTANCE.md) preserves recorded4/4 native PASS; current-artifact handoff remains NOT PASS, current native binary/Main index UNVERIFIED and release certification UNVERIFIED. Release verification must verify finalized artifacts;9E-5 must design commit-time owner validation, same-operation hold-through-commit and storage/recovery. Public Submit transport remains unimplemented and requires explicit allocation under E4-D4. No implementation of9E-5 is authorized.
- Original design rationale below is retained. This dated approval supersedes proposal-only wording and the historical missing-service blocker: user restored `exercise-service.ts`; its E3 seams/dependencies and unchanged Git baseline were checked briefly. Historical document deletions are user-intended; do not restore/investigate them.

## Tóm tắt bài toán

Generic Judge must turn the existing Main-private Official execution evidence into exact comparison, truthful case/overall verdicts and a cleanup-qualified eligibility result. It must reuse the single ExerciseService operation, leased Official plan and C#/JavaScript Runtime. It must not infer grading success from a returned value, exhausted loop or resolved completion promise alone.

This document and the [four-step plan](PHASE-9E4-IMPLEMENTATION-PLAN.md) are a design proposal, not an implementation or release acceptance report.

## Mục tiêu và tiêu chí thành công

1. Implement one allowlisted `exact-typed@1` for all six existing types, without exercise-ID or language-specific equality branches.
2. Compare only indexed `RETURNED` observations after the existing VERIFIED case barrier; stop at the first WA using the synchronous consumer.
3. Reduce real failure/completion evidence conservatively, preserve the attempted prefix and unattempted suffix, and distinguish student failures from infrastructure/protocol ambiguity.
4. Conclude Accepted only for the exact current Official identity, all cases compared PASS, valid completion and VERIFIED complete cleanup/release.
5. Keep Expected, hidden cases, actuals and diagnostics Main-private. No public Run changes, Submit API/IPC/Preload/UI, persistence or completion marking in 9E-4.

## Thông tin đã biết

### Authority and evidence read

**Fact:** all nine requested documents exist. None was recreated or restored. Relevant sections of REQUIREMENT, ARCHITECTURE, DECISIONS, CODEBASE-MAP, LANGUAGE-SUPPORT and IMPLEMENTATION-PLAN were consulted in authority order; searches/source reads were limited to Judge dependencies.

**Final working-tree observation:** the statement above describes the initial survey. During final checks, Git reported deletions that were absent at task start: `docs/PHASE-9E2-IMPLEMENTATION-PLAN.md`, `docs/PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`, `docs/PHASE-9E3-S1-PRIVATE-CONTRACTS-ACCEPTANCE.md`, `docs/PHASE-9E3-S2-CSHARP-OFFICIAL-RUNTIME-ACCEPTANCE.md`, `docs/PHASE-9E3-S3-JAVASCRIPT-OFFICIAL-RUNTIME-ACCEPTANCE.md`, `docs/PHASE-9E3-S4-DRIVER-HOOK-PRIVATE-ADMISSION-ACCEPTANCE.md`, `docs/PHASE-9E3-S5-OFFICIAL-RUNTIME-PILOT-ACCEPTANCE.md` and `src/main/services/learning/exercise-service.ts`. This task did not delete or restore them. The requested E3 design and ExerciseService were read before they disappeared; their references below describe that surveyed state, not a claim that the files still exist at handoff. The historical links may therefore be unavailable. Future integration must stop until the actual source baseline is available and reconciled under user direction; do not reconstruct deleted history or implement against assumed current source.

| Source | Binding detail used here |
|---|---|
| [DECISIONS](DECISIONS.md), ADR-025 / Phase 9E-0 approval, H1–H5 and L1–L12 | Six types, Main allowlist, 100%, privacy, one lifecycle, trusted grade/cleanup eligibility |
| [REQUIREMENT](REQUIREMENT.md), Learning Run/Submit and Submission History | Student verdicts separate from internal errors; saved completion requires committed Accepted |
| [ARCHITECTURE](ARCHITECTURE.md), Exercise/Judge/runtime boundary | ExerciseService owns execution; Judge consumes settled evidence; no second process/cleanup owner |
| [IMPLEMENTATION-PLAN](IMPLEMENTATION-PLAN.md), 9E steps and final E3 closure | Accepted prerequisites, downstream scope and current phase status |
| [Approved 9E design](PHASE-9E-JUDGE-SUBMIT-DESIGN.md), Sections 7–10 and 16 | Exact comparison, verdict names, precedence, fail-fast and H3 eligibility; section headings retain historical PROPOSED wording but 9E-0 approval governs approved policies |
| [E3 design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md), Sections B–G; [E3 plan](PHASE-9E3-IMPLEMENTATION-PLAN.md), S1–S6 and final closure | E3-D1–D4 approved; leased plan, input-only language descriptors, post-VERIFIED hook and same-operation cleanup |
| [E3 final acceptance](PHASE-9E3-FINAL-ACCEPTANCE.md), Sections 8–11 | Formal COMPLETE — PASS WITH LIMITATIONS, truthful failure evidence and Judge handoff |
| [E2 final acceptance](PHASE-9E2-FINAL-ACCEPTANCE.md), Sections 6–9 and dated closure | Frozen identities/coverage, 12 pending performance models and inherited release limitations |

Latest dated E3 acceptance/IMPLEMENTATION-PLAN closure supersedes the older pending-final-acceptance banner in the E3 design. Earlier status statements in historical documents are not new blockers or authority to rerun accepted work. This task updates only the main plan's current scoped handoff; it does not rewrite historical reports.

The older 9E roadmap includes safe Submit DTO/IPC/Preload within 9E-4. The user's current instruction explicitly excludes them. This proposal scopes 9E-4 to Main-private Judge and eligibility; public transport remains unimplemented and needs a separately approved package allocation before the later UI can use it (E4-D4). Approved privacy/product semantics are unchanged.

### Current-state architecture: implemented and reusable

Paths below are actual source paths, relative to the repository. Proposed modules are listed separately.

| Actual module / symbol | Reusable capability and limit |
|---|---|
| `src/main/services/learning/exercise-service.ts`: `runOfficial`, `admit`, `execute`, `cleanup`, `officialCompletion` | One active Run/Official slot, no queue; owner-entry/generation checks, owned Prepare, shared driver, retained cleanup/retry. Official references cannot use public Run snapshot/completion/stop/events. Completion is private evidence, not a grade. |
| `src/main/services/learning/official-case-plan.ts`: `acquireOfficialCasePlan`, `bindOfficialCasePlan`, `OfficialCasePlan.caseAt` | One existing full Registry lease, frozen identity, validated case count/signature, borrowed args/Expected. Acquired in Prepare; current phase/deadline guarded reads. Content releases only after cleanup and retained package work settle. |
| `content/exercise-package-registry.ts`, `exercise-package-budget.ts`, `exercise-package-contracts.ts` | Existing canonical tree/owner lease/accounting, Official schema and identity. No new Registry, parser, cache or full-set clone needed. |
| `runtime/execution-plan.ts` | Main-only signature/count/indexed input descriptor; excludes Expected, visibility and Judge metadata. `ExecutionValue` is a type union, not runtime validation. |
| `runtime/execution-driver.ts`: `runExecutionDriver` | Same session, language barriers and synchronous `CONTINUE/STOP`; checks owner/operation before and after hook, after barrier and before close. Hook gets immutable borrowed actual; exceptions/invalid/Promise return cause infrastructure failure. No hook for failed cases. |
| `runtime/official-execution-contracts.ts` | `OfficialCaseObservation`, `OfficialSettledCaseConsumer`, private handle/completion; `planAcquired`, disposition, compile/syntax, prefix/suffix, failure, endReason, cleanup. |
| `runtime/csharp-official-evidence.ts`, `javascript-official-evidence.ts`; existing adapters | Private RETURNED / USER_EXCEPTION / INVALID_RESULT / PROTOCOL_FAILURE / INFRASTRUCTURE_FAILURE / INTERRUPTED. C# valid FAILED requires exit 0; JavaScript valid FAILED requires exit 1. Wrong typed value/length remains RETURNED for Judge comparison. |
| `runtime/csharp-compiler.ts`, `csharp-diagnostics.ts`, `javascript-syntax.ts` | Existing compile/syntax attribution: C# COMPILE_ERROR requires source/binding error and no infrastructure error; dependencies/mixed ambiguity remain infrastructure. JS trusted parse-only syntax envelope identifies solution syntax. Judge must not guess from diagnostic text or generated filename. |
| `src/shared/contracts/exercise.ts`, `csharp-execution.ts`, `javascript-execution.ts` and validators | Existing cleanup/end reasons and safe compile/failure primitives; reuse types without exposing new private Judge contracts in shared exports. |
| `src/shared/contracts/execution-json.ts`, language response validators | Existing bounded strict transport parsing, duplicate/index/type/Unicode/exit checks. Preserve this path; do not decode child responses again inside Judge. |
| `src/shared/contracts/practice.ts`; `content/exercise-package-validation.ts`, `exercise-package-policy.ts` | Six-type vocabulary and package L1–L12 validation. `matchesExerciseType` alone does not prove dense arrays, Unicode validity or budgets. `validatePackageTypedValue` accepts bytes and reparses; do not serialize runtime actuals through it. |

**Fact: integration gaps, not E3 defects.** `caseAt` exists, but `bindOfficialCasePlan` exposes only identity/evidence/release to ExerciseService; `runOfficial` accepts an already-created consumer. A Judge cannot obtain Expected from that consumer today. Completion also lacks explicit session/owner authority and successful content-release attestation as a single Judge handoff. A handle reference/identity object by itself cannot grant those privileges. These are E4 seams to add, not capabilities already delivered by E3.

E3 accepted historical evidence: 126/126 exercise-language pairs, 1008/1008 cases, 110 new plus 16 reused operations, 1197 native Jobs, 115 unique S6 tests PASS after corrections; historical 1 unit FAIL and 3 filtered SKIPs preserved. These numbers are not new Judge test results. E2 supplies 63 full packages / 504 frozen cases (126 public, 378 hidden). No data or runtime verification was rerun here.

### Missing in 9E-4 versus downstream work

| Allocation | Work |
|---|---|
| 9E-4, proposed | Pure comparator, case/overall verdict contracts and reducer, synchronous Judge consumer, narrow leased comparison seam, owner-bound final eligibility handoff and targeted Judge acceptance |
| 9E-5 | Immutable submission capture/records and transaction authority; Accepted/Failed stores, idempotency, capacity, OS store lease, crash/recovery, saved/pending/failed/unknown, hold-through-commit and commit-time owner check |
| 9E-6 | Submission History and Submit presentation, aggregates, source view/Restore and public sample comparison UI; public transport allocation must first be explicitly agreed, not assumed implemented by E4 |
| 9E-7 | Full integration/release matrix, pending runtime performance models, mandatory deferred loader target hosts, reliability/resource/installed certification |
| Outside this package | Runtime redesign/optimization, protocol/native changes, public Run comparator wiring, authoring/Expected changes, new languages/checkers, custom Run, UI/Project/PTY/Monaco/draft smokes |

## Giả định

- **Assumption:** a future trusted Main caller supplies the existing admitted source request and exact `OfficialPlanIdentity`; it cannot substitute Renderer case lists, Expected or verdicts. Public request admission is not designed here. If this caller needs new authority, stop at that boundary for a separate design.
- **Assumption:** a bounded synchronous equality walk over already validated data fits the current hook model. No new latency measurement is claimed. If later targeted evidence shows unacceptable stalls, stop for approval of a remedy; do not introduce async scheduling or weaken limits.
- No assumption that current-host E3 PASS proves release certification, malicious-code authenticity, MLE exhaustion behavior or pending performance kills.

## Câu hỏi quan trọng

No missing input blocks E4-S1. E4-D1–D4 below are user-approved; only S1 is authorized. No decision is resolved through implementation convenience.

## Các phương án

**A — Recommendation: construct an operation-local Judge consumer from a narrow leased comparison view in admitted Prepare.** The view provides frozen identity, return type, count and guarded Expected access by index, without args/visibility/case IDs. Judge retains scalar outcomes only. It uses the existing driver hook and service cleanup/final handoff. Small binding/service edits, no process work; Expected stays outside language factories. Lifetime and final authority require focused tests.

**B — Binding-owned equality operation.** Keep `caseAt` entirely inside the binding and give the consumer an indexed `compareReturned(actual)` capability that calls the same pure comparator. Same lifecycle/bounds and no extra copies, but it places Judge dispatch/semantics in the content binding and makes separation/testing less direct. Practical if the team prefers stricter Expected encapsulation to the current content/runtime separation. Neither option needs a new Registry or runtime.

Post-completion comparison is unsuitable: it loses WA fail-fast and requires Expected beyond normal lease release or a new retained payload. Sending Expected to a child is incompatible with the approved privacy contract. These are not recommended alternatives.

## So sánh trade-off

| Criterion | A: narrow view + Judge closure | B: binding comparison capability |
|---|---|---|
| Reuse / complexity | Existing hook; small Prepare/final seams | Same seams; binding also dispatches comparator |
| Ownership | Judge owns comparison, binding guards lease | Expected most encapsulated; content binding owns equality invocation |
| Memory / process cost | Aliases, bounded scalar prefix; no extra child | Same, no demonstrated performance advantage |
| Maintainability | Pure comparator/reducer isolated from Runtime | More content/Judge coupling |
| Main risk | Escaped view or late final eligibility | Coupling can hide grading policy in binding |

## Giải pháp đề xuất

### 1. Proposed modules and data flow (E4-D1)

**Recommendation: A.** Planned paths, not actual files:

- `src/main/services/learning/judge/exact-typed-comparator.ts`: pure comparison and bounded typed guards over validated plain values.
- `src/main/services/learning/judge/judge-contracts.ts`: Main-private comparison, scalar case decisions, reduction/eligibility result.
- `src/main/services/learning/judge/verdict-reducer.ts`: pure evidence reduction and invariant checking, no effects.
- `src/main/services/learning/judge-service.ts`: operation-local consumer/final reduction composition, no independent service admission, resources or global cache. This matches the planned domain owner in CODEBASE-MAP; do not mark paths actual until implemented.
- Narrow edits to existing `official-case-plan.ts`, `exercise-service.ts`, and private Official contracts to connect the view and final handoff. Expected must not be added to `OfficialAdapterFactory`, `ExecutionPlan`, driver observation or shared/public DTOs.

```text
Trusted Main request/identity
  -> existing ExerciseService admission (same owner entry/generation/slot)
  -> owned Prepare -> existing Registry lease / OfficialCasePlan
       -> input-only descriptor -> existing C# or JS adapter -> child
       -> guarded comparison view -> operation-local Judge consumer
  -> existing driver: RETURNED -> VERIFIED barrier -> synchronous Judge
       -> exact-typed(actual, expected[index]) -> CONTINUE or STOP
  -> existing driver/Core close -> existing retained cleanup
  -> service verifies owner + completion + cleanup + package release
  -> synchronous private Judge final handoff (scalar result, no Expected)
```

The proposed Prepare initializer runs synchronously after identity/plan validation and before case execution, inside the existing owned load path. Install one stable forwarding consumer before `execute` can start; do not mutate a consumer after `runOfficial` returns because Prepare starts immediately. Initialization failure follows existing infrastructure/cleanup handling and retains the acquired release handle. No pre-admission acquisition/I/O. Revoke/drop the view at release; `expectedAt` reuses guarded `caseAt`, never a detached Expected clone. Normal Core close aborts reads, so final reduction uses captured scalar comparison results and identity/count only, not `caseAt` after close.

Memory: alias one Registry tree, compare one current actual/Expected pair, retain at most 128 scalar decisions and fixed identity fields. Runtime owns its existing bounded observation prefix and completion copies. Do not retain the view or another actual/Expected tree in the Judge result, error, log or cache. Any new package-derived representation must use existing accounting; stop if it cannot be represented under accepted budgets.

### 2. Pure comparator contract

Conceptual private signature: `compare(type, actual, expected, comparatorIdentity)` returns `PASS | DIFFERENT | INVALID_ACTUAL | INVALID_EXPECTED | INVALID_CONFIGURATION`. These names follow the approved 9E design; they are not public verdicts.

Validate configuration/Expected first; unknown comparator ID/version/type or corrupt Expected is infrastructure, never WA. Then validate actual according to the existing runtime typed domain before equality. Expected is already package-validated; defensive checks must be bounded and must not mutate/re-freeze/change it. Do not run an authoring constraint validator against actual output.

| Type | Equality and valid data |
|---|---|
| `int32` | Finite integer within [-2147483648, 2147483647], numeric equality; `-0` equals `0` |
| `boolean` | Only booleans; exact equality, no 0/1/string coercion |
| `string` | Valid Unicode, identical UTF-16 code-unit sequence; no trim, case-fold, newline conversion or Unicode normalization |
| `int32[]` | Dense ordinary JSON array of int32; equal length, ordered index equality |
| `string[]` | Dense array of valid strings; equal length, ordered exact string equality |
| `int32[][]` | Dense array of dense rectangular int32 rows; equal row count, row width and cells |

`[]`, `[[]]` and `[[], []]` are valid generic matrix shapes and are different from each other. Generic empty arrays/strings are valid even if an exercise's input domain forbids them. A rectangular output of the wrong dimensions is DIFFERENT/WA. Ragged/null rows, sparse arrays, wrong types, fractions, overflow, NaN/Infinity, lone surrogates and object coercions are invalid typed data. No rounding, sorting, tolerance, partial/prefix equality or source-dependent exceptions.

Bounds are asymmetric by origin: Expected uses approved package L6 caps (string 32768 units; int32 array 65536 elements; string array 1024 elements/65536 total units; matrix 1024 per dimension/65536 cells; serialized value 256KiB). Actual uses the existing validated runtime envelope/aggregate 1MiB and depth constraints, not newly imposed package caps. A larger but runtime-valid typed output must remain comparable and yield DIFFERENT if unequal, rather than become a new quota/invalid-result policy. Package L8 512KiB synthetic request/response checks are not a new live Runtime quota.

Reuse type vocabulary, constants and parser/validator semantics. `matchesExerciseType` needs explicit density/Unicode protection in this private comparator; do not change public Run validation as a side effect. No JSON stringify/reparse or full-tree clone for equality. Inputs are trusted-parser plain data, not arbitrary live objects; do not invoke getters, proxies, `toJSON` or conversion hooks. Keep traversal bounded; the surrounding driver performs trusted monotonic deadline checks before/after comparison. There is no async traversal, timer or worker.

`INVALID_ACTUAL` from a direct pure call is not automatically Runtime Error. A trusted harness `INVALID_RESULT` is Runtime Error. A malformed typed RETURNED envelope is protocol failure upstream; an allegedly validated RETURNED rejected by comparator is an internal evidence inconsistency and remains infrastructure. This prevents a Judge bug from creating student blame.

### 3. Verdict contracts and evidence mapping (E4-D2)

Keep three axes: (a) provisional/final execution-comparison outcome, (b) lifecycle/cleanup and official-result eligibility, (c) later persistence outcome. 9E-4 defines the first two only. Pending is a state without a terminal grade, not a new student verdict. Cancellation/owner loss is the existing Cancelled/Invalidated category.

| Approved verdict/category | Required evidence; exclusions |
|---|---|
| Accepted | Exact nonempty Official plan, successful compile/syntax, all indexed cases RETURNED and compared PASS, EXHAUSTED, no suffix/failure/invalidation and full final eligibility below |
| Wrong Answer | Settled successful typed RETURNED + comparator DIFFERENT. The row stays runtime RETURNED; driver STOP is not a runtime failure. |
| Compilation Error / Syntax Error | Existing trusted C# COMPILE_ERROR source/signature attribution or JS SYNTAX_ERROR from solution parse-only evidence; may have zero attempted cases. Preserve JS Syntax Error subtype under approved Compilation/Syntax family; no new public spelling is fixed here. |
| Runtime Error | Valid USER_EXCEPTION/INVALID_RESULT from the private decoder; controlled student crash only if positive trusted attribution exists. Current absent/malformed/nonzero protocol is not sufficient crash attribution. |
| Time Limit Exceeded | Trusted Core/phase/operation timeout and its original phase; never wall-clock guess, text matching or cleanup caller wait expiry |
| Memory Limit Exceeded | Trusted Job limit observation/mapped quota failure, including compile phase where provided; OOM text/exit code alone is insufficient |
| Output Limit Exceeded | Trusted Runtime raw aggregate/envelope accounting; no refund due to privacy redaction |
| Infrastructure/Protocol Failure | Invalid package/config/identity/evidence, missing/incompatible runtime, harness/compiler/transport/observer/ownership/cleanup uncertainty or consumer bug; safe finite reason code, no raw diagnostics |
| Cancelled/Invalidated | Existing owner/context/language/leave/shutdown cancellation; suppress late official publication and grade eligibility; retain cleanup responsibility |

Case decisions contain index plus PASS/WA or evidence-derived failure, without copying values. Compile/Prepare/operation failures have no invented case row. NOT_RUN denotes the existing unattempted suffix, not a fabricated verdict row or failed-case count. Overall graded-failure candidates are limited to approved WA/Compilation-Syntax/Runtime/TLE/MLE/OLE with trusted attribution; infrastructure/cancellation/pending can never become failed graded history.

C# attribution is reused from `CsharpCompiler`: its diagnostic classification already handles explicit binding/accessibility diagnostics at harness call sites and dependency errors. Judge does not duplicate code lists or classify by `source === harness`. Validate compile result/failure/phase consistency. A mixed/ambiguous failure is infrastructure, even when another diagnostic resembles a student error. Private stdout/stderr/diagnostics never enter the scalar Judge result.

### 4. Failure precedence and fail-fast

This is the approved 9E design Section 8 reduction order applied to E3 evidence, not a new ranking of hypothetical faults:

1. Check current owner entry, generation and operation binding at every asynchronous handoff. Invalidation suppresses publication/eligibility; retain earlier provisional evidence and cleanup faults internally.
2. Validate plan/evidence integrity. Reject missing/mismatched identity/count/indices/disposition as infrastructure. `planAcquired=false` is not an empty successful set. If no plan was acquired, do not synthesize a suffix from requested metadata.
3. Use Core's authoritative first interruption cause and original phase. Trusted timeout/quota beats parsed RETURNED. Runtime failure beats comparison. Do not invent an MLE>TLE>OLE ordering; contradictory unresolvable evidence is infrastructure. Keep secondary observations internally.
4. Compare only RETURNED after VERIFIED barrier. PASS -> CONTINUE; DIFFERENT -> store provisional WA and STOP. Invalid comparator/config/evidence -> throw a sanitized internal failure so the existing driver closes as infrastructure; do not label that STOP as WA.
5. Existing post-hook/pre-close checks secure the decision within Core60s. Expiry before it is secured supersedes provisional WA/PASS with TLE; owner loss suppresses success. Failures bypass the consumer and are reduced from actual completion, never simulated hook rows.
6. Final cleanup pending/failed/unverified prevents final eligible grade. Keep provisional WA/error separately; use pending infrastructure state or terminal Infrastructure Failure as appropriate, never Accepted. A resolved promise or FINALIZED state with HISTORY_UNVERIFIED/PROCESS_UNRESOLVED is insufficient.

The operation deadline covers phases, barriers and comparison before close. Existing final cleanup wait12s may extend beyond Core60s; elapsed cleanup time alone must not retroactively turn a secured decision into TLE. No new timer/reason race is introduced.

After WA at index k, the actual attempted prefix is 0..k, suffix k+1..N-1; compare only that prefix, never run another case. On execution failure retain whatever real attempted prefix the adapter reports and validate it against its suffix. Earlier PASS/WA may remain provisional if post-hook timeout/barrier/cleanup subsequently fails. `CONSUMER_STOP` must match exactly one decisive Judge WA and its prefix, including WA on the final case with empty suffix. `EXHAUSTED` without N successful comparisons cannot mean Accepted. No next launch after STOP/failure; cleanup retry never reruns or recomputes cases.

### 5. Completion and acceptance eligibility

Proposed private result is a scalar receipt containing frozen plan identity, bound operation/session generation and source/language context, required/attempted/compared/passed counts, scalar indexed decisions, provisional cause, final category/state, cleanup facts and eligibility reason codes. It includes no args, Expected, actual, case ID/visibility, console or diagnostics. This receipt is Main-private and is not a public API or a persistence authority token.

Two conceptual eligibility flags are mutually exclusive: `acceptedCandidateEligible` and `gradedFailureCandidateEligible`; neither says saved/completed. Both require an authentic same-operation completion, current owner at handoff, settled execution/package work and successful release. A pending completion may have neither and a provisional verdict. An invalidated result has neither even if all previous comparisons passed.

Accepted candidate requires ALL:

- `planAcquired=true`; exact exercise/package/testSet ID+version/hash, signature version/hash and comparator ID/version; trusted count 1..128 from the acquired plan, not Renderer/request claims.
- Same owner-entry/generation/session, language and immutable admitted source/revision context; no replacement/stale operation. Identity equality alone is insufficient.
- Successful compile/syntax, cases exactly 0..N-1, N one-to-one successful synchronous comparisons, every result PASS, suffix empty, disposition EXHAUSTED.
- No failure/interruption/consumer error, no contradictory/unhandled evidence; normal successful end reason COMPLETED and decision secured before close.
- Cleanup state FINALIZED and proof VERIFIED, processClean=true, cleanupComplete=true, workspace REMOVED, pendingIo=false; no owned resources, execution done and no retained Registry tasks/representation borrows.
- Service-controlled content release succeeded. The service performs the final owner guard and scalar reduction in the same synchronous handoff turn; no promise gap between guard and result sealing.

Graded failure candidates require the same ownership/trust/cleanup/release conditions, a decisive approved failure and a coherent prefix/suffix appropriate to its phase. They do not require all cases attempted or successful compile for a trusted compile/syntax error. Invalid Expected, protocol ambiguity, missing runtime, interrupted owner or unsafe cleanup cannot qualify.

**Proposed integration detail:** seal the scalar Judge result at the existing cleanup success path, after VERIFIED close, settled tasks and successful content release, before clearing the active slot. No Expected access in this finalizer. Keep the existing private Runtime completion available; the Judge handoff adds explicit operation/current-owner/release facts within Main, rather than treating old completion shape as sufficient. If cleanup or release is pending, retain the same operation and accumulator and let the existing managed retry join it. Do not finalize twice or acquire/relaunch on retry. Unexpected finalizer failure becomes infrastructure and must not leak a grade or bypass cleanup; cleanup/release still have their existing owner.

Future asynchronous consumption must recheck ownership; a historical receipt cannot authorize a later commit after owner loss. 9E-5 must add its own approved commit admission/hold-through-commit semantics to the same operation. E4 does not retain a second store lease, introduce a storage wait or claim a completed exercise. Cleanup failure is not a student failure; a later storage failure must not rewrite an already valid Judge verdict.

### 6. Privacy and lifecycle invariants

- Expected stays in leased Main-private Judge view only; language input remains signature/count/indexed args. Hidden input necessarily reaches its owned child for that case, but hidden metadata/Expected never does.
- Runtime actuals/console/diagnostics remain private evidence. No new public endpoint, subscription, polling route, error details or log contains them. Existing public Run stays sample-only and cannot select an Official plan/handle.
- One Registry/lease/accounting tree, one admitted service operation/Core, one driver, one authoritative cancellation reason, existing Policy B and managed cleanup/recovery only.
- Limits unchanged: Prepare10s, compile/syntax30s/2GiB, execute2s per case including startup/512MiB, Core operation60s, caller cleanup12s, aggregate raw output1MiB, one operation/no queue. Existing retained-envelope limits remain. No quota refund, batching or fallback subset.
- Preserve contextIsolation/nodeIntegration/sandbox settings and main/preload/renderer ownership. No renderer imports of private Judge/Official modules and no public shared Judge exports.
- No absolute secrecy or anti-tamper/authenticity guarantee against malicious local code. Existing execution is not a malicious-code sandbox; a typed response does not improve that security model.

### 7. Decisions requiring approval

All E4-D1–D4 entries are **APPROVED by user, 2026-10-26**. Existing comparator rules, verdict categories/precedence, H3 and Policy B are not reopened. Integration remains unimplemented.

| ID | Proposed selection | Gate |
|---|---|---|
| E4-D1 | Option A: synchronous leased Judge-view initialization in owned Prepare; existing hook forwarding; service-owned scalar final handoff after verified cleanup/release, before slot release | Approve before integration; no Expected in driver/adapter/public contracts |
| E4-D2 | Main-private pure comparator/reducer and scalar eligibility contracts; preserve JS Syntax Error subtype, invalid-RETURNED inconsistency as infrastructure; no new public verdict spelling | Approve contract shape before S1/S2; policy semantics remain approved baseline |
| E4-D3 | Four independent steps in linked plan; focused controlled integration plus bounded new real-native Judge acceptance, without rerunning E3 catalogue/release matrix | Approve plan; separately authorize each step |
| E4-D4 | Current 9E-4 excludes baseline Submit transport/Run comparison wiring; record future transport work as unimplemented, requiring explicit package assignment before UI integration | Approve scoped roadmap clarification; no automatic transfer/implementation in 9E-6 |

## Phạm vi MVP

- **Bắt buộc có:** six-type exact comparator; trusted verdict reduction; narrow private integration; fail-fast; exact prefix/suffix; final cleanup/release/current-owner eligibility; focused privacy/lifecycle tests.
- **Nên có:** finite private reason codes and explicit evidence assertions; synthetic boundary tests independent of frozen Official assets.
- **Làm sau:** persistence/commit/recovery (9E-5), public transport under separate allocation, UI/history/Restore (9E-6), performance models and release matrix (9E-7).
- **Không nên làm:** second runtime/Registry/cache/lifecycle, async hooks, timers/queues, per-exercise grading, changed Expected/domain semantics, public Run edits or fabricated release PASS.

## Rủi ro

| Risk / limitation | Consequence and mitigation |
|---|---|
| Borrowed Expected escapes its lease or finalizer reads after close | Revoke/drop view; retain only identity/count/scalar decisions; test close/invalidation/retry |
| Old completion mistaken for current authority | Bind to service operation/owner entry; seal at service handoff; future commit must guard again |
| Generic validator is weaker than transport/package validation | Add bounded private density/Unicode guards; do not apply package caps to actual or change Run |
| Generic runtime failure hides private protocol subtype | Reduce private observations plus trusted Core endReason; coarse failure alone never invents student blame |
| Hook cost consumes deadline or stalls Main | Bounded allocation-free traversal, existing before/after checks; later evidence can require a new approved remedy, no async hook |
| Unsafe cleanup mistaken for failed grade | Separate provisional cause from final eligibility; same retained cleanup retry, no replay |
| Inherited evidence limitations | 12 performance models remain PENDING_RUNTIME; general Official60s, target-host/reliability/release UNVERIFIED; forced native memory exhaustion NOT MEASURED |

Retain 9E1-AC1/S5-AC1 deferred loader B1a/B1b target hosts, filesystem/symlink/UNC/reparse, offline/installed, source-lineage/line-ending and historical FAIL/SKIP limits. Current-host E3 correct-source screen does not discharge these or prove performance mutant kills. No old Runtime investigation or benchmark is restarted by this design.

## Bước tiếp theo

E4-S1/S2/S3 **COMPLETE — PASS WITH LIMITATIONS**, user accepted; original evidence preserved. [Final acceptance](PHASE-9E4-FINAL-ACCEPTANCE.md) records4 native Divide operations PASS on recorded hashes, VERIFIED cleanup/release and22 Jobs. Final audit found native binary/Main index drift after that run: **current-artifact handoff NOT PASS** remains unchanged. User-approved Option A closes **S4 COMPLETE — PASS WITH LIMITATIONS (recorded-hash scope only); Phase9E-4 COMPLETE — PASS WITH LIMITATIONS (amended acceptance scope)**. No current-artifact/release/Submit/storage certification.9E-5 NOT_STARTED; STOP after documentation-only acceptance.

**STOP for S4 and Phase9E-4 user acceptance. Do not close the phase or start9E-5.**

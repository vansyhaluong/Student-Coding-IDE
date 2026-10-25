# Phase 9E-3 — Official Runtime Implementation Plan

2026-10-25. **DESIGN/PLAN AND E3-D1–D4 APPROVED. IN_PROGRESS — E3-S1 ONLY.**
S1 delivered for user acceptance; E3-S2–S6 remain NOT_STARTED and unauthorized. Original planning-task statements below are historical; the dated approval record at the end supersedes their status.
The user explicitly authorizes S1 only; S2–S6 require separate authorization.
Companion: [Official Runtime design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md).
Authority: [overall plan](IMPLEMENTATION-PLAN.md), [Decisions](DECISIONS.md),
[approved Judge/Submit boundary](PHASE-9E-JUDGE-SUBMIT-DESIGN.md),
[9E-2 final handoff](PHASE-9E2-FINAL-ACCEPTANCE.md).

## 1. Scope, prerequisite and unchanged contracts

Phase9E-2 **COMPLETE — PASS WITH LIMITATIONS**, formally user accepted. It delivers
63 full packages/0 public-only,504 cases (126 public/378 hidden),789 static
obligations,206 critical correctness+126 broader kills, release7 and matching
compiled anchor. All data/Expected/coverage/signature identities stay frozen.
The12 performance models remain PENDING_RUNTIME; Official60s UNVERIFIED. Keep
all historical failures/SKIP and9E1-AC1/S5-AC1 deferred gates.

9E-3 implements only private execution plumbing: owned Official plan, input source,
C#/JS runtime reuse, private observations, post-VERIFIED consumer hook, same-service
admission/cancellation/cleanup and public Run compatibility. It does not implement
Generic Judge/Comparator/verdict, Submit API/UI, Accepted/Failed Storage, History,
completion, public custom tests or Runtime optimization policy changes.

Before any production step: user approves/revises E3-D1–D4 and explicitly names
the work package authorized. Approval of this design or of9E-2 alone is not Step1
authorization. No future module below is an existing production capability.

Unchanged: single ExerciseService/ExerciseSession/Core/native/Registry lifecycle;
one operation/no queue; owned Prepare10s, compile/syntax30s/2GiB,
execute2s/case including startup/512MiB, operation60s and caller cleanup wait12s;
aggregate raw output1MiB and bounded retained envelopes/failure reserve; SDK10.x/
Node24 stable discovery; six exact types and existing security/Policy B. No
batching/multiple operations per submission, concurrency/worker/cache, lowered
coverage or SDK concurrency prototype. Public samples≤16, Official cases≤128.

## 2. Sequence and independently reviewable gates

Six steps follow distinct integration risks: pure/private ownership contracts,
two different language boundaries, one central lifecycle/publication integration,
representative runtime proof, then bounded full-catalogue evidence. They are not
chosen to reproduce the shape of an earlier phase.

| Package | Status | Dependency | Review output / boundary |
|---|---|---|---|
| E3-S1 — Private contracts, plan lifetime and protocol seams |IN_PROGRESS — delivered PASS WITH LIMITATIONS; awaiting user acceptance|E3-D1–D3 approved; explicit S1 authorization|Reviewable Main-only plan/schema/accounting and pure extraction; no Official production entry/consumer wiring |
| E3-S2 — C# input source and private evidence |NOT_STARTED|S1 accepted; explicit S2 authorization|C# runtime port and legacy Run parity, native proof in scoped integration |
| E3-S3 — JavaScript input source and private evidence |NOT_STARTED|S1/S2 accepted; explicit S3 authorization|JS port/probe/syntax/barriers and Run parity; no public Official route |
| E3-S4 — Driver hook and same-service private admission |NOT_STARTED|Both language ports accepted; explicit S4 authorization|Single-slot Run/Official exclusion, private routing and retained lifecycle proof |
| E3-S5 — Eight-ID, two-language Official pilot |NOT_STARTED|S4 accepted; pilot scope approved; explicit S5 authorization|Complete frozen-set compatibility/headroom/failure evidence; STOP before catalogue expansion |
| E3-S6 — Full63 bridge screen and phase handoff |NOT_STARTED|User accepts pilot, separately authorizes exact S6 scope|63×2 whole-operation bridge inventory, pending-model classification, scoped final review; STOP before9E-4 |

Each package starts IN_PROGRESS only when explicitly authorized; passes only on
actual stated acceptance evidence. A concrete blocker is BLOCKED, not a false
PASS. Completion/user acceptance is recorded separately from implementation
delivery. New findings cannot silently reopen an accepted policy or extend phase.

## 3. E3-S1 — Private contracts, plan lifetime and protocol seams

### Goal and scope / planned module paths

Define the input-only runtime contract and privately owned Official plan; make
signature/count and JSON parsing seams explicit before changing execution.

- Planned new Main modules: `src/main/services/learning/official-case-plan.ts`,
  `runtime/execution-plan.ts`, `runtime/official-execution-contracts.ts`.
- Narrow signature-generation/prepared-input extraction in
  `runtime/csharp-harness.ts`, `csharp-execution-contracts.ts`,
  `javascript-harness.ts`, `javascript-execution-contracts.ts`; preserve legacy
  wrapper behavior. No adapter launch/factory/IPC composition yet.
- If E3-D3 approved, extract the existing JS strict protocol JSON kernel to
  `src/shared/contracts/execution-json.ts` with unchanged bounds/semantics and
  internal imports; no public bridge export or separate parser policy.
- Proposed tests: `tests/main/official-case-plan.test.ts`,
  `tests/contracts/official-execution-internal.test.ts`,
  `tests/contracts/execution-json.test.ts`; focused existing harness/contracts
  tests touched by the pure extraction.

### Dependencies and data flow

Accepted compiled-root Registry and full schema are inputs, not reimplemented.
Fake/controlled already-admitted Prepare contexts may exercise the binding in
tests. Plan construction is reached only inside owned Prepare; source aliases
and identity stay private; language view gets trusted signature/count/args only.
No I/O in a factory before the service admits execution.

### Invariants to retain

Full lease vs public lease capability, exact version/hash/sample linkage, actual
owner-entry/generation, retained Registry tasks and registered package-derived
clones/representations. Guards for later serialization use current Core phase
deadline/signal; no stale Prepare10s closure or new timer. Release only after
uses/tasks/required cleanup settle; invalidation never publishes late data.
Do not apply package-asset shape/node caps to arbitrary student actuals as a
side effect of accounting. Public Exercise/sample cap and six types stay intact.

### Necessary tests / acceptance

- Plan identity/full-capability admission, missing/corrupt/mismatched/stale
  metadata/signature/test-set linkage, per-set IDs/public prefix; existing shared
  validators remain the authority, not duplicate tests of JSON.stringify.
- Owner switch/cancel/late acquire, one flight, pin/derived tasks/release timing,
  borrowed vs copied representation accounting; no unregistered full-package clone.
- Private counts17/21/128 admitted within Official contract; public17-sample
  Exercise still rejected; cases/Expected never appear in input-only descriptor.
- Six-type signature/arity/output shape and protocol parsing extraction parity,
  duplicate decoded keys/depth/UTF8/single-document bounds; legacy C#/JS harness
  wrapper output remains equivalent in the scoped fixtures.
- Run only new named tests and affected existing contracts/harness/Registry tests;
  scoped typecheck/ESLint on changed modules. No native execution/build needed
  unless an actual emitted-boundary change creates a direct dependency.

Acceptance: inspectable private interfaces/accounting inventory, precise guard
lifetime, focused tests PASS and no public export. Record package vs runtime
buffer budgets and failure reserves; absence of memory/performance measurement
is explicit. Risks: shared parser extraction/legacy shape drift or insufficient
accounting primitive. **Stop:** seek a narrow decision if ownership/parser/cap
semantics cannot be preserved. User reviews S1 before S2; no automatic execution.

## 4. E3-S2 — C# input source and private execution evidence

### Goal / scope / modules

Use signature/count/input source in the existing C# implementation, retaining Run
wrappers. Planned edits: `csharp-execution-adapter.ts`, `csharp-compiler.ts`,
`csharp-harness.ts`, `csharp-execution-contracts.ts`; Main-only
`csharp-official-evidence.ts` may house the private parser/observation mapping.
Use the S1 neutral protocol kernel; do not add PROTOCOL_FAILURE to the public C#
failure union merely to expose private semantics. No Core/native/SDK policy edit.

Dependencies: S1 accepted and explicit authorization. Actual SDK10/native Windows
integration prerequisite must be present for a real-runtime PASS. Missing native
environment is truthful SKIP/UNVERIFIED, with scope not marked fully accepted.

### Architecture / preserved flow

Trusted signature/count generates one harness; existing resolver/runtime capture
prepares once and Roslyn compiles once. For each admitted execute phase,
revalidate artifact/runtime, obtain indexed args from input source, serialize and
launch the same fresh dotnet process under2s. Keep raw accounting before decode,
bounded prefix/true suffix and failure headroom. Expected/visibility never reaches
compiler input, child stdin or harness source. C# valid FAILED envelope exits0;
malformed/nonzero/host anomalies need separate private evidence, with old public
Run mapping unchanged. Typed wrong shape remains returned data, not mismatch.

### Tests / acceptance / stop

- New `tests/main/csharp-official-evidence.test.ts`: returned/USER_EXCEPTION/
  INVALID_RESULT vs malformed/duplicate/wrong-index/exit/UTF8/extra document and
  ambiguous host failure; public mapping compatibility; source diagnostic alias
  is evidence, not a new student-fault classifier.
- Target affected `csharp-{harness,compiler,execution-adapter}.test.ts` and
  `tests/contracts/csharp-execution.test.ts`; simulated byte/deadline/quota/owner
  and request-source faults. Verify Prepare/compile execute exactly once, no
  expected-value dependency and truthful attempted prefix/suffix.
- New scoped `tests/main/csharp-official.integration.test.ts`: small complete
  frozen Divide/LeapYear sets, real Roslyn/dotnet/Jobs and deliberate controlled
  failure/cancel. Use current compiled native ABI, retained OS lease/checkpoint,
  actual barrier and cleanup evidence. Add bounded signature fixture when needed;
  test code only, no new Official cases/Expected.
- Existing C# multi-case integration regression only for changed semantics;
  its real-live flag is `LEARNING_CSHARP_EXECUTE_LIVE=1`. An unset flag/unsupported
  host cannot be reported as real integration PASS. Do not run a UI smoke.

Acceptance: input-only native execution and private distinctions proved in C#;
legacy public DTO/error mapping stable; original timers/quotas/cleanup untouched.
Risks: generated signature/diagnostic attribution, malformed response collapse,
SDK discovery reliability and buffer accounting. Performance not certified by
small sets. **Stop:** retain first failures; do not repair old resolver/SDK issues
or adjust deadlines without separate authorization. Await S2 acceptance.

## 5. E3-S3 — JavaScript input source and private evidence

### Goal / scope / modules / dependency

S1/S2 accepted; explicit S3 authorization. Edits confined to
`javascript-execution-adapter.ts`, `javascript-harness.ts`,
`javascript-execution-contracts.ts`, `javascript-syntax.ts` only where prepared
input type changes; fixed `javascript-harness-child.mjs` changes only if a proven
signature/count seam requires it. No new VM/process/security policy or public
sample cap. Reuse S1 protocol extraction and private evidence contracts.

### Flow and invariants

Same PATH-first Node24 identity/probe inside Prepare10s/512MiB; same post-Prepare
VERIFIED barrier. Source JSON has code/function/schema only; syntax runs parse-only
in one compile-phase Job; same post-syntax barrier. Each case revalidates identity
and files, requests its ordered private input and launches a fresh execute process.
JS valid FAILED exit1 versus RETURNED exit0, explicit protocol failures and raw
stderr rules remain language-specific. Retain USER_EXCEPTION/INVALID_RESULT
privately and unchanged public mapping, prefix/suffix/aggregate reserves.

### Tests / acceptance / risks / stop

- New `tests/main/javascript-official-evidence.test.ts` and affected
  `javascript-{harness,syntax,execution-adapter}.test.ts`,
  `tests/contracts/javascript-execution.test.ts`; private input/expected
  separation, count>16, strict protocol/exit and valid-wrong-shape semantics,
  callback-independent failures/cancel/raw output/late success.
- New `tests/main/javascript-official.integration.test.ts`: same small full-set
  scope as S2 and controlled syntax/user/protocol/cancel cases, real Node24,
  Prepare-probe/syntax/execute Jobs and VERIFIED cleanup. Verify invalidation
  during probe/stdin/case does not launch the next process or release early.
- Existing JS multi-case integration only for relevant changed behavior; selected
  C# protocol/Run tests if shared extraction changes. No Project/PTY/Renderer test
  expansion. Scoped typecheck/lint and private asset exclusion when touched.

Acceptance: both language ports retain one lifecycle, correct phase schedule,
private subtype evidence and Run compatibility. Risks: bypassed probe barrier,
top-level evaluation during syntax, exit-rule confusion, late publication or
copied samples-only schema. **Stop:** any such regression blocks integration;
no replacing Node selection/probe or widening quotas. User acceptance before S4.

## 6. E3-S4 — Driver hook and same-service Main-only Official admission

### Goal / scope / modules

After S2/S3 acceptance and explicit S4 authorization: add the Main-only Official
operation variant to `exercise-service.ts` and narrow
`official-case-plan.ts` binding; planned `runtime/execution-driver.ts` shares the
loop mechanics used by `csharp-orchestrator.ts`/`javascript-orchestrator.ts`.
Update sample wrappers without changing public behavior. `package-run-binding.ts`
only changes if necessary to call the common typed seam and maintain reservations.
No Submit IPC/Preload/Renderer entry. Existing `exercise-ipc-service.ts` should
remain unchanged unless a minimal explicit Run-kind rejection is required;
any such change needs the corresponding focused IPC tests, not new channels.

### Architecture/data flow and contracts

One central service admission/active Operation with internal kind; same observed
owner entry/generation, recovery guard, workspace/session and completion ownership.
The factory performs no probes/read before admitted Prepare. Claim orchestration
on the exact binding adapter used by Core. Preserve C#/JS-specific stage/barrier
schedule. Input and output read/parse stay in execute2s; hook and next-launch
guards stay in the operation60s budget.

After a successful returned case and VERIFIED barrier, call a bounded synchronous
trusted consumer: CONTINUE or STOP. Check Core operation and owner before/after.
STOP leaves a real suffix, records private consumer-stop and closes the same Core
normally; no runtime failure or WA is invented. Callback throw/invalid/Promise
return is infrastructure and triggers existing cleanup. Failures do not call a
continuation hook; private failure completion includes actual cleanup status.

No Official observations/console/diagnostics in `onSnapshot`, public last result,
ExerciseApi snapshot/completion or old Run route. Public Run cannot reference or
choose an Official plan. Existing invalidate/owner loss/leave/shutdown continues
to cancel private activity even though it is not publicly routed. Content release
remains after execution/tasks and VERIFIED complete cleanup. No extra task timer,
queue/Registry/cache or hidden async consumer lifecycle.

### Tests / acceptance / risks / stop

- New `tests/main/official-runtime-driver.test.ts` and
  `tests/main/official-runtime-service.test.ts`; affected
  `exercise-{service,session,ipc}.test.ts` and sample orchestrator tests only.
- Assert Run→Official and Official→Run BUSY, duplicate/mismatched orchestration,
  owner/generation replacement, failed preflight, pending Registry I/O, cancel in
  each phase/between cases/hook, trusted deadline vs late success, barrier failure,
  STOP prevents next launch, exact suffix and no fabricated result.
- Fake-clock/hook failure/Promise rejection tests, resumed cleanup without rerun,
  HISTORY_UNVERIFIED/PROCESS_UNRESOLVED retains slot/pin, shutdown order and
  zero final registered ledger after true completion; recovery admission retained.
- Sentinel private args/actual/console/Expected/test identity in all existing
  public reply/event/error/poll paths; no private observation cast to public DTO.
- Minimal both-language native service integration through the admitted private
  entry, not just direct adapter tests. Same real Core/Jobs; no Renderer UI.

Acceptance: single active slot/lifetime proven, public routing sealed, consumer
hook semantics proven, both languages can complete through this service. Primary
risk is privacy or ownership regression, not raw algorithm speed. **Stop** on any
private leak, unowned task, fail-fast race or need to alter Core policies. Await S4
acceptance; do not silently implement the later Judge as the test consumer.

## 7. E3-S5 — Representative Official pilot, both languages

### Goal / dependencies / proposed scope

S4 accepted; E3-D4 and explicit S5 authorization. Use the exact frozen full sets
below via Registry→private plan→same service→same Core/driver; no extra product
code beyond necessary pilot defect corrections within S1–S4 approved design.
New test modules/receipts may live under `tests/main/official-runtime-pilot.*`,
`tests/fixtures/learning/official-runtime/` and ignored `out/official-runtime/`.
They are test-only, not new shipping frameworks or app execution APIs.

| ID / full set | Why required |
|---|---|
| ch2-04 Divide | Multiple scalar args; ordered int32[] result |
| ch3-04 LeapYear | Boolean result, scalar exact typing |
| ch3-07 Ticket | Boolean input and mixed parameter types |
| ch5-03 CommonPrefix | string[] input/string result, empty strings/repetition within approved domain |
| ch5-07 MinWindow | Scalar strings, multiplicity and approved M1=A identity |
| ch7-01 TwoSum | int32[] input/scalar target, ordered array return |
| ch8-01 Reshape | Rectangular int32[][] input/output, multiple args,13 cases/output budget risk |
| ch4-03 DigitCount |21 cases, proves private count does not inherit public16 cap and exposes early headroom risk |

### Flow / tests / acceptance

Run each complete set once per language for this first integration screen; record
actual attempted case count, exact unattempted suffix if any, selection/source/
package/runtime identities, phase deadlines, bytes and real cleanup observations.
Controlled solutions are pinned test-only sources compatible with actual harness
entry rules; they are never imported into app bundles or resources. Any adaptation
from developer reference source is explicit and reviewed, not a runtime generator.

Test-only assertions compare returned values to accepted Expected to validate
bridge transport/order/type; **no production Comparator or verdict engine** is
created. Hook STOP/throw and malformed/user/syntax/compile/cancel cases use
controlled fixture programs, not changed Official sets or new golden Expected.
Do not treat an incomplete timed-out set as a passing prefix.

For every operation assert one Prepare/compile or syntax, fresh process per case,
correct required barriers, raw aggregate and retained envelope/reserve limits,
current-owner private completion and VERIFIED complete cleanup/ledger0. Check
meaningful Run unit/IPC regressions and Main-private bundle/dev-route exclusion
only where implementation touched those boundaries. A normal build is needed if
emission/composition changes; no unrelated workspace/editor smoke.

**Acceptance:** all selected complete sets execute in both languages within original
budgets with correct observed values and no private leak/ownership fault; controlled
failures are truthful and cleanup retained. Otherwise mark the specific acceptance
FAIL/UNVERIFIED and retain evidence, not PASS WITH LIMITATIONS hiding a failed
core requirement. Native failure-cause attribution may itself stay UNVERIFIED.

Risks: SDK Prepare cost, per-case startup/AV,13/21 cases, output accumulation and
retained prefix. No performance-model kill or target-host certificate from one
screen. **Stop for user pilot acceptance before expanding to63.** If a full set
cannot fit, present minimal investigation options; do not decrease coverage,
raise timeout, batch/split operations or activate concurrency.

## 8. E3-S6 — Full63 bridge screen and handoff to9E-4

### Goal / authorization boundary / modules

Only after user accepts S5 and separately authorizes S6. Default proposed screen:
63 exercise×2 language selections, each one real whole-set operation, sequential
under the existing slot.504 cases are across63 operations per language, never one
504-case operation. This is126 selected operations, not a claim of1008 successfully
executed cases or a fixed native Job count before evidence. Prepare probes and
failed operations affect actual counts.

Extend the existing pilot integration test consumer/receipts to the remaining
sets; no new production capability, corpus regeneration or required build merely
for a larger evidence count. Planned final report:
`docs/PHASE-9E3-FINAL-ACCEPTANCE.md`. Record actual paths only after they exist.

### Flow / preserved contracts / tests

- Bind manifest7, each frozen test-set/version/SHA/signature, full case count and
  owner to actual runtime observations. Confirm no resource/hash/public change.
- Every set/language must have a row: complete success, concrete failure, truthful
  SKIP/UNVERIFIED or NOT MEASURED. Never replace a failed set with a smaller one.
- Include high-count NextDate, DigitCount, Reshape and high-payload arrays/matrices,
  syntax/compile/user/protocol/quota/timeout/cancellation cases selected from actual
  bridge changes; reuse S2–S5 evidence where unchanged rather than rerunning it all.
- Retain same raw/envelope/failure-reserve limits, fresh Jobs/barriers, cleanup/
  retained tasks, no public private data. Capture startup and validation cost
  rather than inferring it from reference batches.
- If explicitly included in S6 authorization, create reviewed test-only functionally
  correct slow fixtures for the12 pending model descriptions and run them through
  the full pinned plan/original deadlines. Current authoring performance models are
  descriptors that deliberately do not execute; they are not ready-made native
  performance fixtures. Use no new Official cases or target semantics.

### Acceptance / risk / stop

Bridge acceptance requires all63×2 actual compatibility rows, truthful errors,
original policies and private/lifecycle integrity. A dataset blocked by deadline,
output or dependency remains a blocker to that full compatibility acceptance,
not an automatically deferred PASS. Separate an observed implementation defect
from missing host/evidence and from a potential requirements conflict.

Pending-model evidence must distinguish a relevant reached witness/execute timeout
from Prepare/compile/infrastructure failure or an earlier OLE; the latter does not
prove the algorithmic model killed. A current-host result is scoped and cannot
erase pending evidence on required machines. No automatic `PENDING_RUNTIME→PASS`
or9E-7 release certification. Record any proposed classification change for user
review with precise evidence, preserving historical pending states.

Release repeat/target matrix remains9E0-C2/C3 and9E-7:20 warm+5 fresh-app per
exercise/language/target machine; borderline50+10 and both approved hosts. Running
that broad workload needs separate explicit authorization; it is not implicitly
started by this126-operation screen. B1a/B1b loader/installed/offline/reparse/RSS/
reliability obligations from9E-1 stay open where not proved.

Output a final9E-3 packet with source/binding signatures, actual per-set rows,
private error/protocol mapping, lifecycle/privacy/Run parity, remaining pending
models, limitations and9E-4 consumption obligations. **STOP for user9E-3
acceptance; no Generic Judge, Comparator, Submit, storage or9E-4 implementation.**

## 9. Verification policy for later authorized implementation

All tests/commands in Sections3–8 are **planned, not run** in this design task.

- Run only tests touching changed private contracts/adapters/service/security
  seams. New tests must exercise ownership, quota, protocol, deadline, identity
  or compatibility behavior; no fixed output-count padding or full-suite claims.
- Use installed tooling, explicit file lists such as `npx vitest run --maxWorkers=1
  <affected-files>`; do not append a second maxWorkers through npm test. Actual
  command paths/host prerequisites are finalized when files exist.
- Real-native integration requires supported Windowsx64, matching built native
  module and installed dependencies; default skipped/live-disabled tests are not
  proof. Rebuild only when a direct changed artifact/ABI dependency requires it.
- Scoped typecheck/ESLint for changed modules plus imported contract closure;
  production build only on a changed emission/composition/harness-boundary gate.
  No full lint/full suite or unrelated Project/PTY/Monaco/drafts tests/smokes.
- Private boundary edits require targeted public Run IPC/DTO/routing parity and
  bundle/dev-server checks; this is a direct dependency, not blanket UI testing.
- Retain first failures, skips, ignored private receipts and overlapping-test
  accounting. Never add repeated assertion counts across steps to a full-suite
  total. Resource/data hashes and .gitattributes remain unchanged; doc diff check
  for status/report work.

## 10. Decisions, unavailable evidence and task-start gate

| Decision | User action needed | Before |
|---|---|---|
| E3-D1: input-driven reuse/same-service Main-only admission |Approve/revise architectural seam and scope |S1, then composition S4 |
| E3-D2: aliased plan/accounting and synchronous post-barrier hook |Approve/revise private lifetime/consumer contract; no policy waiver |S1 and S4 |
| E3-D3: private protocol evidence/kernel reuse, public Run mapping preserved |Approve/revise parser/evidence seam; no new wire version implicit |S1–S3 |
| E3-D4: six packages/eight-ID pilot and separate all63 gate |Approve/revise acceptance scope and required explicit work-package authorization |Any implementation; S5/S6 separately |

No design/proposed decision is APPROVED by this document. If approval changes an
accepted architecture/security policy rather than these implementation choices,
stop the affected scope and follow ADR change control first.

Task-start checklist for each authorized step: identify package/goal/out-of-scope,
confirm prerequisite acceptance and approved E3 decisions, inspect dirty files,
name actual modules/deadlines/private boundaries and minimum meaningful tests,
state native host/coverage assumptions and stop criteria. Preserve existing user
work; no commits/pushes/merges or unrelated fixes.

**This planning task's verification:** source/docs/dependency tracing and document
consistency only. No new runtime timing, memory, protocol execution, package
correctness, tests/build/lint/smoke or target-machine results. Infeasibility is
not proved by static ceiling sums; actual bridge feasibility remains UNVERIFIED.

Historical documentation availability is a separate limitation: the authoring
design and multiple old acceptance/specification reports disappeared during the
survey, after they had been read. The status writer stopped on the missing file,
then completed only existing documents; no history was recreated or deletion
undone. Their old links in retained reports may remain unresolved pending user
archive/restoration guidance. New design/plan links use available source and
authoritative final/decision records. This is not evidence that package data or
Runtime contracts failed, and does not authorize broader recovery work.
Document QA: nine changed/new documents pass whitespace/fences/status checks;
the two new planning documents have39 resolving local links. Scoped git diff
--check PASS (exit0, existing LF→CRLF notices retained).44 unique missing legacy
targets are recorded separately and were not repaired or labeled PASS. All
runtime/test/build/profiling evidence in this plan remains planned or historical.

**STOP: Phase9E-3 NOT_STARTED — DESIGN PROPOSED. Await user review of design and
plan, and separate explicit authorization before E3-S1 production work.**


## User approval / E3-S1 delivery — 2026-10-25

The user **APPROVES the Phase9E-3 design, six-step plan and E3-D1–D4**, and explicitly authorizes **E3-S1 only**. This dated record supersedes earlier proposal/authorization statements without deleting history. **Phase9E-2 COMPLETE — PASS WITH LIMITATIONS; Phase9E-3 IN_PROGRESS — E3-S1; E3-S2–S6 NOT_STARTED.** Architecture approval is not advance permission for later implementation.

| Decision | Approved selection | Scope restriction |
|---|---|---|
| E3-D1 — APPROVED | A: input-driven adapter reuse; future Main-only admission on the existing ExerciseService | Public Run unchanged; no S1 admission or Official execution wiring |
| E3-D2 — APPROVED | Leased plan and existing accounting; synchronous post-VERIFIED CONTINUE/STOP hook | S1 establishes contracts/controlled lifetime tests only; no production consumer hook |
| E3-D3 — APPROVED | Existing strict JSON kernel extraction; private C# evidence; public mapping and wire v1 unchanged | Native/private response mapping and execution await S2/S3 |
| E3-D4 — APPROVED | Six steps; eight-ID pilot in both languages, accepted before expansion to63 | Each later step needs its own authorization |

[S1 acceptance](PHASE-9E3-S1-PRIVATE-CONTRACTS-ACCEPTANCE.md): implementation delivered **PASS WITH LIMITATIONS — awaiting user acceptance**. Main-private leased identity/input contracts, pure signature/harness seams and existing strict JSON kernel extraction only. No adapter execution, service admission, Core/Registry/native lifecycle or public IPC/DTO change. Preserve all12 PENDING_RUNTIME models, Official60s UNVERIFIED, historical failures/SKIP and deferred9E1 gates. STOP before E3-S2; no commit/push/merge.

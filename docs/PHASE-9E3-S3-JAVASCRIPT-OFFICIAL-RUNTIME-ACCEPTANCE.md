# Phase 9E-3 / E3-S3 — JavaScript Official Runtime Acceptance

2026-10-25. **TASK REVIEW: PASS WITH LIMITATIONS.**
**E3-S3: REVIEW COMPLETED — AWAITING USER ACCEPTANCE** (execution tracking
IN_PROGRESS). The user formally accepts **E3-S2 COMPLETE — PASS WITH LIMITATIONS**
and authorizes E3-S3 only. Phase9E-3 remains IN_PROGRESS; E3-S4–S6 NOT_STARTED.

Authority: [approved design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md),
[step plan](PHASE-9E3-IMPLEMENTATION-PLAN.md),
[unchanged historical S2 evidence](PHASE-9E3-S2-CSHARP-OFFICIAL-RUNTIME-ACCEPTANCE.md).
S2's182 unique PASS/0 FAIL/0 SKIP (173 unit/contract +9 native), C# compatibility,
VERIFIED barriers/final cleanup/zero Registry ledger, failures and native coverage
limitations are preserved. No S2/C# tests were rerun; no shared extraction changed.

## 1. Task start, authorization and actual files

Branch: `feature/phase-9a-learning-mode`. At task start,14 tracked/untracked files
from the preceding S2 delivery were still uncommitted: its C# source/tests,
acceptance report and five status/map/changelog documents. All were preserved;
only the overlapping current-status documents received S3 updates. The historical
S1/S2 reports and C# implementation/tests were not edited. No reset, restore,
commit/push/merge, Git configuration or .gitattributes change occurred.

Only S3 input-source/private JavaScript evidence was authorized. S1/S2 acceptance
and E3-D1–D4 approval satisfy its prerequisites. No new decision or architecture
deviation was required. The applicable gates were input-only six-type/count
compatibility, original probe/syntax/execute schedule, strict protocol evidence,
current ownership/deadlines, raw quotas, truthful prefix/suffix, native barriers,
VERIFIED cleanup and public Run parity. Production Official service admission,
consumer hooks, Judge/Comparator/Verdict/Submit/storage/history and S4–S6 were
outside scope and remain unimplemented.

| Actual source/test file changed | Change |
|---|---|
| `src/main/services/learning/runtime/javascript-execution-adapter.ts` | Common input-driven implementation, existing public constructor wrapper and private Official loader/result; retained input borrow and current input guards |
| `src/main/services/learning/runtime/javascript-execution-contracts.ts` | Input-only preparation/loader/private evidence; legacy prepared Exercise type retained |
| `src/main/services/learning/runtime/javascript-harness.ts` | Shared preparation from signature/count; legacy Exercise/request compatibility; same exclusive files and identity validation |
| `src/main/services/learning/runtime/javascript-syntax.ts` | Prepared-input type widened only; syntax/process/error implementation unchanged |
| `src/main/services/learning/runtime/javascript-official-evidence.ts` | New Main-only strict-v1/native evidence mapper with JS exit semantics |
| `tests/main/javascript-execution-adapter.test.ts` | Existing Run regressions plus20 Official count/type/order/arity/ownership/accounting/lifetime cases |
| `tests/main/javascript-harness.test.ts` | Signature-only count128 preparation and exact Source.json/unchanged child assertion |
| `tests/main/javascript-official-evidence.test.ts` |24 new private protocol/type/exit/stream/native-fact controls |
| `tests/main/javascript-official.integration.test.ts` |15 real native integrations:14 Official/fault fixtures and1 public Run compatibility test |

Documentation changed: this report, `PHASE-9E3-IMPLEMENTATION-PLAN.md`,
`PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`, `IMPLEMENTATION-PLAN.md`, `CODEBASE-MAP.md`
and `CHANGELOG-THESIS.md` (15 files in S3 scope). No child asset, public/shared
contract, strict JSON kernel, Node discovery/probe, Core/native, Registry/reader,
package binding, production ExerciseService, compiled anchor or frozen data changed.

## 2. Input-source architecture

`WindowsJavascriptExecutionAdapter` retains the existing constructor arguments and
public result mapping. The same internal implementation also serves the private
`createOfficialJavascriptExecutionAdapter`; it owns the same existing probe and
syntax/execute native adapters. There is no second Runtime, process manager,
admission slot or lifecycle.

The trusted loader runs only inside the exact adapter's admitted Prepare. Its
caller acquires the S1 plan through the existing full Registry and current Core
owner/context, then passes only the `execution` descriptor (trusted signature,
caseCount and indexed args) and its input-representation capability. No full plan,
Expected, visibility, case IDs or Judge-side view crosses that port. Production
owner/service composition remains S4 work.

Prepare checks signature/count1–128, uses unchanged PATH-first stable Node24
discovery/identity verification and the owned512MiB probe, then prepares the fixed
harness and Source.json. Official inputs are not read/cloned/serialized in Prepare.
The post-probe VERIFIED barrier remains mandatory. Syntax runs once in compile
phase, parse-only, followed by its own VERIFIED barrier. Each execute revalidates
Node/files, reads the next guarded input, registers/serializes it in the current
execute budget and starts a fresh Node child. No captured Prepare deadline is
used for later input work.

The legacy `JavascriptPreparedExecution` remains valid. A separate input-only
preparation type permits signature/count without constructing a public Exercise.
Both use the S1 pure preparation seam; Source.json remains exactly
`{code,functionName,schema}`. Child stdin remains exactly v1
`{protocolVersion,caseIndex,args}`. The child already accepts the private count
range; `javascript-harness-child.mjs` needed no modification. Public samples≤16
and public Run contracts remain unchanged.

## 3. Private evidence and protocol

| Kind | Evidence/mapping |
|---|---|
| RETURNED | Strict valid typed v1 envelope, correct version/index, settled process/streams, exit0 |
| USER_EXCEPTION / INVALID_RESULT | Valid FAILED envelope with that exact harness tag, exit1 and consistent NONZERO_EXIT process fact |
| PROTOCOL_FAILURE | Malformed/duplicate/extra-document/invalid-UTF8/BOM/field/index/version/type response, missing response, inconsistent physical stderr/exit or valid envelope with wrong exit |
| INFRASTRUCTURE_FAILURE | Missing/unsettled process facts, native/host/transport/preflight failure; never inferred as a student error |
| INTERRUPTED | Trusted Runtime/Core timeout, Job-memory or output-quota facts; mapper also preserves trusted cancellation facts |

The existing S1 strict JSON kernel enforces fatal UTF8/BOM rejection, decoded
duplicate-key rejection, single-document grammar, depth12 and1MiB wire bounds.
The existing JavaScript response validator enforces exact v1 fields and six
types. No C# FAILED-exit0 rule was imported. A nonzero exit alone does not imply
USER_EXCEPTION; malformed protocol is not a student exception. Valid actual
values remain RETURNED regardless of problem Expected or requested array length:
the real wrong-length Divide `[42]` fixture executes all7 cases without comparison.

`officialResult()` returns detached Main-only evidence; the public `result()` port
rejects for Official mode. Current-owner revocation during a returned observation
discards it. Owner/context loss through Core invalidates result publication;
cancellation is not fabricated as a student runtime result. Core cleanup/native
facts remain available to the owning operation. Internal public-compatible failure
fields are not Judge verdicts; the future consumer must inspect private kinds.

## 4. Resource accounting, cancellation and cleanup

No timer, queue, worker, cache, Registry, operation slot or budget reset was added.
Existing policy stays Prepare10s/512MiB, syntax30s/2GiB, execute2s/case/512MiB,
operation60s, caller cleanup wait12s and aggregate physical stdout+stderr1MiB.
Native quota readback and current Core phase deadlines are recorded/asserted;
the monotonic operation deadline remains identical throughout each operation.
Probe, syntax and execute continue to charge raw bytes before decode/redaction.
Invalid UTF8 and protocol failures do not refund those bytes.

Signature/argument payloads alias the existing leased Registry tree. Each current
request uses `representInput` and the existing512KiB request/accounting ceiling.
Its one input borrow remains retained through unresolved native IO: a successful
case releases it at its VERIFIED barrier; a failed barrier/case retains it until
Core resource release. A pending representation remains owned while cancellation
waits for it; cancellation cannot launch a late child. No full plan is released
by the language adapter.

The trusted test owner retains all started package tasks and releases content only
after execution/borrows/tasks settle and final VERIFIED cleanup completes. Real
tests assert that attempting full release at a case barrier still fails, while
Jobs/handles remain owned. Controlled native-query failure leaves the same Jobs,
input borrow and lease retained until cleanup retry. Final cleanup proves process
termination, drained IO, released Jobs/handles, removed workspace/OS lease and zero
Registry shutdown parsed bytes/nodes/raw bytes. No cleanup or Policy B stage was
replaced or abandoned.

The original bounded result prefix, exact untouched suffix and failure headroom
remain. Private observations share actual/console payloads with the bounded
runtime rows. As in accepted S2, a128KiB reserve inside the existing1MiB result
envelope covers at most128 fixed private/native headers; it does not widen the
physical output quota or introduce a ledger. Detached getter copies are transient
and bounded. Package-derived request representations and Runtime/native buffers
retain their distinct existing owners/bounds.

## 5. Verification actually executed

**279 unique executed tests PASS,0 unresolved FAIL across6 files:**
**264 controlled unit/contract +15 real native tests.** No dependency/host-disabled
test was skipped. The final focused public-parity invocation reported14 SKIP by
name filter: those exact14 Official native tests had already executed and PASSED
in the preceding native run. They are deselections to avoid repetition, not14
unverified scenarios. Historical failures remain below; repeated PASS is counted
once. This is not a full-suite or cumulative S1/S2 total.

| File | Final unique executed PASS |
|---|---:|
| `tests/main/javascript-official-evidence.test.ts` |24 |
| `tests/main/javascript-execution-adapter.test.ts` |43 |
| `tests/main/javascript-harness.test.ts` |8 |
| `tests/main/javascript-syntax.test.ts` |17 |
| `tests/contracts/javascript-execution.test.ts` |172 |
| `tests/main/javascript-official.integration.test.ts` |15 |

Initial unit selection used one worker and exactly the first five files:

```text
npx vitest run --maxWorkers=1
  tests/main/javascript-official-evidence.test.ts
  tests/main/javascript-execution-adapter.test.ts
  tests/main/javascript-harness.test.ts
  tests/main/javascript-syntax.test.ts
  tests/contracts/javascript-execution.test.ts
```

First result260 PASS/2 FAIL. After fixture correction, only adapter reran41 PASS;
after two new directly relevant raw-accounting/arity regressions, adapter43 PASS.
The other four files'221 PASS were retained without rerunning them.

Native commands:

```powershell
$env:LEARNING_JAVASCRIPT_EXECUTE_LIVE='1'
npx vitest run --maxWorkers=1 tests/main/javascript-official.integration.test.ts
# After adding only public parity; do not rerun the14 already-passing native cases:
npx vitest run --maxWorkers=1 tests/main/javascript-official.integration.test.ts -t 'preserves real public Run'
```

The first native run14/14 PASS,17.28s; the focused public run1 PASS/14 filtered
SKIP,2.25s. Each individual operation uses its original60s Core deadline.

| Gate | Actual result |
|---|---|
| Scoped typecheck | PASS — `npx tsc --noEmit -p out/e3-s3/tsconfig.json`, changed JS modules/tests plus imported dependency closure/raw declarations |
| Targeted lint | PASS — exactly nine changed source/test files; only the two subsequently edited tests relinted |
| Scoped emission build | PASS — installed `esbuild`, bundled JS composition with `.mjs=text` raw child loader to ignored `out/e3-s3/javascript-runtime.cjs` (86.8KiB); no native hooks |
| Whitespace/local report links | PASS — `git diff --check` plus explicit new-file/document QA |
| Input-only count/types/order/arity | PASS — controlled counts21/128, all six input/actual types, native frozen order and exact child Source.json/stdin shapes |
| Public Run compatibility | PASS — affected public regressions and real existing Registry public binding/original wrapper/orchestrator over Divide's two public samples |
| Native Official execution/lifecycle | PASS —14 current-host runs with controlled fault fixtures identified below |

No full suite/repository lint, C# tests, old unrelated phases, UI/Project/PTY/
Monaco/drafts/Electron smoke,63-set campaign, broad profiling/benchmark, dependency
installation/upgrade, native ABI rebuild or repository production build was run.

## 6. Native Windows integration evidence

Current host: Windows x64 `10.0.26200`, Node `v24.16.0`/ABI137. The unchanged
PATH-first resolver performs its actual Node24 capability/identity probe inside
Prepare. Existing `out/main/native/learning/learning-job.node` loaded and ran
without rebuild. Registry uses the emitted production reader and **compiled
anchor**, over `out/main/resources/learning/exercises`; test-created/source hashes
do not replace that anchor. Frozen inputs/Expected are compared only in Main test
assertions; no Expected enters runtime preparation, Source.json or child stdin.

| Native run | Evidence |
|---|---|
| Divide success | Exact7 frozen cases;1 probe +1 syntax +7 fresh execute Jobs;9 VERIFIED barriers; typed actuals equal test-only Expected; top-level counter proves fresh isolation |
| LeapYear success | Exact8 frozen cases;1 probe +1 syntax +8 execute Jobs;10 VERIFIED barriers; ordered boolean actuals |
| User exception / invalid result | Actual throw/null fixtures; strict valid FAILED envelopes exit1; first case fails and suffix remains untouched |
| Syntax failure | Actual invalid source;1 probe +1 syntax Job, no execute cases |
| Throwing top-level source | Syntax succeeds without evaluation; Execute then returns USER_EXCEPTION; both pre-execute barriers proven |
| Wrong-length vector | Actual `[42]` returned in all7 cases; no Wrong Answer/protocol decision |
| Execute timeout | Actual infinite loop stopped by original execute deadline; no suffix launch |
| Aggregate output | Actual600000-character console output per case; second case hits aggregate raw quota; first actual/console retained |
| Protocol fault | Explicit test-only argv substitution launches a real contained Node transport fixture producing malformed stdout; classified PROTOCOL_FAILURE |
| Probe/stdin/case cancellation | Three real Job/IO cancellation points on the same Core; owner invalidation suppresses late success; final cleanup VERIFIED |
| Barrier/query fault and retry | Explicit injected query error after first real case; same Jobs/input borrow/full lease retained; no second case; cleanup retry VERIFIED |
| Public Run parity | Existing public Registry binding acquires two public samples inside Prepare; original Run wrapper/orchestrator returns expected actuals and VERIFIED cleanup |

All15 private receipts under ignored `out/e3-s3/native/` record native diagnostics,
cleanup and zero Registry shutdown ledger. Official receipts also contain phases,
quotas, executable paths, barriers and bounded private observations where owner
publication remains valid. They are private verification artifacts, not app
resources, public snapshots, IPC or Renderer data.

## 7. Historical failures and limitations

- The initial restricted-token shell launch failed before execution because the
  Windows sandbox could not enforce split writable roots. Necessary scoped
  commands ran with explicit approval; no Runtime/security policy was changed.
- First unit run:260 PASS/2 FAIL. Both new ordered-input assertions compared
  negative zero from `-index` at index0 with wire JSON's canonical0. The fixture
  was corrected to use0; production serialization/type policy was unchanged.
  Subsequent adapter41/43 PASS counts are overlapping executions, not additions.
- One read-only probe requested nonexistent
  `tests/main/javascript-execution.integration.test.ts`; actual existing native
  filename is `javascript-multicase.integration.test.ts`. No file was recreated
  or old suite run to compensate.
- First and final targeted lint/typecheck/build checks passed; no hidden native
  failure or dependency SKIP occurred. Final name-filter SKIPs are explicitly
  accounted for in Section5.
- Existing Git LF-to-CRLF notices remain; no resource normalization or history
  reconstruction occurred. S1/S2 historical failures/limitations remain intact.

## 8. Still UNVERIFIED / NOT MEASURED

This is current-host evidence over the approved small frozen sets. Native counts
above16 and a native round-trip matrix of all six types were not newly run;
counts21/128 and all six types have controlled coverage, while native integration
uses int32 inputs and vector/boolean actuals. The broader pilot/full63 matrix
belongs to separately authorized S5/S6. No native memory-exhaustion workload or
new12s retained-cleanup-timeout experiment was run; Job-memory attribution and
retained task/input/barrier behavior have controlled tests and real quota readback.

Windows10/other target host, installed/offline/loader/reliability/release matrix
and inherited platform limitations remain UNVERIFIED where previously pending.
All12 performance models remain PENDING_RUNTIME. General Official Runtime60s,
memory/output headroom across all63 sets and9E-7 release certification remain
UNVERIFIED/NOT MEASURED. Passing two small sets does not close those gates.

Production Official service admission, single-slot Run/Official exclusion,
private completion/publication routing and synchronous post-VERIFIED consumer
wiring are deliberately unimplemented/unverified until S4. The S3 factory has no
production caller. No broader bundle/dev-server/UI privacy certification is
claimed; source/data-shape/private result guards and scoped emission are the S3
boundary evidence.

## 9. Acceptance stop gate and decisions before S4

New decisions resolved: **NONE**. Architecture deviations: **NONE**.
Current-host S3 core acceptance blockers: **NONE**. User acceptance of this report
and explicit S4 authorization are required before service/hook work. No new Node,
protocol, security or policy decision is requested before S4; existing deferred
host/performance/release decisions remain as recorded.

Public JavaScript Run compatibility is preserved. No Official Expected/visibility/
hidden IDs/Judge metadata is passed into the language input, harness/child or
public APIs; Official actual/console/evidence has no public result or production
service publication route. **E3-S3 REVIEW COMPLETED — AWAITING USER ACCEPTANCE**;
tracking IN_PROGRESS. **STOP. E3-S4–S6 remain NOT_STARTED; no automatic next step.**

# Phase9E-3 / E3-S5 — Official Runtime Pilot Acceptance

2026-10-25. **TASK REVIEW: PASS WITH LIMITATIONS.**
**E3-S5: REVIEW COMPLETED — AWAITING USER ACCEPTANCE**, tracking IN_PROGRESS.
Phase9E-3 remains IN_PROGRESS. E3-S6 remains NOT_STARTED and unauthorized.

## 1. Authority, S4 closure and scope

The user accepts **E3-S4 COMPLETE — PASS WITH LIMITATIONS**. Its unchanged
[report](PHASE-9E3-S4-DRIVER-HOOK-PRIVATE-ADMISSION-ACCEPTANCE.md) matches
[plan Section6](PHASE-9E3-IMPLEMENTATION-PLAN.md): same-service admission/slot,
shared driver, private completion, synchronous post-VERIFIED hook, cleanup and
public isolation. Confirmed historical evidence: **221 unique PASS /0 FAIL /0
SKIP**, comprising219 controlled and2 native tests. These are historical S4
results, not newly executed S5 tests. No S4 tests or old acceptance report were
rerun/rewritten for closure. All historical failures and limitations remain.

Only S5 is authorized. The exact Section7 list is unchanged: Divide, LeapYear,
Ticket, CommonPrefix, MinWindow, TwoSum, Reshape and DigitCount. Each complete
frozen set was executed once in C# and once in JavaScript, sequentially through
the existing Main-private service. S1–S4 exit gates are user accepted. E3-D1–D4
remain approved; no new decision or architecture deviation was required.
The initial35 dirty tracked/untracked paths from previous work were preserved.
No production correction was necessary.

## 2. Actual files changed for S5

New test-only files:

- `tests/main/official-runtime-pilot.test.ts` — four controlled contracts.
- `tests/main/official-runtime-pilot.integration.test.ts` —36 native tests.
- `tests/fixtures/learning/official-runtime/pilot-solutions.ts` —16 fixed sources
  and bounded fault programs.
- `tests/fixtures/learning/official-runtime/pilot-pins.json` —16 source SHA pins.
- `tests/fixtures/learning/official-runtime/pilot-native.ts` — actual service/native
  observer and private receipts; no alternate runtime or process manager.
- `tests/fixtures/learning/official-runtime/README.md` — source provenance,
  adaptations, invocation and evidence boundary.

Documentation updated: this report, `PHASE-9E3-IMPLEMENTATION-PLAN.md`,
`PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`, `IMPLEMENTATION-PLAN.md`,
`CODEBASE-MAP.md`, and `CHANGELOG-THESIS.md` (all under `docs/`).
Ignored evidence/config/build files live under `out/e3-s5/`; they are not shipping
resources. Existing dirty production/S2–S4 files belong to prior work and were not
edited for S5. Frozen resources, manifest7, anchor, shared/public contracts,
Core/native policies, Git configuration and `.gitattributes` were not changed.

## 3. Architecture, source identity and privacy

Real flow: compiled-root Registry → admitted ExerciseService.runOfficial → owned
Prepare/private plan → existing C#/JS adapters/shared driver → real native Jobs →
private observations → VERIFIED case barrier → synchronous CONTINUE/STOP → same
Core final close. One active slot, no queue/cache/worker/timer/admission mechanism
was added. Plan acquisition still happens inside admitted Prepare.

The reader is loaded from `out/main/exercise-package-resources-runtime.js` and
uses its compiled integrity anchor; tests do not manufacture a replacement trust
root. Each receipt pins package/test-set/signature versions and hashes, source
SHA, actual executable/compiler paths, native SHA, input indexes and argument
hashes, artifact hashes, phase deadlines, process identities and cleanup facts.
Source Judge bytes are separately hash-checked against frozen metadata for Main
test assertions. The real Registry verifies the compiled package used by execution.

The16 fixed sources adapt the existing developer references to actual harness
entry rules. C# global public instance methods and explicit BCL names replace
project wrappers/usings; Reshape row cloning and MinWindow TryGetValue adaptations
are documented in the fixture README. Sources are statically pinned, not generated
solutions. No production Comparator/Judge/verdict is present. Actual-vs-Expected
equality occurs only after completion in test-only Main assertions, never in the
hook, language adapter, harness or child.

All native stdin documents have only protocolVersion/caseIndex/args; ordered args
match the full frozen set. JS Source.json contains code/functionName/schema only,
with the true private case count and fixed child. C# generated harness excludes
Judge identity/Expected/visibility. Contract tests cover all six signature input
types across the selected sets and pure harness input-only generation. Official
hooks observe pin/active ownership; attempted public Run is BUSY. Official public
snapshot references are rejected and no onSnapshot publication occurs. S4's
unchanged broader public IPC/last-result/owner-generation/privacy tests are reused
as historical evidence, not counted as freshly executed S5 tests. Test fixtures
are absent from the inspected production entries/build/contracts.

## 4. Native environment and complete-set results

Actual host: Windows x64, OS10.0.26200; Node v24.16.0/ABI137; Roslyn from installed
SDK10.0.112; `C:\Program Files\dotnet\dotnet.exe` and
`C:\Program Files\nodejs\node.exe`. Existing native module:
`out/main/native/learning/learning-job.node`, SHA-256
`4dff6a17526293c00e59fc4e04adc1a24b430f49a16ff236116c5c651756035d`.
No SDK/Node install, download, ABI rebuild, runtime selection or policy change.

Every row below is real full-set exhaustion, correct typed actuals in exact order,
empty unattempted suffix, no failure, final cleanup VERIFIED and Registry ledger0.
Time is measured admission-to-first-Core-close, rounded milliseconds, not a
benchmark or portable performance certificate. Raw bytes include probe/compiler
and child physical stdout/stderr. Barriers are separate from final cleanup.

| ID | Language | Cases | Time ms | Raw bytes | VERIFIED barriers | Result |
|---|---|---:|---:|---:|---:|---|
| ch2-04 | C# |7|7239|674|8|PASS|
| ch2-04 | JavaScript |7|1076|885|9|PASS|
| ch3-04 | C# |8|5445|758|9|PASS|
| ch3-04 | JavaScript |8|1170|969|10|PASS|
| ch3-07 | C# |10|5266|919|11|PASS|
| ch3-07 | JavaScript |10|1343|1130|12|PASS|
| ch5-03 | C# |9|5178|937|10|PASS|
| ch5-03 | JavaScript |9|1207|1148|11|PASS|
| ch5-07 | C# |8|5091|1745|9|PASS|
| ch5-07 | JavaScript |8|1119|1956|10|PASS|
| ch7-01 | C# |5|4674|479|6|PASS|
| ch7-01 | JavaScript |5|933|690|7|PASS|
| ch8-01 | C# |13|6401|4389|14|PASS|
| ch8-01 | JavaScript |13|1741|4600|15|PASS|
| ch4-03 | C# |21|7513|1923|22|PASS|
| ch4-03 | JavaScript |21|2476|2134|23|PASS|

Totals:16 complete operations,162 returned Official cases,186 real Jobs. C# uses
one compile Job and one fresh execute Job per case; JavaScript uses one probe,
one syntax Job and one fresh execute Job per case. Prepare and compile/syntax each
occur once. Required C# compile/case and JS probe/syntax/case barriers all verify.
Every operation retains a single unchanged operation deadline and current phase
deadline; no old Prepare deadline is reused for Execute. Counts13/21 do not
inherit the public16-sample cap.

## 5. Controlled native failures, public Run and resources

The following are fixed fault scenarios executed on real native processes, not
mock native evidence. Both languages PASS each scenario:

| Scenario | Actual evidence / attempted cases per language |
|---|---|
| STOP |1 RETURNED, CONSUMER_STOP, no runtime failure, exact6-case suffix; no next launch|
| Hook throw |1 RETURNED retained; infrastructure failure/INTERNAL_ERROR, exact suffix|
| Compile/syntax error |0 executes; truthful COMPILE_ERROR/SYNTAX_ERROR; full suffix|
| User exception |1 USER_EXCEPTION; C# exit0, JS exit1; no continuation|
| Invalid return |1 INVALID_RESULT; C# null/JS undefined; language-specific FAILED exit preserved|
| Malformed protocol |1 PROTOCOL_FAILURE, no student verdict or continuation|
| Infinite loop |1 INTERRUPTED/TIMEOUT; EXECUTE_TIMEOUT and exact suffix|
| Owner invalidation after execute resume |1 INTERRUPTED/CANCELLED; INVALIDATED/CONTEXT_CHANGED; no late success|
| Aggregate output exhaustion |First returned console retained, second INTERRUPTED/OUTPUT_LIMIT; exact5-case suffix|

JavaScript protocol control uses a test-only fixed Node --eval transport under
the real execute Job; it does not claim malformed output from the fixed child.
C# protocol control writes malformed raw stdout from its fixed student program.
Hook exception classification is infrastructure in phase cleanup under current
driver completion semantics; it is not converted into Wrong Answer or Accepted.
Other hook return/Promise, owner/generation races, retained cleanup/recovery and
shutdown scenarios retain S4 controlled evidence; they were not rerun here.

Two additional actual public Run operations (one/language) use the ordinary
two-sample binding, correct actuals and normal public snapshots. Public request,
error, result DTO and16-sample limit are unchanged. These regressions do not
publish Official observations.

All36 native operations (16 full +18 fault +2 public) use238 actual Jobs, each
with quota readback, unique root PID/creation identity, complete process coverage,
settled previous Job/IO checks and exactly one release/close. Independent watches
report signaled roots. Hooks retain the Registry pin and service active slot.
Final Core cleanup is VERIFIED/complete before service/Registry release. Every
shutdown ledger has parsedBytes/nodes/rawBytes=0; no retained operation or leaked
test workspace remained. Recovery uses the existing service only; a fixture guard
retains unresolved owners and refuses later launches if cleanup ever fails.

Prepare10s (JS probe512MiB), compile/syntax30s/2GiB, execute2s/512MiB, operation60s
and caller cleanup12s are untouched. Receipt deadlines and native quotas match
those policies. Raw output is counted before returning bytes to Runtime; the
read-only receipt audit reconciles every byte with per-Job physical streams.
Output controls observed1,058,847 bytes (C#) and1,059,060 bytes (JS), including
the final quota-crossing chunk, without refund/truncation of physical accounting.
Both stop on the second attempted case. Retained private completions, including
the600,000-character first-case console, remain below1MiB with128KiB headroom.
Full-set completion sizes range2,039–7,385 bytes. No output reserve was lowered.
Native memory-limit readback is verified; forced native memory exhaustion is
NOT MEASURED by S5. This is not a broad memory/headroom/reliability benchmark.

## 6. Executed checks and evidence inventory

| Check | Actual result |
|---|---|
| `npx vitest run --maxWorkers=1 tests/main/official-runtime-pilot.test.ts` |4 PASS /0 FAIL /0 SKIP;1.21s|
| `LEARNING_OFFICIAL_PILOT_LIVE=1 npx vitest run --maxWorkers=1 tests/main/official-runtime-pilot.integration.test.ts` |36 PASS /0 FAIL /0 SKIP;129.35s; all16 full pairs run once|
| `npx tsc --noEmit -p out/e3-s5/tsconfig.json` |PASS, scoped new tests/fixtures and transitive production types|
| Targeted ESLint on the four new TypeScript files |PASS after fixture-only no-unsafe-finally correction|
| esbuild pilot-solutions.ts → ignored out/e3-s5/pilot-solutions.cjs |PASS,6.6KiB; test-only fixture emission|
| `node out/e3-s5/audit.cjs` |PASS;36 receipts, source pins, exact16 pairs, physical bytes, retained headroom, cleanup/ledger|
| `git diff --check` |PASS|

**40 unique tests PASS /0 FAIL /0 SKIP**:4 controlled unit/contracts and36 native
integration tests. Do not add the historical221 S4 results to this count. Native
tests include controlled fault programs but all their process evidence is real.
The4 contract tests do not provide native proof. No full suite, repo-wide lint,
app build, UI/Project/PTY/Monaco/draft/Electron smoke, broad profiling or63-set
screen was run. Production emission/composition did not change, so an app/native
rebuild was unnecessary. Scoped test fixture emission was checked explicitly.

Private local evidence: `out/e3-s5/native/*.json` (36 receipts),
`out/e3-s5/summary.json` (16 rows and identities), `out/e3-s5/audit.cjs`, scoped
tsconfig and fixture build. These ignored artifacts contain Main test evidence;
retain them with the report, never package or expose them to Renderer.

## 7. Failures, limitations and stop gate

- The initial restricted-token shell failed because it cannot enforce split
  writable roots; necessary scoped commands used execution approval. No runtime
  or filesystem policy was changed to bypass this tool limitation.
- One intermediate tool response was unavailable after output/context truncation.
  Scoped contract/type/lint commands were repeated to obtain inspectable evidence;
  their unknown earlier results are not counted. No native operation was rerun.
- Targeted lint initially found no-unsafe-finally in the new fixture's guarded
  workspace cleanup. It was corrected to record an unsafe-root violation and
  avoid deletion; affected lint/typecheck pass. No unit/native assertion failed.
- Historical S1–S4 failures, filtered skips, host/native coverage limitations and
 9E1-AC1/S5-AC1 remain in unchanged prior reports. S4 acceptance does not erase
  them. No prior acceptance evidence was rewritten.
- This is one existing Windows host and one sequential run of each complete pilot
  pair. Other target hosts, installed/offline loader certification, repeated-run
  reliability, native memory exhaustion, exhaustive fault/race matrices and full
 63×2 compatibility remain UNVERIFIED or NOT MEASURED as applicable.
- **All12 performance models remain PENDING_RUNTIME. General Official Runtime60s
  remains UNVERIFIED.** Passing these16 operations under60s is evidence only for
  the pinned correct pilot solutions/current host, not all63 runtime feasibility,
  algorithmic performance-model kills or release certification.

Remaining S5 implementation blockers: **NONE** within the approved current-host
pilot. New decisions: **NONE**. Architecture deviations: **NONE**. Public Run
compatibility and private-data boundary are preserved in the scoped evidence.
No Judge/Comparator/Verdict, Submit, Accepted persistence/My Solutions, future
API or protected-domain change was implemented. No commit/push/merge occurred.

**E3-S5 REVIEW COMPLETED — AWAITING USER ACCEPTANCE; tracking IN_PROGRESS.**
**E3-S6 NOT_STARTED.** Remaining S6 work is the separately authorized full63×2
screen and its handoff/limitations register under plan Section8. Any performance
model execution needs explicit included scope and reviewed fixtures. User pilot
acceptance and separate S6 authorization are required. STOP.

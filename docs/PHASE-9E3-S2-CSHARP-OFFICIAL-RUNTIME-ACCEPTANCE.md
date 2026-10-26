# Phase 9E-3 / E3-S2 — C# Official Runtime Acceptance

2026-10-25. **TASK REVIEW: PASS WITH LIMITATIONS.**
**E3-S2: REVIEW COMPLETED — AWAITING USER ACCEPTANCE** (execution tracking
IN_PROGRESS). E3-S1 is **COMPLETE — PASS WITH LIMITATIONS**, formally accepted
by the user. Phase9E-3 remains IN_PROGRESS; E3-S3–S6 remain NOT_STARTED.

Authority: [approved design](PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md),
[step plan](PHASE-9E3-IMPLEMENTATION-PLAN.md),
[unchanged historical S1 evidence](PHASE-9E3-S1-PRIVATE-CONTRACTS-ACCEPTANCE.md).
The user's S2 authorization supersedes earlier S1-only authorization statements;
it does not authorize JavaScript integration or production Official admission.

## 1. Authorized work and task-start findings

Only E3-S2 was implemented: input-driven reuse of the existing C# Runtime and
private execution evidence. E3-D1–D4 were already APPROVED, S1 was accepted,
and no new decision gate or architecture deviation was required. The starting
branch was `feature/phase-9a-learning-mode`; `git status --short` was empty.
No existing user work was removed, restored or overwritten. No commit/push/merge,
Git configuration, .gitattributes, historical acceptance report, frozen package,
Expected, manifest7 or compiled integrity anchor was changed.

The applicable constraints were the existing Main/Preload/Renderer boundary,
leased Registry ownership/current-phase guards, Runtime9D/Core/Policy B and
Windows x64 native lifecycle. Required acceptance was scoped C# tests, real
frozen-set native execution, public Run compatibility, bounded private evidence,
truthful prefix/suffix and VERIFIED cleanup. S3–S6, production ExerciseService
Official wiring, consumer hooks, Judge/Comparator/Verdict/Submit/storage/history
were outside authorization and remain unimplemented.

## 2. Files actually changed

| File | Change |
|---|---|
| `src/main/services/learning/runtime/csharp-execution-adapter.ts` | One common input-driven implementation; unchanged public constructor wrapper; private Official factory/loader/result; current input borrow retained through barrier or Core release |
| `src/main/services/learning/runtime/csharp-compiler.ts` | Signature-only compilation seam with legacy Exercise input compatibility; physical compiler-byte accounting before decoding |
| `src/main/services/learning/runtime/csharp-execution-contracts.ts` | Main-private input loader, signature preparation and private evidence types; legacy prepared Exercise still accepted |
| `src/main/services/learning/runtime/csharp-official-evidence.ts` | New private strict v1 protocol/native evidence mapper |
| `tests/main/csharp-execution-adapter.test.ts` | Affected public regression fixture plus Official count/order/ownership/late-result/borrow/timeout/protocol tests |
| `tests/main/csharp-compiler.test.ts` | Physical invalid-UTF8 accounting regression |
| `tests/main/csharp-official-evidence.test.ts` | New private protocol/type/exit/stream/native classification tests |
| `tests/main/csharp-official.integration.test.ts` | New real frozen Divide/LeapYear integration with native lifecycle and controlled failures |

Documentation changed: this report, `PHASE-9E3-OFFICIAL-RUNTIME-DESIGN.md`,
`PHASE-9E3-IMPLEMENTATION-PLAN.md`, `IMPLEMENTATION-PLAN.md`, `CODEBASE-MAP.md`
and `CHANGELOG-THESIS.md`. The S1 acceptance report and historical failures were
not edited. `csharp-harness.ts` needed no change: its accepted S1 signature-only
generator is reused directly. No shared contract, JavaScript, Core/native,
Registry, SDK discovery or service composition module changed.

## 3. Input-source integration architecture

`WindowsCsharpExecutionAdapter` keeps its original constructor arguments and Run
result mapping. It now delegates to the same internal implementation used by the
Main-private `createOfficialCsharpExecutionAdapter`. This is one implementation
of the existing compiler/execute lifecycle, with the same native adapters.

The trusted loader runs only inside this exact adapter's admitted Prepare. The
caller acquires the S1 leased plan using the existing Registry and current Core
context, then passes only `execution` (signature/count/indexed args) and its
accounted input-representation capability. It passes no full plan, Expected,
visibility, case IDs or Judge-side view. S4 remains responsible for composing the
production owner and release path; S2 supplies only the private language port.

Official Prepare checks the signature/count and performs the existing SDK/runtime
capture once. It does not clone or serialize all Official inputs. Roslyn compiles
one harness from the trusted signature/count, once per operation. Each execute
phase revalidates the artifact/runtime, checks indexed args/current owner, registers
the current request through `representInput`, serializes that representation
inside the original execute budget and launches a fresh dotnet process.
Signature/count21/128 are verified with controlled inputs; public sample cap16
is unchanged. The real sets use their exact frozen7/8 cases, without expansion.

## 4. Private evidence and protocol mapping

| Observation | Evidence |
|---|---|
| RETURNED | Strict valid v1 envelope, expected index, typed actual, physical stderr empty, settled process and exit0 |
| USER_EXCEPTION / INVALID_RESULT | Strict valid FAILED envelope with that harness error; C# exit0 is valid |
| PROTOCOL_FAILURE | Malformed/duplicate/extra-document/invalid-UTF8/BOM/type/version/index/field response; missing response; inconsistent physical stderr or nonzero exit |
| INFRASTRUCTURE_FAILURE | Missing/unsettled process facts, artifact/host failure or other trusted infrastructure failure; no student exception inferred |
| INTERRUPTED | Trusted Runtime/Core timeout, output quota or native Job-memory evidence; parser also preserves trusted cancellation facts |

The S1 `parseExecutionJson` kernel enforces fatal UTF8, BOM rejection, decoded
duplicate-key rejection, one-document grammar, depth12 and1MiB wire bounds.
The existing C# validator then checks exact v1 fields/index/type. No JavaScript
FAILED exit-code rule was imported. A nonzero exit alone never becomes
USER_EXCEPTION. Valid wrong-value/wrong-length `int32[]` remains RETURNED: the
real `[42]` Divide fixture executes the whole set without a Comparator.

Official `result()` rejects to prevent accidental use of the public Run result
route; `officialResult()` provides detached Main-only evidence. Owner loss
invalidates publication rather than fabricating a successful or student-failure
completion. Core cancellation and native cleanup facts remain authoritative;
an invalidated owner cannot retrieve a private result. S4 must combine this
evidence with the existing owner-bound completion/cleanup contracts. Internal
legacy failure fields are not Judge verdicts; consumers must inspect private kinds.

## 5. Ownership, budgets and cleanup

No timer, queue, worker, cache, Registry, operation slot or second admission path
was added. Existing limits remain Prepare10s, compile30s/2GiB,
execute2s/case/512MiB, operation60s, caller cleanup wait12s and aggregate physical
stdout+stderr1MiB. Native quota readback is asserted on every real launch.
Both execute and compiler output charge physical bytes before decoding or
redaction; parsing does not refund those bytes.

The plan/signature/input arrays remain leased aliases. The current request uses
the existing Registry representation accounting and512KiB request ceiling.
There is at most one retained input borrow: successful cases release it only
after the VERIFIED case barrier; a failed/unresolved case retains it until Core
resource release. A failed barrier cannot start the next case or release that
borrow. The adapter never releases the full package lease. The test owner waits
for execution, retained package tasks and final VERIFIED Core cleanup before
releasing the plan and stopping the Registry.

Runtime case/compile payloads keep the existing bounded result-prefix/failure
reserve logic. Official private observations alias the same actual/console
payloads rather than retaining another full payload clone. A128KiB representation
reserve within the existing1MiB result budget covers at most128 fixed private
headers/native fact records; it does not increase the physical output quota or
create another ledger. Detached getter copies are transient and bounded. Request
strings/native input bytes remain under existing request/Runtime/native ownership;
the representation borrow persists through unresolved native IO.

Real tests distinguish per-case VERIFIED barriers (cleanup still incomplete,
retained Jobs still owned) from final VERIFIED cleanup (Jobs released/handles
closed, workspace removed). Controlled query failure retains the same Jobs and
input lease until retry, without relaunch. Registry shutdown records zero parsed
bytes/nodes/raw bytes. No retained cleanup path or Policy B stage was removed.

## 6. Verification actually executed

Final unique evidence: **182 PASS /0 FAIL /0 SKIP across6 files**:
**173 controlled unit/contract tests +9 real native integration tests**. This
is not a full-suite result and is not added to the historical S1 total333.

Initial explicit unit selection:

```text
npx vitest run --maxWorkers=1
  tests/main/csharp-official-evidence.test.ts
  tests/main/csharp-execution-adapter.test.ts
  tests/main/csharp-compiler.test.ts
  tests/main/csharp-harness.test.ts
  tests/contracts/csharp-execution.test.ts
```

That run passed169 tests. After directly relevant changes, only affected files
were rerun: compiler/adapter55 PASS, adapter44 PASS, then final adapter45 plus
native9 =54 PASS. Counts overlap; final compiler13 and adapter45 plus the
unchanged115 from the other three files give173 unique unit/contract PASS.

Native command (PowerShell; environment set only in that test process):

```powershell
$env:LEARNING_CSHARP_EXECUTE_LIVE='1'
npx vitest run --maxWorkers=1 tests/main/csharp-official.integration.test.ts
```

Native passed9/9, then reran together with the adapter after the retained-input
lifetime change: final54/54 PASS,75.72s across both files. Each operation retains
its original60s Core deadline; this suite duration is not one operation duration.

| Quality gate | Actual result |
|---|---|
| Scoped TypeScript | PASS — `npx tsc --noEmit -p out/e3-s2/tsconfig.json`; changed files/tests and imported dependency closure |
| Targeted ESLint | PASS — exactly the eight source/test files in Section2 |
| Scoped emission build | PASS — installed `esbuild`, bundled C# adapter/compiler/harness dependency closure to ignored `out/e3-s2/csharp-runtime.cjs` (104.3KiB); no native build hook |
| Whitespace | PASS — `git diff --check`; added files checked separately as untracked files |
| Public C# Run | PASS in affected contract/harness/compiler/adapter scope; original wrapper/orchestrator and public error union unchanged |
| Native C# integration | PASS — nine real runs with deliberate failure fixtures/injected query fault as identified below |

No full suite, repository lint, JavaScript Official tests, UI/Project/PTY/Monaco/
draft/Electron smoke,63-set campaign, profiling, SDK installation, native rebuild
or repository production build was run. The scoped emission build checks the
changed execution composition; real Roslyn verifies the generated child harness.

## 7. Native Windows evidence

Host: Windows x64 `10.0.26200`, Node `v24.16.0`/ABI137; installed SDK10.0.112
observed alongside older SDKs. Existing `out/main/native/learning/learning-job.node`
loaded and executed successfully without rebuild. The integration loads the
emitted production resource reader with its **compiled anchor**, over
`out/main/resources/learning/exercises`, through the existing full Registry.
Expected assertions use separate Main test fixtures only.

| Run | Real evidence |
|---|---|
| Divide success | Exact7 frozen cases;1 Roslyn Job +7 fresh execute Jobs;8 VERIFIED barriers; ordered typed actuals equal test-only Expected |
| LeapYear success | Exact8 frozen cases;1 Roslyn Job +8 fresh execute Jobs;9 VERIFIED barriers; ordered typed boolean actuals |
| Divide exception / invalid result | Real throw/null-return fixtures; valid FAILED envelopes, exit0; first case stops exact suffix |
| Divide timeout | Real infinite loop; original execute deadline, INTERRUPTED/TIMEOUT; suffix untouched |
| Divide aggregate output | Real600000-character console writes; first case retained, second hits cumulative quota; suffix untouched |
| Divide wrong-length vector | Real typed `[42]` returned in all7 cases; no comparison/protocol failure |
| Divide owner loss | Real running child emits a physical readiness byte; test closes the same Core with OWNER_LOST; no private success publication; VERIFIED cleanup |
| Divide barrier fault/retry | Real compiled/execute Jobs plus explicitly injected native-query failure; no next launch; retained resources released on cleanup retry |

All nine final receipts record quotas, attempted observations where publishable,
Core reason, barriers, native Job diagnostics, final cleanup and zero Registry
shutdown ledger under ignored `out/e3-s2/native/`. These private receipts contain
actual/console evidence and are not application resources or public API output.

## 8. Historical failures and limitations

- Windows restricted-token sandbox refused process launch because it could not
  enforce the split writable-root configuration. Necessary scoped commands were
  rerun with explicit execution approval; no Runtime/security policy was changed.
- First live native run: **0 PASS /9 FAIL**, before Prepare/child execution.
  Test fixture object spread omitted non-enumerable N-API methods, making lease
  acquisition fail and cleanup report PREPARATION_UNRESOLVED. Explicit capability
  forwarding fixed the fixture. This was not a missing SDK/ABI or a policy waiver.
  Failed fixture setup left temporary test directories; they were not silently
  deleted. Final live runs use real leases and finish VERIFIED with zero ledger.
- First targeted lint found prefer-const and no-unsafe-finally in the new native
  test. Both were corrected; final targeted lint passed.
- Read-only exploratory commands queried several nonexistent config/resource
  helper filenames, and one Windows wildcard path was rejected by rg. These were
  corrected using actual paths, without recreating files or claiming checks ran.
- Repeated PASS counts are not accumulated. S1's333 unique PASS/0 SKIP and all
  historical failures/limitations remain unchanged; no standalone S1 plan/kernel/
  Registry/JavaScript tests were rerun. Affected C# harness/contracts were rerun
  because the compiler/input boundary directly depends on them.
- Existing LF-to-CRLF notices remain. No normalization or .gitattributes change.

## 9. Still UNVERIFIED and downstream obligations

Current-host C# S2 criteria pass. Native Official counts above16 and native
round-trips for all six types were not separately executed: counts21/128 and six
types have controlled coverage; native integration uses the approved small
Divide/LeapYear sets (`int32` inputs, vector/boolean actuals). The broader native
type/catalogue matrix remains the separately gated pilot/full-screen scope.
No native memory-exhaustion workload or12s retained-cleanup-timeout scenario was
newly run; trusted Job-limit mapping and retained-input/barrier behavior have
controlled coverage, with existing Core/native policy unchanged.

Windows10/other target host, installed/offline/loader/reliability and release
matrix gates remain UNVERIFIED where inherited. All12 PENDING_RUNTIME performance
models, all63 Official60s/headroom and9E-7 release certification remain pending.
This current-host integration is not pilot acceptance or a catalogue certificate.
There is no production Official admission/publication route to certify in S2;
S4 must prove the same service slot, owner composition and private completion
segregation, and must never use public snapshots for Official actual/console data.

## 10. User decision / stop gate

Decisions resolved: **NONE newly required**. Architecture deviations: **NONE**.
No core S2 acceptance criterion is blocked on this host. User acceptance of this
delivery and explicit E3-S3 authorization are required before JavaScript work.
No new semantic/policy decision is requested before S3. Existing deferred release
and performance decisions remain as recorded; S2 does not resolve them.

**Public Run compatibility preserved. No Expected/visibility/hidden metadata
crosses the Official language input, harness, child stdin or public APIs.**
Only test-side Main assertions join actual to Expected. Evidence is private
execution evidence, not a Comparator/Verdict. **STOP — await user acceptance;
E3-S3–S6 and9E-4+ remain unauthorized.**

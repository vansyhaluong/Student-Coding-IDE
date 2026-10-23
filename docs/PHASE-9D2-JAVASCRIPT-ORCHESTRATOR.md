# Phase 9D.2 Step 4 — JavaScript Orchestrator

Authorized/implemented 2026-10-22. Review: **PASS WITH LIMITATIONS** on the observed
Windows 11 / installed Node host. Step 4 is **COMPLETE — PASS WITH LIMITATIONS**, accepted by the user 2026-10-23; Steps 1–3 remain COMPLETE — PASS WITH LIMITATIONS. Step 5 is COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23; Step 6 remains NOT_STARTED.
Phase 9D.2 and Common remain IN_PROGRESS.

## Scope and implementation

New Main-only modules in `src/main/services/learning/runtime/`:

- `javascript-execution-adapter.ts`: WindowsJavascriptExecutionAdapter implements
  the existing Step 1 port, reusing LearningNodeResolver/WindowsLearningNodeProbe,
  FixedJavascriptHarness, NodeJavascriptSyntaxChecker and Windows runtime adapter.
- `javascript-orchestrator.ts`: runJavascriptSamples claims one already admitted
  ExerciseSession and drives Prepare → VERIFIED barrier → Syntax → VERIFIED barrier
  → sequential Execute/barrier pairs → final Core cleanup. No service factory,
  public API, scheduling queue or new process authority.

New targeted tests: `tests/main/javascript-execution-adapter.test.ts` and
`tests/main/javascript-multicase.integration.test.ts`. Progress/actual-path docs
were synchronized. Existing production/test files, including the Step 3
single-sample driver, Core, C# adapter/orchestrator, native Job and Policy B,
were not changed by Step 4. Earlier working-tree changes were preserved.

The adapter clones Main catalogue/source at construction; it validates each
catalogue request during Prepare. Resolve/probe, workspace creation and syntax
checking each happen once per operation. Before every Execute it revalidates the
same Node selection and retained source/harness identities; it never selects a
different runtime between cases. Each Execute creates a new Node child/Job, and
the fixed harness creates a fresh context, arguments and student globals.

Only a fresh VERIFIED barrier admits the next phase/case. Aggregate evidence
includes probe, syntax and every attempted case, while all handles remain owned
until final cleanup. Pending/unresolved evidence and incomplete historical
coverage block further execution. Barrier failures are cleanup infrastructure
failures, never fabricated student results. Core remains the proof authority.

Case indices derive from the settled prefix. Returned actuals are in catalogue
order; expected values are not compared. A failed case records its real index,
retains prior actuals and leaves the exact remaining notRunCaseIndices suffix.
Syntax/Prepare failures leave every case not run. Step 1 validators guard each
response and detached result, including exit/outcome consistency. Representation
checks reserve space for later real failures; raw bytes remain separately counted
by the unchanged Core counter across all phases/cases.

Original budgets remain: Prepare 10 s / 512 MiB probe; Syntax 30 s / 2 GiB;
Execute 2 s / 512 MiB per case including startup, evaluation, serialization and
I/O; operation 60 s; cleanup caller wait 12 s; stdout/stderr 1 MiB per operation.
No reset between cases. Cancellation invalidates owner results and prevents late
launches. Close/retry joins the same Core cleanup work, retaining pending I/O,
Jobs, handles, lease and checkpoints; retries cannot re-enter the sample loop.
Quarantine/recovery/admission remain Common responsibilities.

`node:vm` and Windows Jobs are not malicious-code security sandboxes. No guarantee
of filesystem/network confinement or child-result authenticity is introduced.

## Verification

**160 targeted tests PASS**, across the following selected commands:

```text
npm test -- tests/main/javascript-execution-adapter.test.ts tests/main/javascript-multicase.integration.test.ts tests/main/exercise-session.test.ts tests/main/exercise-workspace.test.ts tests/main/windows-exercise-adapter.test.ts tests/main/csharp-execution-adapter.test.ts
```

152 PASS: 18 new adapter/unit/lifecycle, 16 new real native cases and 118 selected
existing Core/workspace/Windows adapter/C# adapter regressions. These cover
ordered results, immutable inputs, first/middle/last failure, missing barrier,
pending/observer/identity/history evidence, cancellation, unchanged operation
deadline, cumulative output, indexed protocol/memory/stdin failures and cleanup
retry. Common regressions cover 12 s pending barrier/I/O, checkpoint persistence,
recovery/quarantine and process-unresolved handling.

```text
npm test -- tests/main/exercise-service.test.ts -t 'admits one operation globally|keeps pending FINALIZED|tracks recovery failure|recovers .* using a lease'
```

7 PASS, 15 name-filtered skips: existing global single-operation/no-queue
admission, blocked re-admission during retained cleanup/recovery, managed retry
and lease/quarantine recovery. No JavaScript production service wiring was added.

```powershell
$env:LEARNING_CSHARP_EXECUTE_LIVE = '1'
npm test -- tests/main/csharp-multicase.integration.test.ts -t 'compiles once and invokes three isolated real catalogue-signature cases in order'
```

1 PASS, 12 name-filtered skips: real C# compilation once and three isolated sample
cases, ordered actuals [8, 0, 3], four owned Jobs and verified final cleanup.
This is a selected compatibility check, not renewed full C# acceptance.

### Real JavaScript Job evidence

`out/learning-javascript-multicase-step4/2026-10-22T09-41-56-917Z/`
contains environment/source hashes and operation observations. Windows
`10.0.26200` (Windows 11), Node **v24.16.0 x64** observed; patch is not pinned.

**16 operations / 57 real Learning Jobs**, all final cleanup VERIFIED,
processClean/cleanupComplete, released Jobs/closed handles, signaled independently
retained identity observations and released workspace leases. Before each new
launch, native observations verify earlier Jobs have no members/active processes,
stdin and observers settled, identities signaled, and handles still retained.
Quota membership/read-back is checked at suspended launch before adapter resume.

Real cases include success, cross-process global isolation, first/middle runtime
failure, syntax failure, cancellation at Prepare/Syntax/Execute/stdin/between
cases, middle-case 2 s timeout, observed 512 MiB Job memory limit, cumulative raw
output overflow across individually bounded responses, middle protocol failure,
descendant observation/settlement and retained native cleanup failure/retry.
Trusted test wrappers inject transport/descendant/cancellation/native-control
faults only in tests; no production debug endpoint or student capability added.
The 60 s operation and 12 s caller-wait edge cases use targeted clock-controlled
Core tests, not a new real-time benchmark or acceptance matrix.

Quality gates: `npm run typecheck`, `npm run build`, targeted ESLint on the four
new TypeScript files, `git diff --check` and explicit untracked-file whitespace
checks PASS. Existing Monaco mixed-import build warning remains. Step 3 evidence
source hashes still match (including Core/adapter/native/harness); C# source is
unchanged and the selected real regression passed. No full suite/repository lint,
benchmark/spike matrix, dependency changes or historical lint fixes.

Initial test corrections: fake probe/syntax stdin is empty and must not be parsed
as a request; the fixture now respects that EOF behavior. The first native run had
15/16 PASS because its descendant assertion read an absent diagnostics field;
it now records the actual native totalProcesses and the final 16/16 run passes.
Earlier evidence is retained. No architecture/contract amendment was needed.

## Limits and readiness

No blocking defect remains in the executed checks. Windows 10, actual UNC,
packaging/bundled Node (9G), concurrent Project Run/PTY smoke and production
Electron UI/IPC/end-to-end JavaScript Run remain unverified. The production
ExerciseService factory did not select this adapter at Step 4 closure. Step 5's
subsequent integration is recorded in PHASE-9D2-JAVASCRIPT-UI-IPC.md. These are not PASS
claims. Common single-operation admission is regression-tested; full JavaScript
service/owner/public-envelope integration belongs to Step 5 and acceptance Step 6.

Review: **PASS WITH LIMITATIONS**. Step 4 is COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23.
Closure uses the recorded evidence above; no Step 1–4 tests were rerun for closure.
Step 5 was separately authorized and accepted COMPLETE — PASS WITH LIMITATIONS 2026-10-23; Step 6 remains NOT_STARTED and requires a separate user request. No commit/push/merge.

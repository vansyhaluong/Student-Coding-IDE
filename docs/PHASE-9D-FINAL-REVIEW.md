# Phase 9D — Learning Runtime final review

Date: 2026-10-23. **Initial overall review: NOT PASS** — finding **A03,
C# Prepare-timeout observation race**, confirmed by a deterministic read-only
diagnostic. Sections 1–6 preserve that pre-fix review and FAIL evidence.

**A03: FIXED — PASS**, accepted by the user on 2026-10-23. Section 7 records the
authorized fix, before/after regressions and real Electron/Resolver reproduction.
**Final user acceptance, 2026-10-23: 9D Common and overall Phase 9D COMPLETE —
PASS WITH LIMITATIONS**; see Section 8. The user accepted the named limitations.
Closure is applied from existing evidence only; 9E remains NOT_STARTED.

Actual tracking: **9D/Common COMPLETE — PASS WITH LIMITATIONS**, **9D.1 COMPLETE — PASS WITH
LIMITATIONS**, **9D.2 COMPLETE — PASS WITH LIMITATIONS**, **9E NOT_STARTED**.
The accepted adapter histories are preserved; A01/A02/A03 are FIXED — PASS.
The original failing scenario and verdict remain historical evidence, superseded
for A03 only by its accepted post-fix evidence. Do not begin 9E.

## 1. Scope and authority

Reviewed actual source against Requirement Section 21, Architecture's Learning
runtime/Policy B sections, ADR-025, Codebase Map/Language Support, Implementation
Plan Section 13.6, the existing JavaScript step/final reports and available JSON
evidence. The original C# final/step reports and Common step-7 report referenced
by the plan are absent from this checkout. Their contents are not invented.
Implementation-plan historical entries, actual artifacts and newer regressions
are identified separately below.

Source review covers ExerciseSession/Limits/Workspace/Checkpoint/Recovery,
ExerciseService and managed Main composition, Learning native Job/adapter,
C# resolver/compiler/adapter/orchestrator, JavaScript factory/adapter/orchestrator,
IPC/Preload, Renderer result/context handling and the accepted A01/A02 changes.
Shared contracts retain the approved budgets and independent language observations.
No Judge, Submit, custom cases or 9E feature is reviewed as implemented.

Branch: feature/phase-9a-learning-mode. Existing modified/untracked work is
preserved. This review makes documentation changes only. No source, test or
script is edited; no dependency, branch switch, commit/push/merge, benchmark,
spike matrix, full suite, build or lint run. One narrowly scoped in-memory
diagnostic was justified by the concrete new C# finding; it is not native or
production Electron acceptance.

## 2. PASS / FAIL / UNVERIFIED matrix

PASS is limited to the named evidence, not universal platform acceptance.

| Group | Result | Evidence and boundary |
|---|---|---|
| Common admission/session ownership | PASS | One operation/no queue; Main UUID/generation/epoch, owner authorization, synchronous shutdown sealing and stale publication suppression; service/IPC regressions and C/R live checks |
| Common deadlines/output | PASS | Immutable 10s Prepare, 30s compile, 2s/case, original monotonic 60s due; 12s cleanup caller wait retains task/lease; 1 MiB combined raw output. C real-clock 60,149.8759 ms / 27 Jobs and 12,292.718 ms / one original pending write; R adapter/output regressions |
| Windows Job/quota/native process ownership | PASS, Windows 11 | Set/read-back quota before resume, retained root/descendant identities, EOF/observer settlement, memory event 10 distinct from runtime OOM; native suites and actual C#/JS production evidence. Not a claim of filesystem/network sandboxing |
| VERIFIED execution barrier | PASS in exercised paths | Core retains barrier task through cancellation/deadline; adapters require settled previous Job evidence before a new case; native multi-case and barrier/pending-work regressions |
| Policy B cleanup/retry | PASS in exercised paths | Acknowledged OWNED → RELEASE_READY → release/handles → FINALIZED → VERIFIED deletion/CLEANUP_COMPLETE. Unresolved processes/errors retain ownership and block replacement/quit; retries join retained work and avoid duplicate irreversible native actions |
| Checkpoint/recovery/quarantine | PASS mechanisms | Real filesystem/native lease seeded recovery, safe identity/containment checks, no historical PID killing; history gap finalizes quarantined with false clean flags. Full production-language crash followed by restart remains UNVERIFIED |
| Shutdown and Project/PTY isolation | PASS in exercised paths | C reaches STOPPED after real cleanup; injected failure retains retry and prevents early teardown; C/CS/R real heartbeat and PTY round trips during Learning cancellation/failure/shutdown |
| C# SDK/Roslyn/samples/diagnostics | PASS in demonstrated scenarios | Installed stable SDK 10.x selection/revalidation, direct Roslyn, sequential isolated samples, compile/signature/runtime diagnostics and exact NOT_RUN; CS actual [8,0], compile CS1525, resource/error operations, later R live C# regressions |
| C# Prepare timeout result consistency | **FAIL — A03** | Core PREPARE_TIMEOUT but C# failure=null, compile=null, cases=[], NOT_RUN=[0,1]; deterministic Core-clock diagnostic below. Real delayed-SDK production Electron reproduction has not run |
| JavaScript resolver/harness/syntax/multi-case | PASS WITH LIMITATIONS, accepted | [9D.2 final review](PHASE-9D2-JAVASCRIPT-FINAL-REVIEW.md): actual Node v24.16.0 x64, six-type real harness, sequential catalogue samples/actuals/NOT_RUN, strict bounded protocol and safe errors |
| IPC/UI/cancellation/stale rejection | PASS in exercised scenarios | Existing channels, exact request/observation validation, independent C#/JS DTOs, immutable source/revision/context, frame/document epoch and late event/invoke rejection; A03 is a separate final C# observation defect |
| Monaco/editor/drafts | PASS in recorded methods | Real typing/cursor, Unicode, command-based selection, autosave, Reset cancel/confirm/undo and draft restore/reload; A02 diagnostics clear after fixes. Native-key selection and production Accepted Restore remain UNVERIFIED |
| A01 / A02 | FIXED — PASS, accepted | F Prepare-timeout regression + real JS Electron reproduction; W production binder/diagnostics and UI [8,0], VERIFIED cleanup. A03 does not reopen or alter these JavaScript fixes |
| Windows 10 / actual UNC / remaining Windows configurations | UNVERIFIED | No OS/share/AV/installed-runtime configuration evidence inferred from Windows 11 or controlled temporary fixtures |
| Packaging/bundled runtime/clean-machine delivery | UNVERIFIED — Phase 9G | Current evidence uses installed SDK/Node only, no download/install/fallback; per-application offline evidence is not disconnected clean-machine delivery |
| Accepted Solution Restore / Judge / Submit | Deferred — Phase 9E | Production Accepted records not supplied, Submit disabled; no comparison or Accepted/Wrong Answer execution verdict. Restore component/intent tests are narrower evidence |
| Typecheck/build/production or targeted lint | PASS in referenced historical runs | Common and accepted adapter/fix gates; not rerun for this review |
| Full repository lint | FAIL — known historical limitation | 1,106 recorded spike/archive errors; scoped production/targeted lint passes. Do not relabel the repository gate PASS |

## 3. Evidence actually available

Use these independent sets without adding their counts into one suite:

- **C:** `out/learning-common-step7-1792718768796/evidence.json`: overall PASS,
  14 checks. Real Electron/native fixed-driver composition, not a language
  adapter replacement. Covers 2s/60s, owner navigation/crash, cleanup failure,
  12s pending checkpoint I/O, history gaps, recovery, shutdown and Project/PTY.
  Injected faults/pending I/O/history gaps are labelled, not natural OS failures.
- **CS:** `out/learning-csharp-ui-step7-1792555189966/evidence.json`: PASS,
  eight operation records plus four additional check entries and five isolation
  probes. Sum actuals [8,0]; syntax/signature/runtime-middle/timeout/output/memory
  and retained-cleanup scenarios. The retained-cleanup snapshot intentionally
  records PROCESS_UNRESOLVED/cleanupComplete=false, followed by the recorded
  managed retry/identity/handle check. Watchdog=false.
- C# resolver: `out/learning-csharp-sdk-step2-1792511679992/evidence.json`: PASS.
  Historical plan records SDK 10.0.112/runtime and pack 10.0.12/167 references;
  these are observed versions, not version locks. Original compile/native/execute
  counts in the plan are historical records, not new tests performed here.
- **R:** `out/learning-javascript-acceptance-step6-1792717832533/`:
  merged-regression.json records **907 PASS / 11 SKIP**, latest-per-assertion
  aggregation from targeted runs, not one full suite. Contains Common/C#/JS,
  native, service, IPC/Preload, Result Panels, editor and Project/Terminal tests;
  fresh real C# multi-case run is 3 PASS / 10 name-filtered skips. Production-
  isolation-v2 records live C# [8,0] alongside Project/PTY and JS; functional/
  errors/lifecycle/stale/history/retained/shutdown groups provide JS evidence.
- **F:** `out/learning-javascript-a01-fix-1792721044399/`: **32 targeted PASS**,
  separately recorded filtered skips, original deterministic FAIL and actual
  Windows 11 JS Prepare-timeout reproduction PASS.
- **W:** `out/learning-javascript-a02-fix-1792722222643/`: **23 targeted PASS**,
  actual JS/TS Monaco diagnostics and other worker checks, two JavaScript UI Runs,
  [8,0], VERIFIED cleanup, typecheck/build/targeted lint/diff PASS. Binder retained;
  TypeScript bundles grow about 115.1 KiB / 0.894% each.

The original C# UI artifact `...1792552856562/evidence.json` is **FAIL** (Sum
observation deadline), as are several subsequent attempts. It is not counted as
PASS. The actual later CS PASS artifact above was located and read. The plan's
older summary of 12 operations/25 Jobs is not re-derived from its eight operation
records/four check entries, and those four entries are not called four additional
Runs. Original failures remain intact. Missing reports do not erase available
JSON, but their detailed contents/claims cannot be independently reviewed.

## 4. New blocking finding A03 — C# Prepare timeout observation

**Status: OPEN — NOT FIXED. Scope: C# adapter/result integration, not a proven
Common timer/cleanup or native defect.** This blocks overall 9D acceptance now.

Root cause: `csharp-execution-adapter.ts` runPhase catch (around line 131) throws
immediately when context.signal.aborted. Prepare has no compiler/execute observer
to populate its failure first. result() (around line 54) synthesizes only
OPERATION_TIMEOUT. When Core expires Prepare before the held resolver rejects,
the final C# observation therefore retains its initial failure=null state.
runCsharpSamples then rejects the Core timeout instead of returning a coherent
C# TIMEOUT/prepare result. Main's existing execute path catches execution failure
and composes the remaining observation; the Common reason remains correct.
This is the C# counterpart of the already fixed JavaScript A01 scenario.

### Deterministic diagnostic and observed FAIL

Executed once during this review: inline CommonJS source piped from PowerShell
to `node` (`@'<inline source>'@ | node`), exit **1**, reported **FAIL**. The script
registers a process-local TypeScript transpileModule loader, then imports actual
WindowsCsharpExecutionAdapter, ExerciseSession and runCsharpSamples. It edits no
file or module on disk. The inline diagnostic:

1. Supplies an injected monotonic clock and records Core's scheduled timers.
2. Uses an in-memory workspace/checkpoint port and a held resolver. No native
   Job, Roslyn, Node child or real filesystem operation is launched.
3. Starts the actual orchestrator and waits until adapter Prepare enters resolve.
4. Advances the injected clock to the earliest timer (10s Prepare), fires Core's
   actual expiry callback, then lets resolve throw context.signal.reason.
5. Reads the actual adapter result and Core snapshot after cleanup settles.

Observed output (not a production Electron/native cleanup claim):

```json
{
  "result": "FAIL",
  "orchestrator": { "resolved": false, "errorReason": "PREPARE_TIMEOUT" },
  "reason": "PREPARE_TIMEOUT",
  "csharp": {
    "compile": null,
    "cases": [],
    "notRunCaseIndices": [0, 1],
    "failure": null
  },
  "cleanup": {
    "state": "FINALIZED",
    "proof": "VERIFIED",
    "processClean": true,
    "cleanupComplete": true,
    "workspace": "REMOVED",
    "pendingIo": false
  },
  "leaseReleased": true,
  "removed": true
}
```

Expected final semantic observation: Common PREPARE_TIMEOUT and C# failure
`{kind:'TIMEOUT',phase:'prepare',caseIndex:null}`, with all samples NOT_RUN.
Actual Common timer/reason is correct, and the in-memory cleanup completes;
the failure DTO is missing. This is not a fabricated successful actual or a
demonstrated process leak. A real delayed-SDK Electron reproduction remains
UNVERIFIED, rather than being claimed from this controlled diagnostic.

### Proposed correction — requires separate user approval

Narrow correction in
`src/main/services/learning/runtime/csharp-execution-adapter.ts`: before the
generic aborted-signal escape, explicitly record TIMEOUT/prepare only for an
entered Prepare aborted with the trusted PREPARE_TIMEOUT DomainError reason.
Do not infer timeout from generic cancellation or only from elapsed wall time.
Keep Common's original reason, exact NOT_RUN and owner-invalidated result guard.
No Core, native, Policy B, budgets, contracts, JavaScript/A01/A02, Project or
Terminal change is proposed.

Proposed follow-up files: the C# adapter; focused regressions in existing
`tests/main/csharp-execution-adapter.test.ts`; an approved test-only Electron
reproduction fixture/evidence and this report/progress. Targeted checks should
cover Core-first resolver timeout, context/owner/leave/shutdown cancellation,
no stale publication, all samples NOT_RUN, and real delayed Prepare cleanup/
leases/handles with unchanged Policy B. Use a labelled resolver/filesystem delay
in test-only instrumentation, no production debug endpoint or fake response.

Regression risk is misclassifying lifecycle cancellation as reportable timeout
or permitting stale C# publication. Keep the condition phase/reason-specific and
verify both outcomes. A01/A02 must remain untouched. No correction is applied.

## 5. Common exit assessment and remaining gates

Common mechanics have substantial scoped PASS evidence: strict semantic
contracts, sender/session ownership, one monotonic operation budget, quota
read-back, raw output limits, retained barriers/tasks/handles, acknowledged
checkpoints, safe quarantine/recovery and shutdown retry/isolation. Source
review found no additional demonstrated Core/native/Policy B blocker. Historical
production lint passes are separate from the real repository-wide lint FAIL.

However the Common/overall exit also requires production integration and
preparation/failure handling for both adapters. A03 means that integrated gate is
not fully satisfied. **Do not propose or apply Common COMPLETE in this review.**
Common remains IN_PROGRESS; after A03 is authorized, corrected and narrowly
verified, its scoped closure can be reconsidered with explicit acceptance of
remaining Windows/recovery/environment limits. A fixed-driver Common PASS alone
cannot substitute for a failing production adapter path.

Existing limitations, distinct from A03:

- **Potentially acceptable scoped coverage/tooling limits:** Windows 10/actual
  UNC; locked installed runtimes/AV delays/live installed nvm switching or multiple
  major selection; full production-language crash then restart; production UI
  string[] return absent from catalogue; missing historical report references;
  native-key selection and reliable worker cold-start delta. They remain
  UNVERIFIED, even where controlled mechanisms or narrower scenarios pass.
- **Unresolved observation:** two sandbox startup console messages involving
  sandboxed_renderer.bundle.js and null binding.startupData; inspector causality
  unestablished. A02 worker exceptions are fixed; error-free startup is not
  claimed. No associated functional/security regression is established by the
  available secure-preload/editor/Run checks.
- **Known accepted performance/tooling limits:** C# Run approximately 7–8s,
  optimization after Phase 9; full lint FAIL with 1,106 historical errors while
  scoped production/targeted lint passes. Neither is reclassified as PASS.
- **Later-phase scope:** packaging/bundled runtimes/clean-machine delivery in
  9G; Judge/Submit and production Accepted Solution Restore in 9E. Neither
  installed-runtime evidence nor empty My Solutions presentation implements them.

Document consistency: some ADR-025/architecture capability-status paragraphs
still show pre-closure 9D.2 progress. The approved 9D.2 final review and current
Implementation Plan record accepted COMPLETE — PASS WITH LIMITATIONS. These
stale progress summaries need documentation reconciliation; they do not amend
accepted architecture or erase A03. Missing reports/old counts are explicitly
limited above instead of silently reconstructed.

## 6. Verdict and stop

**9D overall: NOT PASS.** A03 is a concrete failing result-consistency scenario,
not a Windows coverage limitation to hide under PASS WITH LIMITATIONS.
**Common: keep IN_PROGRESS**, pending the integrated gate and user decision.
9D.1/9D.2 retain their recorded accepted COMPLETE — PASS WITH LIMITATIONS status;
the new C# finding is recorded for a separately approved corrective reopening,
without silently changing earlier acceptance evidence.

**Ready to move to 9E: NO.** 9E remains NOT_STARTED. Request authorization for
the narrow A03 correction before changing code/tests. After it passes, reconsider
Common/9D closure with the remaining named limitations; do not assume the outcome
in advance. No official COMPLETE transition, production fix or next-phase work.
Only this report and the Implementation Plan assessment are updated; document
diff/whitespace checked. Stop for the user's decision; no commit/push/merge.

## 7. A03 authorized correction — post-fix verification

Date: 2026-10-23. **A03: FIXED — PASS**, accepted by the user on 2026-10-23.
The user separately authorized and accepted the correction. Original Sections 1–6 and their
FAIL observations above remain historical evidence; no failed artifact is edited
into PASS. At the A03 correction stage Common/9D remained IN_PROGRESS; the later
explicit final acceptance is recorded in Section 8. 9E remains NOT_STARTED.

### Narrow change and preservation

`src/main/services/learning/runtime/csharp-execution-adapter.ts` now handles one
specific catch condition before the existing aborted-signal escape: phase is
prepare, signal is aborted, abortReason() returns PREPARE_TIMEOUT and no failure
has already been recorded. abortReason() reads only a DomainError reason from
the admitted operation signal. This catch is reached only after phase admission
and Prepare entry. It records TIMEOUT/prepare through the existing reject path.

This branch does not infer a timeout from elapsed time, error text or an ordinary
cancellation; the existing unrelated error mapping is unchanged. Core retains
PREPARE_TIMEOUT. compile remains null, cases empty and all samples NOT_RUN.
Owner/context/leave/shutdown invalidation still bypasses reportable failure and
result() still rejects stale publication. No cleanup/resource management changes.

Files in this correction:

- `src/main/services/learning/runtime/csharp-execution-adapter.ts`: four added
  lines, including comments; trusted Prepare timeout branch only.
- `tests/main/csharp-execution-adapter.test.ts`: six A03 regressions and an
  optional injected Core clock in the existing session fixture.
- `scripts/accept-csharp-prepare-timeout-a03.mjs`: new test-only production
  Electron/real-resolver fixture with labelled SDK filesystem delay.
- `docs/PHASE-9D-FINAL-REVIEW.md`: this update and historical/current-state notice.

Evidence root `A = out/learning-csharp-a03-fix-1792725627282/`.
`A/baseline.json` captures branch feature/phase-9a-learning-mode, HEAD 05a2912,
existing dirty/untracked work and protected source/test/script/config hashes.
Only the C# adapter and its targeted test differ among those protected existing
files; the test-only script is new and this report is updated. Core, native,
contracts, quotas/deadlines, Policy B, JS/A01/A02, worker configuration, Project,
Terminal and dependencies remain unchanged. No commit/push/merge or branch change.

### Targeted regressions and quality gates

Commands executed from D:/coding-ide, with PowerShell `2>&1 | Tee-Object
-FilePath <log>` capturing output under A:

| Command | Result / evidence |
|---|---|
| `npm test -- tests/main/csharp-execution-adapter.test.ts -t A03` before production fix | **1 FAIL, 5 PASS, 26 filtered SKIP**; regression-before.log. Core's actual injected 10s timer fires while resolver rejection is held; the orchestrator rejects instead of returning TIMEOUT/prepare |
| `npm test -- tests/main/csharp-execution-adapter.test.ts tests/main/exercise-session.test.ts` after fix | **79 PASS, 0 FAIL, 0 SKIP** (32 adapter + 47 Core); regression-after.log |
| `npm test -- tests/main/exercise-service.test.ts tests/main/exercise-ipc.test.ts -t 'invalidates\|owner invalidation\|cancels only Learning\|publishes only the current\|late cancellation replies\|invoke result retired'` | **9 PASS, 26 filtered SKIP**, no failures; ownership-ipc.log |
| `npm run typecheck` | **PASS**, exit 0; typecheck.log |
| `npm run build` | **PASS**, exit 0; build.log. Existing mixed static/dynamic Monaco import warning remains |
| `.\node_modules\.bin\eslint.cmd src/main/services/learning/runtime/csharp-execution-adapter.ts tests/main/csharp-execution-adapter.test.ts scripts/accept-csharp-prepare-timeout-a03.mjs` | **PASS**, exit 0; targeted-eslint.log |
| `git diff --check` plus explicit new-file/report whitespace checks | **PASS** |

Post-fix targeted total for this correction: **88 PASS**, with 26 intentionally
name-filtered skips. This is separate from the historical 907/11, A01's 32 and
A02's 23; it is not a full-suite run or a new combined total. No full repository
lint, benchmark, spike matrix or whole-9D acceptance rerun was performed.

The six new A03 checks cover the exact timeout race, four independent lifecycle
reasons (CONTEXT_CHANGED, LEARNING_LEFT, OWNER_LOST, SHUTDOWN), and an abort object
shaped like PREPARE_TIMEOUT that is not a DomainError. True timeout produces the
exact failure/NOT_RUN result with Core PREPARE_TIMEOUT. Each lifecycle reason
retains its reason, rejects result publication with RESULT_INVALIDATED, starts
no process/compiler and releases the lease once. Untrusted timeout-shaped data
does not manufacture TIMEOUT. Existing Core pending work, barrier, retry,
quarantine, deadlines and service/IPC late-response regressions also pass.

### Real Electron + actual C# Resolver reproduction

```powershell
.\node_modules\.bin\electron.cmd scripts/accept-csharp-prepare-timeout-a03.mjs out/learning-csharp-a03-fix-1792725627282/electron
```

**PASS**, exit 0. `A/electron.log` and `A/electron/evidence.json` record actual
production Main/IPC/Preload/Renderer and FilesystemCsharpSdkResolver execution on
Windows 11 10.0.26200 x64 / Electron 44.0.0. Secure window preferences are checked.
The baseline resolves installed SDK 10.0.112 and .NET runtime 10.0.12, invokes real
Roslyn and returns sample actuals [8,0]. No compiler/result/IPC response is mocked.

For the timeout operation, test-only instrumentation delays one real SDK lstat of
`C:\Program Files\dotnet\dotnet.exe` by 10,500 ms, then calls the original actual
filesystem operation. The original Core 10s deadline expires while that I/O is
pending; actual resolver cancellation unwinds when the I/O settles. No production
debug endpoint, replacement resolver, artificial result, runtime install, budget
change or native fault is introduced.

Observed timeout operation elapsed time is **10,742.9179 ms**, including UI and
cleanup overhead. Final production snapshot:

```text
reason: PREPARE_TIMEOUT
csharp.result: compile=null, cases=[], notRunCaseIndices=[0,1]
failure: { kind: TIMEOUT, phase: prepare, caseIndex: null }
javascript: absent
cleanup: FINALIZED / VERIFIED / processClean=true / cleanupComplete=true
workspace: REMOVED; pendingIo=false
```

A third operation holds the same real SDK I/O and switches the UI language to
JavaScript during Prepare. No stale C# timeout/result appears in the replacement
view; cleanup finishes after the original I/O settles. The fixture records this
as lifecycle cancellation with no reportable timeout, not a successful C# Run.
Its checkpoint/lease/workspace proof is recorded without exposing a retired
snapshot through production IPC. Unit/service tests provide the independent
reason and RESULT_INVALIDATED/late-reply assertions. Runtime exceptions captured:
0; remote network requests: 0; Submit disabled and no Judge verdicts.

### Actual cleanup and remaining limits

All three operations hold one actual native lease each; all three leases close,
session directories are absent and their persisted checkpoints read
CLEANUP_COMPLETE / VERIFIED / HANDLES_CLOSED / REMOVED. The successful baseline's
three Jobs (compile 2 GiB, two execute 512 MiB) are terminated/released/handlesClosed,
each release/close exactly once; independently retained process identities are
all signaled. Final managedShutdown=true.

The timeout and cancellation happen during non-process C# Prepare, so **zero
Jobs/process handles are launched for those two operations**. Their lease,
pending resolver I/O settlement, checkpoint and workspace evidence is actual;
the baseline establishes real Job/handle cleanup separately. Do not claim a
nonexistent Prepare Job was terminated or that this reruns every Policy B fault.
Original Core retained-task/retry behavior and all policy values are unchanged.

The real delayed-Resolver gap in the original A03 review is now verified by this
labelled production Electron reproduction. Windows 10/UNC, packaging/9G, Accepted
Restore/9E, full production crash/restart, C# performance, historical full-lint
failure, startup console observations and other previously named limits remain.
Neither A01 nor A02 is changed/reopened. A03 is **FIXED — PASS**, now accepted by
the user. No other production correction was made. Section 8 re-evaluates Common
and overall 9D; do not apply their closure or start 9E without final approval.

## 8. Final reassessment after accepted A03 closure

Date: 2026-10-23. The user accepted **9D Common and overall Phase 9D: COMPLETE —
PASS WITH LIMITATIONS**, including the named limitations below. The formal
documentation status transition is now applied. This is scoped installed-runtime
Windows 11 acceptance, not an unconditional Windows 10/11 release-compatibility claim.

### Rechecked acceptance conditions

The source/requirements/architecture/ADR-025 assessment in Sections 1–5 is reused,
with the A03 failure disposition updated by Section 7. Read-only artifact and
hash checks confirm the accepted C# adapter/tests/reproduction still match their
post-fix manifest; all other protected source/config/tests/scripts match the A03
baseline. No code drift or new evidence gap requiring tests was found. No tests,
build, lint, benchmark, spike or acceptance matrix is rerun for this reassessment.

| Acceptance group | Current result | Supporting evidence / scope |
|---|---|---|
| Common Core/admission/ownership | PASS in demonstrated Windows 11 scope | C's 14 checks, service/Core/IPC regressions; one operation/no queue, Main-issued identities, authorization and shutdown sealing |
| Deadlines/quota/raw output | PASS in exercised scope | Shared 60s monotonic due, phase limits and 12s retained cleanup wait, 1 MiB aggregate raw output, pre-resume quota read-back and actual Job memory-limit evidence; fixed-driver timing and production adapter runs remain separately labelled |
| Windows Job/barrier/Policy B | PASS in exercised scope | Prior Job/descendant/observer/EOF settlement before new samples, retained handles/tasks, no release on unresolved ownership, acknowledged stage-aware retry, no fabricated VERIFIED or history proof |
| Checkpoint/recovery/quarantine/shutdown | PASS mechanisms, with coverage limits | Exclusive leases, validated records/identities, safe deletion/quarantine, real owner-exit and seeded recovery, retained cleanup failure/retry and managed shutdown; full production-language crash/restart is still UNVERIFIED |
| C# Learning Run | PASS WITH LIMITATIONS; prior accepted package retained | CS/R production SDK/Roslyn/actual [8,0], diagnostics/runtime/resource failures and NOT_RUN; accepted A03 closes the previously failing Prepare observation |
| A03 Prepare timeout/cancellation | FIXED — PASS, accepted | 88 targeted PASS; real SDK 10.0.112/runtime 10.0.12 Electron run: PREPARE_TIMEOUT → TIMEOUT/prepare, compile=null/cases=[]/NOT_RUN=[0,1]. Four lifecycle reasons and timeout-shaped untrusted data tested; real language-switch cancellation avoids stale result |
| JavaScript Learning Run | PASS WITH LIMITATIONS; prior accepted package retained | R production/catalogue and six-type harness, existing IPC/UI/strict protocol and actual/NOT_RUN; A01 and A02 remain FIXED — PASS |
| IPC/Renderer/Monaco | PASS in recorded methods | Existing language-specific bounded contracts, owner/frame/epoch/session/generation/sequence/revision rejection, late responses/events, source capture; actual JS/TS diagnostics, typing/drafts/Reset/undo and tested restore paths |
| Project Mode / Terminal isolation | PASS in exercised scenarios | C/CS/R real heartbeat and PTY round trips before/during/after Learning timeout, navigation, failure and shutdown; affected domain source unchanged |
| Typecheck/build/production or targeted lint/diff | PASS from existing relevant gates | Common and accepted adapter/fix records; A03 gates all PASS. This reassessment repeats only document diff/whitespace |
| Full repository lint | FAIL — retained historical limitation | 1,106 archived/spike errors; scoped production/targeted lint PASS; no exclusion/rule change or silent waiver into PASS |
| Windows 10 / actual UNC / remaining Windows configurations | UNVERIFIED | No inference from Windows 11, temporary resolver fixtures or narrower native mechanisms |
| Full production crash/restart, cold worker startup delta, native-key selection, production UI string[] return | UNVERIFIED | Limits described in Sections 5 and 7; neither prior package acceptance nor A03 changes coverage |
| Packaged/bundled runtimes / Accepted Restore / Judge / Submit | Deferred, not implemented or accepted as PASS here | Runtime delivery/clean-machine gate remains 9G; production Accepted Solution Restore and Judge/Submit remain 9E |

### Why the former blocker no longer prevents scoped Common closure

Before A03, fixed-driver Common evidence could not compensate for a failing C#
production adapter observation. That missing integration condition is now covered
by the accepted deterministic regression and actual production Electron/SDK
resolver reproduction: correct final timeout DTO, no samples attempted, original
I/O retained until settlement, VERIFIED cleanup, three closed native leases,
removed workspaces and acknowledged CLEANUP_COMPLETE checkpoints. The successful
C# baseline separately verifies three actual Job/handle disposals; no Prepare
Job is invented. Lifecycle cancellation and stale suppression pass independently.

Together with actual production C#/JS evidence and C's Common mechanism checks,
the demonstrated installed-runtime Windows 11 gates have sufficient evidence.
**No known unfixed production acceptance blocker remains in that reviewed scope.**
This does not prove all OS/environment combinations or error-free startup.
The user has now accepted Common/9D scoped closure with those explicit limitations;
both official statuses are COMPLETE — PASS WITH LIMITATIONS.

### Independent evidence sets — no combined suite

| Existing set | Recorded result |
|---|---|
| Common C artifact | 14 checks PASS, fixed-driver/native/IPC composition with labelled injected faults |
| C#/JavaScript production artifacts | CS and R production runs, actual SDK/Node, source capture, resource/lifecycle/cleanup and Project/PTY evidence as indexed in Section 3 |
| JavaScript Step 6 targeted aggregation | 907 PASS / 11 SKIP, latest-per-assertion merge of targeted runs, not one full suite |
| A01 | 32 targeted PASS plus real Electron Prepare-timeout reproduction PASS |
| A02 | 23 targeted PASS plus real Monaco/worker and JavaScript UI smoke PASS |
| A03 | 88 targeted PASS, 26 name-filtered skips, real C# Resolver/Electron reproduction PASS; typecheck/build/targeted lint/diff PASS |

These result sets overlap in scope and remain independent. No new aggregate test
count or full-suite PASS is asserted. Original NOT PASS, pre-fix FAIL probes,
early fixture FAILs and all original evidence artifacts remain intact. A03's
accepted fix supersedes the specific defect, not the historical execution result.

### Named limitations accepted at final closure

Retain all limits in Section 5: Windows 10/UNC and untested installed-runtime,
AV/lock/junction configurations; full production-language crash/restart;
production UI string[] return coverage; native-key selection and reliable worker
cold-start comparison; missing historical report references and stale peripheral
progress summaries. The current statuses below and Implementation Plan
are explicit; historical summaries do not change accepted architecture or grant
an unperformed compatibility PASS. Remaining progress reconciliation can occur
with this authorized documentation closure, without changing ADR policy. Earlier
execution-time pending statuses remain historical records.

Also retain 9G packaging/bundled runtimes/clean-machine delivery, 9E production
Accepted Restore and Judge/Submit, C# Run approximately 7–8s with optimization
after Phase 9, full repository lint FAIL (1,106 historical errors), and unresolved
sandbox startup messages/inspector causality. Those messages are not A02 worker
exceptions; no associated regression is demonstrated, but they are not resolved.
These are user-accepted coverage/performance/tooling/observation limits, not
an unfixed A01/A02/A03 blocker. None is converted from FAIL/UNVERIFIED to PASS.

### Final accepted status and next-package readiness

| Package | Final accepted status |
|---|---|
| 9D Common | COMPLETE — PASS WITH LIMITATIONS |
| 9D.1 | COMPLETE — PASS WITH LIMITATIONS, retained |
| 9D.2 | COMPLETE — PASS WITH LIMITATIONS, retained |
| Phase 9D overall | COMPLETE — PASS WITH LIMITATIONS |
| 9E | NOT_STARTED until separately authorized |

**9D prerequisite for considering 9E: satisfied by this accepted scoped closure.**
9E implementation still requires separate authorization and its applicable
prerequisites. Permission to start 9E now: NO. No Windows 10 or
9G compatibility/delivery gate closes with this acceptance. The approved
runtime security boundary (process containment, not a malicious-code OS sandbox)
and all budgets/Policy B remain unchanged.

Final closure updates documentation/status summaries only, including the related
Implementation Plan, authority/capability map and changelog. Document diff/whitespace
checks PASS; no code/tests/scripts change, no tests/build/lint rerun, no commit/
push/merge. Historical FAILs and independent test counts remain intact. Overall
Phase 9 stays IN_PROGRESS because 9E–9G are NOT_STARTED. Stop for the user's next decision.

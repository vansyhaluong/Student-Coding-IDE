# Phase 9D.2 Step 6 — JavaScript Run Acceptance

Date: 2026-10-23. User-accepted status: **Step 6 and Phase 9D.2 — COMPLETE — PASS
WITH LIMITATIONS**. Steps 1–5 retain COMPLETE — PASS WITH LIMITATIONS; Phase 9D.1
retains the same accepted status. Common Runtime remains **IN_PROGRESS** and
Phase 9E remains **NOT_STARTED**. No next-phase work is started.

**A01: FIXED — PASS**, accepted by the user on 2026-10-23; Section 14 records the
fix and its verification. **A02 — Monaco Diagnostics: FIXED — PASS**, accepted by
the user on 2026-10-23; Section 15 records the correction and evidence.
Sections 1–12 preserve the original pre-fix findings and FAIL evidence as history;
Sections 13 and 16 give the user-accepted closure and unchanged limitations.

**Final accepted result: COMPLETE — PASS WITH LIMITATIONS** for Step 6 and Phase
9D.2, explicitly accepted by the user on 2026-10-23. A01/A02 are fixed and
accepted, no longer production blockers. The
initial overall FAIL and all pre-fix evidence remain historical results.
All named limitations are accepted for 9D.2 closure; their FAIL/UNVERIFIED or
unresolved states remain unchanged. Common/platform/deferred gates are not closed.
See [final review](PHASE-9D2-JAVASCRIPT-FINAL-REVIEW.md).
Successful checks below remain valid within their stated
scope; they do not turn the failed cases, full-repository lint or unverified
platform scenarios into PASS.

## 1. Scope, authority and environment

Acceptance/verification only: existing JavaScript production Run, six-type
contracts/harness, errors, budgets, lifecycle, Windows behavior, isolation and
the Step 5 console issue. No feature, Judge, Submit, custom-case API, Stop/Cancel
UI, dependency, runtime installation/bundling, architecture or Policy B change.

Read/compared: PHASE-9D2-JAVASCRIPT-PLAN.md, UI-IPC.md, ORCHESTRATOR.md,
HARNESS-SYNTAX.md, NODE-RESOLVER-PROBE.md; Requirement Section 21, Architecture
Section 6, ADR-025, Implementation Plan Section 13.6, actual test/native/production
fixtures. Referenced PHASE-9D-COMMON-STEP7-ACCEPTANCE.md and
PHASE-9D1-FINAL-REVIEW.md are absent; a repository-wide filename search found no
alternate locations. Their contents were not inferred. Inline historical plan/
ADR evidence and newly executed Common/C# fixtures are identified separately.

Observed environment: Windows 11 **10.0.26200 x64**, Electron **44.0.0**, Node-API
Learning native binding built for that Electron, installed **Node v24.16.0 x64**.
The patch is evidence, not a version pin. C# live regressions use the existing
installed stable SDK 10.x; no SDK/Node download or installation was performed.
Windows 10, UNC shares, antivirus controls and another installed incompatible
Node major are unavailable in this session.

Evidence root (R):
`out/learning-javascript-acceptance-step6-1792717832533/`.
It contains baseline.json, commands.json, regression JSON/logs, per-group
production evidence, compiler experiments and summary.json. Full commands are
in R/commands.json; paths below beginning R/ refer to this root.

## 2. Git state, preservation and files

Branch: `feature/phase-9a-learning-mode`; HEAD `05a2912` — C# Run/editor sync.
The existing modified/untracked Step 1–5 production, tests and documents were
present before Step 6. The complete starting status is in R/baseline.json.
No branch switch, commit, push, merge or destructive cleanup was performed.

Baseline hashing checks **471 pre-existing files**, including **266 src files**
and original JavaScript reports/evidence. Final comparison finds **zero changes**
to those files. Original tests write new timestamped evidence directories; the
old evidence is preserved. No production/config/native/dependency file is edited.

New test-only scripts:

- scripts/accept-learning-javascript-run.mjs: unchanged production app, real
  Monaco input/Run, IPC observation, native Job/lease/identity accounting,
  labelled boundary faults, offline mode, lifecycle and isolation groups.
- scripts/investigate-javascript-worker-step6.mjs: disposable compiler build
  variants and HEAD comparison; does not alter production config/node_modules.

Documentation: this report and progress/status updates in the JavaScript plan,
IMPLEMENTATION-PLAN.md, CODEBASE-MAP.md, CHANGELOG-THESIS.md, REQUIREMENT.md,
ARCHITECTURE.md, DECISIONS.md and LANGUAGE-SUPPORT.md. ADR policies are unchanged.

## 3. Functional six-type matrix

Production cases use the unchanged Main catalogue; no sample/schema is supplied
by Renderer. Browser input edits the actual Monaco model. Immediately before
the real Run click, the fixture captures model identity/source and asserts exact
IPC source equality. Each successful actual is selected and checked in the real
Result Panel. Type-harness tests use explicitly Main-owned test catalogues and
real Node/native execution; these are not production UI catalogue coverage.

| Type/scenario | Windows 11 result and evidence | Windows 10 |
|---|---|---|
| int32 | PASS production Sum [8,0]; endpoint actuals [-2147483648,2147483647] | UNVERIFIED — no host |
| boolean | PASS production IsEven [true,false] | UNVERIFIED |
| string | PASS production Unicode actual `Việt Ω 😀` | UNVERIFIED |
| int32[] | PASS production Divide [[4,5],[0,3]] and empty [] actuals | UNVERIFIED |
| string[] | PASS production parameter values through CommonPrefix; PASS real native harness return/empty/Unicode arrays. Production UI string[] **return UNVERIFIED**: catalogue has no such return exercise | UNVERIFIED |
| int32[][] | PASS production rectangular Transpose and empty [] matrix actuals | UNVERIFIED |
| boundary/invalid arrays/matrices | PASS real harness tests: endpoints, empty arrays/rows, ragged/sparse/cyclic/invalid values rejected; labelled Main test catalogue, not custom-case UI | UNVERIFIED |

R/production-functional: nine operations/36 Jobs PASS. The production string[]
return gap is recorded explicitly, without changing content to manufacture PASS.
The 60-case real harness suite also PASSes; fresh evidence:
`out/learning-javascript-harness-step3/2026-10-23T01-16-48-772Z/`.

## 4. Error/protocol matrix

| Scenario | Result | Evidence/classification |
|---|---|---|
| Syntax failure, static import, ESM export | PASS | Real student source, no samples attempted, exact NOT_RUN [0,1] |
| Missing function, require/npm, module.exports | PASS | Real source; safe RUNTIME_ERROR, no host capability supplied |
| Wrong type, undefined, NaN, Infinity, int32 overflow, BigInt, null, object | PASS | Real source; no successful actual |
| Promise, thenable, async function return | PASS | Real source; unsupported values rejected |
| Middle runtime exception | PASS | Prefix RETURNED/FAILED; private marker/stack absent from Result Panel |
| Middle execute timeout | PASS | EXECUTE_TIMEOUT/TIMEOUT; suffix not launched |
| Missing Node | PASS | Empty test-process Main PATH; NODE_MISSING, zero Jobs, no fallback/install |
| Invalid Node candidate | PASS | Invalid real PE file in isolated PATH; NODE_INCOMPATIBLE, zero Jobs |
| Actual incompatible installed Node major | UNVERIFIED | No second installed major. Wrong-major/preview/arch rejection PASS in resolver fixtures only |
| Protocol contamination | PASS | Labelled Node preload writes unframed bytes before the original fixed harness; real pipe/parser failure, no replacement actual/IPC result |
| Native launch failure | PASS | Labelled nonexistent executable at native boundary; real OS failure mapped INFRASTRUCTURE_FAILURE |
| Native observer failure | PASS | Explicit one-shot query fault with real retained Jobs, safe INFRASTRUCTURE_FAILURE and cleanup |
| Prepare timeout result DTO | **FAIL — A01** | Common reason PREPARE_TIMEOUT, but JavaScript result.failure sometimes null |

R/production-errors-v2: 21 operations/56 Jobs PASS. R/production-faults has a
passing resource/fault run, followed by the later failing Prepare scenario in
R/production-faults-v2. Both observations are retained; the later failure prevents
a blanket timeout-observation PASS. Result Panel checks preserve disabled Submit
and exclude Accepted/Wrong Answer/Passed/Failed verdicts and host stack/path data.

## 5. Resource/deadline matrix

| Contract | Observed result |
|---|---|
| Prepare 10s / probe 512 MiB | Enforcement and quota read-back PASS in real native probe/production runs; JavaScript timeout observation FAIL A01 |
| Syntax 30s / 2 GiB | PASS real hang injection; independent production syntax-timeout-repro completed at 31,102.87 ms including UI/preparation/cleanup overhead, COMPILE_TIMEOUT/TIMEOUT |
| Execute 2s/case / 512 MiB | PASS real middle loops, termination/settlement and quota read-back; original Core tests verify per-case due clamped to operation due |
| Operation 60s total | PASS Common real-clock fixed driver at 60,149.88 ms across compile/sequential execute; JS-specific common-due tests PASS. Not claimed as a 60s production JS catalogue run |
| Cleanup caller wait 12s/attempt | PASS Common real pending checkpoint I/O at 12,292.72 ms; original task/lease retained, retry joins without rewriting/respawning |
| Combined raw stdout/stderr 1 MiB | PASS probe/syntax/sample accounting and production two-case raw overflow; whitespace preload adds physical bytes while original harness computes actuals |
| Job aggregate commit | PASS production 512 MiB quota read-back plus **JOB_OBJECT_MSG_JOB_MEMORY_LIMIT (10)** on the owning Job completion port; no inference from V8 OOM text |
| Native quota mechanism | PASS bounded allocator test: real allocation denial + matching Job event at test-only 64 MiB; production limits unchanged |

Every successful group checks quotas before resume, real membership/identity,
settled previous Jobs before another launch, and retains handles until final
cleanup. The memory evidence in R/production-faults contains event 10 at quota
536870912. Raw accounting is independent of safe serialized snapshot bounds.

## 6. Lifecycle/cleanup/recovery matrix

| Scenario | Result and scope |
|---|---|
| Prepare/Syntax/Execute cancellation | PASS production, phase-specific hang preloads only where needed to keep the phase observable |
| Exercise/language switch, leaving Learning | PASS real UI, native handles closed; stale snapshot rejected |
| Pagehide, reload/unload | PASS production; no late context result shown |
| Active app/window shutdown | PASS production app.quit while execute active; managed will-quit after ownership cleanup |
| Stale session/generation/sequence/revision/exercise/language | PASS real transport rejection injection and unit regressions |
| Invalid/mixed/oversized observations | PASS real Preload/Renderer event injection plus shared/Main/IPC tests |
| Late genuine snapshot invoke after newer event | PASS production held actual reply; newer final result preserved |
| Descendants and execution barrier | PASS real child/descendant Jobs; prior members empty, observers/stdin settled, identities signaled before next case |
| Real stdin EOF/stdout/stderr settlement | PASS native/harness suites and final Job observations |
| Deliberately pending stream/observer tasks | PASS controlled adapter/Core tests. Common real-clock pending I/O scenario is checkpoint I/O; not represented as a production JS slow-pipe fault |
| Cleanup failure, PROCESS_UNRESOLVED, re-admission | PASS production injected terminate failure: cleanup false, owned handles retained, replacement rejected; managed shutdown retries |
| HISTORY_UNVERIFIED | PASS production injected history gap: quarantine retained, processClean/cleanupComplete false; never fabricated VERIFIED |
| Startup recovery/quarantine | PASS Common seeded checkpoints/real filesystem/native leases; verified FINALIZED cleanup deleted, uncertain history quarantined |
| Owner process crash | PASS native integration actual owner exit, Job tree kill and exclusive lease release |
| Actual production JS crash then restart end-to-end | UNVERIFIED; the owner-exit mechanism and seeded startup recovery above are separate evidence |

R/production-lifecycle: eight scenarios/22 Jobs PASS; production-stale: two
operations/eight Jobs PASS; production-history: one Job quarantined correctly;
production-retained: four Jobs, retained admission then successful managed retry;
production-shutdown: three Jobs, active managed shutdown PASS.

Passing production group evidence records release/close once per Job, independently
retained root/descendant identities signaled, all recorded leases closed and
managed will-quit. Normal completed sessions also check workspace absence and
read their real checkpoints. Quarantine deliberately retains its workspace.
Failed attempts are not counted as successful final-shutdown evidence.

Common evidence: `out/learning-common-step7-1792718768796/evidence.json` — 14 checks
PASS, including actual Renderer crash/navigation, 12s pending I/O, 60s operation,
retained shutdown/retry, recovery and Project/PTY. It is a fixed-driver Common
composition, not a replacement for production JavaScript functional acceptance.

## 7. Windows compatibility matrix

| Scenario | Windows 11 | Windows 10 |
|---|---|---|
| Electron/native ABI and installed Node architecture | PASS 44.0.0 / x64 / Node24 | UNVERIFIED — no host |
| Drive/case, spaces/Unicode, verified nvm-style directory junction | PASS production R/production-paths; 2 operations/8 Jobs | UNVERIFIED |
| PATH priority/no CWD/no shell/first verified stable candidate | PASS controlled resolver filesystem/real probe suites; actual multiple installed-version ordering UNVERIFIED | UNVERIFIED |
| Broken/cyclic junction, target switch, executable edit/replacement | PASS controlled temporary-file resolver tests; live installed runtime switching UNVERIFIED | UNVERIFIED |
| Locked executable and antivirus timing | UNVERIFIED — no controlled lock/AV environment; no installed executable was modified | UNVERIFIED |
| Supported UNC | UNVERIFIED — no supplied/available share; validation tests are not actual UNC execution | UNVERIFIED |
| Delayed launch/cancellation/quota admission | PASS controlled adapter tests and real startup-cancellation probes; actual antivirus delay UNVERIFIED | UNVERIFIED |
| Concurrent Learning + Project Run + PTY | PASS production and Common evidence below | UNVERIFIED |
| Packaged/clean-machine delivery | UNVERIFIED / 9G, no bundling or fallback policy selected | UNVERIFIED / 9G |

No Windows 10 result is inferred from this Windows 11 run.

## 8. Project Run/PTY and editor regressions

R/production-isolation-v2: real Project Node heartbeat and PTY echo round trips
before Learning, during JavaScript execute, after its timeout and after a real
C# Run. Project stays RUNNING. C# actuals [8,0], three real C# Jobs, original
factory/DTO preserved. Managed shutdown closes all recorded Learning resources.
Project resolver, Terminal, ProcessManager and their source are unchanged.

Existing real editor regression also PASSes:
`out/learning-editor-sync-1792719139580/evidence.json` — rapid typing/caret,
Unicode clipboard/whitespace, undo/redo, selection/autosave, persisted drafts,
exercise/language context, undoable Reset, reload; **zero Learning Run calls**.
This establishes source/draft behavior, not healthy TypeScript diagnostics.

## 9. Regression tests and quality gates

Commands and log redirects are indexed in R/commands.json.

- `npm test -- <34 selected files> --reporter=default --reporter=json --outputFile=R/regression.json`:
  **903 PASS / 1 FAIL / 1 SKIP** initially. All JS Step 1–5 suites ran, including
  60 real harness, 16 real multi-case and 9 real probe tests. Common/native,
  C# adapters/compiler/harness/resolver, service, IPC/Preload, Result Panels,
  editor/draft and Project/Terminal suites are explicitly listed in commands.json.
- Initial native failure: native-allocator.exe had not been built; real native
  start failed. `node scripts/build-learning-native.mjs --test-fixtures` built it
  using existing MSVC/headers. `npm test -- tests/main/windows-exercise-native.integration.test.ts ...`:
  **6/6 PASS**. Original failed JSON/log remains unchanged.
- `$env:LEARNING_CSHARP_EXECUTE_LIVE='1'; npm test -- tests/main/csharp-multicase.integration.test.ts -t 'compiles once and invokes three isolated real catalogue-signature cases in order|fails fast at a middle runtime exception|does not launch any case after real syntax failure' ...`:
  **3 PASS / 10 name-filtered SKIP**; actual compiler/runtime execution.
- Latest result per file/assertion position: **907 PASS / 11 SKIP**, not a single
  full-suite run (R/merged-regression.json). The other skip is the optional
  LEARNING_CSHARP_REAL_SDK filesystem observation, whose opt-in was not enabled.
- `npm run typecheck`: PASS (R/typecheck.log).
- `npm run build`: PASS, including Electron native artifacts (R/build.log).
  Existing Monaco mixed static/dynamic import warning remains.
- `npm run lint`: **FAIL — 1,106 errors**, existing spike/evidence files
  (R/lint.log). No configuration/exclusion or out-of-scope fix was made.
- Targeted ESLint on both new scripts: PASS. Initial fixture syntax/unused/global
  errors were corrected; initial logs retained. Final diff/whitespace checks are
  recorded separately. No full test-suite PASS is claimed.

## 10. Production Electron/offline evidence

Invocation:
`.\node_modules\.bin\electron.cmd scripts/accept-learning-javascript-run.mjs <group> <new-evidence-directory>`.
Secure production BrowserWindow assertions preserve contextIsolation/sandbox true
and nodeIntegration false. Main/preload/renderer bundles and native binary hashes
are recorded. No debug endpoint or replacement IPC result was introduced.

Renderer CDP network is offline, and remote HTTP/HTTPS/WS/WSS requests are blocked
for the test session. Local worker/assets and installed runtime suffice. No npm
install/download/other-major fallback is used. The whole machine's NIC was not
disabled; this is per-application offline evidence, not a disconnected-machine
or clean-machine packaging claim. Actual selected Node version/architecture is
observed from the real owned probe, not Electron's embedded Node version.

Passing groups are retained separately from production-faults-v2 and
prepare-timeout-repro, which FAIL. A passing earlier Prepare run does not erase
the later reproductions. Job totals per group, snapshots, inputs, raw byte counts,
quota read-backs, events, identity handles, leases and checkpoints remain auditable.

## 11. Defect A01 — Prepare timeout observation race

Failing real reproduction: R/prepare-timeout-repro/evidence.json and log.
Native-boundary preload keeps the actual verified Node probe busy; the original
10s Prepare budget expires. The final production snapshot contains:

```text
reason: PREPARE_TIMEOUT
javascript.result: syntax=null, cases=[], notRunCaseIndices=[0,1], failure=null
cleanup: FINALIZED / VERIFIED / cleanupComplete=true / workspace=REMOVED
```

The fixture expects a TIMEOUT/prepare failure DTO and fails. R/production-faults-v2
also fails at the same check; R/production-faults contains the earlier passing
observation, demonstrating timing sensitivity. UI still renders timeout via the
Common reason; there is no fabricated actual or demonstrated cleanup leak.

Root cause: WindowsJavascriptExecutionAdapter.runPhase catches an error after
Core aborts the phase, but its `context.signal.aborted` guard throws before
javascriptProcessFailure can map PREPARE_TIMEOUT. The Prepare branch has no
syntax/execute sub-observer to record that failure. result() synthesizes only
OPERATION_TIMEOUT, leaving an initial-looking JavaScript result in a finished
timeout snapshot. Core correctly retains its reason and cleanup authority.

**Proposed correction, awaiting approval:** narrow handling in
src/main/services/learning/runtime/javascript-execution-adapter.ts to preserve
TIMEOUT/prepare for a deadline abort while continuing to suppress owner/context/
shutdown invalidations; preserve all NOT_RUN cases. Add a deterministic regression
and rerun the real Prepare reproduction plus selected lifecycle/ownership tests.
Do not modify Core, Policy B, contracts, C# or budgets. Regression risk: confusing
lifecycle cancellation with reportable execution failure or publishing stale
results. No production correction has been applied.

## 12. Defect A02 — Step 5 Renderer console investigation

R/production-console records exact CDP exception stacks. Editing JavaScript before
Run reproduces `Cannot read properties of undefined (reading 'get')`:

```text
initializeTypeChecker -> createTypeChecker -> synchronizeHostDataWorker
-> getSyntacticDiagnostics / getSemanticDiagnostics -> TypeScriptWorker
typescript.worker-JXK1C0WB.js:111000:54: file.locals.get("globalThis")
```

The compiler source calls binder(file, options); the production worker bundle
has removed that call, leaving file.locals uninitialized. A disposable build
experiment reproduces the exact failure without Step 5/Run code:

| Variant | Binder call | Diagnostics |
|---|---|---|
| Default tree-shaking | Removed | FAIL, same `.get` error |
| annotations:false | Retained | PASS, syntactic/semantic diagnostics return |
| treeshake:false | Retained | PASS, syntactic/semantic diagnostics return |

R/compiler-investigation-v3/evidence.json records hashes/results. Worker entry,
Monaco defaults, PracticeEditor, config and package/lock files match pre-JavaScript
HEAD. This isolates an existing build/compiler path rather than a new JavaScript
Run service defect; no historical executable was silently substituted. Production
diagnostics are defective. Exact source capture, real Run, editor/draft lifecycle
and managed shutdown checks nevertheless pass in their stated scopes.

**Proposed correction, awaiting approval:** update only the renderer worker build
options in electron.vite.config.ts to disable unsafe annotation-based elimination
for worker builds (candidate `worker.rollupOptions.treeshake.annotations=false`),
then rebuild and verify actual worker diagnostics, JS/TS models, all worker labels,
Learning source/drafts and Run. The disposable experiment validates the candidate
mechanism; it is not production-worker acceptance. Risk: worker size/startup cost
and other worker bundling. No dependency change, Monaco refactor or production
config edit has been applied.

Console instrumentation also recorded two Electron sandbox startup console
messages in the console group. Their relationship to early inspector attachment
is not established; the real preload API and secure window assertions work.
These additional messages are not represented as resolved or error-free startup.

## 13. Failures, limitations and stopping point

**A02 — Monaco Diagnostics: FIXED — PASS**, accepted by the user; see Section
15. It is no longer an unfixed production finding. **A01: FIXED — PASS**, accepted
by the user; its original failure and correction remain in Sections 11 and 14.
Full repository lint remains FAIL.
Windows 10, actual UNC, AV/locked installed runtime, full production crash/restart,
multiple actual installed-major selection and production string[] return coverage
remain named unverified scopes. Windows 10/Common/9G gates are not closed.

Other failed attempts are fixture failures, preserved separately: missing native
allocator helper; syntax input auto-closing altered the requested malformed text
(rerun uses balanced invalid syntax); initial JS-only quota assertion misclassified
C# compile (rerun correctly uses 2 GiB); initial compiler experiment had a script
typo then an invalid snapshot helper (v3 is the valid comparison). Some early
fixture FAILs returned exit 0 after app.quit; the evidence.json result is FAIL,
and the fixture now returns a nonzero failure exit after managed shutdown.
No such attempt is counted as a passing production acceptance group.

The original acceptance FAIL is preserved as pre-fix history. The user accepted
**Step 6 and Phase 9D.2 COMPLETE — PASS WITH LIMITATIONS** with the named limits.
Common remains IN_PROGRESS and 9E NOT_STARTED. Decisions resolved:
NONE; architecture deviations: NONE; production correction: A01's narrow
JavaScript adapter fix and A02's worker-only build configuration. Ready for next
package: requires the user's separate decision and applicable prerequisites.
Stop after documentation closure; no commit/push/merge.

## 14. A01 authorized correction — post-fix verification

This section preserves the A01-time verification/closure history. Current final
Step 6/9D.2 acceptance is recorded in Section 16.

Date: 2026-10-23. Scope: user-approved A01 Prepare timeout race only.
**A01: FIXED — PASS**, accepted by the user on 2026-10-23 based on the following
existing evidence. This is not a Step 6 PASS verdict. This closure updates
documentation only; no tests, build, lint or acceptance matrix were rerun.
The original FAIL evidence in Section 11 and its original R directory is retained;
no earlier test result is replaced or reinterpreted.

New evidence root `F = out/learning-javascript-a01-fix-1792721044399/`.
`F/baseline.json` records starting branch, HEAD, working tree and source/config
hashes. Branch remains feature/phase-9a-learning-mode, HEAD 05a2912. Existing
Step 1–6 working-tree changes were preserved. No commit, push, merge, dependency,
architecture, Core, native, Policy B, contract, C#, Project or Terminal edit.

### Correction and files

Root cause remains the aborted-signal catch guard described in Section 11. Core
can abort Prepare first, before the resolver/probe rejection reaches the adapter.
The adapter now permits only phase `prepare` with a DomainError abort reason
`PREPARE_TIMEOUT` through the existing javascriptProcessFailure/reject path.
That path records `{kind:'TIMEOUT',phase:'prepare',caseIndex:null}`. Common retains
its original PREPARE_TIMEOUT. Syntax stays null, cases stays empty and every
unattempted sample remains NOT_RUN. No timeout value, quota or cleanup code changes.

Files changed in this correction:

- `src/main/services/learning/runtime/javascript-execution-adapter.ts`: narrow catch guard.
- `tests/main/javascript-execution-adapter.test.ts`: deterministic Core-clock race,
  four lifecycle cancellation regressions, lease-release assertions.
- `scripts/accept-learning-javascript-run.mjs`: strengthen the existing
  prepare-timeout-repro group with exact Common reason, failure phase and NOT_RUN
  assertions; retain the same real probe-hang reproduction mechanism.
- `docs/PHASE-9D2-JAVASCRIPT-ACCEPTANCE.md`: this dated addendum/history notice.

### Targeted commands and results

Commands ran from D:/coding-ide. Logs are under F; PowerShell `2>&1 |
Tee-Object -FilePath <log>` captured command output.

| Command | Result / log |
|---|---|
| `npm test -- tests/main/javascript-execution-adapter.test.ts -t A01` before production fix | **1 FAIL, 4 PASS, 18 filtered skips**; regression-before.log. Core abort is triggered at its injected 10s phase deadline while resolver settlement is held; the orchestrator rejects instead of producing TIMEOUT/prepare. |
| `npm test -- tests/main/javascript-execution-adapter.test.ts` after fix | **23 PASS, 0 FAIL, 0 SKIP**; regression-after.log. Includes the five new A01 checks plus existing barriers, pending work, retained ownership, cleanup retries and failure handling. |
| `npm test -- tests/main/exercise-service.test.ts tests/main/exercise-ipc.test.ts -t 'invalidates\|owner invalidation\|cancels only Learning\|publishes only the current\|late cancellation replies\|invoke result retired'` | **9 PASS, 0 FAIL, 26 filtered skips**; ownership-ipc.log. Filters cover context invalidation, owner navigation/process loss/destruction and stale event/invoke responses. |
| `npm run typecheck` | **PASS**, exit 0; typecheck.log. |
| `npm run build` | **PASS**, exit 0; build.log. Existing mixed static/dynamic Monaco import warning remains. |
| `.\node_modules\.bin\eslint.cmd src/main/services/learning/runtime/javascript-execution-adapter.ts tests/main/javascript-execution-adapter.test.ts scripts/accept-learning-javascript-run.mjs` | **PASS**, exit 0; targeted-eslint.log. |
| `git diff --check` | **PASS**; existing CRLF conversion notices are not whitespace errors. Additional whitespace check covers the four untracked A01 files. |

Post-fix targeted total: **32 PASS**, with 26 intentionally filtered skips. The
pre-fix regression FAIL is a separate preserved result. The 907-test regression,
full suite, full lint, benchmarks and spike matrix were not rerun. The earlier
full-lint failure remains an earlier failure, not a passing gate in this correction.

### Real Electron / Windows Job reproduction

Exact existing reproduction group, with stronger assertions, executed after the
production build:

```powershell
.\node_modules\.bin\electron.cmd scripts/accept-learning-javascript-run.mjs prepare-timeout-repro out/learning-javascript-a01-fix-1792721044399/prepare-timeout-repro
```

**PASS**, exit 0. Evidence: `F/electron-prepare-timeout.log` and
`F/prepare-timeout-repro/evidence.json`. Windows 11 Home Single Language x64,
10.0.26200; installed external Node v24.16.0 x64 at
`C:\Program Files\nodejs\node.exe`; Electron 44.0.0 / ABI 149 (Electron's embedded
Node v24.18.1 is reported separately). No runtime download, installation or
dependency change. Recorded network requests: none.

The fixture holds the real production Node probe busy via labelled native-boundary
instrumentation, preserving the actual 10s budget and 512 MiB Job quota. It does
not substitute IPC snapshots or actual results. Observed elapsed operation/UI
time is 11116.9805 ms, within the fixture's 10–16s window. Final snapshot:

```text
reason: PREPARE_TIMEOUT
javascript.result: syntax=null, cases=[], notRunCaseIndices=[0,1]
failure: { kind: TIMEOUT, phase: prepare, caseIndex: null }
cleanup: FINALIZED / VERIFIED / processClean=true / cleanupComplete=true
workspace: REMOVED; pendingIo=false
```

One actual Prepare Job, quota 536870912 bytes, two retained process identities
(root and descendant), both signaled; activeProcesses=0, coverageComplete=true,
stdinSettled=true and observerSettled=true. Job terminated/released/handlesClosed;
release and close each occurred exactly once. Lease closed. Session workspace
absence was checked. Checkpoint is CLEANUP_COMPLETE / VERIFIED / HANDLES_CLOSED /
REMOVED. Final managedShutdown=true. The existing Result Panel NOT_RUN check,
disabled Submit check and absence of Judge verdicts pass.

### Cancellation, cleanup and remaining limitations

The new tests independently abort pending Prepare with CONTEXT_CHANGED,
LEARNING_LEFT, OWNER_LOST and SHUTDOWN. All retain the actual cancellation reason,
reject result publication with RESULT_INVALIDATED, launch no late process and
release the workspace lease once. They are not reclassified as timeout. Existing
service/IPC invalidation tests also pass, including late responses after document
or context retirement. Unload/owner loss uses these existing lifecycle paths;
the full Electron lifecycle matrix was not rerun for this narrow correction.

Policy B implementation is unchanged. Targeted retained-work/barrier/retry tests
and the real timeout's cleanup, identities, handles, lease, workspace and final
shutdown evidence show no regression in the exercised paths. This does not claim
a rerun of every Policy B fault or Windows compatibility scenario.

A02 `.get` worker exceptions are still captured in this new Electron evidence.
They were neither fixed nor suppressed. All previous unrelated limitations,
Windows 10/9G gates and unverified scopes remain as recorded. Step 6 stays
**IN_PROGRESS — NOT PASS**; Phase 9D.2/Common stay **IN_PROGRESS**.
A01 is closed as **FIXED — PASS**; at this A01 closure, A02 was **OPEN — NOT FIXED**
(superseded by the later correction in Section 15).
No overall Step 6 PASS/COMPLETE is asserted. Stop for separate user approval
before any A02 correction or further phase work.

## 15. A02 authorized correction — production Monaco diagnostics

Date: 2026-10-23. A02: **FIXED — PASS**, accepted by the user on 2026-10-23.
Only the separately approved worker configuration correction was applied.
A01 remains accepted FIXED — PASS. The post-fix state before final review was
Step 6 IN_PROGRESS — NOT PASS; the current recommendation/status is in Section
16. These statements record the historical post-fix state; current 9D.2 closure
does not close Common. A02 closure reruns no tests/build/lint.
Original failures and experimental evidence in
Section 12, R, and the A01 evidence roots remain intact.

### Change and preservation

Production change: `electron.vite.config.ts`, renderer-only configuration:

```ts
worker: {
  rollupOptions: { treeshake: { annotations: false } },
},
```

Vite/Rollup accepts this configuration; tree-shaking remains enabled and the
other optimization/build options are unchanged. Ignoring pure annotations in
workers preserves TypeScript's required binder call. No Monaco implementation,
editor, dependency, runtime, C#, IPC, Project, Terminal, native, Core, Policy B,
budget or A01 change.

Other files: new test-only `scripts/verify-monaco-diagnostics-a02.mjs` and this
report. The fixture loads the actual production app/bundles, creates disposable
Monaco models through existing editor APIs and requests actual worker services.
It adds no production debug endpoint and does not substitute worker responses,
diagnostics, source capture or Run results.

Evidence root `W = out/learning-javascript-a02-fix-1792722222643/`.
`W/baseline.json` records Git state, source/config hashes and pre-fix worker
hashes/sizes/binder presence. Branch remains feature/phase-9a-learning-mode, HEAD
05a2912; existing uncommitted work is preserved. No commit/push/merge.

### Production binder and bundle size

`W/worker-comparison.json` records exact byte counts and SHA-256 hashes.

| Bundle | Before | After | Evidence |
|---|---:|---:|---|
| typescript.worker | 13,190,038 bytes | 13,307,936 bytes | Binder absent before, present after |
| ts.worker | 13,190,038 bytes | 13,307,936 bytes | Binder absent before, present after |
| editor.worker | 584,829 bytes | 584,829 bytes | Identical SHA-256 |
| css.worker | 1,909,933 bytes | 1,909,933 bytes | Identical SHA-256 |
| html.worker | 1,285,522 bytes | 1,285,522 bytes | Identical SHA-256 |
| json.worker | 883,992 bytes | 883,992 bytes | Identical SHA-256 |

Both production TypeScript worker files now contain `binder(file, options);` at
line 64378: `out/renderer/assets/typescript.worker-B_w3UDAD.js` and
`out/renderer/assets/ts.worker-B_w3UDAD.js`. Each grows by 117,898 bytes
(approximately 115.1 KiB / 0.894%). Their SHA-256 is
3e138f68c2157d7b7bf52eceb5ac434fb84cc0c3746fc79f93edaa2c2e482107.

### Actual Electron diagnostics and editor checks

Final fixture: `W/diagnostics-v3/evidence.json`, log
`W/electron-diagnostics-v3.log`, and JS/TS syntax screenshots. The TypeScript
screenshot was also visually inspected: the error at column 15 has a red squiggle
and overview marker. Production Electron 44.0.0 / Windows 11 x64, local file
bundles, contextIsolation=true, nodeIntegration=false, sandbox=true.

| Check | Observed result |
|---|---|
| JavaScript and TypeScript valid `const value = 1;` | PASS: syntax and semantic diagnostics empty; no worker exception |
| Both languages: `const value = ;` | PASS: TS1109, offset 14, marker line 1 column 15; real Monaco error markers/squiggles |
| JavaScript reassignment to const | PASS: semantic TS2588 |
| TypeScript string assigned to number | PASS: semantic TS2322 |
| Correct both models back to valid code | PASS: syntax/semantic diagnostics empty, automatic markers clear |
| CSS actual production worker | PASS: invalid color returns diagnostics; fixed color clears them |
| HTML actual production worker | PASS: `<di` completion includes div |
| JSON actual production worker | PASS: malformed object returns diagnostics; fixed object clears them |
| Worker discovery | PASS: editor/typescript/javascript/html/css/json labels load through existing smoke |
| Real Learning typing | PASS: Chromium Input.insertText preserves Unicode `Việt Ω`; cursor line 1, column 41 |
| Selection | PASS via actual Monaco cursorLeftSelect command: columns 40–41; native Shift+Arrow is not claimed |
| Autosave | PASS: production practice.load reads the exact typed draft after the normal save delay |
| Reset | PASS: cancel preserves draft, confirm loads exact catalogue starter, undo restores prior draft and autosaves it |
| Draft restore on language switch | PASS: switch to C#, return to JavaScript restores exact draft |
| Accepted Solution Restore in production | UNVERIFIED: production supplies no Accepted records until Phase 9E; existing component/intent regressions pass separately |

Final diagnostics fixture has zero captured Runtime.exceptionThrown events, no
`.get`/TypeScript worker exception, zero remote requests and managedShutdown=true.
It records first worker-request readiness at 392.5 ms (JS) and 355.5 ms (TS).
These are single-run, already-initializing production-window request observations,
not cold-start benchmarks or a reliable before/after startup comparison. No
startup-performance regression claim is made; cold-start delta is UNVERIFIED.

### Production JavaScript Run smoke

Existing unchanged `accept-learning-javascript-run.mjs console` group:
`W/production-run/evidence.json` and `W/production-run.log`, **PASS**.
Two UI-triggered JavaScript Runs, before/after switching via C#, both return
actual samples [8,0], with exact live Monaco source/revision captured at the real
Run click. No C# Run was executed. No fabricated verdict, Submit remains disabled,
normal Result Panel tabs and VERIFIED cleanup checks pass. Eight actual native
Jobs released/handles closed exactly once, leases closed, workspaces removed,
retained identities signaled, managedShutdown=true. Captured worker exceptions: 0;
remote requests: 0. Installed external Node remains v24.16.0 x64; no downloads,
installation, dependency changes or runtime fallback.

### Commands, targeted tests and gates

Commands executed from D:/coding-ide; PowerShell Tee-Object captured the listed
logs under W. No 907-test rerun, full suite/full lint, benchmark or spike matrix.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0; typecheck.log |
| `npm run build` | PASS, exit 0; build.log; existing mixed static/dynamic Monaco import warning remains |
| `npm test -- tests/renderer/practice-editor-sync.test.tsx tests/renderer/practice-draft-queue.test.ts tests/renderer/practice-workspace.test.tsx tests/renderer/monaco-language-registration.test.ts` | 23 PASS, 0 FAIL, 0 SKIP in 4 files; targeted-tests.log |
| `.\node_modules\.bin\eslint.cmd electron.vite.config.ts scripts/verify-monaco-diagnostics-a02.mjs` | Final PASS, exit 0; targeted-eslint-final.log |
| `.\node_modules\.bin\electron.cmd scripts/verify-monaco-diagnostics-a02.mjs out/learning-javascript-a02-fix-1792722222643/diagnostics-v3` | PASS, exit 0; electron-diagnostics-v3.log |
| `.\node_modules\.bin\electron.cmd scripts/accept-learning-javascript-run.mjs console out/learning-javascript-a02-fix-1792722222643/production-run` | PASS, exit 0; production-run.log |
| `npm run smoke:monaco-workers` | Six-label discovery PASS, exit 0; worker-discovery.log; limited harness logs missing unrelated IPC handlers, not a complete app smoke |
| `git diff --check` and explicit new-fixture/report whitespace checks | PASS |

Initial fixture attempts remain separate: `W/diagnostics` FAIL used JSON options
instead of required diagnosticsOptions (enableSchemaRequest undefined);
`W/diagnostics-v2` FAIL asserted modifier-only CDP ArrowLeft creates a selection
under native EditContext, but observed a collapsed selection. Both had passing
JS/TS diagnostic checks before the fixture failure. The final fixture uses the
correct JSON defaults and actual Monaco selection command. These failed attempts
are not counted as production PASS or native-key acceptance. Initial targeted
ESLint found two unused global declarations in the fixture; corrected without
production changes, original log retained and final lint passes.

### Limitations and stopping point

Both final Electron evidence sets retain the two previously observed sandbox
startup console messages concerning sandboxed_renderer.bundle.js and null
binding.startupData. They are not TypeScript worker exceptions and are not claimed
resolved or an error-free startup. Their relationship to inspector attachment
remains unestablished. Actual secure preload, diagnostics, editor, Run and managed
shutdown work in the tested scopes.

Windows 10, production Accepted-record Restore, native keyboard selection,
reliable cold-start timing and prior unrelated acceptance/compatibility gates are
not inferred PASS. Source-hash verification preserves A01 and every pre-existing
src file; only the approved production config changes. A02 recommendation:
**FIXED — PASS**, accepted by the user. Section 16 records Step 6/9D.2's final
COMPLETE — PASS WITH LIMITATIONS acceptance; Common remains IN_PROGRESS.
No next-phase work is started.

## 16. Final review — user-accepted package closure

The [final review and PASS/FAIL/UNVERIFIED matrix](PHASE-9D2-JAVASCRIPT-FINAL-REVIEW.md)
cross-checks implementation, plan Steps 1–6 and the actual existing artifacts.
A01 and A02 are **FIXED — PASS**, accepted by the user; neither is an outstanding
production acceptance blocker. No new production blocker was found within the
demonstrated Windows 11 / installed Node scope.

Evidence is kept in separate sets: Step 6's **907 PASS / 11 SKIP** is a historical
latest-per-assertion merge of targeted runs, not a single suite; A01 has **32
targeted PASS** plus real Prepare-timeout reproduction; A02 has **23 targeted
PASS** plus real Monaco diagnostics and JavaScript UI smoke. These counts are
not summed. No additional tests, build, lint, acceptance matrix, benchmark or
spike were needed or executed in this final review. Only document diff/whitespace
and read-only source/hash/evidence checks were performed.

The user accepted **COMPLETE — PASS WITH LIMITATIONS** for Step 6 and Phase
9D.2 on 2026-10-23, explicitly accepting the named limitations. They include
Windows 10/actual UNC, 9G delivery, 9E
production Accepted Restore, production UI string[] return coverage, installed
runtime/AV/lock scenarios, full production crash/restart, worker cold-start and
native-key selection, startup console observations, missing historical report
references, and the real full-lint FAIL (1,106 historical errors). None becomes
PASS by closure; scoped passing evidence is detailed in the review.

Official states: Steps 1–6 and Phase 9D.2 **COMPLETE — PASS WITH LIMITATIONS**;
9D.1 retains COMPLETE — PASS WITH LIMITATIONS; 9D Common **IN_PROGRESS**; Phase
9E **NOT_STARTED**. This is documentation-only closure based on accepted evidence.
No next-phase work or Common/Windows 10/9G gate closure. Stop for the user's next
decision; no commit/push/merge.

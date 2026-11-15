# Phase 9D — Shutdown & Cleanup verification spike

Date: 2026-10-19. Branch: `feature/phase-9a-learning-mode`.
Baseline HEAD: `11c71a0f0ebd90f76606a5297c5f16ba4b5427ac`.

**Latest authorized run: corrected build PASS (one attempt); fixed 21-slot matrix
executed once: 16 PASS, 5 NOT_OBSERVED, 0 FAIL, 0 BLOCKED. This supports further
review of Policy B, not production acceptance. Original R5 build FAIL, R3 FAIL
and all earlier evidence remain preserved. The old 16 blocked scenarios remain
unexecuted. Production 9D remains NOT accepted by this report.**
No production code/configuration/native binding was changed. Production 9D
Common/9D/9D.1/9D.2 status was not changed. No checkout, merge, commit or push.

## Policy-B corrected-build run — 2026-10-19T16-31-46-833Z

Only the authorized extra `nullptr` was removed from the `failedAssociation`
initializer. Build instrumentation now writes complete compiler stdout/stderr
before checking the compiler result, and the controller saves build-wrapper
stdout/stderr on failure. No Job, cleanup, classification, assertion or deadline
logic was changed. Files changed in this turn: `native-test-helpers.inc`,
`build.mjs`, `policy-b-run.mjs`, and this report, all inside the spike.

Command: `node spikes/exercise-shutdown-9d-common/policy-b-run.mjs`.
Exactly one isolated native build and bundle attempt passed. Then all 21 slots
from the unchanged plan ran once, in order. Electron host exited 0. Installed
Node v24.16.0 and .NET SDK 10.0.112 were used; no runtime was installed. Cold/warm
means fresh exercise workspaces; the second run can benefit from OS/host caches.

Evidence is separate from the failed R5 run:

- [Results, timelines and integrity](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/results.json)
- [Electron suite evidence](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/suite.json)
- [Unchanged plan copy](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/plan.json)
- [Compiler stdout](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/native-compiler.stdout.log),
  [compiler stderr](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/native-compiler.stderr.log),
  [build output](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/build.log)
- [New-host recovery evidence](evidence/2026-10-19T16-31-46-833Z-R5-policy-b/recovery.json)

Compiler stderr and suite stderr were empty. The failure-capture code path was
added but deliberately not tested by introducing another build failure.

| Slot | Result | Evidence interpretation |
|---|---|---|
| node-cold | PASS | Actual function output 5; CLEAN |
| node-warm | PASS | Actual function output 5; CLEAN |
| csharp-cold | PASS | Actual offline SDK10 build and DLL execution; CLEAN |
| csharp-warm | PASS | Actual offline SDK10 build and DLL execution; CLEAN |
| root-first | PASS | Root gone, child alive in exact Job before cleanup; all tracked handles signaled before release |
| short-natural-1 | NOT_OBSERVED | Cleanup invariants passed; no natural tracking history gap observed |
| short-natural-2 | NOT_OBSERVED | Cleanup invariants passed; no natural tracking history gap observed |
| short-held-1 | PASS | Controlled history gap, real child/grandchild; HISTORY_UNVERIFIED |
| short-held-2 | PASS | Controlled history gap, real child/grandchild; HISTORY_UNVERIFIED |
| race-0 | NOT_OBSERVED | No completed child spawn before cancellation |
| race-15 | NOT_OBSERVED | No completed child spawn before cancellation |
| race-30 | PASS | Spawn observed and cancellation invariants passed; CLEAN |
| race-60 | PASS | Spawn observed and cancellation invariants passed; CLEAN |
| failed-association | NOT_OBSERVED | Assignment failed as intended; expected accounting increment did not occur |
| history-restart | PASS | Persisted quarantine read by a genuinely new Electron Main |
| deny-unsignaled | PASS | Expected rejection; PROCESS_UNRESOLVED, ownership retained |
| deny-member | PASS | Expected rejection; PROCESS_UNRESOLVED, ownership retained |
| deny-query | PASS | Expected rejection; PROCESS_UNRESOLVED, ownership retained |
| deny-ownership | PASS | Expected rejection; PROCESS_UNRESOLVED, ownership retained |
| deny-native | PASS | Expected rejection; PROCESS_UNRESOLVED, ownership retained |
| deny-record | PASS | Expected rejection before release; PROCESS_UNRESOLVED |

### Root-first termination order

Root PID 13200, child PID 33976 and identified helper PID 12116
(`C:\Windows\System32\conhost.exe`) belonged to the exact Learning Job before
root exit. After root exit, only child 33976 remained a member and its retained
handle was still PENDING. Monotonic timestamps below are relative to cleanup
start (12261.7631 ms in the host performance clock); they are observation times,
not exact kernel exit times:

| Milestone | Observed offset |
|---|---:|
| cleanup start | 0 ms |
| root/helper handles observed signaled | +0.231 / +0.238 ms |
| terminate returned | +0.391 ms |
| child handle observed signaled | +17.734 ms |
| TERMINATION_VERIFIED | +34.305 ms |
| native release start, exact Job empty | +34.357 ms |
| native release returned | +34.611 ms |
| PROCESS_CLEAN | +34.615 ms |
| retained observer handles closed | +34.904 ms |
| workspace deletion completed / CLEANUP_COMPLETE | +38.007 ms |

This corrected-contract sample does not replace or reclassify R3/R4. Native
release and ProcessManager zero are still not treated as termination proof.

### Policy B, accounting and recovery

The controlled gap fixtures used independent process handles to establish real
child/grandchild termination while deliberately suppressing the session tracker.
They demonstrate the disposition path, not naturally occurring missed capture.
HISTORY_UNVERIFIED kept processClean=false and cleanupComplete=false, wrote and
read back disposition before release, finalized its recovery record after
release, and retained its workspace. The new recovery host PID 29276 differed
from suite host PID 3280; it preserved the workspace/manifest without PID killing.
This was a normal fresh-host restart, not a Main hard-crash test.

Failed association returned false, Windows error 1816. Both processes were
created suspended and never resumed; retained handles were awaited before
closing. Accounting stayed total=1, active=1, limitTerminations=0 before and after
the rejected association. Thus the rejection was observed, but this host did
not demonstrate the proposed failed-association counter increment. No claim is
made that a failed association executed student code or that counter mismatch
proves a leak.

All six denial gates retained manager resource=1, unreleased Job ownership,
false clean flags and workspace at the assertion point. The explicitly separate
test safety teardown then terminated/released test resources without deleting
unresolved workspaces. Timeline entries from safety teardown must not be read as
successful Policy-B finalization or successful production retry.

### Integrity, limits and recommendation

Pre-build through post-suite SHA-256 comparison: **PASS, 509 entries, no changes**.
Snapshot scope: tracked repository files, existing `out/main` artifacts,
node-pty native artifacts and all earlier spike evidence including R1-R5. It is
not a hash inventory of every untracked file in the repository. Existing dirty
design documents were preserved. Only isolated spike output was built; Project
native output/build hooks were not destinations or changed inputs.

No live Project Run/Terminal isolation, old 16 blocked scenarios, hard crash,
KILL_ON_JOB_CLOSE crash verification, Windows 10 acceptance, production quota or
post-native-release persistence-failure recovery was tested here. Source/artifact
integrity does not establish live Project behavior. Controlled fault seams are
not proof of all OS error paths. Five phenomena remain NOT_OBSERVED; no reruns,
deadline increases or relaxed assertions were used to obtain PASS.

**Policy B has initial feasibility evidence sufficient for further technical
review, but insufficient evidence for production adoption.** Decisions resolved:
NONE. Before more execution, user authorization is required for the remaining
coverage, crash/retry/persistence boundaries and actual Project/Terminal isolation.
No production policy, shared integration or architecture change is authorized by
this result. Ready for production 9D Common: NO.

The R5 section below records the original failed attempt and its then-current
diagnosis; it is preserved as history rather than rewritten to PASS.

## Policy-B R5 — fixed plan prepared; native build failure, verification stopped

The user authorized only a minimal policy-B feasibility group in this spike,
not production policy or continuation of the old 16 scenarios. Policy B must
never finalize on pending observed handles, unresolved membership/query/ownership/
native errors, or failed disposition persistence. HISTORY_UNVERIFIED must retain
workspace and never receive PROCESS_CLEAN or CLEANUP_COMPLETE.

### Predetermined plan and implementation scope

The plan was saved before execution in [policy-b-plan.json](policy-b-plan.json),
and copied unchanged into the new run evidence. **21 functional slots, exactly
one run each**, with no repeat-until-PASS:

- Node real function cold/warm: 2.
- Actual C# SDK10 build + function execution cold/warm: 2.
- Root-first strict descendant termination: 1.
- Short-lived natural child/grandchild: 2; controlled retained-independent-handle
  tree with deliberately suppressed tracker observation: 2.
- Spawn/cancellation race at predetermined 0/15/30/60 ms offsets: 4.
- Real failed association under a test-only Job active-process limit: 1.
- HISTORY_UNVERIFIED disposition + genuinely new Electron recovery host: 1.
- Six negative policy gates: unsignaled handle, member not resolved, current
  query failure, ownership failure, native termination failure, disposition write
  failure: 6.

Each non-observed natural timing phenomenon was planned as NOT_OBSERVED; expected
negative rejection is not itself a test FAIL. No such result was actually reached.
Trial cleanup deadline stayed 12000 ms; intentionally unresolved negative cases
had a predeclared 150 ms test deadline, not a production threshold. Compile trial
deadline was 30000 ms. No quota production policy was selected.

New draft sources: `policy-b-runtime.ts`, `policy-b-host.ts`, `policy-b-run.mjs`,
`policy-b-plan.json`; `build.mjs` selects a separate entry/output via `--policy-b`.
The spike-only native helper include adds accounting, strict nonblocking handle
state, process identity and a suspended-process failed-association experiment.
These additions are unverified; none is imported by production. They are not
claimed to implement a proven production cleanup contract.

Runtime draft waits for tracked handles and checks the Job before release. Its
intended HISTORY_UNVERIFIED path writes/syncs/read-backs disposition, retains
workspace and keeps both clean flags false. The planned new-host recovery path
only inspects/quarantines, never kills a manifest PID. None of these behaviors
has passed runtime acceptance in R5 because the build stopped first.

### Actual command and result

Command: `node spikes/exercise-shutdown-9d-common/policy-b-run.mjs`.

The controller took integrity hashes BEFORE the isolated build, verified the
branch and installed Node v24.16.0 / SDK 10.0.112 inventory, then invoked:

```text
node spikes/exercise-shutdown-9d-common/build.mjs --policy-b
```

Native compilation returned failure. The controller stopped with exit code 1;
no policy-B Electron host, test child/grandchild, failed-association experiment,
restart or function execution was started. Only build prerequisite/compiler
processes and runtime inventory were invoked. No runtime/dependency was downloaded.

Evidence preserved separately:

- [R5 plan copy](evidence/2026-10-19T16-21-02-885Z-R5-policy-b/plan.json)
- [R5 failure and integrity results](evidence/2026-10-19T16-21-02-885Z-R5-policy-b/results.json)

| Item | Actual result |
|---|---|
| Installed runtime/branch preflight | PASS — correct branch, Node24 and SDK10 present |
| Isolated policy-B native build | **FAIL** |
| 21 functional slots | BLOCKED — zero executed |
| Timing phenomena | Not evaluated; no NOT_OBSERVED test results are claimed |
| Original source/artifact/evidence integrity | PASS — 507 entries unchanged before build through failure |
| R1/R2/R3/R4 evidence | Preserved unchanged by hash comparison |
| Old 16 blocked cases | Not run |

### Diagnosis and evidence limitation

Read-only source review after failure found a malformed initializer in the newly
added test-only helper export:

```cpp
{"failedAssociation", nullptr, spikeFailedAssociation,
 nullptr, nullptr, nullptr, nullptr, napi_default, nullptr}
```

It has nine entries, unlike the eight-field napi_property_descriptor initializers
beside it. There is one extra nullptr before napi_default. This is a source-level
error introduced in this spike, not evidence against Windows Job behavior or
policy B. The initializer was NOT corrected after the failure.

The outer controller currently retains the thrown build error/stderr in results,
but does not persist execFileSync's captured compiler stdout on failure. Therefore
the exact MSVC diagnostic text was not preserved and is not fabricated here.
The malformed initializer is a confirmed static defect and the leading build
failure explanation; a successful corrected build has not yet verified that no
additional compilation issues remain.

### Next action requiring user confirmation

1. Correct only the extra nullptr in the spike helper initializer.
2. Capture failed build stdout/stderr into the new run evidence so future compiler
   errors are directly reviewable. Do not overwrite this failure evidence.
3. Build once and, only if successful, execute the same 21-slot plan once. Stop
   on any new FAIL, without weakening assertions or changing the planned deadlines.

No correction, rebuild, functional test or architecture change was made after
R5 build FAIL. `git diff --check` passed and there are no tracked modifications
under src/, scripts/, package.json or electron.vite.config.ts. Existing design
document/9D.0 changes in the working tree were preserved.

**Policy-B production recommendation: INSUFFICIENT EVIDENCE.** The build failure
does not show that B is unsafe, but zero functional runs cannot support adopting
it. Shutdown termination, real failed-association accounting, durable disposition,
fresh-host recovery and the denial gates all remain unverified. No production
status, ADR or policy was marked resolved/COMPLETE.

## Observation R4 — Job/registry completion precedes observed child termination

The user authorized only monotonic instrumentation and a root-first/R4 run, not
cleanup changes, deadline increases or continuation of the 16 blocked scenarios.
R1/R2/R3 evidence was retained unchanged. Only host/controller instrumentation and
this spike report/README were edited. Native binding (including the spike native
copy) was not rebuilt or changed in R4; only the isolated JS host was rebundled.

Command: `node spikes/exercise-shutdown-9d-common/run.mjs --r4`.
Actual Electron Main host PID: 28320. Root: 22372; child: 6120; helper: 32556,
positively identified as `C:\Windows\System32\conhost.exe`.

Evidence:

- [R4 controller results](evidence/2026-10-19T13-30-54-826Z-R4-root-first/results.json)
- [R4 full monotonic timeline](evidence/2026-10-19T13-30-54-826Z-R4-root-first/suite-results.json)
- [R4 stderr](evidence/2026-10-19T13-30-54-826Z-R4-root-first/root-first.stderr.log)

### Instrumentation boundaries

Clock: `node:perf_hooks.performance.now()` monotonic milliseconds. Timeline records
absolute monotonic values plus offsets from observation origin 655.4334 ms.
Delegating callbacks record existing native terminate/count/release calls, existing
manager cleanup promise completion, and existing Exercise cleanup completion.
They return the same results/promises and do not add waits to cleanup.

The observer does not open, duplicate, inherit or close a Job handle. It queries
the already-owned Learning native session handle. Existing retained observation
handles have SYNCHRONIZE/PROCESS_QUERY_LIMITED_INFORMATION access to processes;
they do not keep a process executing and are not Job handles. They close during
host safety-finally, as before. No Job/termination flag, spawn argument, cleanup
ordering or lifetime policy changed.

Native release is recorded after the native call succeeds, before the JS wrapper
sets its released boolean. Resource-zero is recorded after the original manager
cleanup promise succeeds. Duplicate cleanup subscribers generate repeated
completion observations; `milestones` keeps the first occurrence.

After cleanup returns, the original immediate assertions run BEFORE passive
observation. A captured immediate failure would still be rethrown and recorded
FAIL after observation. No original R3 failure was overwritten or reclassified.

### Timeline — all offsets relative to observation origin

| First observed milestone | Offset ms | State/evidence |
|---|---:|---|
| Helper handle already signaled | 0.628 | First pre-cleanup sample; actual helper exit was at or before this observation |
| Cleanup begins | 0.770 | Existing session cleanup task starts |
| Native terminate call returns | 1.615 | Next sample still finds child handle unsignaled |
| Job active count zero observed | 2.240 | At 2.265 ms, child handle is STILL unsignaled |
| Native Job release succeeds | 2.662 | Membership snapshot immediately before release is `[]` |
| Sample after native release | 2.701 | Child STILL unsignaled; native released; wrapper boolean not yet updated |
| ProcessManager cleanup resolves | 2.800 | Resource count zero |
| ProcessManager zero recorded | 2.810 | At 2.844 ms, child STILL unsignaled; wrapper released=true |
| Full Exercise cleanup resolves | 13.336 | Includes existing recovery-record writes and workspace removal |
| Child handle first observed signaled | 13.380 | Last unsignaled observation at approximately 2.834 ms |
| Caller returns from awaiting cleanup | 13.412 | Child/helper already signaled at subsequent sample |
| Original immediate assertion group succeeds | 17.514 | All original post-cleanup checks passed in THIS run |
| Passive observation completes | 17.614 | All observed handles signaled; no extra poll/sleep required |

Actual child termination time is bounded by observations: after approximately
2.834 ms and at or before 13.380 ms. **13.380 ms is an observation timestamp, not
the exact kernel exit time.** Do not report the 10.546 ms sampling interval as a
measured teardown duration. Similarly, the helper was already terminated in the
first pre-cleanup sample; its exact exit instant is unknown.

### Assertions and scope of PASS

Root/child membership was confirmed directly before root release. After root
exit, root PID was absent and the still-unsignaled child was the sole Job member.
Final checks passed in R4: child/helper handles signaled, member list empty before
release, native/wrapper released, manager zero and workspace absent.

The experimental observation deadline remains 12000 ms from instrumentation
origin. Passive sampling, if needed, uses the existing 15 ms observation poll
only after cleanup/instant assertions. In R4 all handles were already signaled
at passive-start, so no passive poll delay was executed. No sleep was added to
make cleanup or its immediate assertion pass.

R4 runner exit code: 0. Its result file has root-first PASS and integrity PASS
(494 existing entries unchanged during the run). **R3 remains FAIL.** Only one
R4 run was executed; no repeated probing until PASS and no other test group ran.

### What this establishes about the failure mechanism

Confirmed by R4: Job zero/member-list-empty, native release and ProcessManager
resource removal are observable BEFORE the descendant process object becomes
signaled. Therefore those lower-level completion signals do not establish the
stronger contract "every observed descendant has completed termination".

Windows documents TerminateJobObject as terminating associated processes as if
TerminateProcess were called on each, and describes process signaling as part of
process termination. These are distinct observations in this experiment:
[TerminateJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-terminatejobobject),
[Process termination](https://learn.microsoft.com/en-us/windows/win32/procthread/terminating-a-process).

An unsignaled handle does not, by itself, prove user code is still executing:
termination/teardown may already be in progress. No persistent runaway process
was observed in R4. Nevertheless, reporting a resource fully gone at manager
completion is too early for the strict descendant-termination acceptance.

For the HIGH-LEVEL Exercise cleanup promise, R4 does not reproduce R3's immediate
failure: child was signaled by the time the caller resumed. The existing async
filesystem work provides elapsed time between registry cleanup and final cleanup
resolution; it is not a process-termination barrier. In R3 that interval did not
satisfy the immediate child-exit check. This supports a timing-dependent completion
gap rather than proving that all future runs will succeed. Instrumentation adds
CPU/microtask overhead, so a single instrumented PASS cannot close the R3 finding.
The exact OS-internal point where Job accounting stops counting a terminating
process was not traced and is not claimed as proven.

### Impact and options requiring approval

Impact: Learning may release its process resource, then mark the workspace
process-clean/delete files, without an explicit descendant-termination barrier.
This can race teardown or locked files. The current measurements do not establish
Project damage; no Project implementation was changed and live isolation remains
unexecuted. Do not change Project cleanup based on this experiment.

Recommended option for a SEPARATELY authorized Learning-only corrective spike:

- Define cleanup success explicitly as observed descendant handles signaled,
  root/EOF settled, Job empty, native released, manager empty, then workspace
  cleanup/recovery acknowledgement.
- Retain the Learning resource while awaiting bounded, nonblocking completion
  of the process handles; do not rely on filesystem elapsed time.
- Capture membership/handles before terminate, evaluate the capture/spawn race,
  and keep failure/ownership on missing evidence or timeout. A single PID snapshot
  is not by itself proof that no descendant can be missed.
- Keep all changes in the Learning spike/adapter, leaving production shared
  adapter/terminator/ProcessManager untouched. Reverify root-first before other
  groups. No such corrective change was made during R4.

Alternative: preserve the lower-level meaning "Job accounting/release complete"
but introduce a separate Learning termination barrier before releasing the
Learning resource or touching workspace. This can preserve existing primitives,
but still needs the same descendant observation/race verification. Accepting
Job-empty alone as full termination or adding a fixed sleep is not recommended
and would not meet the existing strict acceptance.

Requested decision: approve the Learning-only completion-contract correction and
its observation/capture design before implementation. R4 does not authorize it.
The 16 other scenarios remain BLOCKED by explicit instruction in this turn.

## Continuation R3 — direct Job membership verified, post-cleanup child-exit FAIL

The user authorized an observation-only helper in the spike native copy and a
root-first-only run. R1/R2 evidence remains unchanged. The helper calls
`QueryInformationJobObject(JobObjectBasicProcessIdList)` on the exact native
Learning Session Job handle. A second read-only query obtains executable images
from retained process handles. Neither observer assigns/terminates processes or
changes cleanup. A transparent test adapter delegate captures the same native
session handle and snapshots membership immediately before the existing release.
No production native binding/source was changed.

Build: isolated native observer rebuild and JS bundle PASS. Run command:
`node spikes/exercise-shutdown-9d-common/run.mjs --root-first`.

Evidence stored separately:

- [R3 results](evidence/2026-10-19T13-22-18-592Z-root-first/results.json)
- [R3 Electron trace](evidence/2026-10-19T13-22-18-592Z-root-first/suite-results.json)
- [R3 assertion log](evidence/2026-10-19T13-22-18-592Z-root-first/root-first.stderr.log)

| Observation | R3 result |
|---|---|
| Child readiness + root/child alive before root release | PASS |
| Specific Learning Job membership before root exit | PASS — root 16848, child 6132, helper 29900 |
| Identify additional process | PASS — PID 29900 image `C:\Windows\System32\conhost.exe` |
| Root exit before cleanup | PASS — retained root handle signaled; root-exit code 0 |
| Child alive and member of same Job before cleanup | PASS — child 6132 live, members `[6132]`, active count 1, Job unreleased |
| Child process handle signaled immediately after cleanup returns | **FAIL** — `native.alive(child)` was `true` instead of `false` |
| Later post-cleanup assertions and consolidated evidence | NOT REACHED — test stopped at child-exit assertion |
| Source/artifact integrity | PASS — 494 entries unchanged during R3 |
| Remaining 16 scenarios | BLOCKED — not started |

### Third-process analysis

The third member was positively identified through its observed process handle
as Windows Console Host, not another unknown Node child. Detached execution is
the context in which this helper was observed. It was in the Learning Job before
root exit, then absent from the Job member list when only the child remained.
Its lifetime must not be equated with member-list presence: the final helper-exit
assertion was not reached, so no helper-exit PASS is claimed.

The invalid R2 exact-total assumptions were replaced, as authorized, by direct
root/child membership checks and identification of every additional member. Root
and child observations were not weakened or removed. No timeout was increased.

### New failure and technical interpretation

Trace: `descendant:root-exit:0 -> descendant:cancel -> descendant:clean`. The
assertion immediately following `await s.cleanup()` found the retained child
process handle still unsignaled. This is the first post-cleanup assertion; root
and child summary fields and all later cleanup assertions were not written.

The unchanged adapter releases only after native settlement and Job active count
zero; the spike session then reports clean and deletes workspace. R3 demonstrates
that this path, as observed here, did not establish an immediately signaled handle
for the recorded descendant when cleanup returned. A temporary process-teardown
interval is a plausible explanation, not yet a measured or proven cause. The
current evidence does not prove a persistent runaway child or that another delay
would satisfy acceptance. Do not reinterpret the test as PASS.

The host's safety-finally ran; the session directory was empty on subsequent
read-only inspection. That establishes workspace absence at inspection time, not
successful descendant-exit acceptance. No additional crash/cleanup test was run.

### Proposed next step requiring confirmation

Instrument the existing observation path to retain timestamps and PID membership
snapshots immediately before release, after cleanup returns, and when root/child/
helper observation handles signal. Use the already established observation
deadline, without increasing it. Keep the immediate state evidence, and only mark
the overall scenario PASS if all required handles signal, Job emptiness is observed
before release, native release/manager-zero/workspace-absence are verified.

This initially changes observation only. If it demonstrates that the cleanup
completion contract must wait for descendant termination before declaring clean
or deleting workspace, stop and present that Learning-only design change; do not
modify the shared adapter or production cleanup. Persistent unsignaled processes
must remain FAIL, not be hidden with polling or a longer timeout.

No correction or rerun after R3 FAIL has been made. Requested decision: approve
the bounded timing/membership observation above before any further execution.
Production Common remains unimplemented, and all 16 previously blocked scenarios
remain BLOCKED, including actual C# Main crash, true restart recovery and live
Project Run/Terminal isolation.

## Continuation R2 — authorized fixture repair, stopped again

The user authorized spike-only detached/readiness correction and required a
root-first PASS before the other 16 scenarios. Original first-run evidence in
`evidence/results.json`, `evidence/suite-results.json`, `evidence/integrity.json`
and `evidence/suite.stderr.log` is unchanged. Sections 1–10 below describe that
historical first run; this section records the latest result separately.

### Changes made before the R2 run

- Only the root-first fixture behavior was repaired: `detached: true`, child
  writes its own readiness PID, root waits for an explicit release file instead
  of exiting after a fixed 500 ms.
- Added pre-cleanup accounting/observation assertions and evidence fields. No
  existing assertion was removed or weakened; no timeout was increased.
- Added root-first-only/remaining test selection to the host/controller and
  timestamped evidence destinations so original FAIL evidence cannot be overwritten.
- Rebundled JavaScript only. Existing spike native binding was not rebuilt or
  modified, and no production file was changed.

Command: `node spikes/exercise-shutdown-9d-common/run.mjs --root-first`.

New evidence:

- [R2 controller results](evidence/2026-10-19T13-12-12-604Z-root-first/results.json)
- [R2 Electron host evidence](evidence/2026-10-19T13-12-12-604Z-root-first/suite-results.json)
- [R2 failure log](evidence/2026-10-19T13-12-12-604Z-root-first/root-first.stderr.log)

| Check | R2 result |
|---|---|
| Isolated JS rebundle | PASS |
| Corrected root-first scenario | **FAIL** |
| Existing source/Project artifact integrity during R2 | PASS — 494 entries unchanged |
| Remaining 16 blocked scenarios | BLOCKED — not started |
| Main crash with actual C# / fresh-host recovery / live Project isolation | BLOCKED — no new evidence |

**Exact failure:** `LearningJob.activeProcessCount() === 2` returned **3** before
root release. Child readiness completed and both root/child observation handles
reported alive. The new fixture made an overly strict additional assumption that
the Job contains exactly root+child. It stopped at this assertion, so it did NOT
yet prove root-exited/child-alive/specific Job membership before cancellation.

The `3` may include a Windows console/helper process created for detached execution.
This is a hypothesis, not a verified identity. No PID/member list was captured by
the current Job API, which exposes count only. Root never received the normal
release file before the assertion failed. Safety-finally subsequently cleaned
the owned session; the sessions directory was empty on read-only inspection.

**Do not change the assertion to `>= 2`, extend a delay or mark this PASS.**
The existing root-first acceptance remains unresolved. Need an observation-only
spike helper that queries the specific Learning Job's process ID list, with retained
process handles, to assert identities rather than an assumed total count:

1. Before root exit: root PID and ready child PID are both members of this Job.
2. Release root; confirm its retained handle signaled.
3. Before cleanup: child handle remains live and its PID is still in this exact
   Job, root PID is absent; record all other members instead of guessing identities.
4. After cleanup: child handle signaled, Job empty, native handle released,
   ProcessManager empty and workspace absent.

This needs a separately approved observation-only extension in the spike native
test copy/adapter, or another direct Job-membership inspection method. No native
change or further correction/run was made after R2 FAIL. Production native/API
must remain untouched. No production architecture change is justified by the
current fixture/accounting failure alone.

Requested decision: permit the spike-only membership observer and the root-first
assertions above, rerun root-first alone, and resume the blocked scenarios only
after PASS. Actual C# Main crash and true process restart still require the
coverage refinements already identified in Section 7, within the approved spike.

Final scope/whitespace check: `git diff --check` PASS; no tracked changes under
`src/`, `scripts/`, package.json or electron.vite.config.ts. No production tests,
quota decision, commit/push/merge or phase completion occurred.

## 1. Authorization, prerequisites and scope

The user authorized an independent spike here and isolated test artifacts only.
Read AGENTS.md, relevant ADR-008/020/021/025, current 9D scope, previous shutdown
survey in the conversation, and the 9D.0 REPORT. 9C is complete; 9D.0 PASS is
feasibility evidence, not production shutdown/crash acceptance.

Project/Terminal classes, adapters, runtime selection and build hooks must remain
unchanged. This spike imports DesktopApplication, ApplicationQuitCoordinator and
ProcessManager unchanged. Installed runtime baseline: SDK10/Node24, no installation
or downloads. CPU/RAM/timeout production thresholds remain undecided. No UI,
Stop/Cancel button, Judge, Accepted persistence or bundled runtime was implemented.

Working tree already had changes to .gitignore and design/status documents and
untracked 9C acceptance/9D.0 files. They were preserved. Only this spike directory
and `out/exercise-shutdown-9d-common/` were written by this task.

## 2. Environment and build

| Item | Observed |
|---|---|
| Windows | Windows 11 Home Single Language x64, 10.0.26200 / build 26200 |
| Electron | 44.0.0, actual browser/Main process |
| Electron embedded Node | 24.18.1; host runtime only |
| External installed Node | v24.16.0, used for Exercise child processes |
| Installed SDK selected for C# experiment | 10.0.112 |
| Other SDK inventory | 8.0.410 / 9.0.314, not selected as fallback |
| Native | Node-API 8, MSVC x64, existing cached Electron headers/import library |
| Host userData | Unique `out/exercise-shutdown-9d-common/host-*/userData` |
| Native/bundle output | Only `out/exercise-shutdown-9d-common/` |

Native build and isolated Vite bundle: PASS. One JS-only rebundle was performed
after pre-execution source review. No failing build was repaired/retried.
No full app build/test/lint/typecheck was run. host.ts is an experimental bundled
test driver with type checking disabled; bundle success is not strict typecheck.

The native source is a selective materialization of the argv/Job primitive at
`b4e23fabfa690201d179d93c1596af7849c3d5c0`. Changes exist only in the generated spike
copy: KILL_ON_JOB_CLOSE and explicit test helpers/fault seams. No Project artifact
is used as the output destination. No change is made to the shared native source.

## 3. First-run results

Evidence:

- [results.json](evidence/results.json): controller results, runtime inventory and integrity outcome.
- [suite-results.json](evidence/suite-results.json): actual Electron host trace and assertions.
- [suite.stderr.log](evidence/suite.stderr.log): first failing assertion.
- [integrity.json](evidence/integrity.json): 494 hashed files, no changes during verification.

Counts exclude the build: **12 PASS, 1 FAIL, 16 BLOCKED/not executed** out of 29
planned scenario/check slots. The 12 PASS are 11 executed functional scenarios
and one artifact/source integrity check. The C# scenario contains three actual
runtime cancellation subchecks. BLOCKED below means not executed after the FAIL,
not a claim that the underlying feature cannot work.

| Scenario | Result | Evidence/limit |
|---|---|---|
| A: normal quit while Exercise process is running | PASS | QuitCoordinator + DesktopApplication; one STOPPING, one final quit callback |
| A: Learning cleanup failure does not block fake Project cleanup | PASS | Native terminate fault; Project stopped once; Window held until retry |
| A: Project rejects before Learning barrier | PASS | Background Learning cleanup finishes before its managed stop is reached |
| A: Project pending before Learning barrier | PASS | Learning cleans while shutdown promise remains pending; fake Project later released |
| A: approval cancelled, later accepted | PASS | No cancellation during rejected approval; two approvals, one final quit |
| A: duplicate cancellation/stop; reject launch after shutdown | PASS | One child spawn, deduplicated cleanup, zero resources after success |
| B: cancel controlled prepare process | PASS | Long-running Node phase fixture, resource removed |
| B: cancel controlled compile process | PASS | Long-running Node phase fixture, resource removed |
| B: cancel controlled execute process | PASS | Long-running Node phase fixture, resource removed |
| B: actual C# prepare/compile/execute cancellation | PASS | SDK10/9D.0 harness, all three phase callbacks reached, manager zero/workspace absent |
| B: infinite loop and experimental timeout | PASS | 150 ms trial trigger, total observed 201 ms; no production threshold selected |
| B: root exits while descendant remains, then Job cleanup | **FAIL** | Descendant handle already signaled before cancellation; fixture precondition false |
| B: injected Job creation failure | BLOCKED | Defined but not run |
| B: injected spawn failure | BLOCKED | Defined but not run |
| B: injected terminate retention/retry standalone | BLOCKED | Earlier A scenario tests this seam during shutdown; this separate case not run |
| B: injected release retention/retry | BLOCKED | Defined but not run |
| C: Renderer reload | BLOCKED | Real Electron event scenario defined, not run |
| C: Renderer navigation | BLOCKED | Not run |
| C: Renderer crash | BLOCKED | Not run; no crash invoked in recorded run |
| C: owner destruction/stale delivery | BLOCKED | Not run |
| C: external Main hard kill during prepare | BLOCKED | Controller did not reach hard-crash group |
| C: external Main hard kill during compile | BLOCKED | Not run |
| C: external Main hard kill during execute | BLOCKED | Not run |
| D: real file lock and recovery/manifest PID handling | BLOCKED | Helper built; scenario not run |
| D: injected EACCES and fail-closed shutdown retry | BLOCKED | Not run |
| D: containment/nested junction/external sentinel | BLOCKED | Not run |
| D: recovery refuses unproven state | BLOCKED | Not run |
| E: actual RunService/TerminalService isolation | BLOCKED | Code prepared but not reached; do not claim live Project regression PASS |
| E: tracked source/config + existing Project artifacts unchanged | PASS | 494 hashes compared before/after verification; changed=[] |

## 4. FAIL diagnosis — stop and request confirmation

Failing assertion: `native.alive(childHandle) === true`, actual `false`, after
the root process had exited. Trace includes `descendant:root-exit:0`; the failure
occurred BEFORE the scenario invoked Learning cancellation. The descendant PID
file recorded 19972. The retained Windows process handle avoids mistaking PID
reuse for the same live process.

The new fixture spawns a non-detached Node child, calls unref(), then exits its
parent. It did not establish the required condition "parent gone, child alive".
The existing read-only reference `tests/fixtures/run/root-first.js` explicitly
uses `detached: true` and waits for the spawn event before root exit. The spike
fixture omitted that option. Node documents detached as enabling a Windows child
to continue after its parent exits:
[Node child_process options.detached](https://nodejs.org/api/child_process.html#optionsdetached).

**Inference:** fixture lifecycle is the leading explanation; this is NOT evidence
that Learning failed to terminate a surviving descendant. The run does not prove
the precise mechanism that ended the child, nor that adding detached alone will
make the corrected scenario pass.

Proposed correction requiring user approval:

1. Change only the spike root-first fixture to detached child + explicit ready
   handshake. Keep it assigned to the Learning Job, with no breakaway permission.
2. Capture root/child process handles, readiness and Job active count BEFORE root
   exit, then assert root-gone/child-alive before testing cleanup.
3. Record Job accounting, EOF and release after cancellation; do not weaken the
   assertion or reinterpret the original FAIL as PASS.
4. Preserve this first-run evidence; put corrected-run evidence in a separate run.

No correction or rerun was made after the FAIL. Remaining groups were stopped
conservatively, including otherwise independent checks. Host safety-finally reset
fault injection, invoked owned cleanup and closed observation handles. The test
host exited with code 1. Its session directory was empty on subsequent read-only
inspection. There is no claim that unexecuted crash/recovery tests passed.

## 5. Actual shutdown order and retry observations

The host registers `[Learning, fake ProjectDependency, fake Project, fake Window]`
and uses `shutdownLast: [fake Window]`. All lifecycle classes are production imports
without changes. This models ordering, not the full production composition.

Observed normal path:

```text
STOPPING (one notification)
  -> Learning.beginShutdown: synchronously block launches/invalidate generation
  -> schedule owned cleanup without awaiting it from the status listener
  -> fake Project.stop
  -> fake ProjectDependency.stop
  -> Learning.stop barrier (awaits/deduplicates cleanup)
  -> native root exit / Job cleanup / workspace removal complete
  -> fake Window.stop
  -> STOPPED / one final quit callback
```

Background cleanup may overlap Project cleanup; only the final confirmation is
ordered after it. Native callbacks/root exit are asynchronous.

With Learning terminate fault: Project stops once, Window does not stop, manager
retains one resource and the process remains alive. Clearing only the injected
test fault and requesting shutdown again succeeds. STOPPING count remains one;
the already stopped Project service is not stopped a second time.

With fake Project rejection: managed Learning.stop is not reached on the first
attempt, but cancellation/cleanup completes independently. Retry completes with
two Project attempts and still only one STOPPING notification.

With fake Project pending: cancellation cleans the Exercise while DesktopApplication
keeps the shared shutdown promise pending. The test later releases the fake
Project promise; it does not prove recovery from a permanently hung Project stop.

## 6. Job, crash, workspace and Project isolation conclusions

- Job-backed graceful cancellation, retained ownership on injected terminate error
  and retry were observed inside a real Electron Main host.
- KILL_ON_JOB_CLOSE was configured in the isolated native build and Job setup
  succeeded. **Its hard-crash behavior was not exercised**, so it is not PASS.
- Root-first descendant scenario failed its setup/precondition; descendant cleanup
  acceptance remains unresolved. 9D.0 timeout-descendant evidence is a different
  scenario and does not replace this check.
- Actual C# stop covers the build host during compile, not proof of csc activity at
  a particular internal compiler stage. Trial timeout does not establish CPU/RAM limits.
- Successful executed scenarios asserted workspace absence only after process
  cleanup. Locked-file/recovery/reparse/permission tests remain unexecuted.
- Actual RunService/TerminalService isolation was not run. Fake Project shutdown
  order passed, but it cannot establish live Project Run/Terminal non-interference.
- Source and existing artifacts: 494 tracked/native/build entries unchanged during
  the verification run. Hash baseline was taken AFTER isolated build, so it is not
  a pre/post-build hash proof. Build code/output paths are isolated; native Project
  output was never a build destination. Existing untracked 9D.0 files were read only.
- No production UI or Stop/Cancel control exists in this spike. Fake Window/quit
  callbacks model graceful application coordination; they do not test the full
  IDE draft approval/user interface. Windows 10 is not tested.

## 7. Known harness gaps before later acceptance

The unexecuted hard-crash group currently uses controlled long-lived phase fixtures.
It must not be reported as actual dotnet compile-phase hard-crash evidence. A later
authorized refinement should include the actual C# build/runtime path and a child
readiness/observer handshake, including crash with descendants still active.

The pending recovery test constructs a fresh recovery function in the same host;
it is not yet a fresh Electron-process restart. Actual restart and simultaneous
instance/lease protection need a separate authorized scenario. A process-clean
marker is a test recovery record, not tamper-proof evidence for untrusted code.

Current file deletion validation is a spike containment check; it is not proof
against concurrent hostile reparse-point replacement. Job and temporary directory
do not sandbox filesystem/network or prevent code with equal account privileges
from acting outside the exercise model. Native faults/event-loop hangs can still
affect Main. Infinite pending resource.close() is not solved by ProcessManager.

No policy allowing IDE exit with an orphan workspace was enabled. The proposed
EACCES test still rejects managed shutdown and retains the recovery record.

## 8. Minimal production direction — provisional only

The executed lifecycle evidence supports continuing investigation of:

1. A Learning-only instance of unchanged ProcessManager, separate from Project.
2. Non-throwing synchronous admission/generation invalidation at STOPPING, with
   tracked background cleanup independent of managed service progress.
3. Learning managed cleanup confirmation after all current ordinary services and
   before WindowManager, keeping Project relative order unchanged.
4. Learning-only native argv/Job binding with explicit cleanup and close-on-crash
   as a separately verified safety mechanism; no Project adapter/Job modifications.
5. Bounded and idempotent owned cleanup, retained failure records and no false
   successful completion. Internal cancellation only; Run/Submit UI remains separate.

This is not ready for production: descendant, native failure variants, Electron
owner/crash lifecycle, workspace recovery and actual Project isolation remain gates.
No need to modify Project production code has been established by this FAIL.

## 9. Decisions requested / next action

- Approve the spike-only root-first fixture correction and readiness evidence,
  followed by rerunning the affected case; no weakening of its acceptance criterion.
- After that case passes, approve continuation of blocked groups. Preserve old
  evidence; refine real compiler hard-crash and fresh-host recovery coverage before
  claiming those requirements satisfied.
- Production quota values, retry policy, Learning-specific kill-on-close policy,
  fail-closed workspace behavior and shared initialization remain separately gated.

Do not continue tests or fix production based on this report without user confirmation.

## 10. Checks performed

- Independent native build and bundle: PASS.
- Electron verification command: exit 1, first FAIL preserved; no rerun.
- Integrity check: PASS for 494 files during verification.
- Full production typecheck/lint/build/test: not run, per authorized spike-only scope.
- Whitespace/source-scope final checks are reported in the conversation after
  creating this report; no unexecuted test is claimed PASS here.
- Ready for production 9D Common: **NO**.

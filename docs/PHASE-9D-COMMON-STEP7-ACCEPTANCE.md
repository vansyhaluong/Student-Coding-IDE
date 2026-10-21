# Phase 9D Common Step 7 — live integration acceptance, 2026-10-20

Review: observed Common mechanisms PASS within the classifications below;
unconditional Common acceptance NOT PASS. Keep Common `IN_PROGRESS` and wait for
user review. Windows 10 and production C#/JS adapter acceptance remain unobserved.
No production defect was identified by this run. This does not complete 9D.

Authorized scope was Step 7 only. Prerequisites were 9C COMPLETE and accepted
Common steps 1–6. Policy B, runtime policy, phase/operation/cleanup limits and
security contracts remain unchanged. No new decision was resolved. Existing
uncommitted steps 1–6 were preserved. This step changes only two test-harness
files and this report, Plan, Codebase Map and Thesis Changelog.

## Feasibility and isolation of the harness

Production has no language driver and rejects Run as UNSUPPORTED before admission.
An active native operation therefore cannot be accepted through production UI
alone. `scripts/run-exercise-common-acceptance.mjs` builds only
`tests/fixtures/learning/common-acceptance.ts` into a timestamped `out/` directory.
It is absent from production entries/imports. The fixture composes unchanged
ExerciseService/Core/Windows adapter, real Electron IPC and production Preload.
It supplies a fixed Main-owned process plan through existing constructor ports.
Request code is never evaluated by this driver; it is not a JavaScript adapter.
No public debug IPC, command/path capability, production mock-success or behavior
change was introduced. Visible IDE UI was not changed.

Host: Windows 11 x64 build 10.0.26200, Electron 44.0.0, Electron Node v24.18.1,
ABI 149. External Node comes from the unchanged NodeRuntimeDetector on PATH.
Evidence records source/native/preload hashes and unmodified Common limits.
No watchdog kills or outer process timeout produce a successful result.
Failure-only app.exit containment is excluded from proof.

## Observations and classification

Evidence keys (paths relative to repository):

- A: `out/learning-common-step7-1792505180495/evidence.json`
- B: `out/learning-common-step7-1792505497858/evidence.json`
- C: `out/learning-common-step7-1792505557380/evidence.json`
- P: `out/learning-ipc-step5-1792505276167/evidence.json`

A and B are **overall FAIL artifacts** due to later fixture-seeding errors. Only
the individually completed checks listed below are PASS evidence. C ran the
remaining groups and is overall PASS, with exit code 0 and will-quit observed.
Do not describe A/B as successful whole runs or C as repeating the whole matrix.

| Group | Result and exact boundary | Evidence |
|---|---|---|
| Native launch, membership, descendant identities, cleanup | PASS with real Electron/Windows Jobs and fixed test driver. Root observed suspended before resume; compile/execute quota read-back 2 GiB/512 MiB; live tree has retained identities; independent process handles signaled after cleanup; native Jobs released/handles closed; VERIFIED/CLEANUP_COMPLETE | A, first check |
| Execute timeout and one-operation/no-queue admission | PASS real native process and 2s execute deadline; second IPC Run rejected while active; clean after timeout. Fixed driver, not language harness | A, first check |
| IPC/Preload session/generation/sequence | PASS real transport plus injected stale/duplicate/foreign-identity events. Increasing valid sequences, no delivery from rejected events, wrong generation rejected. Synthetic stale deliveries are fixture evidence | A, second check |
| Navigation and owner loss | PASS real full main-frame navigation and forcefullyCrashRenderer. Old completion/reference rejected, native cleanup completed, new document can run. No synthetic Electron owner events | A, navigation/owner-loss checks |
| Cleanup failure and retry | PASS fixture-injected release error before native action, over real native processes. PROCESS_UNRESOLVED/false complete; active ownership blocks admission; retry releases real Job/handles | A, release-error check |
| Pending I/O and 12s caller wait | PASS injected pending FINALIZED write, real clock/filesystem/native lease. Caller rejected after 12,224.106ms; pendingIo=true, cleanupComplete=false; lease remains exclusive; replacement rejected; retry joins original write (one call), then actual acknowledgement/deletion finishes | A, 12s check |
| Policy B historical uncertainty | PASS injected historical gap after real process settlement. HISTORY_UNVERIFIED, processClean=false, cleanupComplete=false, quarantine directory retained | A, historical-gap check |
| Output, process exit and spawn failures | PASS native/Electron with fixed failing processes. 1,100,000-byte producer cancels at combined 1,048,576 retained bytes with OUTPUT_LIMIT; exit 23 and missing executable give RUNTIME_FAILED; each reaches actual VERIFIED cleanup | B, three completed checks |
| Startup recovery and quarantine | PASS seeded checkpoints/orphan with real filesystem and OS-exclusive leases. OWNED/history stay quarantined, orphan untouched, valid VERIFIED/FINALIZED deletes and records CLEANUP_COMPLETE. This is a service restart with fixture records, not an interrupted production language execution | C, recovery check |
| One 60s deadline across phases | PASS real clock/native. Compile 20s followed by sequential 1.4s execute fixtures; 28 Jobs created before OPERATION_TIMEOUT; total including cleanup 60,115.627ms. Deadline was not reset by phase transitions; final real cleanup complete | C, deadline check |
| Active shutdown and failure barrier | PASS real native tree and unchanged DesktopApplication in test composition. Shutdown seals admission. Injected FINALIZED write failure leaves STOPPING/active ownership/window alive; removing fault and retry reaches STOPPED after native release/handle closure. Fault realism is fixture-only | C, shutdown check |
| Project Run and Terminal/PTY isolation | PASS actual unchanged RunService/Project native adapter, ProcessManager, TerminalService and patched node-pty in Electron. Project heartbeat continues and PTY echo round-trip works during native execution, timeout, release failure, pending I/O, 60s timeout, shutdown failure and successful Learning shutdown. Two Project/Terminal resources remain owned until their separate cleanup; final manager size 0. A/B group assertions finish only after their isolation probes; C persists its probe list | A/B completed groups; C isolation check |
| Production Main/Preload behavior/security | PASS production composition: secure preferences, no renderer require, narrow bridge, UNSUPPORTED, invalid privileged payload/stale reference/foreign WebContents rejected, unsubscribe/reload, managed idle will-quit | P, six checks |

There are 14 completed acceptance groups across A/B/C (7 + 3 + 4), plus the six
production smoke checks. Active groups all use a test-only driver/composition;
native/transport/PTY observations are real, not mocks. The 284 regression tests
include controlled-clock/mock fault coverage and must not be counted as live OS
proof. New live RAM evidence is quota read-back/ownership, not a fresh allocation
stress test; previously accepted Step 3 hard-quota evidence was not rerun.

## Failed attempts and corrections

Preserved without overwriting artifacts or weakening assertions/limits:

1. `out/learning-common-step7-1792505098117/`: fixture read checkpoint without
   acquiring a fresh exclusive lease. Production correctly rejected OWNERSHIP.
   Fixed fixture to acquire/read/release.
2. A: fixture seeded FINALIZED directly. Production correctly rejected
   CHECKPOINT_REGRESSION. Fixed seed to acknowledge OWNED → RELEASE_READY → FINALIZED.
3. B: historical seed passed HISTORY_UNVERIFIED into OWNED construction, making an
   invalid quarantine state. Production correctly rejected CHECKPOINT_STATE.
   Fixed OWNED seed proof to null.

Following corrections, already completed groups were not rerun: `--remaining`
ran output/process failures and later groups; `--recovery` ran only recovery,
60s/shutdown and associated isolation. No production source fix was needed.
Initial harness type errors and a lint invocation naming nonexistent
vitest.config.ts were corrected before final quality checks.

## Quality gates and limits of acceptance

- Targeted regression: **284/284, 16 files PASS**, using npm test with explicit
  Exercise contracts/Core/workspace/service/IPC/native-mapping, Preload/bridge,
  renderer runtime, Desktop/quit and Run/Terminal lifecycle test files.
- `npm run typecheck`: final PASS after fixture corrections.
- `npm run build`: PASS, including separate MSVC Project/Learning native builds
  and production Main/Preload/Renderer. Production build has no fixture entry.
- Production/test/script/config ESLint: PASS. Full ESLint: FAIL, **1,106 historic
  spike errors, zero outside spikes**; JSON `out/phase-9d-common-step7-lint.json`.
  No lint rules/exclusions or historical evidence were edited.
- Final tracked diff and untracked text whitespace checks: PASS.
- No protected Project/Terminal/ProcessManager/RunService/DesktopApplication/
  Project-native source or behavior changes. No dependencies, C#/JS adapters,
  Judge/Submit, Stop UI, packaging, commits/pushes/merges, or spike 30/30/16/16 runs.

**NOT_OBSERVED / dependent gates:** Windows 10; active production UI → language
resolver → C#/JS harness/compiler/driver → native execution; missing/incompatible
runtime/offline reference closure for those adapters; language-specific prepare/
compile/startup cancellation and error semantics. Real OS release/disk faults and
an actual historical observation loss were not provoked: injection proves handling,
not that those faults occurred. Full crash-to-startup language recovery and packaged/
other-machine acceptance remain later evidence. The temporary directory is not a
filesystem/network sandbox.

Common policy enforcement, native lifecycle, typed transport and concurrent
Project/Terminal operation have the bounded evidence above. Full supported-Windows
and adapter integration acceptance remains outstanding. **Common stays IN_PROGRESS;
do not mark COMPLETE or start 9D.1/9D.2 without the user's next authorization.**

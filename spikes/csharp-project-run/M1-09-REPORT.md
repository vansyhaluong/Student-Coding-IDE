# M1-09 — CSharpRunStrategy and build/execute integration

TASK REVIEW: PASS. Verified 2026-10-08 on Windows 11 Home Single Language
10.0.26200 x64. Only M1-09 is complete; M1-10 remains NOT_STARTED and both
Milestone 1 and overall C# Run remain IN_PROGRESS.

## Implementation

- `CsharpRunPreparation` reads the existing per-project Run target store and
  performs fresh M1-06 discovery/classification, then M1-05 evaluation of the
  selected candidate. Ambiguity and stale/invalid selection never guess a target.
  Scope cleanup is registered before probes; distinct child owners avoid recursive
  cleanup. No selection writes, LSP/editor target inference or SDK policy duplication.
- `CSharpRunStrategy` accepts an internal evaluated-runtime capability and produces
  an immutable build/execute plan. Target/project/canonical root, Console eligibility,
  dotnet executable, candidate cwd and stable SDK >=8 are checked. Effective SDK
  version and single TFM participate in the execution-plan fingerprint. The JS
  fingerprint payload is unchanged when no C# configuration identity is present.
- Existing M1-08 owns the session, step transitions, cancellation and fail-closed
  cleanup. Each step re-resolves selection/evaluation and validates identity and
  plan fingerprint; M1-09a checks saved-source approval before preparation and
  launch. No auto-save or immutable source snapshot is claimed.
- Main composition registers the trusted strategy and preparation service.
  The legacy public `startRun` entry rejects `.csproj`; no M1-10 IPC/Preload or
  M1-11 UI capability was added. Main-only `startPlannedRun` exercises execution.
- Safe error details distinguish missing/invalid SDK configuration, invalid target,
  ambiguity/preflight/source failure, build/restore nonzero, execution nonzero,
  spawn, observation and retained cleanup failure. No raw native errors or stderr
  are used as public error reasons; stdout/stderr remain session output streams.

## Fixed command policy

Main supplies the resolved absolute `dotnet.exe`, canonical project path and
candidate directory. No shell, PTY, custom environment additions or application
arguments. The M1-04 command policy is unchanged:

```text
dotnet build <absolute.csproj> --configuration Debug --disable-build-servers -nodeReuse:false
dotnet run --project <absolute.csproj> --configuration Debug --no-build --no-restore --no-launch-profile --disable-build-servers
```

Build success requires complete process-tree/pipe/native cleanup before execute.
Build nonzero cannot execute. Stop can cancel preparation, either step or the
transition; failed cleanup retains ownership and blocks replacement.

## Focused automated verification

30 new tests PASS:

```text
npm test -- tests/main/csharp-run-strategy.test.ts
```

384 tests in 13 files PASS (includes the 30 new tests):

```text
npm test -- tests/main/csharp-run-strategy.test.ts tests/main/run-plan-lifecycle.test.ts tests/main/run-lifecycle.test.ts tests/main/run-project-lifecycle.test.ts tests/main/run-identity.test.ts tests/main/run-foundation.test.ts tests/main/run-runtime.test.ts tests/main/csharp-run-preflight.test.ts tests/main/csharp-run-targets.test.ts tests/main/csharp-run-target-store.test.ts tests/main/run-source-guard.test.ts tests/main/run-source-guard-lifecycle.test.ts tests/renderer/run-output.integration.test.tsx
```

Coverage includes exact commands/immutability, build/nonzero/spawn/observation
failures, SDK drift, deleted/ineligible/wrong-project targets, ambiguity, dirty
source, cancellation at every phase, project close/switch, re-run, ownership,
shutdown, root/descendant cleanup, retained failures, event ordering and JS behavior.
Existing M1-09a integration covers real editor/preload/guard behavior with controlled
processes. Native smoke uses the real guard with simulated semantic editor replies.

Quality gates PASS:

```text
npm run typecheck
npx eslint src/main/index.ts src/main/services/run/csharp-run-strategy.ts src/main/services/run/csharp-run-preparation.ts src/main/services/run/run-strategy.ts src/main/services/run/run-service.ts src/main/services/run/run-runtime.ts tests/main/csharp-run-strategy.test.ts scripts/smoke-csharp-run-strategy.mjs
git diff --check
```

New files also receive `git diff --no-index --check -- /dev/null <file>` checks.
No full test suite, full application build or unrelated subsystem smoke was run.
One test fixture initially lacked the required observation-error message; it was
corrected and typecheck passed. No flaky test or unrelated module fix was needed.

## Real Windows execution evidence

The scoped Main runtime bundle uses current production services and the existing,
unchanged `out/main/native/run-process.node`. This bundle is necessary to exercise
the Electron native ABI; it is not a full application build or a native rebuild.

```text
node -e "require('esbuild').buildSync({entryPoints:['src/main/services/run/run-runtime.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:'out/m1-09-smoke/runtime.cjs'})"
node -e "const cp=require('node:child_process');const fs=require('node:fs');const log=fs.openSync('out/m1-09-smoke/console.log','w');const child=cp.spawn(require('electron'),['scripts/smoke-csharp-run-strategy.mjs'],{stdio:['ignore',log,log],windowsHide:true});child.on('exit',code=>{fs.closeSync(log);console.log('Smoke exit:',code);process.exitCode=code??1;});"
```

For the resource repetition run, use the same spawn command with arguments
`['scripts/smoke-csharp-run-strategy.mjs','--resource-repeat']` and log path
`out/m1-09-smoke/resource-console.log`.

Fixtures are in a unique Windows Temp directory with Unicode, emoji and spaces.
Each has an exact `global.json` SDK pin and empty NuGet feeds (no SDK/workload or
dependency installation). Production SDK resolution, evaluator, target resolver,
selection store, strategy, source guard, RunService and native adapter all execute.

| Fixture behavior | SDK 8.0.410 / net8.0 | SDK 10.0.112 / net10.0 |
|---|---|---|
| Build then execute, UTF-8 stdout/stderr, exit 0 | PASS | PASS |
| Compile failure, no execute | PASS | PASS |
| Runtime exit 23, execution failure classification | PASS | PASS |
| Stop in build after CoreCompile | PASS | PASS |
| Stop executing application and its spawned child | PASS | PASS |
| Stop at EXECUTING phase before process creation | PASS | PASS |
| Dirty source, no probe/build/execute | PASS | PASS |

14/14 PASS; 210 native process objects, all released; ProcessManager and source
guard records zero; no new surviving .NET/application processes relative to the
baseline PID/creation-time inventory. Both smoke parent commands exit 0.

The initial direct PowerShell launch lost its output pipe, raising Electron's
`EPIPE` error dialog at `console.log`. That incomplete harness run is not acceptance
evidence. Its owned harness was stopped after diagnosis; the final run retained
stdout/stderr in files and completed normally. No native/adapter fix was needed.

The main matrix's total Electron handles increased from 353 before app startup
to 671 afterwards; this is not used as a leak verdict. A separate four-run warm
repetition PASS observes **677, 677, 677, 677** handles, 80/80 native objects
released, zero manager resources and zero new process survivors. Across both
accepted runs: 18 cases and 290 released native process objects.

Evidence (local generated artifacts, not tracked; fixtures retained for review):

- `out/m1-09-smoke/2026-10-08T08-02-01.691Z/results.json`
  SHA-256 `e7133561a25e1ebfc5c312707885bbe3ec1b3c2a90f40928cf4ceac7e65a430c`.
- `out/m1-09-smoke/2026-10-08T08-05-47.082Z/results.json`
  SHA-256 `d466c1f78b3b729c159d20ffa39dcac183ce7d7ec63f026789c1d1210a83b370`.
- Evidence records command arrays, phases, session exit/error facts, runtime bundle
  and production source/native hashes, process snapshots and resource observations.

## Limits and readiness

No new ADR, dependency, native/process adapter changes, Terminal/LSP changes,
public C# Run API, picker, stdin or auto-save. No commit, push or merge.
The handshake is not a disk snapshot; external source changes and end-user UI/
packaging acceptance remain subject to later gates. Fresh discovery/evaluation
can be expensive in larger workspaces but stays bounded and cancellable.

M1-09 COMPLETE. M1-10 is ready for separate authorization, not implemented.
Full C# Run and Milestone 1 remain IN_PROGRESS.

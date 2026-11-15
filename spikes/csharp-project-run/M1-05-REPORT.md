# M1-05 — Production Run SDK/evaluation verification

Date: 2026-10-07. Result: **PASS / COMPLETE**. Acceptance platform: Windows 11 x64.
M1-06 remains NOT_STARTED; overall C# Run/M1 remain IN_PROGRESS. This report is
separate from the frozen M1-04 spike results and does not claim production C# Run.

## Implemented boundary

Main resolves dotnet from validated PATH entries, inventories SDKs, and asks
`dotnet --version` in the authorized canonical candidate directory. Stable SDK >=8
is Run-specific; the existing csharp-ls SDK >=10 detector is unchanged. A bounded
nearest-ancestor global.json inspection validates syntax/comments and known field
shapes because invalid settings can be silently ignored by the host. It does not
choose an SDK or implement roll-forward. No arbitrary executable/argv/cwd/env is
accepted from Renderer and no public IPC was added.

One project is reauthorized before fixed Debug `dotnet msbuild -getProperty` /
`-getItem:ProjectReference` evaluation. No target, build or restore is requested;
no XML-based classification occurs. The returned Main-only facts preserve
OutputType, TargetFramework, TargetFrameworks, TargetFrameworkIdentifier/Version,
UsingMicrosoftNETSdk/Web, UseWPF, UseWindowsForms, IsTestProject and references.
References remain untrusted facts for M1-06 containment/traversal. Empty values,
Library, multi-target and future TFMs are not silently converted into eligibility.

Existing M1-01 dependency/candidate reasons are retained. Internal details identify
missing host/SDK, SDK selection/configuration/invalid global.json, invalid output,
invalid/changed path, evaluation exit failure, timeout, cancellation, output limit,
spawn/observation and retained-cleanup failure. Raw stderr never becomes a DTO.

## Automated and real evidence

- Focused M1-05 unit/mocked tests: **60/60**. Focused plus dependency, JS Run,
  lifecycle and language workspace/preflight regression: **214/214**, 8 files.
- Final independent `npm test`: **1255/1255**, 86 files. Typecheck, lint and build
  PASS. `git diff --check` PASS. Existing non-failing jsdom canvas message remains.
- Real production module smoke: **20/20**, run ID
  `2026-10-07T16-52-28.593Z`; [captured JSON](evidence/m1-05-preflight.json) includes
  source hashes, exact fixed argv/cwd, inventory, facts and cleanup observations.
  Installed SDKs: 8.0.410, 9.0.314, 10.0.112; tested SDK 8/net8 and SDK 10/net10.
  Production selects contextually and does not hard-code these patch versions.
- Real cases include unpinned CLI selection, exact/ancestor/nearest pins, changing
  cwd/config context, roll-forward, comments, malformed/trailing-comma/invalid SDK
  config, unavailable requested SDK, Directory.Build.props, conditional/imported
  properties, project references, spaces/#/Unicode, Library/multiple/future TFMs,
  malformed/missing project, traversal, no fixture changes, cancellation after
  native evaluation creation, and repeated cleanup.
- Probe bounds: 20 seconds and combined 1 MiB output per command. Timeout,
  stdout/stderr overflow and failed-cleanup retry are unit/mocked evidence;
  cancellation and release are also exercised on real native processes.
- Real **77 native sessions released**, ProcessManager **0**, new surviving .NET
  processes **0**. Eight measured process handle counts: **682** each. Execution
  uses the unchanged production Run binding; the existing isolated probe provides
  read-only process/handle inspection. No kill by process name or SDK installation.
- Native regressions PASS: Run (15 cycles, 23 argv round trips, 30 rejects,
  handles 692 -> 692), Run lifecycle (5 sessions/0 resources), project lifecycle
  (4 sessions/0 resources), Git, C# native/provider/preflight, Terminal live-root
  and natural-root cleanup with unrelated control preserved.

## Reproduce and disclosed earlier attempts

Run sequentially from the repository root with existing SDKs/toolchain:

```powershell
npm run build
node spikes/csharp-project-run/build-native.mjs
node_modules/.bin/electron.cmd scripts/smoke-csharp-run-preflight.mjs
```

The last command uses production code, and requires SDK 8 and SDK 10 already
installed. Missing SDKs fail the smoke explicitly; none is downloaded. Generated
fixtures live in a unique Windows Temp directory outside the open workspace;
JSON is written to ignored `out/m1-05-smoke/<run-id>/results.json`.

Earlier attempts are not counted as PASS:

- The initial fixture under this open IDE workspace acquired generated obj files.
  The source of those writes was not traced. Moving fixtures outside the watched
  workspace isolated the measurement; the unchanged invocation then left both SDK
  fixture trees byte-for-byte unchanged. No native flags were weakened.
- Real SDK 10 malformed global.json returned generic exit 1, while an invalid
  short SDK version could silently fall back. These findings led to bounded
  syntax/known-field diagnostics. A test assumption that trailing commas were
  accepted was corrected after real CLI evidence; comments remain supported.
- An initial full suite concurrent with build timed out one existing Git test
  at 5 seconds. The independent final suite passed without test/timeout changes.
- Initial unchanged JS native smoke hit EPERM deleting a temporary node.exe copy.
  Its retry and all subsequent native regressions passed; no native code changed.

## Completion revalidation — 2026-10-08

Resumed at the user's request on `feature/csharp-project-run`; the existing
M1-05 implementation and captured 2026-10-07 evidence were preserved. No source
changes, new decisions or architecture deviations were required.

- Fresh `npm test`: **1255/1255**, 86 files PASS; typecheck, lint, build and
  `git diff --check` PASS. The existing non-failing jsdom canvas message remains.
- Rebuilt the existing native inspection probe and reran the production smoke:
  **20/20 PASS**, run ID `2026-10-08T00-42-22.219Z`. Evidence:
  [completion revalidation JSON](evidence/m1-05-revalidation-2026-10-08.json).
- All 77 native sessions released; final ProcessManager resources 0; new
  surviving .NET processes 0. All eight handle measurements were 677.
- All five captured source hashes match the 2026-10-07 evidence. Cross-domain
  native regressions above remain the prior executed evidence; they were not
  rerun in this revalidation. The full automated suite and M1-05 native smoke
  were rerun against the current tree.
- M1-05 remains COMPLETE. M1-06 remains READY / NOT_STARTED; no commit or push.

## Limits and next task

No manual production UI or packaged/installed acceptance ran. Evaluation can
execute trusted project logic; it is not an OS sandbox or proof of runtime,
targeting-pack/restore availability, or a snapshot against future external edits.
No production build/run/input/strategy or M1-06 discovery/classification is present.
M1-06's prerequisite is satisfied, but it needs separate authorization.
Windows 10 is outside the verified C# Project Run acceptance baseline;
compatibility is not claimed. No commit, push or merge was performed.

Reference semantics: Microsoft [global.json](https://learn.microsoft.com/en-us/dotnet/core/tools/global-json)
and [evaluation-only MSBuild JSON](https://learn.microsoft.com/en-us/visualstudio/msbuild/evaluate-items-and-properties).
The PASS claims above are based on executed tests and the captured evidence.

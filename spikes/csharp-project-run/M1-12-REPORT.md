# M1-12 — C# Project Run Core Acceptance

**TASK REVIEW: BLOCKED — acceptance is not complete.**

The focused contract/UI tests, real Windows native C# Main smoke, and existing
JavaScript production-UI smoke passed. However, the required C# run through the
production UI and public Preload API to the real native process was not exercised
as one integrated flow. Multi-project target choice and interactive visual QA
also remain unverified. The evidence below is not sufficient for PASS.

## Environment

- `Win32_OperatingSystem`: Microsoft Windows 11 Home Single Language, version
  `10.0.26200`, build `26200`, 64-bit. Registry `ProductName` still reports
  “Windows 10 Home Single Language”; the OS class and build report Windows 11.
- Electron: `44.0.0`; Node/native architecture: Windows x64.
- .NET SDKs: `8.0.410`, `9.0.314`, `10.0.112`.
- Installed .NET runtimes include `Microsoft.NETCore.App` `8.0.16`, `8.0.27`,
  `9.0.16`, and `10.0.12` (also 6.0.36); ASP.NET Core and Windows Desktop
  runtimes are installed for 6–10 as shown by `dotnet --info`.
- The real C# smoke used SDK `8.0.410` with `net8.0` and SDK `10.0.112` with
  `net10.0`.

## Checks and results

| Area | Result | Evidence / limit |
|---|---|---|
| Focused tests | **PASS — 170/170, 8 files** | C# strategy/lifecycle, Run IPC/Preload bridge, source guard, renderer C# UI and JS output integration. These are automated tests, with controlled API/process boundaries. |
| Real C# build/execute | **PASS — Main/native only** | Existing Electron-hosted `smoke-csharp-run-strategy.mjs`; real Windows process adapter and installed `dotnet`; both SDK/TFM pairs ran success, compile failure, exit 23, Stop-build, Stop-execute, Stop-at-transition and dirty-source cases (14/14). This does not call the UI or public C# Preload API. |
| Stdout/stderr and exit | **PASS — Main/native only** | Smoke asserts stdout contains `M109 Xin chào 😀`, stderr contains `M109 stderr`, successful exit is `0`, and runtime failure exit is `23`. The generated result JSON records phases and exit facts; output payload assertions are made by the smoke but not copied into its JSON evidence. |
| Build failure | **PASS — Main/native only** | Both SDK cases ended `FAILED` with `BUILD_OR_RESTORE_FAILED`; no `dotnet run` execution command was launched. |
| Dirty source guard | **PASS — Main/native with semantic reply stub** | Production `RunSourceGuard` rejected dirty source before SDK probes/build/execute. The editor reply was simulated by the smoke harness, not obtained through the live Renderer handshake. |
| Stop/cleanup | **PASS — Main/native only** | Stop during build, execution, and phase transition passed for both SDKs. All native objects released, `ProcessManager` size `0`, no new process survivors. Stop during PREPARING and project switch were covered only by focused tests with controlled ports, not real UI/native integration. |
| JS regression | **PASS with harness note** | Existing Electron production-UI smoke: Run, stdout/stderr, five re-runs, Stop, Output/Problems tabs, exit 0 and exit 7; 8 sessions and zero remaining resources. The log also contains a non-fatal `run:resolve-targets` “No handler registered” message because this legacy JS smoke harness does not register the newer C# target IPC. It is not a JS execution failure and is not evidence for C# IPC. |
| Multiple projects / target independent of editor | **NOT VERIFIED end-to-end** | The real native smoke creates one project per case. No live UI check selected between multiple `.csproj` targets or changed editor tabs while preserving the selected target. |
| Stale target / diagnostics | **PARTIAL** | Focused UI/API tests cover diagnostics and stale-event behavior; no real UI/native stale-target scenario was reproduced. |
| Visual QA | **NOT VERIFIED** | Computer Use inventory returned `apps: []` before and after starting Electron dev. No window was available to inspect. Narrow-window, light/dark theme, long paths, empty/error dialog states and interactive Stop/project-switch visuals were not checked. |

## Commands run

Focused tests:

```text
npm test -- tests/main/csharp-run-strategy.test.ts tests/main/run-plan-lifecycle.test.ts tests/main/run-project-ipc.test.ts tests/main/csharp-run-target-requests.test.ts tests/main/run-source-guard.test.ts tests/renderer/csharp-run-ui.test.tsx tests/renderer/run-output.integration.test.tsx tests/preload/run-project-bridge.test.ts --reporter=dot
```

Result: **8 files passed; 170 tests passed; exit 0.** These test doubles and
controlled ports are not the real C# UI-to-native acceptance flow.

Real C# Main/native smoke (Electron host, existing script):

```text
node -e "const cp=require('node:child_process');const fs=require('node:fs');fs.mkdirSync('out/m1-12-smoke',{recursive:true});const log=fs.openSync('out/m1-12-smoke/csharp-native.log','w');const child=cp.spawn(require('electron'),['scripts/smoke-csharp-run-strategy.mjs'],{stdio:['ignore',log,log],windowsHide:true});child.on('exit',code=>{fs.closeSync(log);console.log('C# native smoke exit:',code);process.exitCode=code??1;});"
```

Result: **exit 0; 14/14 PASS**. Result evidence:
`out/m1-09-smoke/2026-10-11T07-18-41.728Z/results.json`; harness log:
`out/m1-12-smoke/csharp-native.log`.

JavaScript production UI smoke:

```text
node -e "const cp=require('node:child_process');const fs=require('node:fs');fs.mkdirSync('out/m1-12-smoke',{recursive:true});const log=fs.openSync('out/m1-12-smoke/javascript-ui.log','w');const child=cp.spawn(require('electron'),['scripts/smoke-run-ui.mjs'],{stdio:['ignore',log,log],windowsHide:true});child.on('exit',code=>{fs.closeSync(log);console.log('JavaScript production UI smoke exit:',code);process.exitCode=code??1;});"
```

Result: **exit 0**; its log records 8 successful sessions, including re-run,
Stop, Output/Problems switching, stdout/stderr and exit 0/7. See the harness note
above for the expected unregistered C# target-resolution call.

Environment and visual availability checks:

```text
dotnet --info
dotnet --list-sdks
dotnet --list-runtimes
Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName,DisplayVersion,CurrentBuild,CurrentBuildNumber,BuildLabEx
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture
npm run dev
```

The dev app built Main, the Windows x64 native Run module and Preload, and started
the Renderer dev server. Computer Use still returned no native app windows; the
dev process was then stopped. This is not a production build or visual QA. Full
suite, full lint, `npm run typecheck`, and `npm run build` were not run: no source
implementation was changed, and the request limits testing to directly relevant
checks. No visual pass is claimed.

## Changes, unresolved checks, and disposition

- No functional defect was confirmed and no implementation code was changed.
- Added this acceptance report and marked M1-12 `BLOCKED` in
  `docs/IMPLEMENTATION-PLAN.md`; the C# Run milestone remains `IN_PROGRESS`.
- To unblock: run one integrated C# scenario through the production UI and
  `studentIde.run` Preload API to Main/native execution, verify selected target in
  a multi-project workspace independently of editor tabs, and complete the
  remaining required lifecycle/source-guard scenarios. Perform visual QA when a
  targetable Electron window is available. Then rerun relevant checks and update
  this report only with observed evidence.
- **M1-12 is not accepted. M1-12 has not been marked complete. M2/Console stdin
  was not performed.**

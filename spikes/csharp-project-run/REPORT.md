# M1-04 — C# Project Run Windows/.NET compatibility evidence

Date: 2026-10-07. Scope: isolated compatibility spike only.

**Recorded Windows 11 x64 evidence: PASS (32/32 cases). M1-04 gate: PASS / COMPLETE.**
The 2026-10-07 ADR-024 platform amendment and Plan §13.7 now require Windows 11
x64 acceptance evidence only. Windows 10 evidence is no longer required.
Windows 10 is outside the verified C# Project Run acceptance baseline.
Compatibility is not claimed. This is a scope reduction, not a waived test failure.
M1-05 prerequisites from this gate are satisfied; M1-05 remains NOT_STARTED and
requires separate implementation authorization. This report does not claim
production C# Run or Console input support.

## Task start checklist

1. Authorized: M1-04 only, after COMPLETE M1-01/M1-02/M1-03.
2. Goal: verify real SDK flags, process ownership, Stop and future stdin feasibility.
   Exclude application composition, CSharpRunStrategy, SDK resolver, IPC/UI,
   production input queues, dependencies and SDK installation.
3. Preserve M1-03 argv, ADR-020 retained Job ownership and ADR-021 fail-closed cleanup.
4. At spike start M1-04 was the outstanding hard gate under the previous two-OS
   scope. The platform amendment now closes that gate; M1-05 remains NOT_STARTED.
5. All SDK launches are explicit executable/argv/cwd through native Job creation;
   no renderer capability, shell dispatch or language-service session reuse.
6. Required: real net8/net10 build/run, Stop during restore/build, worker/descendant
   ownership, stdin/blocked-write prototype, regression and quality checks.
7. Branch `feature/csharp-project-run`; initial git status/diff were clean. Existing
   M1-03 source was preserved. No commit, reset, checkout, push or merge performed.

## Environment and provenance

- Windows 11 Home Single Language, build **10.0.26200**, x64.
- Executable: **C:\Program Files\dotnet\dotnet.exe**.
- Installed SDKs: **8.0.410, 9.0.314, 10.0.112**; no SDK installed by this spike.
- Tested SDK/TFM pairs: **8.0.410/net8.0**, **10.0.112/net10.0**. Each fixture has
  a local global.json pin with `rollForward: disable`; candidate-cwd `--version`
  confirms the selection. SDK 9 is inventory only.
- Electron **44.0.0**, ABI **149**. Native prototype compiled with the existing
  MSVC toolchain and Electron headers, `/W4 /WX`.
- [results.json](evidence/results.json) contains raw `--info`/`--list-sdks`, OS
  information, exact argv/cwd, outputs/exits, Job snapshots and source SHA-256s.
  Final run ID: **2026-10-07T13-52-23-262Z**.
- Generated projects/binaries and earlier diagnostic runs are under ignored `out/`.
  Reproduction instructions are in [README.md](README.md).

## Isolated implementation

`native-prototype.cpp` compiles this repository's own native Run primitives into a
separate `run-probe.node`, adding inspection, EOF and owned-root-only termination.
Closed-stdin SDK commands use the unchanged M1-03 `createRun` implementation.
The writable prototype reuses the low-level writable pipe mode through dedicated
probe exports. It creates its own sessions/Jobs; it does not use an LSP manager,
protocol, language session or language process factory.

`harness.mjs` registers each step with the existing ProcessManager before native
creation. It retains ownership through pending writes, root/pipe settlement,
empty Job and release. Every cleanup records zero open session handles, zero
pending writes, no live observed owned PID and released ownership. An independent
control owner uses a separate output copy so rebuilding the test target cannot
lock the control executable.

Production `src/`, RunService/RunStrategy, Run IPC, Output UI, SDK detection,
package manifests and dependencies are unchanged. Prototype APIs are not an
approved production input API; queue limits, session sequencing and UI remain M2.

## Fixed command policy tested

From the candidate directory, with an explicit absolute project path:

```text
dotnet build <project> --configuration Debug --disable-build-servers -nodeReuse:false
dotnet run --project <project> --configuration Debug --no-build --no-restore --no-launch-profile --disable-build-servers
```

No custom production environment additions were needed for this candidate policy.
The harness filters Node/Electron injection variables and uses telemetry/no-logo
settings only for evidence hygiene. SDK launches do not use a command interpreter.
The MSVC build script uses the existing trusted vcvars setup to locate the compiler;
that compiler setup is separate from Run/SDK execution.

Flags were checked with deliberately invalid source after a successful build,
build/restore error guards, unchanged DLL/assets timestamps and a launch-profile
environment sentinel. Existing output executed successfully, no rebuild/restore
guard fired, and the profile sentinel was absent. Spaces, `#`, Vietnamese and emoji
occur in actual cwd/project paths; application arguments include quotes,
backslashes and empty strings.

Reference semantics: [dotnet build](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-build),
[dotnet run](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-run), and
[MSBuild node reuse](https://learn.microsoft.com/en-us/visualstudio/msbuild/msbuild-command-line-reference).
These documents inform the probe; the PASS evidence is the executed harness.

## Recorded Windows 11 results

Each row passed with both tested SDK/TFM pairs; the JSON has 16 cases per SDK.

| Scenario | Observed evidence |
|---|---|
| SDK selection/property evaluation | Correct pinned SDK; Exe, single TFM, .NETCoreApp and SDK flag; two ProjectReferences returned by evaluation-only JSON |
| Restore/build/run | Offline standard Console projects and two referenced libraries built; built output ran |
| stdout/stderr/argv/nonzero | UTF-8 output and separate stderr, argument equality, exit code 23 preserved |
| No-build/no-restore/no-launch-profile | Invalid current source did not compile; timestamps unchanged; guards not executed; profile sentinel absent |
| Stop during build | After real CoreCompile, a fixture task holds the build; an actual owned MSBuild `/nodemode:1 /nodeReuse:false` worker is captured by PID and command line before Job Stop |
| Stop during restore | NuGet requests an intentionally stalled localhost HTTP feed; Stop occurs after the server receives the actual request, before any package response |
| Rebuild after Stop | New owned build succeeds after cancelled build cleanup |
| Live CLI tree Stop | dotnet CLI, app and child are observed in the Job and all cleaned |
| Natural CLI root exit | Descendant remains owned until explicit cleanup |
| Hard CLI root exit | This SDK/Windows combination also ends descendants; cleanup handles both already-empty and nonempty Jobs |
| Direct-host natural/hard root exit | A child with an independent hidden console survives root exit; the retained Job then terminates it |
| Harness owner cancellation | Deterministic owner cleanup ends the scenario tree and preserves the separate control owner |
| ReadLine UTF-8/empty/multiple lines/EOF | Prompt received before writing; `Hello Việt 😀`, ordered lines and empty line; close-input produces EOF/null and exit 0 |
| Stop waiting ReadLine | Waiting application and CLI terminate; handles released |
| Blocked write | 8 MiB prototype write remains pending while child does not read; Stop unblocks it with failure, then pendingWrites becomes 0 before release |
| Failed build/run | Invalid source and missing project produce nonzero exits and complete cleanup; no execute step follows the failed build |
| Repeated cleanup | Eight measured cycles per SDK; no growth after warm-up and no new surviving SDK/compiler process |

### Shared workers and resource evidence

The harness snapshots process identities before **all** inventory/preparation work,
not just after the first build. During build it captures owned worker command lines
and verifies no-reuse. After each scenario it checks Job accounting and release;
after the entire harness it compares surviving .NET/MSBuild/compiler/app identities
against that initial baseline. Final **new surviving processes: 0**; final
**ProcessManager resources: 0**. Existing external .NET processes were not adopted
or terminated. No process-name kill or global build-server shutdown was used.

All eight measured cycle handle counts were **700** for SDK 8 and **696** for SDK 10.
Whole-process counts were not flat across setup and heterogeneous scenarios
(SDK 8 initial count 689); the evidence does not attribute this difference or
claim a flat count over the entire run.
The stronger per-session checks require every native session handle closed and
all writes settled; repeated-cycle counts show no retained growth.

Snapshots sample at 30 ms; they are not an ETW trace of every short-lived process.
Job accounting, final process comparison and actual worker assertions complement
sampling. This evidence covers the fixed policy and trusted fixtures, not arbitrary
hostile MSBuild code or an OS sandbox. Graceful harness cancellation is tested;
forcibly killing the harness itself is not claimed to run graceful cleanup.

## Harness corrections and evidence integrity

Earlier diagnostic runs failed due to test setup, and are not reported as PASS:

- The control initially locked the target output during Rebuild. It now runs a
  separate output copy, preserving the production requirement to stop a target
  before rebuilding it.
- Nested restore-generated source was initially included by the app's default
  glob. The app fixture now explicitly compiles its single Program.cs, and each
  run gets a fresh directory.
- A child with its own console does not share the parent's stdout. Readiness is
  now proved by the child's reported PID and actual Job membership.
- Hard-killing the SDK CLI does not guarantee a surviving child. CLI behavior is
  recorded separately; direct-host fixtures prove the retained-survivor case.
- Distributed MSBuild worker stdout is not a reliable marker. The build-stage
  signal and an explicit owned no-reuse worker command-line snapshot prove the
  scenario without assuming remote-node console forwarding.

These are harness corrections, not changes to production flags/ownership to force
the gate to pass. No production code or accepted ADR was changed.

## Regression and gate disposition

Application quality/regression results are recorded separately in
[verification.json](evidence/verification.json): typecheck/lint/build/diff PASS,
full suite **1195/1195 in 85 files PASS**, and native JS Run, Run lifecycle,
project lifecycle, Git, C# Language Service and Terminal smokes PASS. Checks ran
sequentially after the SDK evidence, avoiding concurrent process/build contention.
No manual UI, installed-package or
Windows 10 result is claimed by this isolated spike.

The recorded Windows 11 evidence supports the existing two-step SDK model,
fixed no-server/no-reuse flags and future asynchronous line-input design. No
observed SDK incompatibility requires reopening ADR-024's technical conclusions.
Under its platform scope amendment, **M1-04 is COMPLETE**: all other hard gates
passed on the required Windows 11 x64 platform. No spike rerun was needed for this
documentation reconciliation. Raw results and technical findings are unchanged.

The original `verification.json` retains its historical `hardGate: BLOCKED` and
two-OS blocker, plus the honest list of unexecuted checks. That policy disposition
is superseded by this scope amendment; it is not a current blocker or Windows 10
verification. Manual production UI and packaged/installed acceptance remain later
milestone/Phase 7 obligations on their applicable platforms. M1-05 prerequisites
from M1-04 are satisfied; M1-05 remains NOT_STARTED and needs explicit authorization.
Production C# Run and Console input are unimplemented. Overall C# Run and
Milestone 1 remain IN_PROGRESS.

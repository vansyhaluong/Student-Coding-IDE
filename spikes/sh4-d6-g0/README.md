# SH4-D6-G0 parser feasibility spike

Isolated technical evidence, **not production code or a completed signature guard**.
Nothing under this directory is imported by Main, Preload, Renderer or the app build.

Run from the repository root:

```text
node spikes/sh4-d6-g0/run.mjs
```

Prerequisites match the measured machine: Windows x64, installed .NET SDK
10.0.112 with reference pack/runtime 10.0.12, repository-installed Electron 44,
TypeScript 6.0.3 and esbuild. The runner intentionally pins its SDK location/version;
it is not a production SDK discovery implementation. No installation or restore
is performed. Child-process restrictions may require execution approval.

The runner:

1. Creates an owned temporary directory with spaces and non-ASCII characters.
2. Bundles and invokes the existing SDK resolver read-only and checks AVAILABLE.
3. Compiles only the trusted `ParserProbe.cs` helper using installed `csc.dll`
   and reference assemblies, without MSBuild, NuGet, restore or student compilation.
4. Copies two Roslyn assemblies from the installed SDK next to that helper.
5. Bundles the existing TypeScript package into a standalone parser worker artifact.
6. Runs the artifact under Electron's Node runtime with `worker_threads`, outside
   the repository and without resolving the TypeScript devDependency at runtime.
7. Parses synthetic fixtures and public ch2-01 starters; input code is data sent
   through stdin/messages, never eval, executed, emitted or compiled.
8. Checks worker/helper cancellation and watchdog termination, missing Roslyn
   failure, and removes that successful run's known temporary files after exit.
9. Writes only enums, counts, versions, sizes and timings to `RESULTS.json`.

Child environment is limited to Windows/temporary-directory variables and the
explicit Electron run-as-Node flag. No credentials, app settings or userData are
read. The helper is a fixed executable with no child-process creation; no source
is placed on the command line or written as a student file.

`RESULTS.json` records the last successful run, not all attempted runs. The first
prototype rejected a leading Unicode comment because modifier trivia was compared
as text; the isolated helper was corrected to compare modifier tokens. Production
validation was unchanged. Failed harness runs can leave their owned temporary
artifacts; they are not application userData or release artifacts.

The probe demonstrates parser APIs, a narrow structural-mask comparison and
signature checks. It does not implement wire validation, full input validation,
Monaco capture, consent, quota, a production subprocess supervisor or all syntax
policies. Empty deletions, surrounding-trivia selection, adversarial AST depth,
all unsupported grammar, real Electron Main packaging/ASAR/installer behavior and
Windows 10 remain D6 acceptance work. Do not copy the probe into production as a
security boundary or infer full signature verification from its case count.

The 5/10/15-second harness watchdogs and 50-ms artificial-hang test are isolated
test controls. They do not change the application's existing 30-second deadline.

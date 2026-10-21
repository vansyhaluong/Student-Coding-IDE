# Phase 9D.1 Step 3 — Roslyn compiler and generated harness

User-authorized resumption after the Process Result Port package. Verification
finished 2026-10-21. Step review PASS within compile-only scope; 9D.1 and Common
remain `IN_PROGRESS`. No production C# Run, sample execution or Judge acceptance.

## Implementation and ownership

- `csharp-harness.ts`: pure generation from a validated Main catalogue schema.
  Student source is written unchanged to Solution.cs. Harness.cs has the fixed
  StudentLearning.Harness entry point, typed Func binding to a new Solution's
  instance method, and six parameter/return representations. Public Solution is
  exposed in a public signature and constrained to a reference type. No reflection
  invocation, method name from stdin, project, expected value or comparison.
- Generated protocol reads one bounded strict UTF-8 JSON request followed by EOF.
  Version/index/arity/exact fields, primitive values, nonnull Unicode strings and
  rectangular matrices are checked. Console.Out/Error are redirected before the
  Solution constructor/invocation into synchronized bounded captures sharing a
  budget. One bounded JSON response is written to the saved physical stdout.
  Exceptions expose only approved tags, never exception messages/stacks.
  Oversized capture/serialized response emits actual over-budget stdout bytes
  (bounded chunks) so the existing Main output limiter remains authoritative;
  it does not fabricate a new successful response or hidden status channel.
  These runtime branches are generated and compiled, **not executed** in Step 3.
- `csharp-compile-workspace.ts`: fixed exclusive csharp directory and filenames
  under the prepared lease-owned session. Checks ancestor reparse/containment,
  workspace/directory identity, exclusive wx writes, opened-file/path identity,
  single links and size/mtime consistency. No adoption/overwrite/retry launch.
  Success requires the output to be a regular contained managed PE file with
  bounded opened-handle reads and identity rechecks, not merely process exit 0.
- `csharp-compiler.ts`: per-operation CsharpCompiler implementation. Its runtime
  property retains the Learning Windows adapter; the admitting Core/driver must
  delegate cleanup to it. The compiler never releases/deletes on its own or
  claims CLEANUP_COMPLETE. Compile produces a result plus an artifact only on
  verified success. A second attempt is rejected without rewriting/relaunching.
- `csharp-sdk-resolver.ts`: exact-selection revalidation helper reuses full existing
  installation validation, filtering SDK/runtime/reference-pack discovery to the
  operation's chosen versions. A newly installed patch cannot change this
  operation's choice. No product patch pin; subsequent operations discover anew.

Roslyn invocation is direct `dotnet exec --fx-version <selected runtime>
--roll-forward Disable <selected csc.dll> /noconfig @<fixed response>`. This binds
the discovered runtime for one operation, without app-wide environment changes.
The compiler environment allowlists Windows root and workspace-owned temp/home
paths and disables host diagnostics; inherited startup hooks/additional-deps or
SDK/compiler options are not passed through. Response options fix entry/output,
x64, stable default language, UTF-8/English diagnostics, no implicit references,
unsafe/debug disabled and explicit validated net10.0 reference DLLs only. No
csproj/MSBuild/restore/NuGet/analyzers/server/config from student source.
Learning.runtimeconfig.json targets net10.0 and the selected runtime version.

All discovery/revalidation/file I/O stays awaited in Core-owned tasks. Compile
generation, process startup and artifact checks share the existing 30s deadline,
capped by the caller's original operation deadline, and process quota 2 GiB.
Prepare 10s, operation 60s, cleanup wait 12s and Policy B are unchanged.

## Diagnostics, output and failure handling

`csharp-diagnostics.ts` incrementally parses known Roslyn English diagnostics into
CS code/severity/source aliases/one-based coordinates only. Raw paths, messages,
source excerpts and stacks are discarded. Pending lines are capped at 16,384
characters and DTO diagnostics at 128, retaining an error even after a warning
flood. Unknown locations become compiler-global aliases. Known harness binding
errors are signature errors; unrelated generated-harness/global/dependency errors
remain infrastructure failures. Nonzero exit alone is never COMPILE_ERROR.

The Main-only phase output callback accepts optional rawBytes accounting. Core
rejects undercount/invalid accounting and retains its same combined 1 MiB limit
across phases. Compiler passes empty presentation plus the original UTF-8 count;
raw Roslyn output never enters an Exercise snapshot. Safe normalized diagnostics
live in the standalone compile DTO for later authorized wiring. No public API,
snapshot shape, Preload or Renderer change. Parsing stops on cancellation/return
while native streams still drain under Policy B, without repeated limit throws.

OS exit and stream completion come from LearningProcessResultPort. Launch/native/
transport/artifact/dependency failures map to INFRASTRUCTURE_FAILURE, not source
fault. Compile and operation timeouts remain distinct. Lifecycle cancellation
rejects a fixed PROCESS_CANCELLED error (the DTO has no fabricated cancellation
kind), leaving Core's existing cancellation reason authoritative. JOB_MEMORY_LIMIT
requires native Job evidence; OOM text/nonzero exit alone does not qualify.
OUTPUT_LIMIT remains separate. No result implies tree-history/cleanup proof.

## Evidence and corrections

- **303/303** focused generator/compiler/resolver/Core/service/workspace and
  contract regressions PASS across nine files. One older opt-in installed-SDK
  observation is skipped; Step 3 has separate real compile evidence below.
- Generator/config/diagnostic/file-identity/fault/timeout/quota unit tests use
  controlled ports. The compiler fixture file mocks SDK validation only within
  that test module; production has no mock-success or debug entry point.
- Real installed Roslyn acceptance: **10/10**, plus targeted process-result native
  regression **1/1** (five older native cases filtered out). Windows 11 x64,
  installed SDK 10.0.112/runtime 10.0.12/reference pack 10.0.12, 167 references.
  Versions are observations, not locks. Compile tests use actual production
  compiler/Core/Windows Job modules with test-only composition, no process bypass.
- Six valid return types produce managed assemblies and runtimeconfig under a
  Unicode/spaced workspace, with one compiler process each and 2 GiB quota
  read-back. Five use current catalogue signatures; string[] return uses an
  explicit Main test signature because production catalogue has only string[]
  inputs. No production catalogue was edited. Assembly hashes and fixed output
  file lists are recorded. No output assembly/student method was executed.
- Real CS1525 syntax error, CS0407 wrong return signature and CS0246 missing
  external package produce bounded safe COMPILE_ERROR DTOs with observed nonzero
  exits. No package tool/restore/download path is invoked. This proves explicit
  local-reference compilation, not a network/firewall sandbox or disconnected
  machine acceptance. Real lifecycle cancellation after compiler launch is
  observed separately; all ten cases finalize through Core's normal Policy B.
- Final source/native hashes and observations:
  `out/learning-csharp-compile-step3-1792515683371/`.
  No watchdog, reduced quota or old shutdown/resource matrix is used.
- First real attempt failed: generated switch pattern variable `s` conflicted
  with a loop variable (CS0136). Corrected the generator; kept this error classified
  as infrastructure rather than weakening its diagnostic mapping. A test also
  assumed a nonexistent catalogue string[] return and was corrected to an explicit
  signature fixture. Original evidence is preserved at
  `out/learning-csharp-compile-step3-1792515094162/`. The intermediate successful
  run `...1792515202085/` predates final truncation/drain/read hardening.
- Review added first-error preservation after warning truncation, ignored late
  parser output while cleanup drains, and bounded full PE-header reads. Initial
  typecheck/lint findings (a nonexistent policy field, test let/const and ASI on a
  parenthesized await) were corrected; final gates pass without rule changes.

Typecheck, targeted lint, production/native build and tracked/new-file diff checks
PASS. Existing Vite Monaco mixed-import warning remains. Full repository lint and
historical spike lint errors are not rerun, edited or waived. No dependency or
protected Project/Terminal/ProcessManager/RunService/DesktopApplication/native
Project changes; no commit/push/merge.

## Remaining execute gate

Files changed this step: four new runtime files listed above; existing
csharp-sdk-resolver.ts, exercise-runtime-adapter.ts and exercise-session.ts;
new tests/main/csharp-harness.test.ts, csharp-compiler.test.ts and
csharp-compiler.integration.test.ts; existing csharp-sdk-resolver.test.ts and
exercise-session.test.ts. Documentation updates: this report, IMPLEMENTATION-PLAN,
CODEBASE-MAP, LANGUAGE-SUPPORT, REQUIREMENT status, DECISIONS implementation status,
PHASE-9D1-CSHARP-CONTRACTS and CHANGELOG-THESIS. Accepted policy/ADR choices are
unchanged; documentation records execution progress only.

Native stdin/EOF delivery, strict native transport decoding, actual JSON invocation
and Console capture, per-case 2s/512 MiB and sequential execution/aggregate deadline
acceptance remain for the next authorized step. Artifact identity must be
revalidated before execute. Compiler adapters are not wired into Main composition,
IPC or Renderer Run; production Run remains UNSUPPORTED. Judge/comparison/Submit/
persistence/custom cases and JavaScript remain outside this step. Windows 10 and
production C#/JS end-to-end/Project+PTY isolation acceptance remain outstanding.
Windows Jobs are not filesystem/network sandboxes. Stop for user review; do not
mark 9D.1/Common COMPLETE or start execute automatically.

No real Roslyn 30s overrun or 2 GiB denial was deliberately induced here. Timeout/
quota failure mapping uses controlled ports and existing Common regressions;
real compile cases verify configured/read-back Job quota and normal completion.

Official command/flag references checked during implementation:
[dotnet exec/runtime selection](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet),
[C# advanced compiler options](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/advanced).

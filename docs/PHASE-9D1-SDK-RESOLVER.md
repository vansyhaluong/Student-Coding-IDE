# Phase 9D.1 Step 2 — Learning SDK filesystem resolver

2026-10-20: user-authorized resolver/tests only. Step review PASS; 9D.1 and Common
remain `IN_PROGRESS`. No compiler/harness/source/config generation, native stdin,
execution adapter, composition, IPC or UI implementation is added by this step.

## Selection and validation

`FilesystemCsharpSdkResolver` implements the existing `CsharpSdkResolver` port.
Default Main candidates come from DOTNET_ROOT_X64, DOTNET_ROOT, ProgramFiles/dotnet
and absolute PATH directories. Main-only roots/filesystem/clock injection supports
controlled tests; this is not a renderer capability or a Settings feature.
No child process, Project resolver/global.json, download/install, environment
mutation or product patch pin is used.

SDK versions must be canonical numeric stable major 10 versions. Candidates are
sorted numerically across roots; equal-version ties use normalized root order.
The highest **valid compatible** candidate wins. A broken newer 10.x candidate
may be skipped for a valid older 10.x candidate; other majors/previews never win.
Unrelated cache entries do not mean that an incompatible SDK is installed.

Within an installation root, validation checks:

- Absolute drive/UNC syntax, containment, reserved/device/ADS/traversal/trailing
  dot/space rejection; lstat/realpath checks on existing ancestors and files reject
  symlink/junction/canonical escape. No directory is adopted from a link.
- x64 dotnet host, SDK .version record matching folder/version/win-x64, compiler
  and local compiler assets listed by csc.deps.json. PE/CLR metadata checks read
  Assembly identity/version and AssemblyRef records; renamed/truncated/malformed
  files are rejected. AnyCPU IL-only assemblies are accepted; required-32-bit or
  mixed x86/native/other-architecture binaries are not treated as x64-compatible.
- csc.runtimeconfig.json framework dependency, not its TFM label, determines the
  required installed Microsoft.NETCore.App 10.x runtime minimum. The observed
  stable SDK's compiler TFM is net9.0 with a 10.x framework dependency. This is not
  permission to execute a 9.x runtime or roll to another major. The harness target
  remains net10.0; Roslyn component prerelease labels do not make a stable SDK
  directory a preview SDK.
- Numerically highest complete compatible stable 10.x runtime, its package/version/
  win-x64 manifest, managed identities/declared assembly versions, CoreLib/System.Runtime
  major 10, coreclr/clrjit/hostpolicy and compatible x64 hostfxr files. Local compiler
  AssemblyRefs must resolve from its own assets or selected shared runtime with
  sufficient assembly versions; no package retrieval is attempted.
- Highest valid stable 10.x Microsoft.NETCore.App.Ref pack not newer than selected
  runtime. Its FrameworkList.xml must identify .NETCoreApp 10.0/Microsoft.NETCore.App;
  duplicate attributes, DTD/entities, traversal and unlisted DLLs are rejected.
  All managed reference entries are checked against contained files and metadata
  identities/versions; analyzers are not selected. Returned references include
  the full validated managed reference set.
- Harness closure follows AssemblyRefs transitively from System.Runtime,
  System.Console, System.Text.Json and System.Collections. Required dependencies
  must exist in the reference set with matching assembly versions. Optional
  compatibility-facade forwards (for example mscorlib forwarding optional NuGet
  APIs) are not dependencies of this harness. Code needing an unavailable external
  API must fail later compilation, not cause a package download.

Reads are bounded to 64 MiB/file and metadata JSON/manifest parsing to 1 MiB.
These are defensive resolver I/O bounds, not changes to Common process RAM/output
quotas. Default reads compare the opened handle's identity with the validated
path and check identity/size/mtime after reading; handles close in finally.
Checks before/after awaits reject cancelled/expired work. Pending I/O is awaited,
not raced away or replaced; the Core phase still owns its task and deadline.

Each AVAILABLE selection and reference array is frozen and detached. There is no
cross-operation cache; a later resolve discovers changed installations. This is
a filesystem validation snapshot, not cryptographic authenticity, a permanent
handle pin or a filesystem/network sandbox. Future compiler/launch integration
must revalidate dependencies and enforce the existing phase/Job ownership rules.

## Failure handling

| Condition | Result |
|---|---|
| No SDK entries (including unrelated cache-only directory) | MISSING / SDK_NOT_FOUND |
| Only preview or another SDK major | INVALID_CONFIGURATION / SDK_INCOMPATIBLE |
| Missing/corrupt compiler, manifest, reference closure, runtime or unsafe path | INVALID_CONFIGURATION / INSTALLATION_INCOMPLETE |
| Incompatible host/SDK/compiler/runtime architecture | INVALID_CONFIGURATION / ARCHITECTURE_MISMATCH |
| EACCES/EPERM | Rejected DomainError PERMISSION_DENIED, fixed message and INFRASTRUCTURE_FAILURE tag |
| Other filesystem failure | Rejected DomainError PROCESS_FAILED, fixed message and INFRASTRUCTURE_FAILURE tag |
| Cancelled/expired context | Safe PROCESS_CANCELLED/CANCELLED or PROCESS_FAILED/PHASE_DEADLINE error |

The result union is unchanged; infrastructure I/O failures reject rather than
masquerading as SDK absence. No raw host path, Node error, abort reason, stack or
Win32 details are serialized by these errors. Main-only selection paths are not
renderer DTOs. Actual Core/adapter mapping and public routing remain later work.

## Evidence and defects corrected

Final focused verification: **183/183 tests across four files**: 41 controlled
resolver cases, one opt-in installed-filesystem observation and 141 contract
regressions. Controlled tests create synthetic PE/CLR metadata in temporary Windows
filesystem installations; they are not actual executable compilers/runtimes.
Fault ports cover permissions, late I/O and replacement. Junction tests use real
Windows filesystem junctions. No SDK/compiler/runtime process is executed.

Actual installed-filesystem observation uses the default production filesystem port:
`out/learning-csharp-sdk-step2-1792511679992/evidence.json`.
Windows 11 x64 10.0.26200, Node v24.16.0: SDK 10.0.112, runtime/reference pack
10.0.12, 167 references, 3,250.364ms. Source/compiler hashes are in the artifact.
Versions are observations, not product locks; elapsed time is one measurement,
not a performance guarantee for other machines or cold antivirus/file caches.

Two initial real-observation tests failed and remain preserved under
`out/learning-csharp-sdk-step2-1792510450309/` and `...1792510638695/` (the latter
adds diagnostic read tracing). Evidence says NOT_OBSERVED/INVALID_CONFIGURATION;
failure.json and the test exit report FAIL. The resolver incorrectly included
compatibility facades as mandatory harness closure roots, demanding optional
packages. Corrected to the actual harness roots/transitive closure and added a
regression; no dependency download, weaker binary checks or relaxed deadline.
Later review added architecture-reason retention, mixed-x86 rejection, opened-file
identity checks, runtime package/assembly-version consistency and cache-only
MISSING mapping. Final default-port observation and regressions PASS.

Typecheck, targeted resolver/test lint, production build (existing Project and
Learning native hooks) and final diff/new-file whitespace checks PASS. Resolver
is deliberately not a production composition entry; build success does not mean
production C# execution. Full repository lint and historical spike matrices are
not rerun. Protected services/native implementations, dependencies and policies
are unchanged; no commit/push/merge.

## Remaining gate / proposed Step 3

Windows 10, actual Roslyn compile/offline binding, generated harness execution,
native stdin/process results, public DTO/error integration, lifecycle and live
Project/PTY isolation for the production C# adapter remain unverified. UNC syntax
is checked, but an actual network-share SDK installation is not observed here.
The original prepare/compile/execute/operation/cleanup limits and Policy B remain
unchanged. Production Run still has no language driver and remains UNSUPPORTED.

Proposed next package is bounded Roslyn compiler/source/config integration and
its offline/diagnostic tests, subject to user approval. Native stdin, complete
adapter and production wiring need their own authorized steps. Stop for review;
do not mark 9D.1/Common COMPLETE or begin Step 3 automatically.

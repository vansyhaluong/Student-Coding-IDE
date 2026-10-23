# Language Support Matrix

This is the authoritative language capability contract and decision register. It
records the verified Phase 3 scope and the newly authorized Phase 5.5 C# V1
extension. Phase 5.5A established the design baseline; production capabilities
are recorded only after their implementing work packages pass.
`Runtime` and `Language Service` remain independent lifecycles.

## Planned C# Project Run extension (2026-10-07)

Status: `NOT_STARTED`; design accepted in ADR-024, implementation not authorized
by the planning task. The implemented capability matrix below still reports
current production behavior (C# Run deferred/unimplemented). The planned extension
is separate from Phase 5.5 intelligence and Phase 9 Exercise Runtime.

Milestone 1 adds saved SDK-style Console `.csproj` selection, independent remembered
Run target, Run-specific SDK/global.json/single-framework checks, SDK build/restore
and dotnet run, stdout/stderr/exit, Stop and Re-run. Milestone 2 adds Console.ReadLine
through bounded session-owned UTF-8 stdin in Output, validated typed IPC, repeated/
multiline input and complete lifecycle/Windows regression acceptance. Both gates
must pass before overall C# Run can be COMPLETE. No terminal/PTY substitution.

Run readiness never depends on csharp-ls. Existing intelligence's SDK >=10 policy
remains; the planned Run policy accepts compatible stable effective SDK >=8 with
net8.0/net10.0 Windows evidence required. No loose `.cs`, Web/API, debugger,
launch profiles, advanced multi-target selection, SDK auto-install or Exercise
Judge in this extension. See Architecture Section 10 and Plan Section 13.7.

## Planned Phase 9 Exercise Runtime scope

Phase 9D schedules only independent Exercise Runtime adapters 9D.1 C# and 9D.2
JavaScript. C# is `COMPLETE` — PASS WITH LIMITATIONS by user acceptance
2026-10-21 for installed-runtime Windows 11 scope. Common and overall 9D are
**COMPLETE — PASS WITH LIMITATIONS** by final user acceptance 2026-10-23;
JavaScript 9D.2 (Steps 1–6) is also COMPLETE — PASS WITH LIMITATIONS.
A01/A02/A03 remain FIXED — PASS; 9E–9G remain NOT_STARTED.
[Accepted final review](PHASE-9D-FINAL-REVIEW.md) records evidence and retained
Windows/UNC/9G/9E, worker/coverage, startup console, C# latency and full-lint
limits. No UNVERIFIED gate is promoted to PASS. The following step-specific
status/verification notes preserve execution-time history.
Step 1 standalone contracts are `COMPLETE`
— PASS WITH LIMITATIONS by user acceptance 2026-10-22, pre-existing lint limitation accepted.
Step 2 resolver/probe is COMPLETE — PASS WITH LIMITATIONS by user acceptance
2026-10-22; 169 targeted tests PASS and recorded limits accepted. Step 3 was
separately authorized/implemented and accepted 2026-10-22: COMPLETE — PASS WITH
LIMITATIONS; Step 4 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23;
Step 5 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23; Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE. Python/Java are outside Phase 9 V1.
Implementation requires explicit package authorization and runtime acceptance.
Learning V1 uses supplied functions with per-language parameters/types, return
type, starter code and compatible tests, executed by generated harnesses/drivers.
Students do not write Main()/Console programs or create projects/open Terminal.
Code Drafts auto-save per exercise/language and survive language switches.
This is distinct from the Project Mode capability matrix below: C#/Python/Java
Project Run and deferred language intelligence remain unchanged. An Exercise
Runtime adapter does not grant language-service capabilities or modify Phase 3,
Phase 4 or Phase 5.5 acceptance. See Implementation Plan Section 13.6 and
Architecture Section 6 for the approved Learning boundaries.

User-approved runtime revision (2026-10-19, versions approved 2026-10-20): Learning
uses installed stable .NET SDK 10.x and Node.js 24.x without locking patch versions,
download, installation, major fallback or bundled-runtime implementation. Common
is IN_PROGRESS through Core/native, Main service/lifecycle and typed IPC/Preload;
the Renderer Run integration displays UNSUPPORTED for JavaScript.
Step 7 wires the production C# Run driver; Submit remains disabled. C# Step 5 supplies
a Main-internal single-sample adapter, extended by Step 6 sequential multi-case
orchestration; JavaScript remains unimplemented.
C# direct installed Roslyn csc.dll and filesystem discovery are user-approved;
Step 1 defines protocol/DTO/Main-only ports; Step 2 implements filesystem SDK
selection with static reference/compiler/runtime validation, without executing
processes or wiring Run. Step 3 separately implements and verifies direct Roslyn
compilation with local net10.0 references in a Learning Windows Job, safe
diagnostics and fixed generated harness/config files. Step 4 adds verified Learning-only bounded
native stdin/EOF transport with retained cleanup; see PHASE-9D1-NATIVE-STDIN.md.
Step 5 verifies actual single-sample harness invocation, all six types and failure/
cleanup handling through production Learning Jobs; see PHASE-9D1-CSHARP-EXECUTION.md.
Step 6 adds compile-once sequential catalogue samples, VERIFIED barriers and exact
not-run indices with shared operation/output budgets; see PHASE-9D1-CSHARP-MULTICASE.md.
Step 7 verifies production C# UI → Preload → IPC → real Roslyn/.NET → Result Panel
on Windows 11, with bounded typed results/diagnostics, lifecycle invalidation and
live Project Run/PTY isolation; see PHASE-9D1-CSHARP-UI.md. User accepted 9D.1
COMPLETE — PASS WITH LIMITATIONS; see [final review](PHASE-9D1-FINAL-REVIEW.md).
Windows 10/packaging remain unverified. C# Run ~7–8s optimization is after Phase 9;
production Accepted-record Restore awaits 9E. Common remains IN_PROGRESS. See
PHASE-9D1-CSHARP-COMPILER.md and PHASE-9D1-SDK-RESOLVER.md. 9D.1 Run executes Main catalogue
samples and returns actuals without comparison. Custom cases need separate scope;
comparison, Submit and results persistence remain 9E. No Project resolver reuse,
patch lock, download/install or major fallback. See PHASE-9D1-CSHARP-CONTRACTS.md.
Learning owns resolver/harness/execution sessions and may share existing executable
files; missing/incompatible runtime produces a clear error, never automatic setup
or a switch to an unapproved version. Project runtime selection, PATH/global.json,
RunService, ProcessManager, Terminal and existing adapters remain unchanged.
Runtime distribution without student setup remains a packaging-stage requirement;
installer integration will be discussed and decided separately.
Main coordinates controlled child processes with
time/resource limits, Stop and cleanup; student code never executes directly in
Main/Renderer. Run tests sample/custom cases without completing exercises;
Submit requires 100% official public/hidden tests, then successful Accepted-record
persistence before newly completed progress. Only saved Accepted records appear
in My Solutions; no failed-submission history. Offline hidden tests are not
absolutely secret. Exercise sessions remain independent from Project Run.

JavaScript design approved 2026-10-22; production integration implemented in Step 5
(COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-23). Evidence: PHASE-9D2-JAVASCRIPT-UI-IPC.md.
Use a fresh Node process/Learning Job per
Main-catalogue sample, fixed harness and `node:vm` context separation, not a
malicious-code security sandbox. Synchronous functions only; int32, boolean,
string, int32[], string[], rectangular int32[][]; no imports/npm/async. Strict JSON
stdin/stdout separates syntax/runtime/protocol failures. Independent JS DTOs reuse
Exercise channels/Result Panel without changing C# contracts or adding Judge,
comparison, Submit, Accepted/Wrong Answer. Learning-only first verified stable
24.x PATH candidate, safe junction/nvm verification, no patch lock/major fallback/
download. Prepare probe is owned by Learning Job, 512 MiB within total 10 s;
Step 2 implements Prepare quota/context mapping only for JavaScript; C# Prepare
remains null/non-process. Fixed probe/identity selection verified in 10 real Jobs
on Windows 11 x64 / installed Node v24.16.0; no student execution or Run factory.
Existing
deadlines/barriers/cancellation/cleanup/recovery/Policy B and Project isolation
remain unchanged. [Six-step plan](PHASE-9D2-JAVASCRIPT-PLAN.md) records acceptance,
targeted tests and pending Windows 10/11 evidence. Step 1 declarations/validators
and Main-only ports are implemented; 308 targeted JS/Common/C# tests PASS.
[Step 1 evidence](PHASE-9D2-JAVASCRIPT-CONTRACTS.md); no production capability is
added. Step 2 evidence: [resolver/probe report](PHASE-9D2-NODE-RESOLVER-PROBE.md),
159 unit/regression + 9 native probe + one real C# Sum test PASS. Step 2 is
COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22. Step 3 now supplies
a Main-internal single catalogue sample harness/syntax path: fixed trusted raw
asset, fresh vm context, strict JSON/UTF-8/EOF and Step 1 validation, bounded
console/serialization, exclusive identity/hash-verified files and delegated
Job/lifecycle cleanup. 259 targeted tests PASS (60 native operations / 172 Jobs)
on Windows 11 / installed Node v24.16.0 x64. [Step 3 report](PHASE-9D2-JAVASCRIPT-HARNESS-SYNTAX.md).
Step 3 COMPLETE — PASS WITH LIMITATIONS by user acceptance 2026-10-22.
Step 4 implements Main-internal multi-case execution over one admitted session,
fresh Jobs and VERIFIED barriers. 160 targeted tests PASS, 16 real JS operations /
57 Jobs VERIFIED/closed; selected real C# multi-case PASS. Step 4 COMPLETE — PASS WITH LIMITATIONS
by user acceptance 2026-10-23; [report](PHASE-9D2-JAVASCRIPT-ORCHESTRATOR.md). Production integration is Step 5 (COMPLETE — PASS WITH LIMITATIONS, accepted 2026-10-23);
see PHASE-9D2-JAVASCRIPT-UI-IPC.md. Step 6 IN_PROGRESS — PENDING USER ACCEPTANCE. Windows 10/actual UNC/concurrent
Project Run/PTY smoke/packaging remain unverified. Bundled Node remains 9G.

ADR-025 records approved Common limits; remaining production acceptance is due.
C# installed-runtime evidence is accepted within the limitations recorded above;
JavaScript single-sample installed-runtime execution evidence is recorded in
Steps 3–4; production UI/IPC/end-to-end and offline distribution acceptance remain pending. Comparison,
package size and packaging fallback thresholds remain open. Additional
runtime packs or detected installed runtimes with guidance are fallback options
for size/technical barriers at packaging. 9D verifies installed-runtime execution;
9G requires packaged offline
C#/JavaScript Run/Submit on another Windows machine without development tooling.
Neither 9D nor later runtime distribution may alter existing Project Run PATH discovery
without separate explicit authorization, or silently change
C# Project Run ADR-024, or Phase 5.5 language-service requirements.

## V1 capability matrix and implementation status

| Language | Tier | Syntax | Completion | Hover | Signature Help | Definition | Diagnostics | Problems | Run | Runtime | Language Service | Decision status |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| JavaScript | 1 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Current saved authorized `.js` file in active project | Node.js | Monaco TypeScript worker with bounded project snapshot | Phase 3 intelligence and Phase 4 JavaScript Run/Output accepted and verified |
| TypeScript | 1 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Deferred | No V1 runtime selected | Monaco TypeScript worker with bounded project snapshot | Phase 3 intelligence supported; future Run gate ADR-014 |
| HTML | 2 | Yes | Yes | Yes, verified provider support | Not required | Not required | Deferred | Deferred | No | N/A | Monaco HTML worker | V1 syntax/completion/hover; diagnostics deferred because provider has no validation support |
| CSS | 2 | Yes | Yes | Yes, verified provider support | Not required | Not required | Yes | Yes | No | N/A | Monaco CSS worker | Accepted and verified for Phase 3 V1 |
| JSON | 2 | Yes | Yes, local schema-free behavior | No useful result without a configured local schema | Not required | Not required | Yes | Yes | No | N/A | Monaco JSON worker | Accepted and verified for current local-only configuration |
| C# | Phase 5.5 V1 intelligence | Yes, implemented in Phase 3 | Yes | Yes | Yes | Yes | Yes, open documents | Yes | Deferred | Independent; no C# Run selected | Monaco tokenization + Main-owned `csharp-ls` semantic providers | Phase 3 syntax and Phase 5.5A–5.5H COMPLETE; automated verification and user-confirmed manual acceptance PASS |
| PHP | Syntax-only | Yes | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Future | Monaco tokenization only | Accepted syntax-only scope |

## Deferred future language support

| Language | Phase 3 syntax | Phase 3 intelligence | Phase 3 Problems | Run | Provider decision | Status |
|---|---|---|---|---|---|---|
| Python | Incidental Monaco recognition/tokenization may remain; not an acceptance requirement | Deferred | Deferred | Deferred | Deferred; no provider selected | Outside current V1; future capability |
| Java | Incidental Monaco recognition/tokenization may remain; not an acceptance requirement | Deferred | Deferred | Deferred | Deferred; no provider selected | Outside current V1; future capability |

Python and Java are not permanently unsupported. A future authorized phase may
add them through the same provider architecture without redesigning Editor,
Project, or Language ownership. Any additional future external language-server process is
Main-owned and reachable only through a narrow, typed, runtime-validated Preload
bridge; Renderer never gains raw filesystem or process authority.

For C#, References, Rename Symbol, code actions/quick fix, refactoring,
formatter, advanced semantic tokens, Razor, metadata/BCL/generated virtual-
document navigation, debugger, C# Run, loose `.cs` full intelligence, and
workspace diagnostics are deferred. Existing optional/future treatment for Find
References and other languages remains unchanged.

## Provider, dependency, and service states

Runtime and executable detection uses:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Current renderer-owned Monaco providers expose only the capability/status states
that apply to browser workers. Phase 5.5 C# separates dependency state from
service lifecycle. Dependency failures use `MISSING` or
`INVALID_CONFIGURATION`; `NOT_CONFIGURED` is reserved for future configured
paths. A usable dependency's service uses:

```text
STARTING
RUNNING
STOPPED
CRASHED
```

The UI must never infer one dependency from another. C# Language Intelligence
requires .NET SDK 10 or newer and uses .NET 10 LTS as its acceptance baseline;
this does not authorize C# Run. Main probes its process PATH and
`dotnet --list-sdks`. The Python examples below
describe only a possible future architecture invariant; neither side is V1 scope:

- Python runtime `AVAILABLE`, Python language service `MISSING`: a future Run capability could remain available while future intelligence reports the missing service.
- Python runtime `MISSING`, Python language service `RUNNING`: future intelligence could remain available while future Run reports the missing runtime.
- Git `MISSING`: editor and language features remain available; Source Control reports Git unavailable.

## Phase 5.5 C# design baseline

Phase 3 completed C# syntax highlighting through Monaco tokenization only. Phase
5.5 is a newly authorized scope extension for completion, hover, signature help,
go to definition, open-document pull diagnostics, and Problems integration. It
does not retroactively change Phase 3 implementation or acceptance evidence.

### Provider and protocol boundary

- Syntax remains a Monaco tokenization capability.
- Completion, hover, signature help, definition, and diagnostics are provided by
  Main-owned `csharp-ls` through a thin semantic LSP↔Monaco adapter.
- Phase 5.5B selected `csharp-ls` 0.27.0,
  `vscode-languageserver-protocol` 3.18.3, and `vscode-jsonrpc/node` 9.0.2.
  Phase 5.5C adds the exact protocol and JSON-RPC versions as production runtime
  dependencies. Phase 5.5D–E implement internal transport, sessions, workspace
  preflight and document synchronization. Phase 5.5F implements semantic
  IPC/Preload and Renderer completion, hover, signature-help and definition
  providers. Phase 5.5G implements open-document diagnostics, Problems and
  separate dependency/workspace/service status UX.
- Renderer sees only typed semantic APIs. It never sees raw LSP/JSON-RPC, PID,
  executable path, cwd, spawn arguments, canonical project root, raw logs, or
  diagnostic `resultId`.
- Completion resolution uses an opaque Main-owned handle. Definition accepts
  only `file:` targets inside the canonical active project root; external,
  metadata, BCL, and generated virtual-document targets are unsupported in V1.

### Workspace policy

Both `.sln` and `.slnx` are supported solution candidates. A saved selection is
reused only while valid. One candidate is auto-selected. Multiple candidates
require user selection which is remembered per project. With no solution and at
least one `.csproj`, the provider uses project mode. Main may perform bounded
project discovery for preflight and UX, but current `csharp-ls` owns recursive
discovery and actual loading; the IDE does not claim Main controls the exact
loaded project set. With no solution or project, C# stays syntax-only. The IDE
does not create temporary solutions. Loose `.cs` full intelligence is deferred.

Workspace readiness is independent: `READY`, `SELECTION_REQUIRED`,
`NO_CSHARP_WORKSPACE`, or `PREFLIGHT_FAILED`. After selection, Main uses
structured `dotnet`/MSBuild exit codes, evaluation JSON, and path checks:
effective SDK selection, selected `.sln`/`.slnx` parse plus listed `.csproj`
path tokens, bounded project-mode discovery, evaluation-only properties/items,
and `ProjectReference`
containment/existence. It requests no target, build, or restore and does not
intentionally modify workspace files. V1 supports user-trusted projects only;
MSBuild project/import evaluation is not sandboxed and is not guaranteed free
of side effects for arbitrary untrusted projects (ADR-022, 2026-09-11).
A failure does not start `csharp-ls`; a pass is `READY`, not
proof that an equivalent Roslyn workspace will load inside the provider.

### Lifecycle and synchronization

- Start lazily and retain at most one C# session for the active project.
- Main performs `initialize` then `initialized` and uses UTF-16 positions.
- `RUNNING` means the owned process is alive and LSP initialization succeeded;
  it does not certify workspace health. Empty/null semantic results and absence
  of diagnostics never determine readiness. Human-readable logs remain
  diagnostic evidence only.
- Monaco dirty content is authoritative. Synchronization is `didOpen`, ordered
  incremental `didChange`, `didSave`, then `didClose`; Monaco model version is
  the document version.
- Ordered batching is allowed but cannot drop changes. Pending changes flush
  before completion, completion resolve, hover, signature, definition, and
  diagnostic requests.
- Project, session, document, and applicable model-version identities reject
  stale results. FileSystemService watcher events are reused; open/dirty document
  sync wins over disk watcher content.
- Pull diagnostics cover open documents only. Main retains diagnostic
  `resultId`; Renderer receives normalized diagnostics for Monaco markers and the
  existing Problems store. Workspace diagnostics are deferred.
- Graceful stop orders invalidate/cancel → `shutdown` → response → `exit` →
  bounded process and descendant cleanup. Unexpected exit becomes `CRASHED`.
  There is no V1 automatic restart loop or public start/stop/restart/raw-log API.

### Distribution policy and compatibility gate

Production `csharp-ls` is app-owned and pinned to 0.27.0. Development
may use a project-private provider and then PATH fallback. Full packaged and
installed provider acceptance remains Phase 7.

Phase 5.5B must verify a real `csharp-ls` on Windows: dependency/version probe;
stdio JSON-RPC/LSP lifecycle; advertised capabilities; dirty buffer and
incremental synchronization; UTF-16/Unicode; completion, resolve, cancellation,
hover, signature, definition, and pull diagnostics; `.sln`, `.slnx`, and project
mode; no-solution recursive discovery behavior/performance; paths with spaces,
`#`, and Unicode; dynamic watched-file registration; workspace-load failure
detection without parsing human log strings; crash/shutdown and descendant
cleanup; and electron-vite/typecheck/build compatibility. The 2026-09-10 spike
and corrective workspace-readiness probe passed this hard gate. Phase 5.5C
and Phase 5.5D–G subsequently implemented under explicit authorization. Corrective F/G runtime verification and user-confirmed manual acceptance passed on 2026-09-13. Phase 5.5H and overall Phase 5.5 are COMPLETE. Phase 6/7 remain NOT_STARTED; packaged/installed acceptance remains Phase 7.

## Current provider decisions and Phase 3 acceptance evidence

Phase 3 V1 uses Monaco-native workers/providers for JavaScript, TypeScript, HTML,
CSS, and JSON. JavaScript/TypeScript project visibility uses a bounded project
snapshot/source synchronization strategy. It must not mirror all of
`node_modules`, and Renderer must not receive the real canonical project root
merely for TypeScript resolution.

Current evidence does not establish full `tsconfig` support. Phase 3C does not
claim it or expand into arbitrary package discovery, unrestricted external type
loading, arbitrary filesystem access, canonical-root exposure, or generic
language IPC.

Current V1 diagnostic and Problems inputs are JavaScript, TypeScript, CSS, and
JSON. HTML diagnostics and HTML Problems contribution are deferred because
the approved Monaco HTML provider does not implement validation. HTML remains V1
for syntax, completion, and provider-supported hover. No custom HTML validator,
alternate provider, new dependency, external LSP, indexing, IPC, or network
capability is authorized.

Phase 3E verifies renderer-owned Problems aggregation for those four diagnostic
contributors. Existing provider markers replace and clear by provider/file
scope; stale project/provider generations are rejected; project switch/close,
root unavailability, provider disposal, and renderer disposal clean owned state.
Problems navigation reuses the canonical editor model and preserves dirty
in-memory content. No provider, validator, dependency, IPC, filesystem/process
authority, project index, or network access was added.

Phase 3F reverified:

- required capability coverage for its tier;
- multi-file/project behavior where committed;
- document synchronization and URI/path handling on Windows;
- bounded snapshot thresholds and exclusions;
- trusted/offline JSON schema behavior;
- provider availability, failure reporting, and worker recovery where applicable;
- cancellation where supported;
- worker resource cleanup;
- Electron development and production-build worker/resource discovery;
- license and maintenance risk.

Worker recovery means safe disposal and renderer-owned reinitialization where
Monaco naturally supports it. Current V1 does not require a manual restart
button, command, menu item, IPC endpoint, or new lifecycle UX. Recovery must
preserve authoritative dirty buffers and reject stale project/provider
generations. Manual lifecycle UX remains deferred for C# and any later external
provider.

Phase 3B verified the local Monaco worker foundation, safe project URI model,
bounded JS/TS cross-file feasibility, provider/project generation identity,
diagnostic owner isolation, and production-build `file://` worker discovery.
Measured fixtures support initial 3C ceilings of 500 source files, 5 MiB total
UTF-8 content, and 256 KiB per file. `node_modules` is excluded, open Monaco
models take precedence over background sources, and exceeding a bound must not
disable edit/save. JSON schema resolution remains offline and deny-by-default;
Phase 3D configures an empty schema list and disables schema requests.

Phase 3C verified production discovery and synchronization for exact `.js`,
`.jsx`, `.ts`, and `.tsx` project sources through the existing project-relative
file API. The production controller enforces the 500-file, 5-MiB-total, and
256-KiB-per-file limits; excludes `node_modules`; gives open/dirty Monaco models
precedence; synchronizes change plus coarse create/delete/rename awareness from
existing watcher events; and rejects stale project/provider work on switch,
close, unavailability, or disposal. Worker tests verify completion, hover,
signature help, definition, diagnostics, JS/TS cross-file behavior, mixed JS/TS,
JSX, and TSX. No bare-package/`node_modules`, full-`tsconfig`, external-type, or
packaged/installed claim is made.

When the active project root becomes `UNAVAILABLE`, project intelligence stops
and stale diagnostics are cleared while editor buffers, syntax highlighting, and
the open project state are preserved.

Full packaged/installed verification remains a Phase 7 acceptance gate and is not
claimed by Phase 3.

Phase 3D verified HTML tag/attribute completion and hover, CSS property/value
completion and hover, CSS validation with diagnostic update/clear behavior, and
JSON local schema-free completion plus syntax validation with diagnostic
update/clear behavior. JSON hover returns no useful result under the approved
schema-free configuration. Remote `$schema` values do not cause network fetches,
and removing a model removes its worker mirror and diagnostic lifetime. HTML
diagnostics remain deferred; no substitute provider or validator was added.

Phase 3 introduced no Pyright, basedpyright, python-lsp-server,
`vscode-jsonrpc`, Python interpreter detection for intelligence, Python LSP
lifecycle, C# external provider, or Java-specific provider infrastructure.
Phase 5.5C now includes `vscode-jsonrpc/node` only for the approved future C#
transport; no transport/session is part of 5.5C. Provider selection and
distribution gates for Python and Java remain deferred until their future scope
is explicitly authorized.

Phase 3F verified the current-scope Definition of Done in `REQUIREMENT.md` with
focused capability/lifecycle tests, two independent full-suite passes,
typecheck, lint, production build, and production-worker smoke. No dependency,
package-lock, provider, validator, IPC, privileged authority, or architecture
change was required.

## TypeScript Run gate

### Approved current JavaScript execution policy

Node resolution is Main-controlled process PATH only. Missing Node reports
`MISSING` and blocks Run; bundled Node and configured absolute Node paths/Settings
UI are deferred. Renderer never selects an executable. Dirty current `.js`
targets must be saved explicitly before Run; buffers remain untouched. Re-run
stops and fully cleans the prior same-target session before replacement, without
a prompt or overlap. Confirmed project close/switch waits for project Run cleanup
and preserves project/editor state on failure; unavailable roots stop owned runs
and stale events are rejected. UI uses one right-aligned editor-header Run action
and an Output sibling tab in the existing Bottom Panel. The feasibility spike,
production native adapter, Electron binding, and lifecycle/UI smokes are verified;
installed-package acceptance remains Phase 7.

### Deferred TypeScript execution

Phase 4 V1 requires only Node.js Run of the current authorized JavaScript `.js`
file inside the active project. Built-in Run Project, npm scripts, dev-server
orchestration, project entry configuration, and framework/project launchers are
deferred; future Run Project requires an explicit entry/script policy.

TypeScript Run is deferred, not permanently rejected. TypeScript intelligence
remains supported from Phase 3. No V1 TypeScript runtime, compilation,
transpilation, ts-node, tsx, or Node-native execution policy is selected.
RunService retains a narrow RunStrategy boundary with JavaScriptRunStrategy as
the only V1 concrete strategy and no placeholder TypeScript production code.
ADR-014 does not block current Phase 4. Before a future authorized phase adds
TypeScriptRunStrategy without redesigning core RunService, it must select and
verify a strategy for the authorized scope, including:

- single-file and project runs;
- Node version compatibility;
- ESM/CommonJS and `tsconfig` behavior;
- error/source locations;
- startup speed and student-facing messages;
- Windows executable/path behavior;
- stop and descendant cleanup.

Future candidates are `tsx`, `ts-node`, compile with `tsc` then Node, and Node native TypeScript support when its detected version and file syntax are compatible. None is selected or authorized for V1.

# Language Support Matrix

This is the authoritative language capability contract and decision register. It
records the approved Phase 3 V1 scope and its verified implementation status.
`Runtime` and `Language Service` remain independent lifecycles.

## Current Phase 3 V1 matrix

| Language | Tier | Syntax | Completion | Hover | Signature Help | Definition | Diagnostics | Problems | Run | Runtime | Language Service | Decision status |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| JavaScript | 1 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Current saved authorized `.js` file in active project | Node.js | Monaco TypeScript worker with bounded project snapshot | Phase 3 intelligence and Phase 4 JavaScript Run/Output accepted and verified |
| TypeScript | 1 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Deferred | No V1 runtime selected | Monaco TypeScript worker with bounded project snapshot | Phase 3 intelligence supported; future Run gate ADR-014 |
| HTML | 2 | Yes | Yes | Yes, verified provider support | Not required | Not required | Deferred | Deferred | No | N/A | Monaco HTML worker | V1 syntax/completion/hover; diagnostics deferred because provider has no validation support |
| CSS | 2 | Yes | Yes | Yes, verified provider support | Not required | Not required | Yes | Yes | No | N/A | Monaco CSS worker | Accepted and verified for Phase 3 V1 |
| JSON | 2 | Yes | Yes, local schema-free behavior | No useful result without a configured local schema | Not required | Not required | Yes | Yes | No | N/A | Monaco JSON worker | Accepted and verified for current local-only configuration |
| C# | Syntax-only | Yes | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Future | Monaco tokenization only | Accepted syntax-only scope |
| PHP | Syntax-only | Yes | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Not V1 | Future | Monaco tokenization only | Accepted syntax-only scope |

## Deferred future language support

| Language | Phase 3 syntax | Phase 3 intelligence | Phase 3 Problems | Run | Provider decision | Status |
|---|---|---|---|---|---|---|
| Python | Incidental Monaco recognition/tokenization may remain; not an acceptance requirement | Deferred | Deferred | Deferred | Deferred; no provider selected | Outside current V1; future capability |
| Java | Incidental Monaco recognition/tokenization may remain; not an acceptance requirement | Deferred | Deferred | Deferred | Deferred; no provider selected | Outside current V1; future capability |

Python and Java are not permanently unsupported. A future authorized phase may
add them through the same provider architecture without redesigning Editor,
Project, or Language ownership. Any future external language-server process is
Main-owned and reachable only through a narrow, typed, runtime-validated Preload
bridge; Renderer never gains raw filesystem or process authority.

Find References is optional/future. Rename Symbol, advanced refactoring, Call Hierarchy, Test Explorer, Formatter, and Debugger are not V1 acceptance criteria.

## Current provider status and future service states

Runtime and executable detection uses:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Current renderer-owned Monaco providers expose only the capability/status states
that apply to browser workers. If a future phase authorizes an external language
server, its lifecycle vocabulary includes:

```text
NOT_CONFIGURED
MISSING
STARTING
RUNNING
STOPPED
CRASHED
INVALID_CONFIGURATION
```

The UI must never infer one dependency from another. The Python examples below
describe only a possible future architecture invariant; neither side is V1 scope:

- Python runtime `AVAILABLE`, Python language service `MISSING`: a future Run capability could remain available while future intelligence reports the missing service.
- Python runtime `MISSING`, Python language service `RUNNING`: future intelligence could remain available while future Run reports the missing runtime.
- Git `MISSING`: editor and language features remain available; Source Control reports Git unavailable.

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
generations. Manual external-server lifecycle UX remains future scope.

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

Current V1 introduces no Pyright, basedpyright, python-lsp-server,
`vscode-jsonrpc`, Python interpreter detection for intelligence, Python LSP
lifecycle, or Java-specific provider infrastructure. Provider selection and
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

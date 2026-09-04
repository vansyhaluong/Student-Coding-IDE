# Language Support Matrix

This is the authoritative language capability contract and decision register. It
records the approved Phase 3 V1 scope but does not claim implementation.
`Runtime` and `Language Service` remain independent lifecycles.

## Current Phase 3 V1 matrix

| Language | Tier | Syntax | Completion | Hover | Signature Help | Definition | Diagnostics | Problems | Run | Runtime | Language Service | Decision status |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| JavaScript | 1 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Phase 4 | Node.js | Monaco TypeScript worker with bounded project snapshot | Accepted for Phase 3 V1 |
| TypeScript | 1 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Phase 4 | Strategy TBD; ultimately executes with Node-compatible runtime | Monaco TypeScript worker with bounded project snapshot | Accepted for Phase 3 V1; Run strategy TBD Phase 4 |
| HTML | 2 | Yes | Yes | If Monaco provider supports | Not required | Not required | Yes | Yes | No | N/A | Monaco HTML worker | Accepted for Phase 3 V1 |
| CSS | 2 | Yes | Yes | If Monaco provider supports | Not required | Not required | Yes | Yes | No | N/A | Monaco CSS worker | Accepted for Phase 3 V1 |
| JSON | 2 | Yes | Yes | If Monaco provider supports | Not required | Not required | Yes | Yes | No | N/A | Monaco JSON worker | Accepted for Phase 3 V1 |
| C# | 3 | Yes | Future | Future | Future | Future | Future | Future | Future | Future | Monaco tokenization only | Accepted syntax-only scope |
| PHP | 3 | Yes | Future | Future | Future | Future | Future | Future | Future | Future | Monaco tokenization only | Accepted syntax-only scope |

## Deferred future language support

| Language | Phase 3 syntax | Phase 3 intelligence | Phase 3 Problems | Run | Provider decision | Status |
|---|---|---|---|---|---|---|
| Python | Incidental Monaco recognition/tokenization may remain; not an acceptance requirement | Deferred | Deferred | Existing Phase 4 scope is unchanged | Deferred; no provider selected | Not in Phase 3 V1 acceptance scope |
| Java | Incidental Monaco recognition/tokenization may remain; not an acceptance requirement | Deferred | Deferred | Future | Deferred; no provider selected | Not in Phase 3 V1 acceptance scope |

Python and Java are not permanently unsupported. A future authorized phase may
add them through the same provider architecture without redesigning Editor,
Project, or Language ownership. Any future external language-server process is
Main-owned and reachable only through a narrow, typed, runtime-validated Preload
bridge; Renderer never gains raw filesystem or process authority.

Find References is optional/future. Rename Symbol, advanced refactoring, Call Hierarchy, Test Explorer, Formatter, and Debugger are not V1 acceptance criteria.

## Dependency and service states

Runtime and executable detection uses:

```text
NOT_CONFIGURED
MISSING
AVAILABLE
INVALID_CONFIGURATION
```

Language-service lifecycle uses:

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
describe a future architecture invariant, not current Phase 3 work:

- Python runtime `AVAILABLE`, Python language service `MISSING`: Run remains available; intelligence shows the missing-service reason and configuration help.
- Python runtime `MISSING`, Python language service `RUNNING`: completion/diagnostics remain available; Run reports the missing runtime.
- Git `MISSING`: editor and language features remain available; Source Control reports Git unavailable.

## Current provider decisions and remaining acceptance gates

Phase 3 V1 uses Monaco-native workers/providers for JavaScript, TypeScript, HTML,
CSS, and JSON. JavaScript/TypeScript project visibility uses a bounded project
snapshot/source synchronization strategy. It must not mirror all of
`node_modules`, and Renderer must not receive the real canonical project root
merely for TypeScript resolution.

The implementation gates that remain must verify:

- required capability coverage for its tier;
- multi-file/project behavior where committed;
- document synchronization and URI/path handling on Windows;
- bounded snapshot thresholds and exclusions;
- trusted/offline JSON schema behavior;
- provider availability, failure reporting, and worker recovery where applicable;
- cancellation where supported;
- worker/process resource cleanup;
- Electron development and packaged behavior;
- license and maintenance risk.

Phase 3B verified the local Monaco worker foundation, safe project URI model,
bounded JS/TS cross-file feasibility, provider/project generation identity,
diagnostic owner isolation, and production-build `file://` worker discovery.
Measured fixtures support initial 3C ceilings of 500 source files, 5 MiB total
UTF-8 content, and 256 KiB per file. `node_modules` is excluded, open Monaco
models take precedence over background sources, and exceeding a bound must not
disable edit/save. JSON schema resolution remains offline and deny-by-default;
3D may add only explicitly bundled or application-trusted schemas.

When the active project root becomes `UNAVAILABLE`, project intelligence stops
and stale diagnostics are cleared while editor buffers, syntax highlighting, and
the open project state are preserved.

Current Phase 3 introduces no Pyright, basedpyright, python-lsp-server,
`vscode-jsonrpc`, Python interpreter detection for intelligence, Python LSP
lifecycle, or Java-specific provider infrastructure. Provider selection and
distribution gates for Python and Java remain deferred until their future scope
is explicitly authorized.

Language intelligence is complete only when the current-scope Definition of Done
in `REQUIREMENT.md` passes.

## TypeScript Run gate

`.ts` remains Tier 1 Run, but the runner is not selected in Phase 1. Before Phase 4, ADR-014 must select and verify one strategy for:

- single-file and project runs;
- Node version compatibility;
- ESM/CommonJS and `tsconfig` behavior;
- error/source locations;
- startup speed and student-facing messages;
- Windows executable/path behavior;
- stop and descendant cleanup.

Candidates are `tsx`, `ts-node`, compile with `tsc` then Node, and Node native TypeScript support when its detected version and file syntax are compatible.

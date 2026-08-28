# Language Support Matrix

This is the Phase 1 capability contract and decision register. It does not claim implementation. `Runtime` and `Language Service` are independently detected dependencies.

## V1 matrix

| Language | Tier | Syntax | Completion | Hover | Signature Help | Definition | Diagnostics | Problems | Run | Runtime | Language Service | Decision status |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| JavaScript | 1 | V1 | V1 | V1 | V1 | V1 | V1 | V1 | V1 | Node.js | Monaco TS worker or external TS service | Provider TBD before Phase 3 |
| TypeScript | 1 | V1 | V1 | V1 | V1 | V1 | V1 | V1 | V1 | Strategy TBD; ultimately executes with Node-compatible runtime | Monaco TS worker or external TS service | Provider TBD Phase 3; Run strategy TBD Phase 4 |
| Python | 1 | V1 | V1 | V1 | V1 | V1 | V1 | V1 | V1 | Python | Pyright candidate | Provider/distribution TBD before Phase 3 |
| HTML | 2 | V1 | V1 | If provider supports | Not required | Not required | V1 | V1 | No | N/A | Monaco HTML worker candidate | TBD before Phase 3 |
| CSS | 2 | V1 | V1 | If provider supports | Not required | Not required | V1 | V1 | No | N/A | Monaco CSS worker candidate | TBD before Phase 3 |
| JSON | 2 | V1 | V1 | If provider supports | Not required | Not required | V1 | V1 | No | N/A | Monaco JSON worker candidate | TBD before Phase 3 |
| Java | 3 | Syntax only acceptable in V1 | Future | Future | Future | Future | Future | Future | Future | Future | Future | Outside V1 intelligence/run acceptance |
| C# | 3 | Syntax only acceptable in V1 | Future | Future | Future | Future | Future | Future | Future | Future | Future | Outside V1 intelligence/run acceptance |
| PHP | 3 | Syntax only acceptable in V1 | Future | Future | Future | Future | Future | Future | Future | Future | Future | Outside V1 intelligence/run acceptance |

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

The UI must never infer one dependency from another. Examples:

- Python runtime `AVAILABLE`, Python language service `MISSING`: Run remains available; intelligence shows the missing-service reason and configuration help.
- Python runtime `MISSING`, Python language service `RUNNING`: completion/diagnostics remain available; Run reports the missing runtime.
- Git `MISSING`: editor and language features remain available; Source Control reports Git unavailable.

## Provider acceptance gate

All provider `TBD` items must be resolved after Phase 2 and before Phase 3 implementation. The decision must verify:

- required capability coverage for its tier;
- multi-file/project behavior where committed;
- document synchronization and URI/path handling on Windows;
- missing/configured dependency detection;
- start, stop, restart, crash, and log behavior;
- cancellation where supported;
- worker/process resource cleanup;
- Electron development and packaged behavior;
- license and maintenance risk.

Language intelligence is complete only when the Definition of Done in `REQUIREMENT.md` passes, including operation while a service is missing, starting, stopped, or crashed.

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

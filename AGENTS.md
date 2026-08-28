# Student Coding IDE — Agent Instructions

These instructions apply repository-wide. Add nested `AGENTS.md` files only for genuinely different subtree rules.

## 1. Repository purpose

Student Coding IDE is an independent Electron + React + TypeScript desktop IDE.
Orca is reference evidence only: never copy its modules, inherit its Git history,
depend on its runtime source, or add it as a submodule.

Phase 0 and Phase 1 established the foundation and architecture baseline. Current implementation status is maintained in `docs/IMPLEMENTATION-PLAN.md`; do not infer it from this file. Begin implementation only when the user explicitly authorizes the relevant work package and its documented prerequisites permit it.

## 2. Authoritative documents

Read the documents relevant to the task before changing code. Authority order:

```text
docs/REQUIREMENT.md
  -> docs/ARCHITECTURE.md
  -> docs/DECISIONS.md
  -> docs/CODEBASE-MAP.md
  -> docs/LANGUAGE-SUPPORT.md
  -> docs/IMPLEMENTATION-PLAN.md
```

- `docs/REQUIREMENT.md` defines required product behavior and scope.
- `docs/ARCHITECTURE.md` defines system design and ownership boundaries.
- `docs/DECISIONS.md` records accepted choices and unresolved decision gates.
- `docs/CODEBASE-MAP.md` defines planned and actual module locations.
- `docs/LANGUAGE-SUPPORT.md` is the language capability contract.
- `docs/IMPLEMENTATION-PLAN.md` defines execution order, dependencies, tests,
  acceptance criteria, and exit gates.
- `docs/REFERENCE-BASELINE.md` and `docs/ORCA-ANALYSIS.md` are reference evidence,
  not implementation authority or project source.
- `docs/CHANGELOG-THESIS.md` records substantial verified project work.

This file defines agent operating behavior but does not override requirements,
accepted architecture, or ADRs. If instructions conflict, stop the affected
work, identify the exact files/sections, and follow change control. Never silently
choose an interpretation.

## 3. Phase and scope discipline

Work only on the explicitly authorized phase and work package. The roadmap is
Phase 2A–2F followed by Phases 3–7; consult the implementation plan for details.

Complete the Task Start Checklist in Section 16. If any answer is unclear, report
the ambiguity instead of expanding scope. Do not implement future work merely
because it is convenient. For example, a Phase 2A task must not implement
Explorer UI, Monaco, Search, Terminal, Run, Git, Language Intelligence, Problems,
or Settings UX unless the implementation plan explicitly places that work in 2A.

## 4. Change control and decision gates

Never silently change an Accepted ADR because another implementation is easier.
If evidence requires an accepted decision to change:

1. Stop the affected implementation.
2. Reopen/update the relevant ADR in `docs/DECISIONS.md`.
3. Record evidence and evaluate alternatives.
4. Record the new decision.
5. Update `docs/ARCHITECTURE.md` if required.
6. Update `docs/IMPLEMENTATION-PLAN.md` and traceability.
7. Continue only after the change is recorded and authorized.

Do not silently resolve open decisions, including renderer shared state (ADR-011),
IPC runtime validation (ADR-016), React Monaco integration, test tooling,
language providers, Python/Pyright distribution/lifecycle, large-file thresholds,
and TypeScript Run (ADR-014).

At a Decision Gate, perform only the authorized evidence/spike, compare required
options, record the decision, and then implement dependent production code. Do
not install a candidate merely to bypass the gate.

## 5. Architecture boundaries

### Main

Main owns privileged operations and process lifecycles: application/window
lifecycle, ProjectService, filesystem, search, PTYs, Run, Git CLI, persistence,
dependency detection, external language servers, and owned-resource cleanup.
Main runtime-validates renderer input, validates project/path/session ownership,
and serializes safe domain errors.

### Preload

Preload is a narrow, typed, capability-scoped bridge. It contains no business
state and exposes domain APIs only. Never expose raw `ipcRenderer`, Electron
primitives, unrestricted filesystem access, or a generic command channel.

### Renderer

Renderer owns React presentation and interactive/editor state: Application Shell,
Explorer UI, Monaco models, tabs, Problems UI, Terminal/Output/Git/Settings views.
Renderer must not import privileged Node/Electron APIs or perform direct disk or
process operations.

Main services must not import Renderer code. Shared contracts must remain
side-effect free and must not depend on Electron runtime objects.

## 6. Non-negotiable security rules

Preserve `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

The Renderer must never receive direct Node access, raw IPC, unrestricted or
arbitrary absolute-path filesystem authority, generic shell execution, or
arbitrary child-process capability.

Runtime-validate every renderer-to-main request before domain dispatch. Validate
payload shape, project identity, path scope, operation/session ownership, and the
allowed action. Type assertions are not validation.

Prohibit APIs equivalent to `window.api.execute(command)` or unrestricted
`window.api.fs(path)`. Remove renderer subscriptions and owned resources when
their WebContents/session/project is destroyed. Keep navigation and external URL
handling explicitly allowlisted and main-controlled.

## 7. Domain ownership rules

### Filesystem and project

- Main owns disk access.
- Renderer sends project IDs and project-relative paths.
- Main resolves/canonicalizes paths and verifies containment under the authorized
  root.
- Reject `..` traversal, absolute-path escalation, and unauthorized root escape.
- Apply the documented V1 symlink policy; do not follow links outside the root by
  default.
- Use Node path APIs, not hand-built separators; keep I/O asynchronous.
- Keep watcher behavior within authorized V1 refresh/external-awareness scope.

### Editor

Preserve `Editor UI != EditorModelManager != FileSystemService`.

- Renderer may own Monaco models, tabs, dirty/version/view state, and disposal.
- FileSystemService alone reads/writes disk.
- Preserve canonical model identity, version-aware save, unsaved protection, and
  no silent source-data loss.
- Do not implement Language Intelligence directly inside editor feature code.

### Terminal, Run, and Language Services

`TerminalService`, `RunService`, and `LanguageServiceManager` are separate
semantic/lifecycle domains. Never replace them with a public generic executor.
A low-level ProcessManager may share only narrow ownership/cleanup primitives and
must not be exposed as a renderer execution API.

### Language Intelligence

Use `docs/LANGUAGE-SUPPORT.md` as capability authority. Preserve
`Runtime != Language Service`. Runtime/dependency states are `NOT_CONFIGURED`,
`MISSING`, `AVAILABLE`, and `INVALID_CONFIGURATION`. Language Service states are
`NOT_CONFIGURED`, `MISSING`, `STARTING`, `RUNNING`, `STOPPED`, `CRASHED`, and
`INVALID_CONFIGURATION`.

Do not infer one dependency state from another. Use provider/language-service
architecture rather than language-specific IntelliSense logic embedded in the
editor.

## 8. Windows-first rules

V1 acceptance targets Windows 10 and Windows 11. Platform-sensitive work must
consider drive letters, case-insensitive paths, separators, supported UNC paths,
reserved names where applicable, locked files, PATH lookup, PowerShell,
`cmd.exe`, native Electron ABI, descendant cleanup, and antivirus/file-lock
timing.

Prefer portable abstractions when simple, but Windows V1 acceptance has priority.
Native Electron dependencies require explicit ABI and Windows feasibility gates.

## 9. Code organization and dependencies

Consult `docs/CODEBASE-MAP.md` before creating a module. Use the documented domain
owner; avoid duplicate services, generic utility layers, or new architecture
without recorded need. Update actual paths only after they exist.

Do not add a dependency merely for convenience. Confirm authorization and the
applicable Decision Gate, consider a small internal implementation, assess
maintenance/security/packaging/native/Windows impact, and record the decision
when required.

Never use `--force` or `--legacy-peer-deps` to hide dependency conflicts unless
explicitly authorized after analysis.

## 10. Testing and quality gates

Phase 2A must establish real automated test infrastructure before it can be
marked `COMPLETE`. Until that gate is resolved, do not invent a test command or
claim automated-test success. Once selected, use the documented project commands
and add focused tests for implemented behavior.

Prioritize validation, domain state, security boundaries, IPC, lifecycle,
cleanup, path behavior, persistence, process behavior, and editor model/save
logic. Add renderer tests where behavior warrants them; avoid excessive tests for
trivial presentation.

For implementation tasks, run at minimum:

```text
npm run typecheck
npm run lint
npm run build
```

When test infrastructure exists, run its documented commands. Also run
`git diff --check` before final reporting when files changed. Compilation alone
cannot complete a work package; functional, security, lifecycle, platform, test,
and exit-gate acceptance must pass.

## 11. Error handling, logging, and secrets

Use structured `AppError`/domain errors. Never send raw Node/Electron errors or
unsafe stack details across IPC, silently swallow failures, or fail silently for
missing dependencies, invalid configuration, crashes, permissions, process
failure, or invalid input.

Do not log credentials, tokens, Git credentials, full environment dumps, file
contents, secrets, or sensitive command arguments. Keep developer diagnostics
useful but redacted.

## 12. Git and working-tree safety

Project workflow is `feature work -> develop -> CI -> PR -> main`.

`main` is stable/milestone history. Do not work directly on `main` unless
explicitly instructed. Never automatically commit, push, merge, tag, delete
branches, or rewrite history. Do not use destructive Git commands to hide
unrelated changes.

Before editing, inspect `git status`. Preserve unrelated and untracked user work;
never assume it is disposable, revert it, or overwrite it. If existing changes
conflict with the task, report the conflict. Never perform destructive cleanup
merely to obtain a clean worktree.

## 13. Documentation and status updates

After implementation is actually complete and verified, update only applicable
documentation:

- `docs/CODEBASE-MAP.md`: planned paths become actual paths when they exist.
- `docs/DECISIONS.md`: update only when a gate is genuinely resolved/reopened.
- `docs/IMPLEMENTATION-PLAN.md`: update status as real execution progresses. Set `IN_PROGRESS` only when an explicitly authorized package begins; set `BLOCKED` only for a concrete blocker; set `COMPLETE` only after the full Exit Gate passes.
- `docs/CHANGELOG-THESIS.md`: record only implemented, verified work.

Allowed statuses are `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, and `COMPLETE`.
Transitions are `NOT_STARTED -> IN_PROGRESS` when authorized work begins, `IN_PROGRESS -> BLOCKED` for a concrete blocker, `BLOCKED -> IN_PROGRESS` when work resumes, and `IN_PROGRESS -> COMPLETE` only after the full Exit Gate passes.
Never mark `COMPLETE` for partial or planned work, typecheck/lint/build alone, unexecuted tests, or documentation claims.

## 14. Out-of-scope work

Do not introduce excluded systems without an explicit requirements change:
formatter, debugger/DAP, AI or coding agents, cloud/remote workspaces,
collaboration, mobile, extension marketplace/host, worktree or multi-agent
orchestration, hosted Git review/forge integration, or multi-root workspaces.
Do not create speculative architecture for them.

## 15. Orca reference policy

When Orca evidence is relevant, use the locked commit in
`docs/REFERENCE-BASELINE.md`, cite useful source paths/symbols, and classify/adapt
the concept as documented. Implement Student Coding IDE independently. Never copy
Orca source because it already solves a problem.

## 16. Task start checklist

Before an implementation task, answer:

1. What phase/work package is authorized?
2. What are its goal, scope, and out-of-scope items?
3. Which dependencies and prior exit gates apply?
4. Which Decision Gates remain?
5. Which architecture/security constraints apply?
6. Which tests, acceptance criteria, and exit gate are required?
7. Which unrelated working-tree changes already exist?

Report uncertainty instead of guessing.

## 17. Task completion report

Implementation work should report equivalent evidence to:

```text
TASK REVIEW: PASS / NOT PASS
Authorized Work Package:
Implemented:
Not Implemented / Out of Scope:
Files Changed:
Decisions Resolved: NONE / ...
Architecture Deviations: NONE / ...
Tests:
Quality Gates: typecheck / lint / build / test / git diff --check
Security / Lifecycle Checks:
Remaining Blockers: NONE / ...
Ready for Next Work Package: YES / NO
```

Trivial documentation-only tasks may use a shorter report, but implementation
claims must include actual evidence. Never report a gate as passing without
running it.

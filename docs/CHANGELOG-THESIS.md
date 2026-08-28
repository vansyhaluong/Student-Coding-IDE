# Student Coding IDE Thesis Changelog

This changelog records substantial work created for the independent Student Coding IDE. It does not claim Orca source or general IDE concepts as original implementation.

## Phase 1 — Orca Analysis & Architecture Design

### Analysis

- Verified and studied Orca repository `https://github.com/stablyai/orca` at locked Reference Commit `4bb337741c335cfcc428d3b4271023566e2dadb8` outside the Student Coding IDE source tree.
- Analyzed Electron lifecycle, process/security boundary, IPC, project/workspace, filesystem, Monaco, terminal, execution, Git, persistence/settings, UI state, AI/worktree coupling, and remote/mobile concerns with file and symbol evidence.
- Classified reference subsystems with `REFERENCE`, `REIMPLEMENT`, `ADAPT`, `ADD`, and `OMIT` semantics.

### Student Coding IDE design

- Defined an independent main/preload/renderer architecture and process-ownership matrix.
- Defined typed, validated, domain-scoped IPC with request/response, event, lifecycle, cancellation, cleanup, and serialized errors.
- Separated Terminal PTY, Run, and Language Server process semantics.
- Defined project-scoped filesystem access, Monaco model ownership, Git CLI abstraction, language-service lifecycle, dependency state, persistence/recovery, logging, and Windows process cleanup boundaries.
- Selected xterm.js + `node-pty` subject to the Phase 2 Windows/native compatibility gate and selected direct local Git CLI behind a typed service.
- Recorded Phase 3 language-provider and Phase 4 TypeScript-run decisions as explicit gates rather than inventing implementation claims.

### Documentation

- Added `ARCHITECTURE.md`.
- Added `ORCA-ANALYSIS.md`.
- Added `CODEBASE-MAP.md`.
- Added `LANGUAGE-SUPPORT.md`.
- Added `DECISIONS.md`.
- Added this thesis changelog.
- Reconciled Phase 1 architecture decisions, phase boundaries, and terminology across project documentation.

### Implementation status

No Core IDE feature was implemented in Phase 1. No Orca source, module, commit, submodule, or runtime dependency was copied into Student Coding IDE.

## Phase 2A — Core Contracts & Application Foundation

### Foundation implementation

- Added deterministic application startup/shutdown ownership and a secure WindowManager preserving sandbox, context isolation, disabled Node integration, exact application-origin navigation, and HTTPS-only external opening.
- Added side-effect-free shared contracts, structured AppError serialization, explicit runtime IPC validation, narrow lifecycle preload APIs, handler cleanup, and lifecycle status events.
- Added canonical project identity and project-relative path foundations with Windows drive-letter, case, separator, and UNC normalization behavior.
- Added versioned JSON persistence with schema validation, serialized temporary-file replacement, last-known-good backup, and corrupt/unsupported-state recovery.
- Added a limited internal owned-resource ProcessManager foundation without Terminal, Run, language-server, or generic command execution.

### Decisions and verification

- Resolved ADR-016 with explicit validators for the current small IPC contract surface.
- Recorded HTTPS-only external URL handling in ADR-017.
- Resolved the Phase 2A Test Infrastructure Gate in ADR-018 with Vitest and the stable `npm test` command, including CI execution.
- Added focused automated coverage for contracts, errors, lifecycle, IPC validation, security/navigation, project identity/path handling, persistence/recovery, cleanup ownership, and preload subscription cleanup.
- Verified typecheck, lint, build, tests, and documentation diff checks before marking Phase 2A complete.

### Scope boundary

No Phase 2B Explorer/filesystem workflow, Monaco/editor, Search, Terminal, Run, Git, Language Intelligence, Settings UX, or other later work-package implementation was added.

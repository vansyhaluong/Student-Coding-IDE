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

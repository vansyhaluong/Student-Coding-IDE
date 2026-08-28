# Orca Reference Baseline

## 1. Reference repository

- **Repository:** <https://github.com/stablyai/orca>
- **Reference branch:** `main`
- **Reference commit SHA:** `4bb337741c335cfcc428d3b4271023566e2dadb8`

This commit is the fixed Orca reference point used by the Student Coding IDE
project. The `main` branch may continue to change, so the commit SHA above makes
the reference version reproducible.

## 2. Purpose

Orca is used only as a reference implementation for studying desktop IDE
architecture, behavior, and UX patterns. Student Coding IDE is an independent
implementation.

The project:

- does not fork Orca as its source repository;
- does not inherit Orca Git history;
- does not copy the Orca source tree into the Student Coding IDE repository;
- does not use an upstream-merge workflow with Orca;
- does not treat Orca modules as modules that must be retained or modified
  directly.

## 3. Areas identified for reference study

During Phase 0, the following Orca areas were identified as relevant reference
targets for later code-level analysis:

- Electron desktop application architecture;
- main/preload/renderer separation;
- application lifecycle;
- Monaco Editor integration;
- file and workspace/project handling;
- integrated terminal architecture;
- process execution;
- Git integration;
- settings infrastructure;
- local application state and persistence;
- UI/UX patterns for a desktop coding IDE.

Detailed source-level analysis of these areas belongs to Phase 1 — Orca Analysis
& Architecture Design.

## 4. Architectural patterns selected for evaluation

The following patterns are considered relevant for evaluation when designing
Student Coding IDE:

- clear separation between Electron main, preload, and renderer processes;
- a restricted preload/API boundary between renderer and privileged desktop
  capabilities;
- renderer isolation from unrestricted Node.js APIs;
- modular separation of editor, project, terminal, Git, settings, and persistence
  responsibilities;
- non-blocking execution for terminal, process, search, and language-service
  workloads;
- local-first operation for core IDE functionality.

These are reference patterns to evaluate, not a statement that Orca code will be
copied or that every Orca implementation detail will be adopted. Accepted
architecture decisions and later decision gates are recorded in
`docs/DECISIONS.md`.

## 5. Features outside Student Coding IDE V1 scope

The following Orca-related areas are intentionally outside the first-version
implementation scope:

- AI Agent workflows;
- AI coding-agent orchestration;
- AI worktree workflows;
- multi-agent orchestration;
- cloud IDE functionality;
- remote/cloud project synchronization;
- collaboration features;
- mobile-specific functionality;
- AI provider integrations such as Codex, Claude Code, Gemini, Grok, or
  equivalent agent workflows.

These areas may be studied only when necessary to understand Orca's architecture
or module boundaries. They must not become dependencies of the Student Coding
IDE core workflow.

## 6. Student Coding IDE V1 focus

The first version focuses on an independent desktop IDE implementation
containing:

- project management;
- File Explorer;
- Code Editor;
- Integrated Terminal;
- Language Intelligence;
- Diagnostics and Problems panel;
- Run and Output;
- basic Git workflow;
- settings and local application state;
- Windows desktop operation.

The complete V1 scope is defined in `docs/REQUIREMENT.md`.

## 7. Phase boundary

This file records the reference baseline only. Phase 0 does not require a full
source-code analysis of Orca.

Detailed investigation of Orca modules, implementation choices, and architecture
belongs to Phase 1 — Orca Analysis & Architecture Design. Phase 1 distinguishes
clearly between:

- `REFERENCE` — study how Orca addresses a problem;
- `REIMPLEMENT` — build equivalent functionality independently;
- `ADAPT` — retain a useful concept or behavior but implement it differently;
- `ADD` — implement functionality required by Student Coding IDE that is not
  provided by the reference;
- `OMIT` — intentionally exclude functionality that is outside project scope.

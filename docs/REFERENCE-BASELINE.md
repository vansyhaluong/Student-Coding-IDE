Orca Reference Baseline

1. Reference Repository

Repository: https://github.com/stablyai/orca

Reference Branch: main

Reference Commit SHA: 4bb337741c335cfcc428d3b4271023566e2dadb8

This commit is the fixed Orca reference point used by the Student Coding IDE project.
The main branch may continue to change, so the commit SHA above is used to make the reference version reproducible.

2. Purpose

Orca is used only as a reference implementation for studying desktop IDE architecture, behavior, and UX patterns.

Student Coding IDE is an independent implementation.

The project:

Does not fork Orca as its source repository.

Does not inherit Orca Git history.

Does not copy the Orca source tree into the Student Coding IDE repository.

Does not use an upstream-merge workflow with Orca.

Does not treat Orca modules as modules that must be retained or modified directly.

3. Areas Identified for Reference Study

During Phase 0, the following Orca areas were identified as relevant reference targets for later code-level analysis:

Electron desktop application architecture.

Main / preload / renderer separation.

Application lifecycle.

Monaco Editor integration.

File and workspace/project handling.

Integrated terminal architecture.

Process execution.

Git integration.

Settings infrastructure.

Local application state and persistence.

UI/UX patterns for a desktop coding IDE.

Detailed source-level analysis of these areas belongs to Phase 1 — Orca Analysis & Architecture Design.

4. Architectural Patterns Selected for Evaluation

The following patterns are considered relevant for evaluation when designing Student Coding IDE:

Clear separation between Electron main, preload, and renderer processes.

A restricted preload/API boundary between renderer and privileged desktop capabilities.

Renderer isolation from unrestricted Node.js APIs.

Modular separation of editor, project, terminal, Git, settings, and persistence responsibilities.

Non-blocking execution for terminal, process, search, and language-service workloads.

Local-first operation for core IDE functionality.

These are reference patterns to evaluate, not a statement that Orca code will be copied or that every Orca implementation detail will be adopted.

Final architecture decisions must be recorded in docs/DECISIONS.md during Phase 1.

5. Features Outside Student Coding IDE V1 Scope

The following Orca-related areas are intentionally not part of the first-version implementation scope:

AI Agent workflows.

AI coding-agent orchestration.

AI worktree workflows.

Multi-agent orchestration.

Cloud IDE functionality.

Remote/cloud project synchronization.

Collaboration features.

Mobile-specific functionality.

AI provider integrations such as Codex, Claude Code, Gemini, Grok, or equivalent agent workflows.

These areas may be studied only when necessary to understand Orca's architecture or module boundaries.

They must not become dependencies of the Student Coding IDE core workflow.

6. Student Coding IDE V1 Focus

The first version focuses on an independent desktop IDE implementation containing:

Project management.

File Explorer.

Code Editor.

Integrated Terminal.

Language Intelligence.

Diagnostics and Problems panel.

Run and Output.

Basic Git workflow.

Settings and local application state.

Windows desktop operation.

The complete V1 scope is defined in docs/REQUIREMENT.md.

7. Phase Boundary

This file records the reference baseline only.

Phase 0 does not require a full source-code analysis of Orca.

Detailed investigation of Orca modules, implementation choices, and architecture must be performed in:

Phase 1 — Orca Analysis & Architecture Design

Phase 1 must distinguish clearly between:

REFERENCE — study how Orca addresses a problem.

REIMPLEMENT — build equivalent functionality independently.

ADAPT — retain a useful concept or behavior but implement it differently.

ADD — implement functionality required by Student Coding IDE that is not provided by the reference.

OMIT — intentionally exclude functionality that is outside project scope.
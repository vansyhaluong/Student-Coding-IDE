# Architecture Decision Log

This log records decisions for Student Coding IDE. It does not describe Orca decisions. `Accepted` decisions are implementation constraints; `Proposed` decisions require the named gate before implementation.

## ADR-001 — Build and development tool

- **Status:** Accepted
- **Context:** Phase 0 requires an Electron + React + TypeScript desktop foundation with a fast development loop.
- **Options:** Vite with custom Electron wiring; electron-vite; another bundler.
- **Selected option:** `electron-vite`.
- **Rationale:** It is already verified by the Phase 0 foundation and keeps main, preload, and renderer builds explicit.
- **Consequences:** Configuration remains in `electron.vite.config.ts`; no Next.js application layer is introduced.
- **Phase:** 0, confirmed in Phase 1.

## ADR-002 — Privileged process boundary

- **Status:** Accepted
- **Context:** Files, shells, Git, child processes, and local settings require Node/Electron privileges.
- **Options:** Node-enabled renderer; broad preload bridge; sandboxed renderer with narrow preload APIs.
- **Selected option:** Sandboxed, context-isolated renderer with Node integration disabled and domain-specific preload APIs.
- **Rationale:** It meets the desktop security requirement and contains privilege at auditable boundaries.
- **Consequences:** Main owns privileged services; preload has no business state and never exposes raw `ipcRenderer`.
- **Phase:** 1.

## ADR-003 — IPC contracts

- **Status:** Accepted
- **Context:** The renderer needs finite calls, streams, lifecycle notifications, and cancellation.
- **Options:** Generic invoke/execute API; untyped channels; typed domain contracts with runtime validation.
- **Selected option:** Typed domain contracts, `<domain>:<action>` naming, main-side validation, serialized `AppError`, scoped events, and domain cancellation.
- **Rationale:** Compile-time types alone do not secure the runtime boundary; generic execution would widen authority.
- **Consequences:** Contract types remain side-effect free; every event subscription returns cleanup; no raw shell/filesystem channel exists.
- **Phase:** 1.

## ADR-004 — V1 project model

- **Status:** Accepted
- **Context:** Orca supports repositories, worktrees, folder workspaces, and remote execution hosts; V1 requires a student to open/create one local project.
- **Options:** Reproduce Orca workspace model; multi-root workspace; one active local folder project.
- **Selected option:** One active local folder project with recent-project metadata and per-project workspace UI state.
- **Rationale:** It satisfies V1 without agent/worktree/remote orchestration.
- **Consequences:** Project switching uses unsaved-change protection; multi-root and worktrees are future scope.
- **Phase:** 1.

## ADR-005 — Filesystem and search ownership

- **Status:** Accepted
- **Context:** Renderer file access must be safe and large projects must not freeze UI.
- **Options:** Renderer Node access; unrestricted absolute-path API; main-owned project-scoped API.
- **Selected option:** Main-owned async filesystem/search services using project IDs and validated relative paths.
- **Rationale:** This preserves authorization and supports lazy traversal, watchers, exclusions, progress, and cancellation.
- **Consequences:** Default search exclusions are `.git`, `node_modules`, `dist`, `build`, and `out`; symlinks are not followed outside root by default.
- **Phase:** 1.

## ADR-006 — Editor model ownership

- **Status:** Accepted
- **Context:** Tabs, dirty buffers, save races, language IDs, and view restoration need one owner.
- **Options:** Component-local models; one global text blob per tab; renderer EditorModelManager.
- **Selected option:** Renderer-owned EditorModelManager with one Monaco model per canonical file identity; disk I/O remains in FileSystemService.
- **Rationale:** It preserves undo/model identity across tab switches and separates UI, model, and disk responsibilities.
- **Consequences:** Saves are version-aware; closing/switching invokes unsaved protection; models and subscriptions have explicit disposal.
- **Phase:** 1.

## ADR-007 — Terminal implementation

- **Status:** Accepted, with Phase 2 Windows/native compatibility gate
- **Context:** V1 requires a real integrated terminal on Windows with resize, input/output, and cleanup.
- **Options:** `child_process` pipes; direct ConPTY implementation; xterm.js + `node-pty`; web terminal service.
- **Selected option:** xterm.js renderer UI plus main-process `node-pty`.
- **Rationale:** Pipes do not provide terminal semantics; direct ConPTY is disproportionate; the selected pair is established and maps cleanly to the required process boundary.
- **Consequences:** `node-pty` is native. Before Terminal implementation is accepted, the Phase 2 spike verifies installation, Electron ABI compatibility, PTY startup inside Electron, PowerShell/cmd launch, input/output, resize, close, process cleanup, and native-module feasibility on Windows. Full packaged-app verification, release artifacts, installer work, and installer smoke testing remain Phase 7 responsibilities. If the compatibility spike fails, reopen this ADR before feature code proceeds.
- **Phase:** 1 decision; Phase 2 spike/implementation.

## ADR-008 — Separate process semantics

- **Status:** Accepted
- **Context:** Terminal PTYs, Run processes, and language servers all launch OS processes but have different protocols and lifecycles.
- **Options:** One public `executeCommand()` service; three domain services over limited shared internals.
- **Selected option:** TerminalService, RunService, and LanguageServiceManager remain separate; internal ProcessManager only shares ownership registry and safe cleanup primitives.
- **Rationale:** A generic executor loses domain semantics and creates a dangerous renderer capability.
- **Consequences:** Each service has its own states, cancellation, output, restart, and error mapping.
- **Phase:** 1.

## ADR-009 — Git implementation

- **Status:** Accepted
- **Context:** V1 needs predictable local Git behavior and explicit dependency detection.
- **Options:** Direct Git CLI calls in handlers; Node Git implementation/library; typed service wrapping the local Git CLI.
- **Selected option:** A typed GitService wrapping the local Git CLI with executable/argument arrays.
- **Rationale:** It keeps native Git semantics visible and debuggable while centralizing parsing, validation, cancellation, and errors.
- **Consequences:** Git must be installed or configured; dependency state is `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, or `INVALID_CONFIGURATION`. Credentials are delegated to Git/OS. Hosted reviews are omitted.
- **Phase:** 1 decision; implementation Phase 5.

## ADR-010 — Persistence strategy

- **Status:** Accepted
- **Context:** Recent projects, settings, configured paths, and workspace UI state must survive restart without a database server.
- **Options:** Browser localStorage; one unversioned JSON blob; server/database; versioned main-owned JSON documents.
- **Selected option:** Versioned JSON in Electron user data, split into app settings/recent projects and per-workspace state.
- **Rationale:** It is local-first, inspectable, small, and controllable at the privileged boundary.
- **Consequences:** Use serialized atomic replacement, last-known-good backup, schema migrations, defaults, and corruption recovery. Exact helper package is not selected; a package is unnecessary unless Phase 2 analysis proves value.
- **Phase:** 1.

## ADR-011 — Renderer state management

- **Status:** Proposed
- **Context:** The shell needs persistent, workspace, editor, process-view, and ephemeral state without overengineering.
- **Options:** React local/context state; Zustand; Redux; another store.
- **Selected option:** `TBD` during early Phase 2 based on actual cross-feature update needs; default to local state and focused feature stores.
- **Rationale:** Orca's Zustand usage reflects a much larger product and is not sufficient reason to add a dependency.
- **Consequences:** Phase 2 must document the choice before shared shell/project/editor state expands; no global all-domain store.
- **Phase:** 2 decision gate.

## ADR-012 — Error, logging, and cancellation model

- **Status:** Accepted
- **Context:** Node errors are not stable IPC contracts and long operations need usable recovery.
- **Options:** Pass thrown errors; string-only errors; structured application errors and domain cancellation.
- **Selected option:** Structured `AppError` categories, redacted source/session logs, and domain-specific cancellation/lifecycle operations.
- **Rationale:** UI receives actionable states while detailed diagnostics remain available without leaking secrets.
- **Consequences:** Search, Run, Terminal, Git, and language requests define their own cancellation semantics and ignore stale events by ID.
- **Phase:** 1.

## ADR-013 — Language intelligence boundary

- **Status:** Accepted boundary; provider selections Proposed
- **Context:** Tier 1/2 capabilities must survive missing/crashed services and remain independent of runtimes.
- **Options:** Feature code talks directly to individual workers/servers; one LanguageServiceManager with provider adapters.
- **Selected option:** Main-owned manager for external server lifecycle plus provider adapters; Monaco/browser-worker providers may remain renderer-side behind the same conceptual capability/status boundary.
- **Rationale:** Providers differ, but diagnostics, capability checks, status UX, and isolation must be consistent.
- **Consequences:** Runtime/dependency detection uses `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, and `INVALID_CONFIGURATION`. Language-service lifecycle uses `NOT_CONFIGURED`, `MISSING`, `STARTING`, `RUNNING`, `STOPPED`, `CRASHED`, and `INVALID_CONFIGURATION`. Provider registry, document sync, normalized diagnostics, restart/logging, and these explicit states are required. Final JS/TS/HTML/CSS/JSON and Python providers are decided after Phase 2 and before Phase 3 implementation.
- **Phase:** 1 boundary; Phase 3 provider gate.

## ADR-014 — TypeScript execution strategy

- **Status:** Proposed — spike required before Phase 4
- **Context:** TypeScript is Tier 1 Run, including a useful single-file student workflow.
- **Options:** `tsx`; `ts-node`; compile with `tsc` then Node; Node native type stripping where the detected runtime supports the file/project.
- **Selected option:** `TBD`. `tsx` is the leading candidate for a predictable single-file experience, but no package is approved in Phase 1.
- **Rationale:**
  - `tsx`: simple and fast; adds a dependency and may differ from project build configuration.
  - `ts-node`: familiar but configuration/ESM behavior can be harder for beginners.
  - `tsc` + Node: accurate compile diagnostics but slower and needs output/config lifecycle.
  - Node native TypeScript: no runner dependency but behavior depends on Node version and supports only erasable syntax/config limitations.
- **Consequences:** Before Phase 4, test Windows paths, ESM/CommonJS, source maps/error locations, `tsconfig`, cancellation/tree cleanup, single-file and project behavior. Record the final selection here.
- **Phase:** 4 decision gate.

## ADR-015 — Language provider candidates

- **Status:** Proposed — decide before Phase 3 implementation
- **Context:** Required capabilities vary by language and runtime installation.
- **Options:** Monaco built-in workers; external LSP/language services; mixed provider architecture.
- **Selected option:** Mixed architecture is the leading direction: Monaco language workers are candidates for JS/TS/HTML/CSS/JSON, and Pyright is the Python candidate. Exact packages/process placement remain `TBD`.
- **Rationale:** Browser workers may cover web languages with lower process overhead; Python needs a dedicated service. Capability and status behavior must remain uniform.
- **Consequences:** A Phase 3 spike must verify Signature Help, Definition, diagnostics, cross-file behavior, cancellation, worker/server packaging, logs, and independent failure states before selection.
- **Phase:** 3 decision gate.

## ADR-016 — IPC runtime validation

- **Status:** Accepted principle; implementation mechanism TBD during early Phase 2
- **Context:** Renderer-to-main IPC crosses the privileged Electron boundary. TypeScript compile-time types do not validate values received at runtime.
- **Options:** Hand-written validators; Zod; Valibot; another lightweight schema-validation mechanism.
- **Selected option:** Runtime validation is mandatory for every renderer-to-main IPC request before it reaches a domain service. The exact mechanism remains `TBD` during early Phase 2. Prefer small explicit validators by default unless contract scale demonstrates that a schema library provides sufficient benefit. A type assertion such as `as SomeRequest` is not validation.
- **Rationale:** Privileged handlers must reject malformed or over-authorized input independently of renderer correctness, without selecting a package before contract scale is known.
- **Consequences:** Validation occurs at the privileged boundary; invalid payloads map to `INVALID_INPUT`; domain services receive validated data; no schema library may be added without recording the decision; no generic unrestricted IPC payload is allowed.
- **Phase:** 1 principle; early Phase 2 mechanism gate.

## Dependency candidate register

No package is installed by this analysis.

| Area | Candidate | Pros | Cons / maintenance risk | Native/Windows impact | Status |
|---|---|---|---|---|---|
| Editor | `monaco-editor` | Required editor engine, strong language primitives | Large bundle/worker configuration | No native ABI; worker packaging must be verified | SELECTED by requirement |
| React Monaco integration | `@monaco-editor/react` or small local adapter | Wrapper simplifies mount | Wrapper can obscure model/disposal control | No native impact | TBD Phase 2 |
| Terminal UI | `@xterm/xterm` + fit/search addons as needed | Established terminal rendering | Version/addon compatibility | No native ABI | SELECTED |
| PTY | `node-pty` | Real PTY/ConPTY semantics | Native rebuild and release maintenance | High: Electron ABI and installer test | SELECTED with gate |
| Persistence | Small internal JSON adapter | Minimal dependency and explicit schema | Must correctly implement atomic/recovery behavior | Windows file locks/rename tests | SELECTED direction |
| Git | Direct CLI behind internal wrapper | Transparent, predictable, easy to diagnose | Must parse output and map failures | External Git detection required | SELECTED |
| JS/TS intelligence | Monaco TS worker or external TypeScript service | Monaco worker is lightweight; external service may improve project fidelity | Capability/project behavior must be measured | Worker/process packaging | TBD Phase 3 |
| HTML/CSS/JSON intelligence | Monaco workers | Built for editor integration | Confirm diagnostics/capability coverage | Worker packaging | TBD Phase 3 |
| Python intelligence | Pyright provider | Strong completion/diagnostics | Distribution and executable/package lifecycle | PATH/config and child-process packaging | TBD Phase 3 |
| TypeScript Run | `tsx`, `ts-node`, `tsc` + Node, native Node TS | Multiple viable UX choices | Semantics/version/config trade-offs | Must test Windows invocation/stop | TBD Phase 4 |

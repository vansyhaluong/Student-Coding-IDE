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
- **Consequences:** Default search exclusions are `.git`, `node_modules`, `dist`, `build`, and `out`; symlinks are not followed outside root by default. Phase 2 filesystem monitoring exposes only project-scoped `AVAILABLE`/`UNAVAILABLE` authority, with close/reopen recovery rather than a new workspace-recovery system.
- **Phase:** 1.

## ADR-006 — Editor model ownership

- **Status:** Accepted
- **Context:** Tabs, dirty buffers, save races, language IDs, and view restoration need one owner.
- **Options:** Component-local models; one global text blob per tab; renderer EditorModelManager.
- **Selected option:** Renderer-owned EditorModelManager with one Monaco model per canonical file identity; disk I/O remains in FileSystemService.
- **Rationale:** It preserves undo/model identity across tab switches and separates UI, model, and disk responsibilities.
- **Consequences:** Saves are version-aware; closing/switching invokes unsaved protection; models and subscriptions have explicit disposal. Externally deleted open files retain their buffer in an explicit disk-missing state and are not silently recreated by normal save.
- **Phase:** 1.

## ADR-007 — Terminal implementation

- **Status:** Accepted, with Phase 2 Windows/native compatibility gate
- **Context:** V1 requires a real integrated terminal on Windows with resize, input/output, and cleanup.
- **Options:** `child_process` pipes; direct ConPTY implementation; xterm.js + `node-pty`; web terminal service.
- **Selected option:** xterm.js renderer UI plus main-process `node-pty`.
- **Rationale:** Pipes do not provide terminal semantics; direct ConPTY is disproportionate; the selected pair is established and maps cleanly to the required process boundary.
- **Windows V1 shell policy:** Resolve valid `pwsh`, then Windows PowerShell, then `ComSpec`/`cmd.exe`. Phase 2E has no configured custom-shell support; user-configurable shell selection is deferred to Phase 6 Settings.
- **Consequences:** `node-pty` is native. Before Terminal implementation is accepted, the Phase 2 spike verifies installation, Electron ABI compatibility, PTY startup inside Electron, PowerShell/cmd launch, input/output, resize, close, process cleanup, and native-module feasibility on Windows. Full packaged-app verification, release artifacts, installer work, and installer smoke testing remain Phase 7 responsibilities. If the compatibility spike fails, reopen this ADR before feature code proceeds.
- **Phase 2E-B evidence (2026-08-30):** On Windows x64, the `node-pty` 1.1.0 shipped prebuild loaded and operated under Electron 44.0.0 / bundled Node 24.18.1 / module ABI 149 without rebuilding. Windows PowerShell was selected because `pwsh` was unavailable; the repository-root PTY passed deterministic input/output, resize, Ctrl+C, single exit-event/code capture, owned-PID release, and clean Electron-exit checks. An electron-vite Main build retained external `node-pty` resolution and repeated the native smoke successfully. `@electron/rebuild` and a native build chain are not required now. This evidence does not claim production TerminalService behavior, descendant-tree cleanup, packaging, or installer acceptance.
- **Phase:** 1 decision; Phase 2 spike/implementation.

## ADR-008 — Separate process semantics

- **Status:** Accepted
- **Context:** Terminal PTYs and Run processes launch OS processes; a future authorized external language server would also launch a process but would have a different protocol and lifecycle.
- **Options:** One public `executeCommand()` service; three domain services over limited shared internals.
- **Selected option:** TerminalService and RunService remain separate. If future scope authorizes an external provider, LanguageServiceManager is a third separate domain; internal ProcessManager only shares ownership registry and safe cleanup primitives.
- **Rationale:** A generic executor loses domain semantics and creates a dangerous renderer capability.
- **Consequences:** Each implemented service has its own applicable states, cancellation, output, cleanup, and error mapping. This ADR preserves but does not require a V1 external LanguageServiceManager.
- **Phase:** 1.

## ADR-009 — Git implementation

- **Status:** Accepted
- **Context:** V1 needs predictable local Git behavior and explicit dependency detection.
- **Options:** Direct Git CLI calls in handlers; Node Git implementation/library; typed service wrapping the local Git CLI.
- **Selected option:** A typed GitService wrapping the local Git CLI with executable/argument arrays.
- **Rationale:** It keeps native Git semantics visible and debuggable while centralizing parsing, validation, cancellation, and errors.
- **Consequences:** Git must be installed or configured; dependency state is `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, or `INVALID_CONFIGURATION`. Credentials are delegated to Git/OS. Hosted reviews are omitted.
- **Phase 5A policy:** Main performs PATH-first detection of exact `git.exe`
  candidates without PATHEXT or cwd fallback. A validated candidate is
  `AVAILABLE`; absence is `MISSING`. `NOT_CONFIGURED` and configured-path
  `INVALID_CONFIGURATION` remain in the public contract but are not emitted by
  Phase 5A. Renderer supplies no executable, cwd, arguments, or shell content.
  Repository detection runs a bounded fixed Git probe at the authorized active
  project root. Git's canonical top-level must equal the canonical project root;
  a normal non-Git folder or a subfolder of a parent repository returns the
  typed `NOT_REPOSITORY` state rather than an `AppError`.
- **Phase:** 1 decision; implementation Phase 5.

## ADR-010 — Persistence strategy

- **Status:** Accepted
- **Context:** Recent projects, settings, configured paths, and workspace UI state must survive restart without a database server.
- **Options:** Browser localStorage; one unversioned JSON blob; server/database; versioned main-owned JSON documents.
- **Selected option:** Versioned JSON in Electron user data, split into app settings/recent projects and per-workspace state.
- **Rationale:** It is local-first, inspectable, small, and controllable at the privileged boundary.
- **Consequences:** Use serialized atomic replacement, last-known-good backup, schema migrations, defaults, and corruption recovery. Exact helper package is not selected; a package is unnecessary unless Phase 2 analysis proves value. Phase 2 retains only minimal recent-project metadata; list-management and any product limit policy remain part of the Phase 6 Recent Projects UX rather than an invented Phase 2 setting.
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

- **Status:** Accepted
- **Context:** Tier 1/2 capabilities must survive provider failure and remain independent of runtimes. Phase 3B confirmed that every Phase 3 intelligence language could use Monaco/browser workers without an external process. Phase 5.5 later authorizes C# as the first external-provider extension under this boundary.
- **Options:** Feature code talks directly to individual workers/servers; a renderer provider manager for browser workers; one Main LanguageServiceManager for external processes; a provider boundary spanning both execution models.
- **Selected option:** Phase 3 uses a renderer-owned LanguageProviderManager and Monaco/browser-worker adapters. Phase 5.5 adds a separate Main-owned LanguageServiceManager for C#; it was not a Phase 3 implementation requirement.
- **Rationale:** Providers differ, but diagnostics, capability checks, status UX, and isolation must be consistent.
- **Consequences:** Runtime/dependency detection uses `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, and `INVALID_CONFIGURATION`. Current workers expose only applicable capability/status and renderer-owned recovery/cleanup behavior. The broader external-service lifecycle vocabulary was not imposed as a Phase 3 exit gate; ADR-022 applies it to C# with dependency/lifecycle separation. Provider registry, document sync, normalized diagnostics, status, and cleanup remain required for current Monaco providers. C# and later external providers remain Main-owned and independent of runtime execution.
- **V1 recovery clarification:** Manual user-facing `Restart Language Service` is not required. Current Monaco/browser-worker providers use safe disposal and natural renderer-owned reinitialization/recovery where supported, without a restart button, command, menu item, IPC endpoint, or new lifecycle UX. Dirty buffers remain authoritative and stale project/provider generations remain rejected. ADR-022 retains no public manual lifecycle API or automatic restart loop for C#.
- **Phase:** Phase 1 boundary, resolved for Phase 3 by ADR-015 and Phase 3B evidence; extended for C# Phase 5.5 by ADR-022.

## ADR-014 — TypeScript execution strategy

- **Status:** Deferred — future TypeScript Run decision gate; not a Phase 4 V1 blocker
- **Context:** Explicit user scope clarification limits Phase 4 V1 to the current authorized JavaScript `.js` file inside the active project via Node.js. TypeScript Language Intelligence remains supported from Phase 3; TypeScript Run is deferred, not permanently rejected.
- **Options:** `tsx`; `ts-node`; compile with `tsc` then Node; Node native type stripping where the detected runtime supports the file/project.
- **Selected option:** None. V1 selects no TypeScript runtime, compile/transpile strategy, `tsx`, `ts-node`, or Node-native TypeScript execution policy. The options below are future comparison evidence only, not approved dependencies or implementation work.
- **Rationale:**
  - `tsx`: simple and fast; adds a dependency and may differ from project build configuration.
  - `ts-node`: familiar but configuration/ESM behavior can be harder for beginners.
  - `tsc` + Node: accurate compile diagnostics but slower and needs output/config lifecycle.
  - Node native TypeScript: no runner dependency but behavior depends on Node version and supports only erasable syntax/config limitations.
- **Consequences:** Before a future authorized TypeScript execution implementation, decide and verify the strategy, including Windows paths, ESM/CommonJS, source maps/error locations, `tsconfig`, runtime compatibility, cancellation/tree cleanup, and the authorized file/project scope. Record the final selection here. RunService retains a narrow internal RunStrategy boundary with only JavaScriptRunStrategy in Phase 4 V1; a future TypeScriptRunStrategy must not require redesigning core RunService. Do not implement placeholder TypeScript production code.
- **Related scope clarification:** Built-in Run Project, npm/package-manager scripts, dev-server orchestration, project entry configuration, and framework/project launcher logic are deferred from Phase 4 V1. Future Run Project requires a separately authorized entry/script policy. This clarification resolves no other Run behavior or lifecycle decision.
- **Phase:** Future TypeScript Run gate; not a dependency or exit gate for current Phase 4 JavaScript implementation.

### Approved Phase 4 V1 Run policies

Explicit user decisions apply to current-file JavaScript Run only:

- One active session per target. Re-run stops the old session and awaits
  successful cleanup before replacement, with no prompt or overlapping sessions.
- Dirty target: block Run and require explicit Save; do not auto-save, execute
  stale disk content, create temporary execution files, or mutate editor buffers.
- Node detection: Main-controlled process PATH only; unresolved Node is `MISSING`
  and blocks Run with a safe useful error. Bundled Node, configured absolute Node
  paths, and Node-path Settings UI are deferred. No detection dependency is approved.
- Confirmed project close/switch waits for all project Run cleanup before commit;
  cleanup failure preserves current project/editor state. Root unavailability
  stops project runs and rejects stale events, including across replacement projects.
- One primary Run action on the right of the editor header. Output joins Problems
  and Terminal in the existing Bottom Panel. No duplicate Run affordance or
  Terminal redesign.
- Windows process-tree feasibility is a read-only gate before implementation:
  verify creation-time ownership for a Node process with separate stdout/stderr,
  descendants after root exit, bounded whole-tree cleanup, and reuse of existing
  shutdown/project ownership. No production/native/dependency/package-lock change,
  ProcessManager redesign, timeout change, lifecycle change, or test weakening is
  authorized by that review. Report insufficiency for user decision.

These are approved product policies, not evidence of an implemented RunService
or a passed Windows feasibility gate. ADR-014 remains deferred as stated above.

## ADR-015 — Phase 3 V1 language scope and providers

- **Status:** Accepted — Phase 3 V1 scope resolved; C# external-provider extension is governed by ADR-022
- **Context:** The original candidate scope included Python intelligence and Java syntax. Phase 3A confirmed that the web-language requirements can use Monaco-native providers while Python would introduce a materially different external-service dependency and lifecycle. The approved V1 scope is JavaScript/TypeScript, HTML/CSS/JSON, and syntax-only C#/PHP; Python and Java are intentionally deferred rather than permanently removed.
- **Options:** Monaco built-in workers; external LSP/language services; a mixed architecture; reduce current scope while preserving the provider boundary for future languages.
- **Selected option:**
  - Use Monaco-native workers/providers for JavaScript, TypeScript, HTML, CSS, and JSON.
  - Give JavaScript/TypeScript bounded project visibility through a bounded project snapshot/source synchronization strategy. Do not mirror all of `node_modules`, and do not expose the real canonical project root to Renderer merely for TypeScript resolution.
  - Use Monaco tokenization only for C# and PHP.
  - Use measured initial JS/TS snapshot ceilings of 500 source files, 5 MiB total
    UTF-8 content, and 256 KiB per file for the 3C implementation baseline. Keep
    editing/saving available for excluded sources and revisit only with measured
    evidence.
  - Keep JSON schema resolution offline and deny-by-default. Phase 3D may use
    explicitly bundled or application-trusted schemas, but may not enable
    implicit network fetching.
  - Defer HTML diagnostics and HTML Problems contribution from current V1
    because the approved Monaco HTML provider has no validation support. Keep
    HTML syntax, completion, and provider-supported hover; do not add a custom
    validator/parser, dependency, external provider, project index, IPC, or
    network capability to replace diagnostics.
  - When the active project root becomes `UNAVAILABLE`, stop project intelligence and clear stale diagnostics while preserving editor buffers, syntax highlighting, and the open project.
  - Defer Python provider selection and all Python LSP lifecycle work. No Pyright, basedpyright, python-lsp-server, `vscode-jsonrpc`, Python interpreter detection for intelligence, or Python document synchronization is approved in current Phase 3.
  - Defer Python runtime integration and Python Run from current V1.
  - Defer all Java support from current V1, including required syntax acceptance, language intelligence, Run, and Java-specific provider/runtime infrastructure.
  - Defer every external language-server process implementation from Phase 3. Preserve Main ownership as a future extension boundary only.
- **Rationale:** This is the smallest architecture that meets the approved current capabilities without adding an external process, new privileged bridge, or language-runtime coupling. The provider boundary keeps later Python and Java additions possible without redesigning Editor, Project, or Language ownership.
- **Consequences:** Phase 3B established snapshot thresholds, exclusions, safe virtual URI mapping, dirty-model precedence, trusted/offline JSON schema policy, provider status contracts, and cleanup rules before production intelligence implementation. It verified editor, JavaScript/TypeScript, HTML, CSS, and JSON workers from local hashed production-renderer assets; JS/TS same-file, cross-file, mixed-language, JSX/TSX, definition and diagnostics feasibility; dirty-model precedence; project cleanup; and stale project/provider generation protection. Phase 3C converted the JS/TS path into bounded production synchronization. Phase 3D verified model-local HTML completion/hover, CSS completion/hover/diagnostics, and local schema-free JSON completion/diagnostics while disabling schema requests; JSON hover produces no useful result without a configured local schema. Phase 3 providers stay Renderer/Monaco-worker based. Phase 3 diagnostic inputs were JavaScript, TypeScript, CSS, and JSON; HTML diagnostics require a future separately approved provider decision. No Python or Java provider exists, and C#/PHP remained tokenization-only in Phase 3. ADR-022 newly authorizes the C# external-provider extension without rewriting that history. Full packaged/installed acceptance remains Phase 7 and is not claimed by Phase 3B-3D or Phase 5.5A–5.5H.
- **Rejected for Phase 3:** Wholesale `node_modules` mirroring; arbitrary package discovery or unrestricted external type loading; canonical project-root exposure to Renderer for TypeScript resolution; generic language IPC; Renderer-owned filesystem/process authority; Python/Java providers; every external language-server process.
- **Phase:** Phase 3A provider gate resolved and Phase 3B evidence recorded; the Phase 3 scope was clarified before 3C. ADR-022 governs the separately authorized Phase 5.5 C# extension.

## ADR-016 — IPC runtime validation

- **Status:** Accepted
- **Context:** Renderer-to-main IPC crosses the privileged Electron boundary. TypeScript compile-time types do not validate values received at runtime.
- **Options:** Hand-written validators; Zod; Valibot; another lightweight schema-validation mechanism.
- **Selected option:** Use small explicit validators for Phase 2 IPC contracts. Every renderer-to-main request is validated before it reaches a domain service, validators return normalized field-level issues, and a type assertion such as `as SomeRequest` is never treated as validation.
- **Rationale:** Phase 2A has a small contract surface with simple object, identifier, and path primitives. Explicit validators make the privileged checks auditable and testable without adding a schema runtime or bundling cost. If later contract scale makes duplication or drift material, this ADR must be reopened before adding a schema library.
- **Consequences:** Validation occurs at the privileged boundary; invalid payloads map to `INVALID_INPUT`; domain services receive validated data; validators and their inferred/narrowed contract types are tested together; no generic unrestricted IPC payload is allowed.
- **Phase:** 1 principle; mechanism resolved in Phase 2A.

## ADR-017 — External URL and navigation policy

- **Status:** Accepted
- **Context:** BrowserWindow navigation and external URL opening cross a privileged Electron boundary. The development renderer uses an HTTP origin, but that internal development transport must not authorize arbitrary external HTTP navigation.
- **Options:** Allow common web/mail protocols; allow HTTPS only; block all external opening.
- **Selected option:** External opening is limited to validated `https:` URLs. Block `http:`, `mailto:`, `file:`, custom protocols, and every other external protocol. Renderer navigation remains restricted to the exact current application origin; the electron-vite development renderer origin is an internal development exception only, while packaged navigation remains restricted to packaged application content.
- **Rationale:** HTTPS-only external opening provides the required documentation-link capability with the smallest approved external protocol surface.
- **Consequences:** Main validates URLs before calling `shell.openExternal`; preload never exposes unrestricted external opening or Electron shell primitives; in-window navigation away from the exact application origin is denied.
- **Phase:** 2A security policy.

## ADR-018 — Automated test infrastructure

- **Status:** Accepted
- **Context:** Phase 2A requires executable unit, main/service, IPC-boundary, persistence, security, and lifecycle tests. The repository currently uses Vite/electron-vite with TypeScript and has only a failing placeholder test command.
- **Options:** Node.js built-in test runner; Jest with a TypeScript transform; Vitest; a full Electron end-to-end runner as the initial test layer.
- **Selected option:** Use Vitest in its Node environment by default for unit, main/service, contract, persistence, security, and adapter-level IPC integration tests. Use explicit Electron port/factory adapters so privileged behavior can be exercised without exposing or heavily mocking live Electron objects. Renderer component integration tests that require DOM interaction use file-scoped jsdom with React Testing Library; Node remains the environment for all other tests. Add full Electron end-to-end tooling only when a later work package has behavior that requires it.
- **Rationale:** Vitest shares the existing Vite TypeScript transform, supplies assertions/mocking in one compatible dependency, and runs on both CI Node 22 and the supported local Node versions. Node's runner would require a separate TypeScript execution convention; Jest would duplicate the Vite transform; a browser/Electron E2E stack is disproportionate before a workflow genuinely requires it. Phase 2B corrective review demonstrated a concrete need for component interaction coverage that reducer-only tests could not provide, so `jsdom`, `@testing-library/react`, and `@testing-library/dom` were explicitly approved as development-only dependencies.
- **Consequences:** `npm test` is the stable CI command and runs Vitest once; focused tests use `*.test.ts`; CI runs tests after typecheck and lint; only Renderer component test files opt into jsdom; real Electron smoke/E2E coverage remains a later incremental gate rather than being claimed by component or adapter tests.
- **Phase:** 2A test infrastructure gate; component-test environment extended during Phase 2B corrective review.

## ADR-019 — Phase 2C editor integration and data-safety policy

- **Status:** Accepted
- **Context:** Phase 2C requires retained Monaco models, source-file writes, unsaved protection across project/application transitions, Explorer coordination, and bounded external-change behavior. The existing architecture fixed ownership boundaries but intentionally left the React wrapper and destructive multi-document policies to the Phase 2C gate.
- **Selected options:**
  - Use `@monaco-editor/react` only as the React mounting layer and configure it with the locally imported `monaco-editor` instance. `EditorModelManager` remains authoritative for document/model identity, dirty baselines, view state, and disposal.
  - Keep focused React/editor state without adding a global renderer-state dependency. ADR-011 remains pending unless later cross-feature evidence requires a shared store.
  - Use one consolidated `Save All` / `Don't Save All` / `Cancel` decision for transitions involving multiple dirty documents. A failed save aborts the transition; earlier successful saves remain saved.
  - Before deleting one open dirty file, require `Save` / `Don't Save` / `Cancel`. Only an approved and, where selected, successfully saved document is closed before the existing Recycle Bin operation.
  - Deleting a folder resolves every open dirty descendant in one consolidated `Save All` / `Don't Save All` / `Cancel` decision. Descendants are selected by normalized project-relative ancestry, never raw string-prefix matching. All required saves must succeed before any affected document is closed; clean descendants close immediately before the Recycle Bin request. A failed Recycle Bin operation is surfaced and never falls back to permanent deletion.
  - Automatically reload externally changed clean documents while retaining view state where practical. Preserve dirty buffers and expose an external-change conflict warning; no Phase 2C merge editor is introduced.
  - Save source files through a validated direct write. Source-file atomic replacement and disk-conflict/version detection are not claimed. Application/workspace JSON persistence retains ADR-010 atomic replacement.
  - Use a narrow transition-ID request/response protocol driven by Main. It participates in the authoritative ProjectService transition guard and application-close coordination; invalid/stale responses, renderer disappearance, timeout, and save failure fail closed.
- **Rationale:** These policies preserve the accepted privilege boundary and prevent silent source loss while keeping Phase 2C smaller than a general conflict-management or renderer RPC subsystem.
- **Consequences:** File write receives only ProjectId, normalized project-relative path, and text. Project/application transitions may wait for the owning renderer. The protocol is lifecycle-specific, validates transition ownership and identity, and cannot execute arbitrary renderer requests. Phase 2C tests must cover save races, multi-document decisions, delete coordination, external changes, timeout/disappearance, and stale transition responses.
- **Phase:** 2C decision gate.

## ADR-020 — Windows terminal descendant-process cleanup

- **Status:** Accepted — reopened and superseded by Phase 2E-J corrective Step 2.
- **Context:** Phase 2E-B proved Electron/`node-pty` native compatibility and Phase 2E-D/G implemented semantic session/project cleanup. Phase 2E-H then proved that `node-pty` `kill()` alone was insufficient: shell PID 22796 and child PID 18376 exited, but owned grandchild PID 26396 remained alive after three seconds while unrelated control PID 29916 correctly survived. Main had already emitted one exit and removed the ProcessManager resource, creating a false-clean descendant state.
- **Options:** Retain current `node-pty` close/kill behavior if controlled evidence proves it sufficient; invoke targeted `taskkill /PID <owned-pid> /T`; enumerate and terminate a validated owned process tree; contain PTY trees with Windows Job Objects.
- **Selected option:** Windows Job Object is the primary Windows V1 terminal process-tree backend. A small reproducible patch to pinned `node-pty` 1.1.0 extends its ConPTY `STARTUPINFOEX` path with `PROC_THREAD_ATTRIBUTE_JOB_LIST`, assigning a dedicated Job atomically at the native `CreateProcessW` boundary. Spawn fails closed if the patched capability, Job creation, attribute association, or process creation is unavailable. The native integration retains the Job handle behind an opaque integration-created token independent of root-process lifetime. Natural root exit retains session and ProcessManager ownership. Finalization is explicit `TerminateJobObject`, bounded `ActiveProcesses == 0` confirmation, `CloseHandle`, then session/ProcessManager release. `KILL_ON_JOB_CLOSE` is not enabled. The previous fingerprinted targeted-taskkill backend remains only for explicit legacy/unestablished ownership and is forbidden after Job establishment or Job termination failure.
- **Trade-offs:**
  - Current behavior is smallest and easiest to maintain, but evidence may show descendants survive.
  - Targeted `taskkill /T` is built into Windows, but PID ownership/reuse, invocation, force semantics, and close races require strict control.
  - Process-tree enumeration can validate targets individually, but ancestry snapshots race with spawn/exit and add permissions/platform code.
  - Job Objects provide strong containment/kill-on-close semantics, but introduce native integration, nesting, ABI, maintenance, and Phase 7 packaging implications.
- **Evidence:** The original Phase 2E-H targeted-taskkill evidence remains valid only for the gated legacy backend. Corrective Step 2 rebuilt the patched native module for Electron 44 x64 and verified its capability marker. The native smoke created shell 28332, child 24636, grandchild 16628, Job-owned conhost helpers 28792 and 25964, and unrelated control 2396. After the shell exited naturally, its PID was gone while the Job remained valid with four active descendants. Explicit Job termination removed the descendants/helpers, preserved the control process, confirmed the Job empty, released the handle, and produced one PTY exit event. A production-service Electron smoke used shell 33128, child 31128, grandchild 6332, and control 5888; ProcessManager stayed registered after natural root exit and reached zero only after successful Job finalization, with one terminal exit. Automated lifecycle/race tests verify failure retention and duplicate-trigger sharing.
- **Related decisions:** V1 remains Windows 10/11 x64 without turning this evidence host into a minimum build. Phase 7 retains packaged/installed Windows CI and release acceptance. Renderer/preload authority is unchanged. Phase 2E-J corrective Step 1 fixed ProcessManager cleanup ownership; Step 2 owns natural-root/Job finalization; Step 3 separately owns application-shutdown semantics.
- **Consequences:** Every newly created production Windows terminal is Job-owned or fails creation. Root PID is not cleanup authority after Job establishment. Job failure retains native and Main ownership; no PID fallback is allowed. An opaque token can address only Jobs created by this integration, and unknown/stale tokens fail. Patch application and Electron ABI rebuild fail loudly, while packaging policy remains Phase 7. Never kill by process name or expose generic renderer spawn/signal/process-control authority.
- **Phase:** 2E-J corrective Step 2; Phase 7 retains packaged/installed verification.

## ADR-021 — Graceful application shutdown failure semantics

- **Status:** Accepted.
- **Context:** Phase 2E-J found that `DesktopApplication` transitioned to
  `STOPPED` in a `finally` path and Electron's `before-quit` handler called
  `app.quit()` after cleanup rejection. Either path could report false shutdown
  success after terminal/Job cleanup failed.
- **Selected option:** Graceful shutdown is fail-closed. The application uses
  `RUNNING -> STOPPING -> STOPPED`, reaches `STOPPED` only after every mandatory
  started service stops successfully, and remains `STOPPING` after failure.
  Successfully stopped services are removed individually; the failed service
  and not-yet-stopped dependencies remain owned for a deterministic later retry.
  Concurrent shutdown calls share one in-flight attempt. WindowManager stops
  last so the existing close surface remains available while cleanup is
  incomplete.
- **Electron coordination:** The first `before-quit` is prevented while close
  approval and cleanup run. Cleanup success authorizes exactly one final
  `app.quit()`; the resulting recursive event passes through without another
  stop. Cleanup failure is logged through a redacted Main callback, does not
  authorize final quit, and clears only the failed attempt so a later graceful
  quit can retry. BrowserWindow close and non-macOS `window-all-closed` route
  through this same coordinator.
- **Rationale:** This preserves the Step 1 ProcessManager and Step 2 Windows Job
  ownership invariant without adding a force-quit policy, failure UX, public
  lifecycle state, dependency, native helper, or Renderer/preload/IPC authority.
- **Consequences:** `STOPPING` can be retained across a failed cleanup attempt;
  normal privileged work remains unavailable, but the existing window close
  path can request another retry. No automatic retry, timeout force quit,
  `app.exit()`, or `process.exit()` fallback exists. Unpreventable OS/process
  termination remains outside graceful-shutdown guarantees.
- **Evidence:** Phase 2E-J corrective Step 3 automated coverage verifies state
  transitions, error propagation, retained ownership, retry, concurrent calls,
  recursive quit protection, final-quit cardinality, and WindowManager bypass
  prevention. Electron 44 Windows x64 native smokes verify live-root and
  natural-root Job cleanup before `STOPPED`, one final quit request, descendant
  removal, ProcessManager release, and unrelated-process survival.
- **Phase:** 2E-J corrective Step 3.

## ADR-022 — Phase 5.5 C# language intelligence

- **Status:** Accepted; Phase 5.5B compatibility gate passed on 2026-09-10.
- **Context:** C# completed Phase 3 as syntax-only. A newly authorized Phase 5.5
  extends C# V1 with completion, hover, signature help, go to definition,
  diagnostics, and Problems integration while preserving the sandboxed Renderer,
  one-active-project model, editor data safety, and independent Run lifecycle.
- **Options:** Integrate a full VS Code compatibility layer in Renderer; expose
  raw LSP/JSON-RPC through Preload; or use a Main-owned `csharp-ls` process with a
  thin semantic LSP↔Monaco adapter and typed capability-specific APIs.
- **Selected option:**
  - Main owns `LanguageServiceManager`, `csharp-ls`, JSON-RPC/LSP transport,
    executable selection, workspace paths, lifecycle, cancellation, and cleanup.
  - Use provider-per-capability: Monaco tokenization for C# syntax;
    `csharp-ls` for completion, hover, signature help, definition, and diagnostics.
  - Use pinned `csharp-ls` 0.27.0 with `vscode-languageserver-protocol` 3.18.3
    and `vscode-jsonrpc/node` 9.0.2, the exact stack verified by Phase 5.5B.
    Phase 5.5B itself installs nothing into the production application.
  - The public language API is semantic and typed. It carries `projectId` plus
    project-relative paths and exposes no raw LSP/JSON-RPC, PID, executable path,
    cwd, spawn arguments, canonical project root, or raw logs. Main derives the
    owner from trusted Electron sender/document identity and performs runtime
    validation, path resolution, canonicalization, and containment checks.
  - Completion resolve uses opaque Main-owned handles. Diagnostic `resultId`
    remains Main-only. Definition targets are limited to `file:` URIs inside the
    canonical active project root; metadata/BCL/generated and external targets
    are unsupported in V1.
  - Support `.sln` and `.slnx`. Reuse a saved valid selection; auto-select one
    candidate; request and remember a per-project selection for multiple
    candidates; use project mode when no solution and one or more `.csproj`
    files exist; fall back to syntax-only when neither exists. Never create a
    temporary solution. Main may use bounded discovery for project-mode
    preflight/UX, while current `csharp-ls` owns recursive project discovery and
    actual loading; Main does not claim the exact loaded project set.
  - Keep workspace readiness independent from dependency and service lifecycle.
    Workspace states are `READY`, `SELECTION_REQUIRED`, `NO_CSHARP_WORKSPACE`,
    and `PREFLIGHT_FAILED`. After selection, Main preflights the effective SDK
    with `dotnet --version`, parses a selected solution with `dotnet sln <path>
    list`, extracts listed `.csproj` path tokens without matching localized
    prose, bounded-discovers projects in project mode, runs evaluation-only MSBuild
    `-getProperty`/`-getItem` JSON for each project, and validates evaluated
    `ProjectReference` containment/existence. It requests no build, restore, or
    target and does not create or modify workspace files. `PREFLIGHT_FAILED`
    prevents provider startup; a pass becomes `READY`.
  - Start lazily with one C# session for the active project. Initialize with LSP
    `initialize` then `initialized` and UTF-16. Treat Monaco dirty content as
    authoritative; send `didOpen`, ordered incremental `didChange`, `didSave`,
    and `didClose`, using Monaco model version as document version. Batching may
    preserve order but cannot drop changes; flush before semantic requests.
  - Reuse FileSystemService watcher events. Open/dirty document sync wins over
    disk watcher content. Reject stale project/session/document results. Use
    pull diagnostics for open documents; defer workspace diagnostics.
  - Shutdown in this order: invalidate/cancel, LSP `shutdown`, await response,
    send `exit`, then bounded child/descendant cleanup. Unexpected exit becomes
    `CRASHED`; V1 has no automatic restart loop or public start/stop/restart API.
  - Require .NET SDK 10 or newer to run current `csharp-ls`; use .NET 10 LTS as
    the V1 acceptance baseline. Main detection uses process PATH plus
    `dotnet --list-sdks`. Dependency state (`MISSING`,
    `INVALID_CONFIGURATION`) remains separate from service lifecycle (`STOPPED`,
    `STARTING`, `RUNNING`, `CRASHED`); `NOT_CONFIGURED` is reserved for future
    configured paths.
  - `RUNNING` means the owned process is alive and LSP initialization succeeded;
    it does not certify an equivalent Roslyn workspace. Empty completion, null
    hover, empty definition, and no diagnostics are never workspace-health
    signals. Provider log/progress text is diagnostic evidence only and never a
    correctness or readiness dependency.
  - After 5.5B passes, production uses an app-owned pinned `csharp-ls`.
    Development may use a project-private provider before PATH fallback.
- **Rationale:** This retains Monaco and the existing Problems/editor ownership,
  keeps protocol and process authority in Main, avoids a broad VS Code runtime
  surface, and gives each supported feature an auditable semantic contract.
- **Deferred:** References, rename, code actions/quick fix, refactoring,
  formatter, advanced semantic tokens, Razor, metadata/BCL/generated virtual
  documents, debugger, C# Run, loose `.cs` full intelligence, workspace
  diagnostics, configured provider paths, and public/manual restart UX.
- **Hard-gate evidence required:** Phase 5.5B must exercise real `csharp-ls` on
  Windows and verify dependency/version probing; stdio JSON-RPC/LSP lifecycle;
  advertised capabilities; dirty/incremental sync; UTF-16/Unicode; completion,
  resolve, and cancellation; hover/signature/definition; pull diagnostics;
  `.sln`, `.slnx`, and project mode; no-solution recursive discovery behavior
  and performance; paths containing spaces, `#`, and Unicode; dynamic watched-
  file registration; workspace-load failure detection without parsing human log
  strings; crash/shutdown and descendant cleanup; and electron-vite, typecheck,
  and build compatibility. Phase 5.5C–5.5H cannot begin unless this gate passes.
- **Consequences:** Phase 7 retains full packaged/installed provider and Windows
  installer acceptance. A failed 5.5B gate blocks production implementation and
  requires recorded reevaluation; it does not authorize silently changing the
  provider, transport, security boundary, or capability scope.
- **Phase 5.5B evidence (2026-09-10):** The Windows stack
  (`csharp-ls` 0.27.0, .NET SDK 10.0.401/runtime 10.0.12,
  `vscode-languageserver-protocol` 3.18.3, `vscode-jsonrpc` 9.0.2, Electron
  44.0.0, and electron-vite 5.0.0) passed capability, synchronization, Unicode,
  workspace-mode, lifecycle, cleanup, import, typecheck, and build probes. The
  original malformed-project probe proved that provider initialization and
  semantic emptiness cannot detect workspace health: the process stayed alive
  and only human text reported the load problem.
- **Corrective Phase 5.5B evidence (2026-09-10):** An isolated structured
  preflight produced deterministic exit/JSON/path-check outcomes for valid and
  broken `.sln`, `.slnx`, and `.csproj`; missing `ProjectReference`; unknown
  project SDK; unavailable `global.json` SDK; unavailable targeting framework;
  and multi-project project mode. It made no workspace changes and did not run
  the fixture's mutation target. An unavailable targeting pack still passed,
  proving the documented residual false-positive boundary. A valid workspace
  also legitimately returned empty completion, null hover, empty definition,
  and no diagnostics, while the broken workspace returned similarly empty/null
  semantic results and could still produce local diagnostics. Therefore semantic
  results and human logs remain excluded from readiness. The revised bounded
  readiness policy is sufficient for V1 without claiming perfect Roslyn health.
  Full evidence is in
  `spikes/csharp-lsp-compatibility/REPORT.md`.
- **Phase:** 5.5A design baseline; 5.5B hard gate; 5.5C–5.5H implementation and
  verification only after PASS.
- **Authorized 5.5D process decision (2026-09-10):** A dedicated Main-only native
  C# entry point supplies stdin/stdout/stderr pipes and atomic Windows Job
  ownership at creation. Retain ownership after root exit through terminate,
  confirmed empty, and release. Verify hard-killed root/surviving descendants.
  Terminal, Run, Git, public authority and bounded readiness remain unchanged.

## Dependency candidate register

Phase 5.5A installed no package. Phase 5.5B installed trial dependencies only in
the isolated compatibility spike. Authorized Phase 5.5C then added the exact
verified protocol and JSON-RPC versions as production runtime dependencies.

| Area | Candidate | Pros | Cons / maintenance risk | Native/Windows impact | Status |
|---|---|---|---|---|---|
| Editor | `monaco-editor` | Required editor engine, strong language primitives | Large bundle/worker configuration | No native ABI; worker packaging must be verified | SELECTED by requirement |
| React Monaco integration | `@monaco-editor/react` over local `monaco-editor` | Thin mount integration while the app retains model/view/disposal ownership | Requires explicit local loader and worker configuration | No native impact | SELECTED Phase 2C |
| Terminal UI | `@xterm/xterm` + fit/search addons as needed | Established terminal rendering | Version/addon compatibility | No native ABI | SELECTED |
| PTY | `node-pty` | Real PTY/ConPTY semantics | Native rebuild and release maintenance | High: Electron ABI and installer test | SELECTED with gate |
| Persistence | Small internal JSON adapter | Minimal dependency and explicit schema | Must correctly implement atomic/recovery behavior | Windows file locks/rename tests | SELECTED direction |
| Git | Direct CLI behind internal wrapper | Transparent, predictable, easy to diagnose | Must parse output and map failures | External Git detection required | SELECTED |
| JS/TS intelligence | Existing Monaco TypeScript worker with bounded project snapshot | Meets accepted capability scope without external process | Snapshot thresholds, exclusions, and project fidelity require verification | Browser-worker packaging only | SELECTED Phase 3A; no new dependency |
| HTML/CSS/JSON intelligence | Existing Monaco workers | Built for editor integration | Confirm HTML completion/hover, CSS/JSON diagnostics, and trusted/offline JSON schema behavior; HTML diagnostics are deferred | Browser-worker packaging only | SELECTED Phase 3A; no new dependency |
| C# intelligence | `csharp-ls` 0.27.0 + `vscode-languageserver-protocol` 3.18.3 + `vscode-jsonrpc/node` 9.0.2 | Roslyn-based external provider behind standard typed protocol libraries; verified structured preflight | Preflight is intentionally not proof of equivalent Roslyn workspace health; distribution remains a later gate | Windows process/lifecycle and Phase 7 packaging impact | SELECTED by Phase 5.5B; exact runtime libraries installed by Phase 5.5C |
| Python intelligence | Future provider decision; Pyright/basedpyright/python-lsp-server remain unselected candidates | Deferred evaluation can use future requirements and packaging evidence | Would add external-service distribution, IPC, lifecycle, and security cost | Future Windows/process gate required | DEFERRED; no current Phase 3 dependency |
| Java intelligence | Future provider decision | Preserves future extensibility | Would add provider/runtime/process complexity if an external server is selected | Future Windows/process gate required | DEFERRED; no current Phase 3 dependency |
| TypeScript Run | `tsx`, `ts-node`, `tsc` + Node, native Node TS | Future comparison only; no V1 selection | Semantics/version/config trade-offs | Must test Windows invocation/stop before future execution | DEFERRED; future ADR-014 gate |
| Automated tests | `vitest` | Reuses Vite/TypeScript transform; unit, service, and adapter integration support | Keep Electron E2E separate until required | No native ABI; CI Node 22 compatible | SELECTED Phase 2A |

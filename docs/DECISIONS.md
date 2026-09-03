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
- **Windows V1 shell policy:** Resolve valid `pwsh`, then Windows PowerShell, then `ComSpec`/`cmd.exe`. Phase 2E has no configured custom-shell support; user-configurable shell selection is deferred to Phase 6 Settings.
- **Consequences:** `node-pty` is native. Before Terminal implementation is accepted, the Phase 2 spike verifies installation, Electron ABI compatibility, PTY startup inside Electron, PowerShell/cmd launch, input/output, resize, close, process cleanup, and native-module feasibility on Windows. Full packaged-app verification, release artifacts, installer work, and installer smoke testing remain Phase 7 responsibilities. If the compatibility spike fails, reopen this ADR before feature code proceeds.
- **Phase 2E-B evidence (2026-08-30):** On Windows x64, the `node-pty` 1.1.0 shipped prebuild loaded and operated under Electron 44.0.0 / bundled Node 24.18.1 / module ABI 149 without rebuilding. Windows PowerShell was selected because `pwsh` was unavailable; the repository-root PTY passed deterministic input/output, resize, Ctrl+C, single exit-event/code capture, owned-PID release, and clean Electron-exit checks. An electron-vite Main build retained external `node-pty` resolution and repeated the native smoke successfully. `@electron/rebuild` and a native build chain are not required now. This evidence does not claim production TerminalService behavior, descendant-tree cleanup, packaging, or installer acceptance.
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

## Dependency candidate register

No package is installed by this analysis.

| Area | Candidate | Pros | Cons / maintenance risk | Native/Windows impact | Status |
|---|---|---|---|---|---|
| Editor | `monaco-editor` | Required editor engine, strong language primitives | Large bundle/worker configuration | No native ABI; worker packaging must be verified | SELECTED by requirement |
| React Monaco integration | `@monaco-editor/react` over local `monaco-editor` | Thin mount integration while the app retains model/view/disposal ownership | Requires explicit local loader and worker configuration | No native impact | SELECTED Phase 2C |
| Terminal UI | `@xterm/xterm` + fit/search addons as needed | Established terminal rendering | Version/addon compatibility | No native ABI | SELECTED |
| PTY | `node-pty` | Real PTY/ConPTY semantics | Native rebuild and release maintenance | High: Electron ABI and installer test | SELECTED with gate |
| Persistence | Small internal JSON adapter | Minimal dependency and explicit schema | Must correctly implement atomic/recovery behavior | Windows file locks/rename tests | SELECTED direction |
| Git | Direct CLI behind internal wrapper | Transparent, predictable, easy to diagnose | Must parse output and map failures | External Git detection required | SELECTED |
| JS/TS intelligence | Monaco TS worker or external TypeScript service | Monaco worker is lightweight; external service may improve project fidelity | Capability/project behavior must be measured | Worker/process packaging | TBD Phase 3 |
| HTML/CSS/JSON intelligence | Monaco workers | Built for editor integration | Confirm diagnostics/capability coverage | Worker packaging | TBD Phase 3 |
| Python intelligence | Pyright provider | Strong completion/diagnostics | Distribution and executable/package lifecycle | PATH/config and child-process packaging | TBD Phase 3 |
| TypeScript Run | `tsx`, `ts-node`, `tsc` + Node, native Node TS | Multiple viable UX choices | Semantics/version/config trade-offs | Must test Windows invocation/stop | TBD Phase 4 |
| Automated tests | `vitest` | Reuses Vite/TypeScript transform; unit, service, and adapter integration support | Keep Electron E2E separate until required | No native ABI; CI Node 22 compatible | SELECTED Phase 2A |

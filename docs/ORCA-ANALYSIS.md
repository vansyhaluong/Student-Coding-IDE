# Orca Reference Analysis

## Reference identity and method

- Repository: `https://github.com/stablyai/orca`
- Reference branch: `main`
- Reference commit: `4bb337741c335cfcc428d3b4271023566e2dadb8`
- Verification: the commit was fetched into a temporary directory outside Student Coding IDE and `git rev-parse HEAD` matched the locked SHA.

This document records observations, source evidence, risks, classification, and implications. Paths below are relative to the Orca reference checkout. No Orca source was copied or imported into Student Coding IDE.

## Classification summary

| Subsystem | Classification | Student Coding IDE implication |
|---|---|---|
| Electron lifecycle | ADAPT | Keep readiness/window/cleanup ownership; simplify to one V1 window |
| Main/preload/renderer boundary | ADAPT | Preserve secure boundary; replace broad bridge with small typed domains |
| Project/workspace | ADAPT | One active local folder project, no worktree/remote host model |
| Filesystem/explorer | ADAPT | Main-owned scoped I/O, lazy tree, watcher, exclusions |
| Monaco editor | ADAPT | Keep model/view-state lifecycle concepts with a smaller manager |
| Terminal | ADAPT | xterm.js + main-owned PTY, Windows-first and without agent coupling |
| Run service | ADD | Define a distinct trusted run lifecycle; Orca terminal/agent execution is not V1 Run |
| Git | ADAPT | Local CLI behind a small typed GitService; omit forge/hosted review complexity |
| Persistence/settings | ADAPT | Versioned app/workspace JSON with recovery, much smaller schema |
| UI shell | REIMPLEMENT | Independent React shell for Explorer/Editor/Panel/Status Bar |
| Language intelligence | ADD | Requirement-driven manager and explicit service states |
| Dependency status UX | ADD | Separate Git/runtime/language dependency state machines |
| AI/agent/worktree | OMIT | No V1 AI or worktree orchestration |
| Remote/cloud/mobile | OMIT | Local-only V1 |

`REFERENCE` applies to the evidence-gathering activity across all areas. `REIMPLEMENT` applies to every required V1 behavior: no Orca module is reused directly.

## A. Electron application lifecycle

### Observed architecture

Orca's main entry owns startup policy and wires many services before/around window creation. It supports single-instance behavior, URL/protocol handling, activation, renderer/GPU crash handling, coordinated shutdown, tray/update behavior, and multiple specialized windows. Development and packaged loads are selected during window creation.

### Source evidence

- `src/main/index.ts` — `app.on('open-url', ...)` near line 774; single-instance startup modules imported near line 212 and lock result near line 892.
- `src/main/index.ts` — `openMainWindow(...)` near line 1435 and `app.whenReady().then(...)` near line 2276.
- `src/main/index.ts` — `child-process-gone` near line 3127, `activate` near line 3302, `before-quit` near line 3459, `will-quit` near line 3481, and `window-all-closed` near line 3644.
- `src/main/window/createMainWindow.ts` — `createMainWindow` and BrowserWindow construction; development versus packaged URL/file load.
- `src/main/startup/single-instance-lock.ts` — single-instance acquisition and second-instance routing.

### Relevant patterns

- Main owns lifecycle and cleanup.
- Initialization has explicit readiness ordering.
- Shutdown waits for owned resources instead of assuming window closure is enough.
- Crash events are observable.

### Risks and simplification

`src/main/index.ts` is very large and startup is coupled to agents, worktrees, remote/runtime, update, and tray concerns. Student Coding IDE V1 needs one main window, deterministic service startup, and cleanup, but not Orca's orchestration depth.

**Classification: ADAPT.** Use a small application lifecycle coordinator and service registry; omit deep links, tray/background mode, multi-window, updater orchestration, and AI readiness gates unless separately required later.

## B. Main, preload, renderer, and IPC boundary

### Observed architecture

Orca uses context isolation and a preload `contextBridge`. IPC combines request/response (`invoke`) with renderer events (`on`) and commands (`send`). The preload API is typed, but one large object exposes many unrelated domains.

### Source evidence

- `src/preload/index.ts` — `const api` near line 560; repo/project APIs near lines 729–870; PTY API near lines 1078–1379; `contextBridge.exposeInMainWorld('electron', ...)` and `('api', api)` near lines 5253–5254.
- `src/main/window/createMainWindow.ts` — `webPreferences.sandbox: true` near line 120.
- `src/main/window/main-window-webview-security.ts` — forces `nodeIntegration = false`, `contextIsolation = true`, and `sandbox = true` near lines 98–105.
- `src/main/window/privileged-window-navigation.ts` — `setWindowOpenHandler` and `will-navigate` handlers.
- `src/main/window/attach-main-window-services.ts` — `setPermissionRequestHandler` near line 210.
- `src/main/ipc/register-core-handlers/register-core-handlers.ts` — `registerCoreHandlers(...)`, central registration of core IPC handler groups.

### Assessment

The security settings and privileged-process ownership are useful. The very broad preload and channel inventory increase audit surface and are influenced by Orca's larger product. Typed TypeScript declarations do not replace runtime validation. A generic command channel would be unsafe for Student Coding IDE.

**Classification: ADAPT.** Expose narrow domain APIs, validate every main-side payload, serialize domain errors, return unsubscribe functions for events, and never expose raw IPC, shell, or unrestricted filesystem access.

## C. Project and workspace management

### Observed architecture

Orca distinguishes repositories, projects, worktrees, folder workspaces, groups, and execution hosts. Persistence holds a catalog and per-session/worktree state. This supports agent and remote workflows beyond a conventional one-folder IDE.

### Source evidence

- `src/main/ipc/repos.ts` — `registerRepoHandlers(...)` near line 17; channels for `repos:*`, `projects:*`, and `folderWorkspaces:*`.
- `src/preload/index.ts` — `repos`, `projects`, and `folderWorkspaces` bridge objects near lines 729–870.
- `src/main/persistence/loading-store/project-collection-operations.ts` — `ProjectCollectionOperations` near line 49.
- `src/shared/execution-host.ts` and `src/shared/execution-host-registry.ts` — local/SSH/runtime execution-host identities.
- `src/main/worktree-root-preparation.ts` and `src/main/worktree-metadata-ownership.ts` — worktree lifecycle and metadata modules.

### Assessment

Canonical paths, explicit project lifecycle, recent items, and persistence are relevant. Worktrees, groups, remote execution hosts, and session orchestration are not V1 needs.

**Classification: ADAPT.** Define one active local folder project with a canonical root, recent-project catalog, close/switch guards, and workspace UI state. **OMIT** worktree and remote-host concepts.

## D. Filesystem and File Explorer

### Observed architecture

Filesystem access is main-side and exposed through handlers. Orca supports local and remote paths, authorization roots, mutations, list/read/write, watchers, retry/overflow behavior, and extensive remote/worktree handling. It uses `@parcel/watcher`.

### Source evidence

- `src/main/ipc/filesystem.ts` — `registerFilesystemHandlers(...)` near line 505; `fs:readFile` near line 581 and `fs:writeFile` near line 845; Node `readdir`, `readFile`, `writeFile`, `stat`, `lstat`, `rename`, and `rm` imports.
- `src/main/ipc/filesystem-allowed-roots.ts` — `getAllowedRoots(...)` near line 87.
- `src/main/ipc/filesystem-list-files.ts` — file listing and exclusion behavior.
- `src/main/ipc/filesystem-mutations.ts` — create/rename/delete operations.
- `src/main/ipc/filesystem-watcher.ts` — `registerFilesystemWatcherHandlers(...)` near line 1589, watch/unwatch handlers, retry and cleanup; `closeAllWatchers(...)` near line 1887.
- `package.json` — dependency `@parcel/watcher`.

### Assessment

Main ownership, allowed roots, typed file entries, watcher cleanup, and explicit errors are useful. Remote dispatch and full Orca watcher recovery machinery are excessive for V1. Symlinks can escape authorized roots if followed carelessly; large directories require lazy reads and exclusions.

**Classification: ADAPT.** Implement project-relative scoped operations, lazy directory loading, explicit symlink metadata, a project-scoped watcher, async cancellable search, and Windows path tests. Do not copy handlers.

## E. Monaco editor integration

### Observed architecture

Orca mounts Monaco through `@monaco-editor/react`, synchronizes externally supplied content, records/restores cursor and scroll state, handles editor mount/disposal, and has separate controllers for save queues, autosave, file watches, and conflicts.

### Source evidence

- `src/renderer/src/components/editor/MonacoEditor.tsx` — `MonacoEditor(...)` near line 48; lifecycle cleanup explanation near line 141; wrapper `saveViewState={false}` near line 264 because view state is managed explicitly.
- `src/renderer/src/components/editor/monaco-content-sync.ts` — `syncContentOnMount(...)` near line 62 and `syncContentUpdate(...)` near line 91.
- `src/renderer/src/components/editor/monaco-view-state-persistence.ts` — `installMonacoViewStateTracking(...)`, `restoreMonacoViewState(...)`, and `snapshotMonacoViewState(...)` near lines 13, 43, and 66.
- `src/renderer/src/components/editor/use-monaco-editor-mount.ts` — mount subscriptions and cleanup.
- `src/renderer/src/components/editor/editor-save-queue.ts` and `editor-autosave-controller.ts` — serialized save/autosave behavior.
- `src/renderer/src/hooks/editor-external-watch-event-reconciliation.ts` and `editor-external-watch-disk-verification.ts` — external-change reconciliation and disk verification.

### Assessment

Explicit model/view lifecycle, save serialization, and conflict awareness are valuable. Orca's editor includes markdown/diff/agent-specific behavior beyond V1.

**Classification: ADAPT.** Student Coding IDE separates Editor UI, EditorModelManager, and FileSystemService. One model maps to one canonical file; dirty state and version-safe saves are owned in the renderer; disk access remains main-side.

## F. Integrated Terminal

### Observed architecture

Orca uses xterm.js in the renderer and `node-pty` in main. It models PTY sessions, streams data and exit events over IPC, handles resize/input/reattach, detects shells, and contains extensive cleanup, descendant termination, persistence, remote, hidden-pane, and agent logic.

### Source evidence

- `package.json` — `@xterm/xterm`, xterm addons, and `node-pty`; optional `@vscode/windows-process-tree`.
- `src/renderer/src/components/terminal-pane/TerminalPane.tsx` — xterm terminal view and transport binding.
- `src/main/providers/local-pty-provider.ts` — `LocalPtyProvider` near line 449; `spawn(...)` near line 466; `onData`/`onExit` bindings near lines 1006/1027; `resize(...)` near line 1114; descendant-aware termination near lines 1195–1224.
- `src/main/ipc/pty/` and `src/main/ipc/pty.ts` — spawn/input/resize/kill/list handlers and cleanup exports.
- `src/preload/index.ts` — PTY request methods and data/replay/exit subscriptions near lines 1078–1379.
- `src/main/providers/local-pty-provider-windows-shell-launch.test.ts` — Windows shell launch coverage.

### Assessment

The library pairing and main-owned session model fit the requirement. `node-pty` is a native dependency with Electron ABI and packaging risk. Orca complexity is dominated by agents, hidden/background terminals, remote transport, replay, and persistent session recovery.

**Classification: ADAPT.** Select xterm.js + node-pty, keep only explicit V1 session lifecycle, Windows shell selection, resize/input/data/exit, and robust cleanup. **OMIT** agent ownership, remote terminals, and restoration of live sessions.

## G. Process execution and Run Service

### Observed architecture

Orca has powerful PTY/agent command execution and shared child-process helpers, but the inspected commit does not expose a small requirement-equivalent `Run Current File` service with language strategies, separated stdout/stderr, exit code, and Output-panel lifecycle. Treating PTY command injection as Run would conflate interactive terminal semantics with deterministic task execution.

### Source evidence

- `src/main/providers/local-pty-provider.ts` — interactive PTY lifecycle.
- `src/shared/child-process/run-process.ts` — lower-level bounded process execution utility.
- `src/main/pty-descendant-termination.ts` — descendant termination support.
- `src/shared/child-process/process-tree-termination.ts` — shared process-tree termination logic.
- No dedicated V1-style `run:start`, `run:stop`, or `RunService` contract was found under `src/main`, `src/preload`, or `src/renderer/src` at the locked commit.

### Assessment

Process ownership and cleanup concepts are reference material; the required product behavior is new.

**Classification: ADD.** Design RunService separately from TerminalService, using trusted strategies, executable/argument arrays, distinct stdout/stderr, exit metadata, cancellation, and Windows tree cleanup.

## H. Git integration

### Observed architecture

Orca executes the local Git CLI behind command runners and domain functions. It parses porcelain output, supports status/diff/staging/commit/branches, accounts for WSL and pathspecs, invalidates caches, and also includes extensive hosted-review/forge integrations.

### Source evidence

- `src/main/git/command-runner/git-exec-file.ts` — `gitExecFileAsync(...)` near line 118, buffer reads near line 133, and warning against sync Git on main near lines 197–206.
- `src/main/git/source-control/status-read.ts` — `getStatus(...)` near line 36 and porcelain-v2 streaming/parsing.
- `src/main/git/source-control/staging.ts` — `stageFile(...)`, `unstageFile(...)`, and bulk variants.
- `src/main/git/source-control/commit-changes.ts` — `commitChanges(...)` invokes `git commit -m` with argument arrays.
- `src/main/source-control/forge-provider.ts` and `hosted-review.ts` — GitHub/GitLab/Gitea/Azure/Bitbucket hosted-review concerns.
- `src/relay/git-handler.ts` — remote relay `git.exec`, evidence of non-local complexity that is not suitable for V1 renderer exposure.

### Assessment

Direct CLI behavior is transparent and debuggable, while a typed wrapper avoids shell injection and normalizes errors. Orca's forge, WSL, submodule, remote relay, review, and deep caching layers exceed V1.

**Classification: ADAPT.** Use direct local Git CLI behind a small GitService. Explicitly detect `AVAILABLE`, `MISSING`, or `INVALID_CONFIGURATION`; delegate credentials to Git/OS; omit hosted review and remote relay.

## I. Local persistence and settings

### Observed architecture

Orca uses a custom JSON persistence store in Electron user data, with loaded-state adaptation, migration, backups, write scheduling, and recovery. Its schema covers many agent/worktree/mobile concerns.

### Source evidence

- `src/main/persistence/loading-store/user-data-path.ts` — `initDataPath()` uses `app.getPath('userData')` and `orca-data.json` near lines 13–16.
- `src/main/persistence/loading-store/loaded-state-parsing.ts` — `LoadedStateParsingOperations`; JSON parsing and backup recovery near lines 68–187.
- `src/main/persistence/loading-store/backup-recovery-rotation.ts` — `BackupRecoveryRotationOperations`, rotating backup paths and validating JSON before restore.
- `src/main/persistence/loading-store/write-scheduling.ts` and `primary-state-writes.ts` — write coordination.
- `src/main/persistence/applying-settings/settings-update.ts` and `ui-state-update.ts` — settings/UI state updates.

### Assessment

User-data storage, version migration, serialized writes, backups, and recovery are appropriate concepts. One large multi-domain state file and its complex migrations are not.

**Classification: ADAPT.** Use small versioned app settings and per-workspace JSON documents with atomic replacement and last-known-good recovery. Keep source buffers out of persistence authority.

## J. UI architecture

### Observed architecture

Orca decomposes the root into background services, workspace shell, and root surfaces. It uses Zustand slices, app-level shortcut dispatch, persisted UI writers, theme hooks, sidebars, panels, tabs, and specialized activity/agent surfaces.

### Source evidence

- `src/renderer/src/App.tsx` — `AppBackgroundServices`, `AppWorkspaceShell`, and `AppRootSurfaces` rendered near lines 96–98.
- `src/renderer/src/app-shell/AppWorkspaceShell.tsx` — sidebar, central workspace, right sidebar, and titlebar composition.
- `src/renderer/src/store/index.ts` and `src/renderer/src/store/slices/` — Zustand application store composition.
- `src/renderer/src/app-shell/use-global-keybindings.ts` and `app-command-handlers.ts` — shortcut dispatch and command handlers.
- `src/renderer/src/app-shell/use-document-appearance.ts` — settings-driven theme application.

### Assessment

Shell regions and separating persistent from ephemeral state are useful. The visual design, two-sidebar/worktree navigation, global store breadth, and agent surfaces should not be copied.

**Classification: REIMPLEMENT.** Build an independent Application Shell with Explorer, Editor Area, Bottom Panel, and Status Bar. Select state tools only from demonstrated needs.

## K. AI, agent, and worktree boundary

### Observed architecture

AI/agent behavior crosses process startup, preload API, PTYs, worktrees, persistence, renderer stores, composer/chat UI, and remote execution hosts. That breadth explains much of Orca's complexity and demonstrates why core IDE services must not depend on AI lifecycle.

### Source evidence

- `src/main/codex/`, `src/main/claude/`, and `src/main/agent-hooks/` — provider and agent lifecycle modules.
- `src/main/worktree-root-preparation.ts`, `src/main/worktree-metadata-ownership.ts`, and `src/main/persistence/tracking-repos/` — agent/worktree state.
- `src/renderer/src/components/terminal-pane/agent-*` and `codex-*` — terminal ownership/completion coupling.
- `src/renderer/src/components/native-chat/` and composer hooks — agent UI integration.
- `src/preload/index.ts` — agent/provider/worktree API domains in the global bridge.
- `src/main/index.ts` — agent/runtime services participate in startup and shutdown.

### Assessment

**Classification: OMIT.** Student Coding IDE core services have no AI dependency. Future AI may consume explicitly permissioned editor/project APIs, but V1 does not create an agent lifecycle, worktree abstraction, provider bridge, or AI extension framework.

## L. Remote, cloud, and mobile concerns

### Observed architecture and evidence

- `src/main/ssh/`, `src/main/runtime/`, and `src/relay/` — remote execution and relay behavior.
- `src/main/ipc/mobile.ts` and `src/renderer/src/runtime/mobile-session-tab-close.ts` — mobile pairing/session concerns.
- `src/shared/execution-host.ts` — local, SSH, and runtime host identities used throughout project/file/process flows.
- `src/main/source-control/forge-provider.ts` — hosted provider behavior.

These introduce authentication, transport reconnect, execution-host routing, remote filesystem/Git/PTY behavior, and account/network failure modes.

**Classification: OMIT.** V1 is local-first on Windows. No remote workspace, cloud sync, collaboration, mobile, backend account dependency, or hosted-review provider is designed.

## Overall conclusions

Orca demonstrates sound concepts in privileged-process ownership, sandboxing, lifecycle cleanup, PTY operation, versioned persistence, explicit editor view state, and Git CLI abstraction. Its current structure also demonstrates the cost of letting AI, worktrees, remote hosts, and many product surfaces expand common boundaries.

Student Coding IDE will independently reimplement only requirement-backed behavior with smaller domain APIs, one local project, separate Terminal/Run/Language process semantics, explicit dependency states, and a Windows-first acceptance path.

# Student Coding IDE Architecture

## 1. Architecture goals

Student Coding IDE is an independent Electron + React + TypeScript desktop application. Orca is evidence for architecture study only; this design does not depend on Orca source, history, or runtime artifacts.

V1 architecture prioritizes:

- a complete local-first student workflow on Windows 10/11;
- a narrow Electron security boundary;
- explicit ownership of files, processes, state, and cleanup;
- responsive renderer behavior for I/O and long-running operations;
- graceful degradation when Git, runtimes, or current Monaco providers are unavailable;
- simple module boundaries that can support future formatter, debugger, and AI work without implementing them now.

The architecture is requirement-driven. It deliberately omits Orca's agent, worktree orchestration, remote execution, cloud, mobile, and hosted-review complexity.

## 2. Process model

```text
Renderer (sandboxed React UI)
  |-- Monaco models and editor UI
  `-- Phase 3 Monaco-native language providers/workers
        |
        | typed, validated preload API for privileged domains only
        v
Preload Bridge
        |
        | Electron IPC
        v
Main Process
  |-- Project / Filesystem / Search
  |-- Settings / Persistence / Git
  `-- Terminal / Run / Process Manager

Future external language providers, if authorized:
Main-owned LanguageServiceManager -> managed language-server child processes
```

The application starts as one main window in V1. The main process owns application readiness, window creation, dependency/service initialization, shutdown coordination, and cleanup of IDE-owned processes. Multi-window, deep links, custom protocols, and background/tray behavior are not V1 requirements.

### Process ownership matrix

| Capability | Owner | Reason |
|---|---|---|
| Electron lifecycle and windows | Main | Electron privileged API ownership |
| Filesystem and project search | Main | Path authorization and non-blocking I/O boundary |
| Terminal PTY | Main | Native process ownership and cleanup |
| Run execution | Main | stdout/stderr/exit/stop and process-tree lifecycle |
| Git CLI | Main | External executable and repository path validation |
| Settings and persistence | Main | Controlled local storage and atomic writes |
| Runtime/dependency detection | Main | PATH and configured executable validation |
| Current Phase 3 Monaco language providers | Renderer browser workers | No external process or privileged authority required |
| Future language-server processes | Main child processes | Isolation, lifecycle, logging, restart |
| Monaco and its browser workers | Renderer | Editor is a browser UI concern |
| Tabs, dirty state, view state | Renderer | Interactive editor state |
| Explorer, Problems, Terminal, Output, Git UI | Renderer | Presentation and user interaction |
| IPC contract implementation | Preload + Main | Capability-limited bridge and validation |

## 3. Main, preload, and renderer responsibilities

### Main process

The main process may access Node and Electron privileged APIs. It:

- creates and secures application windows;
- validates project roots and all filesystem paths;
- owns ProjectService, FileSystemService, SearchService, SettingsService, PersistenceService, TerminalService, RunService, GitService, DependencyDetectionService, ProcessManager, and any future external-language-service lifecycle;
- serializes domain errors across IPC;
- forwards scoped events only to live renderer subscribers;
- coordinates shutdown and cleans up PTYs, run processes, watchers, and any future language servers.

The main process must not expose a generic shell runner to the renderer. Long operations must be asynchronous and cancellable where required.

### Preload bridge

Preload is a thin adapter. It exposes domain APIs with explicit input/output types, not Electron primitives. It does not contain business logic, retain application state, or expose `ipcRenderer` itself.

Candidate public surface:

```text
window.studentIde.project
window.studentIde.file
window.studentIde.search
window.studentIde.terminal
window.studentIde.run
window.studentIde.git
window.studentIde.settings
window.studentIde.lifecycle
```

Current Phase 3 does not expose a language IPC domain. A future external
provider may add a narrow `window.studentIde.language` surface only after its
scope, contracts, and runtime validation are authorized.

### Renderer

The renderer owns React presentation and interaction state. It may request authorized operations through preload, but it cannot access Node, arbitrary filesystem paths, raw IPC, a shell, or child processes directly.

The renderer modules are:

- Application Shell;
- Project and Explorer UI;
- Editor UI and EditorModelManager;
- current Phase 3 language provider orchestration and Monaco workers;
- Problems UI;
- Terminal UI;
- Output UI;
- Git UI;
- Settings UI.

## 4. Service boundaries

| Module | Responsibility | Explicit non-responsibility |
|---|---|---|
| ProjectService | Open/create/close/switch one local folder project; validate root; persist minimal recent-project metadata needed by project lifecycle | User-facing Recent Projects UX/management, file content, editor tabs, Git behavior |
| FileSystemService | Scoped list/read/write/create/rename/delete/stat/watch operations plus authoritative active-project filesystem availability | UI state and Monaco models |
| SearchService | Async project search with exclusions, progress, cancellation token | Renderer traversal of project files |
| EditorModelManager | File-to-Monaco-model mapping, dirty status, view state, language id, disposal | Direct disk access |
| TerminalService | Interactive PTY sessions, input, resize, shell profiles, terminal exit | Run-button output semantics |
| RunService | Bounded non-interactive run sessions, stdout/stderr/exit/stop | Interactive shell sessions |
| ProcessManager | Internal registry and common child-process cleanup primitives | Generic renderer command execution |
| GitService | Typed local Git operations and error mapping | Hosted PRs, credentials UI, arbitrary Git command bridge |
| Renderer LanguageProviderManager | Current Monaco provider registry, capabilities, bounded source synchronization, diagnostics, status | Disk access, runtime execution, external process ownership, Problems presentation |
| Future Main LanguageServiceManager | External provider registry, lifecycle, validated routing, diagnostics, status | Runtime execution and Problems presentation |
| DependencyDetectionService | Detect runtimes, Git, and future language-service executables independently | Starting those services/processes |
| SettingsService | Validate/default/update user and workspace settings | Renderer-only transient state |
| PersistenceService | Versioned local serialization, atomic writes, recovery | Feature-specific policy |

## 5. IPC architecture

IPC contracts live in a shared, side-effect-free contract layer. Each domain defines request, success, error, and event payloads. Runtime input validation occurs in the main process even when TypeScript types exist.

### Interaction forms

- **Request/response:** finite operations such as `file:read`, `file:write`, `git:status`, or `settings:get`.
- **Event stream:** repeated output such as `terminal:data`, `run:stdout`, diagnostics, and watcher changes.
- **Lifecycle event:** service/session transitions such as `terminal:exit` and `run:exit`; a future external provider may add a scoped language-status event.
- **Cancellation:** an operation starts with an opaque operation/session ID and is cancelled through a domain-specific endpoint.

### Naming convention

Use `<domain>:<verb-or-event>` in lowercase kebab case. Candidate channels include:

```text
project:open            file:list-directory
project:close           file:read
search:start            file:write
search:cancel           file:changed
file:get-status         file:status-changed
terminal:create         terminal:event
terminal:input          terminal:resize
terminal:close
run:start               run:stdout
run:stop                run:stderr
run:exit                git:status
settings:update
```

No `language:start`, `language:restart`, or external-provider process channel is
part of Phase 3 V1.

Event subscriptions return an unsubscribe function. Main removes listeners when a WebContents or session is destroyed. Event payloads include a session/operation ID so stale output cannot update a replacement session.

### Errors

Thrown Node/Electron objects never cross IPC directly. Main maps them to:

```ts
type AppError = {
  code:
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'INVALID_INPUT'
    | 'DEPENDENCY_MISSING'
    | 'PROCESS_FAILED'
    | 'PROCESS_CANCELLED'
    | 'SERVICE_CRASHED'
    | 'UNSUPPORTED'
    | 'INTERNAL_ERROR'
  message: string
  operation?: string
  details?: Record<string, string | number | boolean | null>
  retryable: boolean
}
```

Messages are safe for users; developer details and stack traces remain in logs. Paths and command arguments that could contain secrets are redacted where appropriate.

## 6. State ownership

| State class | Examples | Owner/storage |
|---|---|---|
| Persistent app state | recent projects, theme, editor preferences, configured executable paths | Settings/Persistence in main |
| Workspace state | open tabs, active tab, panel visibility, optional cursor/view snapshots | Versioned state keyed by canonical project path |
| Editor state | Monaco models, dirty buffers, disk-missing/conflict state, selections, undo stack | EditorModelManager in renderer; never blindly overwritten by disk |
| Ephemeral UI state | dialogs, hover/loading state, menu state | React component/feature store only |
| Process state | terminal/run session IDs and lifecycle; future external-language sessions only if authorized | Owning main-process service |

React local state and focused feature stores are sufficient initially. Selection of a renderer store library is `TBD` until Phase 2 demonstrates cross-feature needs; Redux/Zustand is not selected solely because Orca uses Zustand.

## 7. Project and filesystem architecture

V1 has one active local folder project. Opening a project canonicalizes and validates its root. Every file operation carries a project ID plus a project-relative path; main resolves the path and verifies the result remains under the authorized root. Absolute unrestricted paths are not accepted from renderer domain APIs.

Explorer directories load lazily. The service returns typed entries with stable relative paths and file kind. Default exclusions for project search are `.git/`, `node_modules/`, `dist/`, `build/`, and `out/`. Search runs outside the renderer, streams bounded results/progress, and supports cancellation.

V1 watcher support is minimal and only required where necessary for Explorer refresh or external-file detection. FileSystemService publishes a project-scoped `AVAILABLE` or `UNAVAILABLE` state when watcher startup/runtime monitoring or the active root becomes unusable. Renderer mutations are disabled while that authority is unavailable; close and reopen/switch remain the recovery path.

Advanced watcher recovery, overflow handling, and complex external-conflict reconciliation are not Phase 2 acceptance criteria. Any watcher created for V1 is scoped to the active project and disposed on project switch or shutdown.

Symlinks are represented explicitly and are not traversed outside the project root by default. Delete/rename operations validate the target immediately before mutation. Phase 2B deletion is a main-owned, project-scoped move to the operating-system Recycle Bin after renderer confirmation; it never silently falls back to permanent deletion. Unsaved editor protection is resolved before close/switch, independently of filesystem deletion behavior.

## 8. Editor architecture

`Editor UI` mounts Monaco, renders tabs, prompts for unsaved changes, and translates user actions. `EditorModelManager` owns one Monaco model per canonical file identity and stores:

- URI and language ID;
- last disk version and current buffer version;
- dirty state;
- tab reference count;
- selection, cursor, and scroll state;
- external-change/conflict state.

`FileSystemService` alone reads and writes disk data. Opening creates or reuses a model after an async file read. Saving captures the intended buffer version, writes through IPC, and only marks clean if the model has not changed during the write. If an external watcher read authoritatively returns `NOT_FOUND`, the model retains its in-memory content and enters an explicit disk-missing state; normal save is blocked rather than silently recreating the path. Closing the final tab disposes its model unless retained by a deliberate workspace-cache policy. Project close disposes all models for that project.

Current Monaco providers consume model/document change events through renderer
adapters. Problems navigation opens the target model and reveals the exact
line/column. Theme and editor preferences are applied from settings. Large files
may disable expensive language features while preserving edit/save; Phase 3B
established the initial bounded thresholds recorded in Section 12.

## 9. Terminal architecture

The selected direction is xterm.js in the renderer and `node-pty` in the main process. The renderer terminal object is a view; the main `TerminalService` owns PTYs and the authoritative session registry.

A terminal session has `CREATING`, `RUNNING`, `CLOSING`, `EXITED`, or `FAILED`
state; ID, shell profile, cwd, and dimensions. IPC covers create, input, resize,
close, data, and exit. V1 supports multiple sessions but does not persist live
PTYs across application restarts.

The terminal IPC adapter exact-validates create/input/resize/close requests and
derives renderer ownership exclusively from the invoking WebContents. It routes
the typed event union on one `terminal:event` channel only to that live owner.
The preload exposes only those semantic operations and a validated,
unsubscribe-returning event API; it never exposes raw IPC. Actual WebContents
destruction or a new main-frame document load closes only that owner's sessions,
while React remounts and same-document navigation do not affect PTYs.

The Renderer keeps one session-scoped `TerminalController` outside the React
component tree. It owns stable xterm/FitAddon instances and host elements, one
preload event subscription, per-session sequence/write state, visible-only fit
observers, and local disposal. React owns Bottom Panel visibility, selected-tab
presentation, controls, and explicit focus requests only; component remounts do
not recreate xterm instances or destroy Main PTYs. The panel height is bounded
session-only UI state and is not persisted.

Main batches each session's ordered PTY output over a short 8 ms window and
bounds queued UTF-8 data to 64 KiB before forcing a flush. It keeps no output
history or replay buffer. Final session metadata is retained only in a bounded
256-entry tombstone set for idempotent close; native handles and listeners are
released on final exit.

Project close or switch acquires a Main-owned, project-scoped terminal transition
lease before renderer confirmation. The lease blocks new terminal creation and
drains creates already in flight so the transition cannot miss a PTY. Dirty
editor decisions are resolved before a separate destructive terminal warning.
After confirmation, Main closes only the old project's sessions and commits the
project transition only after cleanup succeeds. Cancellation, renderer loss,
timeout, or cleanup failure preserves both current project authority and any
terminal sessions not successfully closed; renderer state is reconciled only
after the authoritative project-changed event.

On Windows, the V1 shell profile resolves in this order: valid `pwsh`, Windows PowerShell, then `ComSpec`/`cmd.exe`. Phase 2E does not support a configured custom shell; user-configurable shell selection is deferred to Phase 6 Settings. The initial cwd is the active project root. `node-pty` is native and therefore requires a Phase 2 Windows/native compatibility spike before Terminal implementation is accepted. That spike verifies installation, Electron ABI compatibility, PTY startup inside Electron, PowerShell/cmd launch, input/output, resize, close, process cleanup, and native-module feasibility on Windows. Full packaged-app verification, release artifacts, installer work, and installer smoke testing remain Phase 7 responsibilities. Cleanup waits for exit evidence and escalates termination without targeting unrelated processes.

Phase 2E-J corrective Step 2 makes a Windows Job Object the primary V1 terminal
process-tree owner. The pinned `node-pty` 1.1.0 ConPTY source is patched
reproducibly so `CreateProcessW` receives `PROC_THREAD_ATTRIBUTE_JOB_LIST` in its
existing `STARTUPINFOEX` path. A new Windows terminal therefore starts already
inside its dedicated Job or creation fails closed. Main verifies a narrow native
capability marker before spawn; an upstream/unpatched binary cannot silently
serve a new production terminal.

The native layer retains each Job `HANDLE` behind an opaque integration-created
token. Root-process exit records a lifecycle fact but does not destroy that
registry entry, release ProcessManager responsibility, or finalize the terminal.
TerminalService funnels natural exit, explicit close, project cleanup, and
renderer-owner loss through one idempotent finalization task:
`TerminateJobObject`, bounded confirmation that
`JobObjectBasicAccountingInformation.ActiveProcesses == 0`, native handle
release, then ProcessManager/session release and exactly one terminal exit event.
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` is deliberately not enabled. A termination,
empty-confirmation, or release failure retains the token, handle, session, and
ProcessManager ownership and fails closed.

The prior fingerprinted `taskkill.exe /PID <pid> /T /F` backend remains only for
explicit legacy/unestablished-Job ownership. It still requires immediate OS
identity revalidation. It is forbidden once Job ownership was established and
is never attempted after Job termination failure. The process-tree seam and
native token remain Main-only; Renderer, preload, IPC, and shared terminal
contracts gain no PID, Job, executable, environment, signal, or kill authority.
V1 remains Windows 10/11 x64; packaged/installed verification remains Phase 7.

## 10. Run architecture

RunService is separate from TerminalService. A run session represents a command selected by a trusted language/project strategy, not arbitrary renderer text. It has `STARTING`, `RUNNING`, `STOPPING`, `EXITED`, `FAILED`, or `CANCELLED` state and emits separate stdout, stderr, and terminal exit metadata.

The main process starts it with an explicit executable, argument array, cwd, controlled environment additions, and `shell: false` when possible. Concurrent policy is one active run per run target in V1; starting a replacement asks or stops explicitly rather than orphaning the old process.

Stop terminates the IDE-owned process tree on Windows, waits for exit, then escalates within a bounded timeout. Application shutdown performs the same cleanup. The low-level ProcessManager may share process tracking and tree-termination utilities, but cannot erase semantic differences among run and PTY processes or any future external language-server process.

V1 built-in project run targets are Node.js projects. TypeScript execution remains
a decision gate described in `DECISIONS.md`. Python Run, framework auto-detection,
and Tier 3 built-in runners are future work.

## 11. Git architecture

GitService uses the local Git CLI through a typed wrapper. Calls use an executable plus argument array, never shell-concatenated commands. It provides dependency status, repository detection, status, stage/unstage, commit, branch list/current, switch, and bounded history. Output is parsed into domain types; cancellation and timeouts apply to long reads.

Git status is independent of editor, runtime, and language-service availability. Missing or invalid Git leaves the core editor operational and produces an explicit Source Control state. V1 delegates authentication to Git and the operating system; the IDE neither stores credentials nor implements hosted pull-request providers.

## 12. Language-service architecture

```text
Renderer LanguageProviderManager (Phase 3 V1)
  |-- Provider Registry
  |-- Capability Detection
  |-- Bounded Project Snapshot / Document Synchronization
  |-- Completion / Hover / Signature / Definition Routing
  |-- Diagnostics Routing
  `-- Worker Status and Cleanup
```

Phase 3 V1 selects Monaco-native workers/providers for JavaScript, TypeScript,
HTML, CSS, and JSON. C# and PHP use Monaco tokenization only. Each current
provider declares supported language IDs, capabilities, worker availability, and
document synchronization. Provider failure must not stop the editor or another
provider. Diagnostics from JavaScript, TypeScript, CSS, and JSON are normalized
with document URI, range, severity, message, source, and optional code, then
routed to model markers and Problems UI. HTML completion and hover use the
current Monaco HTML provider, but HTML diagnostics and Problems contribution are
deferred because that provider has no validation support. No alternate HTML
validator/provider is added in current V1.

JavaScript/TypeScript project visibility uses a bounded snapshot/source
synchronization strategy. It does not mirror all of `node_modules`, and it does
not expose the real canonical project root to Renderer merely for module
resolution. Dirty Monaco content takes precedence over an older project
snapshot. Phase 3B measurements support an initial 3C safety ceiling of 500
source files, 5 MiB total UTF-8 content, and 256 KiB per file. These are bounded
implementation defaults, not a promise to load every project file; 3C must keep
edit/save available when a source is excluded and may lower the bounds if live
responsiveness evidence requires it.

Candidate discovery reuses the existing validated, project-ID plus relative-path
FileSystemService capabilities. It traverses deterministically, excludes
`node_modules` and unsupported paths before content reads, checks file metadata
before reading, and stops at the count/byte bounds. Main remains disk authority;
the Renderer receives neither a canonical root nor arbitrary read capability.

Phase 3C implements this flow in the Renderer language feature. Initial project
activation builds background Monaco models for eligible `.js`, `.jsx`, `.ts`,
and `.tsx` sources. `EditorModelManager` adopts an existing URI model when a
file opens or is renamed, so one canonical model identity is retained and its
dirty buffer remains authoritative. Existing project-scoped file events update a
changed source incrementally; the existing coarse `renamed` watcher event causes
a bounded rescan/diff for create, delete, and filesystem rename awareness. No
polling, second watcher, new IPC, or disk authority is introduced.

The production controller serializes synchronization work and captures both
project and provider generations before asynchronous discovery/read operations.
Project switch, close, root unavailability, and renderer disposal invalidate
those tokens and dispose only provider-owned background models. Late work cannot
populate a newer project generation. Provider failure records a safe status but
does not change editor/save ownership; a later ordinary project initialization
can recover without manual restart UX or loss of dirty buffers.

When the active project root becomes `UNAVAILABLE`, project intelligence stops
and stale diagnostics are cleared. Editor buffers, syntax highlighting, and the
open project state remain intact. Project switch/close and renderer reload must
dispose synchronized sources, worker subscriptions, and stale markers scoped to
the prior project.

No external language-server process, Python dependency detection, or
process-control language IPC is authorized in current V1. If bounded project
snapshot data cannot reuse an existing project/file capability, it must use a
narrow project-scoped and runtime-validated Main/Preload contract; it grants no
canonical-root or arbitrary filesystem access. All Python and Java support is
deferred, not permanently removed. If a future phase adds an external provider,
Main owns `LanguageServiceManager`, executable selection, process lifecycle,
workspace scoping, restart, and cleanup; Preload exposes only a narrow typed and
runtime-validated domain bridge. Renderer never receives raw filesystem,
canonical-root, IPC, or process authority.

JSON schema resolution is offline and deny-by-default in current Phase 3. Phase
3D configures no schemas and disables schema requests. A later package may
register only explicitly bundled or application-trusted schemas; network schema
fetching requires a future recorded trust decision.

HTML, CSS, and JSON remain model-local Monaco providers rather than project
indexes. HTML supplies syntax, completion, and provider-supported hover. CSS and
JSON additionally supply diagnostics from current in-memory Monaco content;
their marker lifecycle follows model/provider disposal and feeds the renderer-
owned Phase 3E aggregation boundary. HTML has no current diagnostic source.

Phase 3D verifies this model-local path against the actual Monaco workers. HTML
completion (tags and attributes) and hover use the dirty in-memory model. CSS
completion, hover, validation, diagnostic updates, and diagnostic clearing use
the current model. JSON provides local schema-free completion where the worker
can infer peer properties, plus syntax diagnostics that update and clear after
edits; useful JSON hover is unavailable without a configured local schema.
Explicit remote `$schema` values do not trigger network access. Model removal
ends the worker mirror and diagnostic lifetime, while project switch/close keep
using the existing editor-owned disposal path.

Phase 3E consumes existing JavaScript, TypeScript, CSS, and JSON Monaco markers
without producing or rescanning diagnostics. A renderer-owned Problems store
normalizes provider/file replacement scopes, rejects stale project/provider
generations and model versions, groups by project-relative file identity, and
sorts deterministically by file and range. Project switch/close, root
unavailability, provider disposal, and renderer disposal remove their owned
state. HTML, C#, PHP, Python, and Java contribute no Problems diagnostics.

The existing Bottom Panel hosts Terminal and Problems as sibling tabs. Selecting
a problem uses the existing editor workspace flow to open or reuse the canonical
Monaco model, activate its tab, and reveal the diagnostic range. An already-open
dirty model remains authoritative and is never replaced by a disk read. Stale,
deleted, or old-project targets fail safely without recreating a file or exposing
canonical project-root data.

Current renderer providers expose only capability/status states that apply to
Monaco workers. The broader language-service state vocabulary
`NOT_CONFIGURED`, `MISSING`, `STARTING`, `RUNNING`, `STOPPED`, `CRASHED`, and
`INVALID_CONFIGURATION` is retained for providers where those states genuinely
apply, including a future external provider; external process discovery,
start/stop/restart/crash handling is not a Phase 3 V1 gate. Runtime detection
remains independent, with dependency states `NOT_CONFIGURED`, `MISSING`,
`AVAILABLE`, and `INVALID_CONFIGURATION`. `RunService` and Phase 4 have no
lifecycle coupling to language providers.

Current V1 has no user-facing language-service restart button, command, menu,
IPC endpoint, or new lifecycle UX. Renderer-owned providers may be disposed and
reinitialized when Monaco's existing architecture naturally supports recovery.
Recovery must preserve authoritative dirty EditorModelManager buffers and reject
stale project/provider generations. Manual external-server
start/stop/restart/crash UX remains future scope.

## 13. Persistence

Use versioned JSON under Electron's per-user application-data directory, separated into:

- an app-level settings/recent-projects document;
- workspace-state documents keyed by a stable hash of canonical project path.

Writes use temporary-file plus replace semantics, are serialized per document, and retain a last-known-good backup. Documents include `schemaVersion`; migrations are ordered, small, and tested. Invalid/corrupt state is quarantined or backed up, defaults are loaded, and the user receives a recoverable warning. Workspace state is convenience data and must never be the only copy of source content.

## 14. Cancellation and lifecycle

- Search uses an operation ID and cooperative cancellation; late result events are ignored.
- Run stop is a lifecycle transition with process-tree termination and final exit event.
- Terminal close terminates one PTY session; application shutdown closes all sessions.
- Git reads accept cancellation/timeout; mutating Git operations are not reported cancelled unless process exit and repository outcome are known.
- Current language requests may be cancelled when the Monaco provider supports it; worker recovery remains renderer-owned. External-provider stop/restart is a future lifecycle action.

Cancellation is domain-specific. There is no public generic cancellation or command API.

Application shutdown uses `RUNNING -> STOPPING -> STOPPED`. `STOPPING` blocks
new work while Main stops started services in reverse dependency order. A
service is released from `DesktopApplication` ownership only after its `stop()`
call succeeds. The WindowManager is the final recovery surface and stops only
after all other mandatory cleanup succeeds.

Cleanup failure propagates, retains the application in `STOPPING`, preserves the
failed service and its process/Job ownership, and prevents Electron's final quit.
A later graceful quit retries only retained cleanup; concurrent quit requests
share the in-flight shutdown. `STOPPED` means every required service cleanup,
including TerminalService Job finalization and ProcessManager release, has
succeeded. Only then does the Main-owned quit coordinator authorize one final
`app.quit()` pass. The recursive `before-quit` event and final window close pass
through that authorization without starting another cleanup transaction.

Window close requests route into the same Electron quit coordinator and remain
prevented while cleanup is pending or failed. `window-all-closed` also calls the
same intercepted `app.quit()` path on non-macOS platforms; it cannot bypass
mandatory cleanup. This policy covers graceful application shutdown only. It
does not claim cleanup guarantees for Task Manager force termination, power
loss, operating-system crashes, or equivalent unpreventable termination, and it
introduces no `app.exit()`, `process.exit()`, timeout force-quit, or force-quit
fallback.

## 15. Logging

Main, renderer, run/terminal, and current provider diagnostics have separate
sources and relevant operation IDs. Main owns persistent diagnostic logs and
rotation policy; renderer forwards structured diagnostics through a narrow
logging method if needed. External language-server process logs are a future
concern. Terminal content and run output remain user-visible session data rather
than general application logs.

User-facing errors explain action and recovery. Developer diagnostics include timestamps, component, operation/session ID, state transition, and redacted technical cause. Do not log secrets, environment dumps, file contents, Git credentials, or access tokens.

## 16. Security

The Phase 0 foundation already enables `contextIsolation`, disables `nodeIntegration`, and enables renderer sandboxing. Phase 1 finds no security blocker, but Phase 2 must preserve these rules:

- renderer has no direct Node/Electron access;
- preload exposes only domain methods and never raw `ipcRenderer`;
- main validates payload shape, project identity, path scope, session ownership, and allowed operation;
- no generic shell command or unrestricted filesystem bridge;
- external URLs allow only explicit safe protocols and open through a validated main-process handler;
- navigation away from the packaged/development renderer origin is blocked;
- no unsafe `eval`, arbitrary preload exposure, or secret logging;
- all listeners and privileges are released with their owner.

## 17. Windows considerations

- Canonicalization accounts for drive letters, case-insensitive comparison, UNC paths, separators, reserved names, and long paths.
- Use Node path APIs; never concatenate filesystem separators.
- Executable detection checks configured absolute path first, then the effective `PATH`, and reports invalid configuration separately from missing dependency.
- PTY selection and shell arguments are Windows-aware; PowerShell and `cmd.exe` quoting are not interchangeable.
- Run/Git use executable plus argument arrays and avoid `shell: true`.
- Process stop validates ownership and terminates descendants without broad process-name killing.
- The Phase 2 native compatibility spike must confirm that `node-pty` installs, matches the Electron ABI, starts inside Electron, handles PowerShell/cmd, input/output, resize, close, and owned-process cleanup on Windows.
- Phase 2E-H recorded actual Windows x64/ConPTY behavior and implemented ADR-020's verified targeted owned-root process-tree termination. V1 intentionally retains the Windows 10/11 x64 label without deriving a minimum build from the evidence host. Phase 2E-I retains Ubuntu CI as the portable automated gate and requires recorded actual-Windows Electron evidence for terminal-affecting work; Phase 7 owns packaged/installed Windows CI and release acceptance.
- Phase 7 verifies native-module inclusion in the full packaged application, release artifact, installer, CI packaging path, and Windows installer smoke test.
- Watcher behavior, locked files, antivirus delays, and atomic-replace fallbacks require Windows integration tests.

## 18. Future extension boundaries

Formatter integrates through an editor command/provider boundary; debugger through a future DAP-oriented service; AI through an optional, separately permissioned feature boundary. None is implemented or required for V1. Cloud, collaboration, remote workspaces, mobile, extension host/marketplace, worktree orchestration, and AI agent process hooks are omitted.

## 19. Phase boundaries

- Phase 2 implements project, explorer, editor, unsaved protection, search, and terminal against these contracts. ProjectService may persist the minimal recent-project metadata required for project lifecycle; it does not implement the user-facing Recent Projects management experience.
- Phase 3 implements Monaco-native intelligence for JavaScript, TypeScript,
  HTML, CSS, and JSON; syntax-only C#/PHP; and Problems integration without
  changing privileged boundaries. All Python support and Java support are
  deferred to a future authorized phase.
- Phase 4 implements trusted run strategies and Windows process-tree cleanup.
- Phase 5 implements GitService.
- Phase 6 completes settings, dependency configuration UX, and the user-facing Recent Projects UX and management experience.

Any required deviation must be recorded in `DECISIONS.md` before implementation changes the architecture.

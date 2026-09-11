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

Phase 5.5 C# language intelligence after the 5.5B hard gate:
Main-owned LanguageServiceManager -> app-owned pinned csharp-ls child process
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
| Phase 5.5 C# language-server process | Main child process | Isolation, project scope, lifecycle, protocol routing, and cleanup |
| Monaco and its browser workers | Renderer | Editor is a browser UI concern |
| Tabs, dirty state, view state | Renderer | Interactive editor state |
| Explorer, Problems, Terminal, Output, Git UI | Renderer | Presentation and user interaction |
| IPC contract implementation | Preload + Main | Capability-limited bridge and validation |

## 3. Main, preload, and renderer responsibilities

### Main process

The main process may access Node and Electron privileged APIs. It:

- creates and secures application windows;
- validates project roots and all filesystem paths;
- owns ProjectService, FileSystemService, SearchService, SettingsService, PersistenceService, TerminalService, RunService, GitService, DependencyDetectionService, ProcessManager, and the Phase 5.5 C# LanguageServiceManager lifecycle;
- serializes domain errors across IPC;
- forwards scoped events only to live renderer subscribers;
- coordinates shutdown and cleans up PTYs, run processes, watchers, and the C# language server.

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

Phase 5.5 adds a narrow `window.studentIde.language` semantic surface. It exposes
typed C# capability requests, document synchronization, diagnostics/status
events, and cancellation only. It never exposes raw LSP/JSON-RPC, process
controls, executable details, cwd, spawn arguments, or canonical project roots.

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
| Main LanguageServiceManager | Phase 5.5 C# session registry, `csharp-ls` lifecycle, validated semantic routing, synchronization, diagnostics, status, and cleanup | Runtime execution, Monaco presentation, Problems presentation, or generic process control |
| DependencyDetectionService | Detect runtimes, Git, and C# language-service dependencies independently | Starting those services/processes |
| SettingsService | Validate/default/update user and workspace settings | Renderer-only transient state |
| PersistenceService | Versioned local serialization, atomic writes, recovery | Feature-specific policy |

## 5. IPC architecture

IPC contracts live in a shared, side-effect-free contract layer. Each domain defines request, success, error, and event payloads. Runtime input validation occurs in the main process even when TypeScript types exist.

### Interaction forms

- **Request/response:** finite operations such as `file:read`, `file:write`, `git:status`, or `settings:get`.
- **Event stream:** repeated output such as `terminal:data`, `run:stdout`, diagnostics, and watcher changes.
- **Lifecycle event:** service/session transitions such as `terminal:exit` and `run:exit`; Phase 5.5 C# adds scoped language-status events.
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

No public `language:start`, `language:stop`, `language:restart`, raw-log, or
external-provider process channel is part of V1. Phase 5.5 language IPC uses
semantic operations and Main-owned lazy lifecycle only.

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
| Process state | terminal/run session IDs and lifecycle; one active-project C# language session | Owning main-process service |

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

The main process starts it with an explicit executable, argument array, cwd,
controlled environment additions, and `shell: false`. V1 permits one active run
per target. Re-running the same target stops its current run, awaits successful
cleanup, and only then starts the replacement, without a confirmation prompt.
Sessions for the same target must never overlap; cleanup failure blocks replacement.

Main resolves Node from its process PATH in Phase 4 V1. Missing Node produces a
safe `MISSING` state and blocks Run with an actionable message. No bundled Node,
configured absolute Node path, or Node-path Settings UI is included; configured
Node paths are future Settings scope. Renderer has no executable selection authority.

Dirty active targets block Run with a Save-first message. No auto-save, stale-disk
execution, temporary-file execution, or mutation of the authoritative editor
buffer is allowed. The single primary Run button sits on the right side of the
editor header. Output is a sibling of Problems and Terminal in the existing
Bottom Panel; there is no competing panel system or Terminal redesign.

After project close/switch confirmation, stop all old-project Run sessions and
await successful cleanup before committing the transition. Failure preserves
current project/editor state. Root unavailability stops project-owned runs and
rejects stale events; old-project output cannot mutate replacement project UI.
Run cleanup integrates with existing transition/shutdown ownership, without
changing Terminal behavior. Windows piped-process ownership feasibility must
be established before production Run lifecycle implementation.

The user accepted the isolated native spike as evidence for creation-time Job
ownership with separate pipes, including descendants surviving root exit. This
does not verify production Electron binding or packaging. Later native cleanup
must account for Job empty, root exit, both pipe EOFs, and native handle release;
Job accounting alone is insufficient.

4A implements only preparation/contract foundations. RunService uses an injected
Main-only authorization/runtime seam and owns immutable STARTING preparations
with opaque IDs and renderer-owner checks. Duplicate target preparations must
be released before another can be reserved; this is not user-facing re-run
behavior. 4C must stop/clean the old execution before replacement. No preparation
spawns a process or transitions to RUNNING. Filesystem existence/canonical scope,
active-project availability, and final pre-spawn revalidation belong to the
later concrete authority; current-editor/dirty tracking remains Renderer-owned
and a renderer dirty flag must not be mistaken for disk authorization.

4B adds a Main-only Windows x64 Node-API piped-process adapter and PATH Node
detection. The native binding creates the process suspended with creation-time
Job ownership and explicit inherited pipe handles, installs asynchronous bounded
pipe observers, then resumes it. Release requires root exit, both delivered EOFs,
drained callbacks, and an empty Job. RunService's internal launch seam registers
ownership before native creation and retains it when cleanup fails. ProcessManager
and Terminal semantics are unchanged. The production build emits the native
artifact beside the Main-only runtime entry; portable builds skip native compilation
and unsupported hosts fail closed when constructing the adapter.

4C implements semantic start/stop and per-canonical-target serialized re-run in
RunService using the existing RunSession states. Different targets can run
concurrently. Run events carry immutable session snapshots and are routed to the
owning window's injected Main event sink; callbacks must match both the exact
live session record and its target record. Finalized/old callbacks are ignored.
Root exit initiates cleanup of any surviving descendants; exit events are emitted
only after root exit, both EOFs, native release and successful cleanup. Natural
exit 0 becomes EXITED, non-zero/observation failure becomes FAILED, and explicit
Stop before root exit becomes CANCELLED. Cleanup failure remains STOPPING with a
safe retryable error and retained ownership; it cannot unblock a replacement.
ProcessManager's existing cleanupOwner method uses a unique per-session resource
owner key to await/share/retry cleanup without stopping other targets. Registration
is removed only after successful finalization. A bounded 128-entry completed
snapshot cache makes recent duplicate/late Stop idempotent without retaining output
or native resources; unknown/evicted or foreign session IDs fail closed.
The Main-only preparation and launch seams remain available for foundation tests.
Actual filesystem authority composition, project transitions, application shutdown,
live IPC event routing and UI are still later-package work; no Run capability is
wired into the live renderer by 4C.

4D composes Run in Main and adds RunProjectLifecycle as a managed service. Its
ProjectService guard is registered after UnsavedTransitionService, preserving
existing dirty/save/discard/cancel and Terminal confirmation/cleanup behavior.
Only post-confirmation does it acquire a Run start-blocking lease and await
project-owned cleanup. The lease survives asynchronous project creation/persistence
until the existing project-changed or transition-failed notification. Failed
cleanup throws a safe domain error before mutation and retains retryable ownership.
No new transition queue or shutdown coordinator is introduced.

Existing FileSystemService status subscriptions drive unavailable-project cleanup;
there is no Run watcher. Events are muted immediately for unavailable sessions,
while native exit/EOF accounting continues internally. Generation checks invalidate
asynchronous starts across leases, unavailability and reopen, including immediately
before native creation. Pending starts and cleanup request promises are awaited so
the small interval between session finalization and ProcessManager tracking removal
cannot let a transition finish early. FileSystemService.authorizeRunFile provides
Main-only regular-file/canonical-root/availability checks through its existing path
resolver; no canonical paths are returned over IPC.

DesktopApplication STOPPING immediately blocks new Run starts and event delivery.
RunProjectLifecycle.stop awaits RunService cleanup in the existing reverse service
order, before unsaved/project/filesystem/ProcessManager dependencies stop. Failures
retain STOPPING and the failed service for retry under ADR-021; WindowManager remains
shutdown-last. Main routes only existing session DTO events to their owner; Run
invoke handlers/preload APIs and UI are still not exposed. Shared Main build chunks
remain beside the entry so the verified native/ binding path survives Rollup sharing.

4E registers the 4A IPC/Preload factories as studentIde.run with start, stop and
onEvent only. Main observes Run owners before dispatch and invalidates pending
starts on renderer navigation/destruction. Owner cleanup remains in RunService,
using existing ProcessManager release/retry semantics; no renderer execution
options or independent shutdown coordinator are introduced.

The existing editor-tabs header hosts one right-aligned Run entry point and
contextual Stop. It uses the active EditorModelManager file, dirty/disk/conflict
state and project availability for presentation guards; Main remains final disk
and runtime authority. Missing Node is reported from the start result without a
new dependency-query API. Re-run sends the same semantic start; Main stops/releases
the old session before emitting the replacement. Pending IPC is view state only.

The focused Output RunController projects authoritative session DTOs into
per-target output views, preserving distinct streams and delivery order. It accepts
new session identities only for its outstanding start, ignores superseded events,
and never replaces a newer event state with an older invoke response. Output
notifications batch per animation frame. Project/availability changes invalidate
pending replies, clear views and scheduled frames; one application-level Run
subscription survives panel switches and is removed on unmount. Output uses the
existing Bottom Panel tab/height/PanelResizer pattern and CSS tokens. No global
all-domain store or new ADR-011 selection is introduced.

RunSession/event DTOs carry no executable, native handle, cwd, args,
environment, or canonical root. Internal PreparedRun is never a wire DTO.

Stop terminates the IDE-owned process tree on Windows, waits for exit, then escalates within a bounded timeout. Application shutdown performs the same cleanup. The low-level ProcessManager may share process tracking and tree-termination utilities, but cannot erase semantic differences among run, PTY, and external language-server processes such as Phase 5.5 C#.

Phase 4 V1 runs only the current authorized JavaScript `.js` file inside the
active project via Node.js. Built-in Run Project, npm/package-manager scripts,
dev-server orchestration, project entry configuration, and framework/project
launcher logic are deferred. Future Run Project requires an explicitly authorized
entry/script policy.

RunService selects a narrow internal RunStrategy that supports a target and
prepares the explicit executable, arguments, cwd, and controlled environment
additions. JavaScriptRunStrategy is the only concrete Phase 4 V1 strategy. This
is not a plugin system or a renderer execution capability.

TypeScript Run is deferred, not permanently rejected; Phase 3 TypeScript
intelligence remains supported. A future authorized phase may add
TypeScriptRunStrategy without redesigning core RunService after ADR-014 decides
and verifies runtime, tsconfig, and compile/transpile policy. No TypeScript
runtime, compile/transpile strategy, ts-node, tsx, or Node-native TypeScript
execution policy is selected for V1. No placeholder TypeScript strategy or Run
dependency is introduced. ADR-014 does not block Phase 4 JavaScript Run. Python
Run and Tier 3 built-in runners remain future work.

## 11. Git architecture

GitService uses the local Git CLI through a typed wrapper. Calls use an executable plus argument array, never shell-concatenated commands. It provides dependency status, repository detection, status, stage/unstage, commit, branch list/current, switch, and bounded history. Output is parsed into domain types; cancellation and timeouts apply to long reads.

Git status is independent of editor, runtime, and language-service availability. Missing or invalid Git leaves the core editor operational and produces an explicit Source Control state. V1 delegates authentication to Git and the operating system; the IDE neither stores credentials nor implements hosted pull-request providers.

Phase 5A resolves Git from Main's process `PATH` only. A validated `git.exe` is
`AVAILABLE`; a completed lookup with no usable executable is `MISSING`.
`NOT_CONFIGURED` and configured-path `INVALID_CONFIGURATION` remain public
contract states reserved for future configured-path support. Repository probing
uses only fixed Main-owned arguments and the authorized canonical project root
as cwd. A working tree is accepted only when Git's canonical top-level root
equals that project root using platform-correct identity comparison; an ordinary
non-Git folder or a project nested inside a parent repository is the normal
`NOT_REPOSITORY` state.

Before filesystem canonicalization, Git top-level stdout must contain exactly
one fully-qualified path (with at most one terminal LF/CRLF). Windows drive and
UNC syntax is validated in full; relative/current-drive paths, malformed path
components, NUL/control characters and extra lines fail with `PROCESS_FAILED`.
Unvalidated output never reaches `realpath` or resolves against process cwd.
Canonical comparison continues to use the existing Windows case/separator-aware
project identity. The finite runner settles only after child `close`, including
spawn failure and cancellation, so exit/PID state alone cannot claim cleanup.

Phase 5D composes GitService through GitOperationLifecycle and a Main-only
GitOwnedCommandRunner. Each request has a project/owner generation and request
identity; Main rejects obsolete reads and Preload rejects replies superseded
while in transport. Project changes, root unavailability, renderer navigation/
destruction and application shutdown invalidate the appropriate work. A project
transition waits for Git operations and owned cleanup before releasing authority.
Mutations are serialized. Cancellation stops preparation; after mutation dispatch,
the bounded command drains and preserves applied or explicitly unknown outcomes,
without automatic retry. Stale applied outcomes discard their status snapshot.

Git document ownership is established by Main before window load. Navigation
start revokes the previous document; only a committed current main-frame event
restores availability. Both Git context and operation IPC verify Electron's
sender frame against the committed `processId`/`frameToken` values, reject
detached/disposed frames and never restore ownership on request. These frame
values stay inside Main; shared Git DTOs and Renderer authority are unchanged.

On Windows, the production Git runner creates each process inside an atomic
Windows Job using the existing private native pipe/ownership primitives. A Git
root exit terminates surviving owned hook descendants; release requires root
exit, both pipe EOFs, native settlement and an empty Job. Cleanup failure retains
ownership and blocks new work, project release and application shutdown until a
cleanup retry succeeds. Run retains its separate single-target native entry and
semantic lifecycle. No generic process capability crosses Preload.

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

Phase 3 V1 selected Monaco-native workers/providers for JavaScript, TypeScript,
HTML, CSS, and JSON. C# and PHP used Monaco tokenization only in that completed
phase. Each current
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
process-control language IPC was authorized in Phase 3. If bounded project
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

### Phase 5.5 C# external-provider design

Phase 5.5 is a newly authorized V1 extension; it does not rewrite the completed
Phase 3 C# syntax-only history. Syntax remains Monaco tokenization. Completion,
hover, signature help, definition, and diagnostics use `csharp-ls` through a thin
semantic LSP↔Monaco adapter. References, rename, code actions/quick fixes,
refactoring, formatter, advanced semantic tokens, Razor, metadata/BCL/generated
virtual-document navigation, debugger, C# Run, workspace diagnostics, and loose
`.cs` full intelligence remain deferred.

Main owns `LanguageServiceManager`, the `csharp-ls` child process, JSON-RPC/LSP
connection, real workspace paths, session state, request cancellation, opaque
completion-resolve handles, diagnostics result IDs, and bounded shutdown/cleanup.
The Phase 5.5B verified stack is `csharp-ls` 0.27.0,
`vscode-languageserver-protocol` 3.18.3, and `vscode-jsonrpc/node` 9.0.2.
Production uses the app-owned pinned server. Development may first use a
project-private provider and then PATH fallback.

The renderer registers Monaco providers per semantic capability and maps only
typed semantic DTOs. Public requests carry `projectId` and project-relative path;
Main resolves and canonicalizes the real path and derives ownership from trusted
Electron sender/document identity. The public bridge contains no raw LSP or
JSON-RPC message, PID, executable path, cwd, spawn argument, canonical project
root, diagnostic `resultId`, or general process control. Definition targets are
accepted only when they are `file:` URIs inside the canonical active project
root. Metadata and external targets return an unsupported result in V1.

#### Workspace selection

Both `.sln` and `.slnx` are solution candidates. A saved valid selection is
reused. Exactly one candidate is selected automatically. Multiple candidates
require a user selection which is remembered per project. When there is no
solution but one or more `.csproj` files exist, the session uses project mode.
Main may perform bounded discovery only for preflight and UX in project mode;
the current `csharp-ls` owns actual recursive project discovery/loading, so Main
does not claim control over the exact loaded project set. With no solution or
project, C# remains syntax-only. The IDE never creates a temporary solution.

Workspace readiness is an independent Main-owned state: `READY`,
`SELECTION_REQUIRED`, `NO_CSHARP_WORKSPACE`, or `PREFLIGHT_FAILED`. After
selection and before provider startup, Main probes the effective SDK with
`dotnet --version`, parses a selected `.sln`/`.slnx` with `dotnet sln <path>
list`, extracts listed `.csproj` path tokens without matching localized prose,
bounded-discovers projects in project mode, and evaluates each selected/discovered
`.csproj` with evaluation-only MSBuild `-getProperty`/`-getItem` JSON. Main also
validates evaluated `ProjectReference` paths for containment and existence. All
commands use executable/argument arrays, bounded discovery/output/time, and no
requested build, restore, or target. A preflight failure leaves the semantic
service stopped. The preflight must not write the workspace or create a solution.

`READY` guarantees only that SDK selection, solution parsing where applicable,
bounded project evaluation, and explicit project-reference checks passed. It
does not guarantee that `csharp-ls` later creates or loads an equivalent Roslyn
workspace. In particular, evaluation-only MSBuild does not prove targeting-pack
availability. This bounded false-positive risk is accepted for V1 and is kept
honest in the public state rather than inferred from provider log text.

#### Dependency and lifecycle

The C# language-service dependency requires .NET SDK 10 or newer, with .NET 10
LTS as the V1 acceptance baseline. Main probes the effective process PATH and
uses `dotnet --list-sdks`; Renderer cannot choose or probe executables. Dependency
state is independent of service lifecycle: `MISSING` and
`INVALID_CONFIGURATION` describe dependency failures, while `STOPPED`,
`STARTING`, `RUNNING`, and `CRASHED` describe a usable dependency's service.
`NOT_CONFIGURED` is reserved for future configured-path support.

`RUNNING` means only that the owned `csharp-ls` process is alive and its LSP
session initialized successfully. It does not assert Roslyn workspace health.
Empty completion, null hover, empty definition, or no diagnostics are valid
semantic outcomes and never drive workspace readiness. Human-readable provider
messages remain redacted Main-only diagnostics and never drive the production
state machine.

Startup is lazy with at most one C# session for the active project. Main performs
LSP `initialize`, then `initialized`, and negotiates UTF-16. Unexpected process
exit transitions the service to `CRASHED`; V1 has no automatic restart loop or
public manual start/stop/restart surface. Project close/switch, renderer owner
loss, root unavailability, and application shutdown invalidate session work and
reject stale results. Graceful shutdown orders invalidate/cancel → LSP
`shutdown` → response → `exit` → bounded process and descendant cleanup.

The authorized 5.5D C# native entry point supplies stdin/stdout/stderr pipes and
atomic Windows Job membership at creation. Root exit does not release ownership.
Finalization terminates the Job, confirms it empty, drains I/O, and releases;
failure retains ownership for a later cleanup attempt. This is Main-only and
does not change Terminal, Run, or Git behavior.

#### Document synchronization and diagnostics

The Monaco dirty buffer is authoritative. An open C# model sends `didOpen`, then
ordered incremental `didChange`, optional `didSave`, and `didClose`; Monaco model
version is the LSP document version. Ordered batching is allowed, but changes may
never be dropped, and pending changes must flush before semantic requests. Every
response is guarded by project, session, document, and where applicable model
version. Existing FileSystemService watcher events supply filesystem awareness;
open/dirty document synchronization wins over watcher disk content.

C# V1 uses pull diagnostics for open documents. Diagnostic `resultId` stays in
Main, while normalized typed diagnostics feed Monaco markers and the existing
Problems aggregation/navigation path. Workspace diagnostics are deferred.
Provider and document disposal clear only their owned C# markers and reject late
results without changing editor/save ownership.

HTML, CSS, and JSON remain model-local Monaco providers rather than project
indexes. HTML supplies syntax, completion, and provider-supported hover. CSS and
JSON additionally supply diagnostics from current in-memory Monaco content;
their marker lifecycle follows model/provider disposal and feeds the renderer-
owned Phase 3E aggregation boundary. HTML has no current diagnostic source. C#
diagnostics join that aggregation boundary only through Phase 5.5.

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
state. In completed Phase 3, HTML, C#, PHP, Python, and Java contributed no
Problems diagnostics. Phase 5.5 adds C# diagnostics without altering that history.

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
apply. Phase 5.5 applies the external-service subset documented above; external
process discovery and lifecycle were not a Phase 3 V1 gate. Runtime detection
remains independent, with dependency states `NOT_CONFIGURED`, `MISSING`,
`AVAILABLE`, and `INVALID_CONFIGURATION`. `RunService` and Phase 4 have no
lifecycle coupling to language providers.

Current V1 has no user-facing language-service restart button, command, menu, or
IPC endpoint. Renderer-owned providers may be disposed and
reinitialized when Monaco's existing architecture naturally supports recovery.
Recovery must preserve authoritative dirty EditorModelManager buffers and reject
stale project/provider generations. The Phase 5.5 C# service exposes status UX
but no public manual lifecycle API or automatic restart loop.

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
- Current Monaco-worker requests may be cancelled when supported; worker recovery remains renderer-owned. Phase 5.5 C# semantic requests support cancellation while service lifecycle remains Main-owned.

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

Main, renderer, run/terminal, and provider diagnostics have separate sources and
relevant operation IDs. Main owns persistent diagnostic logs and rotation policy;
renderer forwards structured diagnostics through a narrow logging method if
needed. Phase 5.5 keeps `csharp-ls` logs Main-only and redacted; no raw log API is
public. Terminal content and run output remain user-visible session data rather
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
- Phase 4 Node detection uses only Main's process `PATH`; configured absolute
  Node paths and their Settings UI are deferred. For future authorized configured
  executable support, detection checks configured absolute path first, then the
  effective `PATH`, and distinguishes invalid configuration from missing dependency.
- PTY selection and shell arguments are Windows-aware; PowerShell and `cmd.exe` quoting are not interchangeable.
- Run/Git use executable plus argument arrays and avoid `shell: true`.
- Phase 5.5 C# dependency detection uses Main's PATH plus `dotnet --list-sdks`;
  .NET 10 LTS is the acceptance baseline for running `csharp-ls`.
- Phase 5.5 C# workspace preflight uses `dotnet`/MSBuild without shell execution,
  build, restore, or targets; Windows exit codes, timeouts, path containment, and
  bounded discovery/output are interpreted structurally rather than by matching
  localized human-readable error text.
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
- Phase 5.5 extends C# from its completed Phase 3 syntax-only baseline with a
  Main-owned `csharp-ls` service and semantic Monaco providers. Phase 5.5B is a
  hard compatibility gate before 5.5C–5.5H; packaged/installed acceptance stays
  in Phase 7.
- Phase 6 completes settings, dependency configuration UX, and the user-facing Recent Projects UX and management experience.

Any required deviation must be recorded in `DECISIONS.md` before implementation changes the architecture.

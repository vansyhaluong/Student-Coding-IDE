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

## Phase 2B — Project & File Explorer

### Project and filesystem implementation

- Added one-active-project open, empty-project creation, close, and switch flows through main-owned folder selection and canonical project identity.
- Added a mandatory transition-guard boundary for every project close/switch path without implementing Phase 2C dirty-editor decisions.
- Integrated minimal recent-project metadata with the existing versioned persistence service.
- Added a main-owned FileSystemService for immediate-child listing, stat, UTF-8 read, exclusive file/folder creation, non-overwriting rename, and Recycle Bin deletion.
- Added repeated project authorization, lexical containment, canonical containment, Windows path/reserved-name checks, and symlink-escape rejection immediately before privileged mutations.
- Added a bounded native watcher for the active project with switch, close, shutdown, runtime-error, and stale-event cleanup.

### Contracts, bridge, and UI

- Added explicit validated `project:*` and `file:*` request/event contracts and dedicated IPC adapters.
- Extended the preload API only with typed `project` and `file` capabilities; raw IPC, Electron, filesystem, shell, and generic command capabilities remain unavailable to Renderer.
- Added a responsive Project/Explorer UI with no-project, loading, empty, error, selected-entry, refresh, and mutation states.
- Added lazy directory expansion that requests only the root or explicitly expanded immediate children, plus a read-only file preview without Monaco, tabs, editing, or save behavior.
- Added explicit Renderer confirmation before every delete; Main uses Electron Recycle Bin handling and never falls back to permanent deletion.
- Realigned the Phase 2B Renderer with Orca's locked visual/interaction baseline through an independently implemented dark IDE shell, compact project controls, dense Explorer rows and toolbar, restrained states, and compact workspace/status chrome; removed the unapproved bespoke student-workbench styling without changing Phase 2B behavior.
- Recorded Orca as the primary visual and interaction reference for future visible IDE UI while preserving Student Coding IDE requirements, architecture, security boundaries, source independence, and scope authority.

### Verification and scope boundary

- Fixed the Explorer mount guard for React StrictMode so a successful initial root listing is applied after the development-only effect setup/cleanup replay instead of leaving the tree in its loading state.
- Correctively reopened Phase 2B after final adversarial review found concurrent transition, Create Project compensation, stale preview, and Renderer integration-coverage defects.
- Serialized every project open/create/close/switch transition, evaluated guards against authoritative state inside that boundary, rejected reentrant deadlock attempts, released the queue after failure, and drained in-flight work safely during shutdown.
- Added empty-only, non-recursive compensation for a directory created by a failed Create Project operation; pre-existing targets and unexpected content are never recursively removed, and cleanup failure crosses IPC as a safe structured error.
- Added generation-based stale-response protection for file previews, project state, and directory refreshes, including project switch, close, selection change, StrictMode replay, and unmount behavior.
- Added focused project lifecycle, transition guard, filesystem, path/Windows/UNC, symlink, race authorization, watcher, IPC, preload, error-mapping, lazy-state, immediate-root-enumeration, refresh-state, delete-confirmation, and jsdom component-integration tests.
- Extended ADR-018 with explicitly approved development-only `jsdom`, `@testing-library/react`, and `@testing-library/dom`; Main, service, security, and IPC tests remain in the Node environment.
- Verified 100 Vitest tests across 16 files, typecheck, lint, production build, adversarial security/lifecycle review, and whitespace checks before returning Phase 2B to complete.
- Left ADR-011 unresolved because focused React state remains sufficient.
- Added no Phase 2C+ Monaco/editor/save, Search, Terminal, Run, Git, Language Intelligence, Problems, or Settings UX implementation.

## Phase 2C — Monaco Editor, Tabs & Save

### Editor and model lifecycle

- Added locally bundled Monaco with explicit editor, TypeScript/JavaScript,
  HTML, CSS, and JSON worker entry points and a thin `@monaco-editor/react`
  mounting layer.
- Added a renderer-owned EditorModelManager with one canonical model per
  normalized project/file identity, language assignment, retained tabs,
  active-tab selection, dirty baselines, version-aware save snapshots, view
  state, and explicit listener/model disposal.
- Kept the editor session above transient React effect lifecycles so Vite Fast
  Refresh does not clear active tabs or dispose canonical models; real renderer
  page unload remains the disposal boundary.
- Replaced the Phase 2B read-only preview with editable Monaco tabs while
  preserving the established Orca-aligned application shell.

### Data safety and external changes

- Added validated project-scoped file writes through the existing Main-owned
  FileSystemService and narrow preload bridge; Renderer receives no direct disk,
  Node, Electron, or generic command capability.
- Added Ctrl+S and version-aware dirty clearing so a stale save cannot mark a
  subsequently edited model clean.
- Added Save / Don't Save / Cancel protection for dirty tabs and consolidated
  Save All / Don't Save All / Cancel decisions for project/application
  transitions and affected folder descendants. Save failure, renderer loss,
  invalid ownership, stale resolution, and timeout fail closed.
- Added clean external-file reconciliation into the retained Monaco model while
  preserving clean state, plus dirty-buffer conflict warnings that never
  overwrite local edits.
- Added generation and model-identity guards for out-of-order watcher reads,
  project switches, closed/reopened files, saves, and Fast Refresh lifecycle
  replacement.

### Corrective runtime review and verification

- Corrected a Monaco layout defect caused by an unused grid row consuming the
  flexible editor area; the editor now fills its flex parent and resizes without
  hard-coded viewport heights or overlays.
- Corrected an intermittent active-editor reset caused by transient hook cleanup
  disposing renderer-session models during React/Vite refresh.
- Added deterministic unit and jsdom integration coverage for canonical identity,
  dirty/save races, unsaved decisions, watcher reload/conflict behavior,
  out-of-order responses, stale projects, disposed documents, Explorer refresh,
  StrictMode/Fast Refresh lifecycle, and Main transition ownership/cleanup.
- Manual Electron smoke passed edit/save/reopen, clean external reload, dirty
  conflict protection, application-close decisions, tab/model undo and view
  retention, Fast Refresh retention, resize/layout, and Monaco workers.
- Verified 134 Vitest tests across 18 files, typecheck, lint, production build,
  adversarial data-safety/lifecycle review, and whitespace checks before marking
  Phase 2C complete.

### Scope boundary

No Phase 2D project search, Terminal, Run, Git, Language Intelligence, Problems,
Settings UX, formatter, debugger, or extension-host work was added.

## Phase 2D — Project Search (`COMPLETE`)

### Search service and security boundary

- Added a Main-owned SearchService using only Node built-ins and the active
  ProjectService authorization boundary; no dependency, external executable,
  search binary, native module, or generic filesystem capability was added.
- Added literal case-insensitive disk-content search with asynchronous streaming
  directory traversal, owner/project operation IDs, cooperative supersession,
  owner-scoped cancellation, and renderer-liveness checks.
- Added default `.git`, `node_modules`, `dist`, `build`, and `out` exclusions;
  all symbolic links, obvious binary extensions, NUL-containing content,
  unreadable entries, and files over 1 MiB are skipped safely.
- Bounded traversal to 50,000 entries and 10,000 scanned text files, results to
  1,000 matches in batches of 50, query length to 256 characters, and previews
  to 240 characters.
- Added explicit validated `search:start`, `search:cancel`, and `search:event`
  contracts plus a narrow typed preload bridge. Renderer supplies no root or
  absolute path and receives no Node, raw IPC, shell, or process capability.

### Search UI and editor integration

- Added persistent `Explorer | Search` tabs inside the existing right sidebar;
  Explorer remains the default and switching tabs preserves both feature state
  without remounting editor models.
- Added idle, searching, cancellation, grouped-result, no-result, bounded-result,
  and structured error states with file paths, line numbers, and text previews.
- Added search-result navigation through the existing editor workspace. It opens
  or reuses the canonical Monaco model, activates the existing tab, reveals and
  selects the match, and focuses the editor without changing saved baselines,
  undo state, dirty content, or disk content.
- Added independent renderer guards for superseded query events, project-switch
  events, component cleanup, and out-of-order file opens.

### Orca UI parity corrective pass

- Re-audited the complete visible Phase 2Bâ€“2D shell against the locked Orca
  commit `4bb337741c335cfcc428d3b4271023566e2dadb8` as a strict visual and
  interaction reference, while retaining an independent implementation.
- Rebalanced the three-column shell with 280 px session-only resizable sidebars,
  moved editor tabs into the Orca-style top-chrome hierarchy, introduced semantic
  dark surface/text/border/focus tokens, and aligned Projects, Explorer, Search,
  workspace empty state, and footer density and hierarchy.
- Enabled Electron's native hidden title-bar overlay with a renderer drag region,
  preserving native Windows controls and all existing BrowserWindow security
  flags.
- Added the explicitly authorized `lucide-react` icon package and OFL-1.1 Geist
  font package through normal dependency workflows; no Orca asset or source was
  copied and no second icon system was introduced.
- Replaced native prompt/confirm flows with Student IDE-owned focus-contained
  dialogs while preserving project transition serialization, dirty-file choices,
  save-failure blocking, and Main-owned Recycle Bin deletion.
- Added an Orca-aligned Search query row with a 180 ms debounce, immediate stale
  operation supersession, delayed visible loading feedback, collapsible groups,
  and case-insensitive literal preview highlighting.
- Added focused regression assertions for title-bar configuration, sidebar
  resizing, dialog focus/Escape behavior, Search debounce/loading, result
  highlighting, and result-group disclosure; no filesystem authority, search
  semantics, or Monaco model ownership changed.

### Verification state

- Added focused contract, SearchService, IPC ownership, preload validation,
  result grouping, no-result/error, cancellation, query/project race, canonical
  model reuse, dirty-buffer preservation, and Monaco reveal/select tests.
- The full automated suite passes 157 tests across 21 files. Typecheck, lint,
  production build, and `git diff --check` pass.
- Final adversarial review found no Phase 2D blocker. Manual Electron visual and
  functional smoke passed top chrome/tabs, sidebar resizing, Monaco layout,
  Explorer/Search retention, dialogs, Search debounce/loading/navigation,
  dirty-buffer preservation, keyboard behavior, visual parity, and runtime/IPC
  error checks. Phase 2D is `COMPLETE`.

### Scope boundary

No replace, regex/options UI, Terminal, Run, Git, Language Intelligence,
Problems, formatter, debugger, AI, extension-host, or Phase 2E work was added.

## Phase 2E-B — Windows / Electron Native Compatibility Spike (`COMPLETE`)

- Verified the approved `@xterm/xterm` 6.0.0, `@xterm/addon-fit` 0.11.0, and
  `node-pty` 1.1.0 dependency state without installing or changing dependencies.
- Loaded the shipped Windows x64 `node-pty` prebuild in Electron 44.0.0 with
  bundled Node 24.18.1 and module ABI 149; no ABI error, rebuild, native toolchain,
  or `@electron/rebuild` dependency was required.
- Spawned a real Windows PowerShell PTY at the repository root because `pwsh` was
  unavailable and Windows PowerShell was the first available approved fallback.
  Deterministic input/output, ordered markers, resize, Ctrl+C, one clean exit
  event with code 0, owned-PID release, and clean Electron exit all passed.
- Confirmed a main-only electron-vite build leaves `node-pty` external and that
  its emitted Electron Main entry resolves the repository dependency and repeats
  the native smoke successfully.
- Removed the isolated harness and generated bundles after recording evidence.
  No production terminal service, IPC, preload API, Renderer UI, generic process
  executor, or Phase 2E-C work was introduced.

## Phase 2E-C — Terminal Contract Foundation (`COMPLETE`)

- Added side-effect-free terminal request/response contracts with an opaque
  branded session ID, strict exact-object validation, dimensions bounded to
  1–1,000, and non-empty input bounded to 64 KiB by UTF-8 byte length.
- Added `CREATING`, `RUNNING`, `CLOSING`, `EXITED`, and `FAILED` states with a
  pure allowed-transition predicate. Successful create is the readiness boundary
  and returns `RUNNING`, avoiding a redundant startup event.
- Added exact `data`, `exit`, and serialized `error` events. Data uses a
  non-negative safe-integer sequence; exit code and signal are explicitly
  nullable for provider/platform variability; raw native errors are rejected.
- Added documented terminal uses of existing AppError codes without introducing
  terminal-specific codes.
- Added a Main-only PTY port with explicit executable/args/cwd/environment spawn
  options isolated from Renderer contracts and without importing `node-pty`.
- Added a timer-free fake PTY supporting deterministic spawn failure, writes,
  control bytes, resize, data, immediate/duplicate exit, late data after close,
  idempotent close, listener disposal, and full disposal.
- Added 26 focused tests. The full suite passes 183 tests across 23 files, along
  with typecheck, lint, production build, security/dependency review, and
  whitespace checks. No production TerminalService, native adapter, IPC,
  preload API, Renderer terminal UI, or Phase 2E-D work was introduced.

## Phase 2E-D — Production Main Terminal Backend (`COMPLETE`)

- Added the sole production `node-pty` adapter behind the existing Main-only PTY
  port. Native types remain inside the adapter; electron-vite keeps the package
  external and no Renderer/shared module imports it.
- Added deterministic Windows shell resolution for valid `pwsh`, Windows
  PowerShell, then absolute `ComSpec`/system `cmd.exe`, with no configured custom
  shell or discovery-command execution. Missing approved shells map to
  `DEPENDENCY_MISSING`.
- Added a Main-owned TerminalService with opaque random IDs, canonical active-
  project cwd, immutable project/renderer ownership, authoritative states,
  input/control-byte forwarding, resize deduplication, typed events, and safe
  AppError normalization.
- Added ordered per-session output batching with an 8 ms latency window, 64 KiB
  UTF-8 queue bound, monotonically increasing sequence numbers, forced trailing
  exit flush, and cross-session isolation. No output history or replay was added.
- Registered every live PTY with ProcessManager and added bounded semantic close,
  owner cleanup, project cleanup, shutdown cleanup, duplicate-exit suppression,
  late-callback suppression, and 256 bounded exited/failed tombstones. No broad
  process-tree kill primitive or generic executor was introduced.
- Extended the deterministic fake PTY and manual scheduler for immediate exit,
  late callbacks, adapter failures, close races, bounded timeouts, and aggregate
  cleanup. The full suite passes 207 tests across 25 files.
- A temporary Main-only Electron 44 smoke exercised the production adapter with
  external `node-pty`, Windows PowerShell, output, resize, one clean exit, and no
  remaining owned PID; all temporary artifacts were removed.
- Typecheck, lint, production build, dependency/security review, and whitespace
  checks pass. No terminal IPC, preload API, Renderer/xterm UI, project dialog,
  or Phase 2E-E work was introduced.

## Phase 2E-E — Production Terminal IPC and Preload Bridge (`COMPLETE`)

- Added four strict terminal handlers through the centralized Main IPC registry.
  Create, input, resize, and close reject unknown fields and malformed values;
  renderer ownership is derived only from `event.sender.id`.
- Connected handlers to TerminalService without moving shell, PTY, batching, or
  session business logic into IPC. Later operations recover immutable project
  identity from Main session state rather than accepting it from Renderer.
- Added validated owner-only `terminal:event` delivery with no window broadcast,
  safe destroyed-owner drops, preserved service ordering, and guarded send errors.
- Added actual WebContents destruction and main-frame reload cleanup through
  `closeSessionsForOwner`. Cleanup is idempotent and owner-scoped; React remounts
  and same-document navigation do not close sessions.
- Added the narrow typed `window.studentIde.terminal` API for create, input,
  resize, close, and unsubscribe-returning events. Requests, responses, and
  events are validated, and one underlying IPC listener fans out to local
  subscribers without exposing raw `ipcRenderer` or generic channels.
- Added 12 focused IPC/preload/routing/lifecycle tests. The full suite passes 219
  tests across 27 files, with typecheck, lint, production build, dependency and
  adversarial security review, and whitespace checks passing.
- No dependency, Renderer terminal UI, xterm import, generic process API,
  replay/reattach behavior, or Phase 2E-F work was added.

## Phase 2E-F — Renderer Terminal UI (`COMPLETE`)

- Added a Renderer-session `TerminalController` that owns stable xterm and
  FitAddon instances independently of React mounts, subscribes to the typed
  terminal event API once, rejects stale/out-of-order events, serializes bounded
  writes, and disposes per-session resources exactly once.
- Added exact xterm input forwarding, including control bytes and Unicode, plus
  visible/non-zero-only fitting, coalesced/deduplicated resize propagation, and
  stopped input/resize behavior for exited or failed sessions.
- Added the initially closed, resizable Bottom Panel with project-aware empty
  state, multiple session tabs, New/Close controls, user-initiated focus, and
  restrained exit/error status while retaining scrollback.
- Added 17 focused controller/panel/resizer tests. The full suite passes 236
  tests across 29 files, together with typecheck, lint, production build, and
  whitespace checks.
- Verified the built Electron application with real Windows PowerShell and
  ConPTY: prompt, input/output, project-root cwd, Vietnamese Unicode, Ctrl+C,
  panel/window/sidebar resizing, multiple sessions, exit, close/reopen, and
  Monaco coexistence all passed.
- No dependency, IPC/preload contract, shell authority, persistence,
  project-transition policy, split terminal, or Phase 2E-G work was added.

## Phase 2E-G — Terminal Transition and Lifecycle Policy (`COMPLETE`)

- Added a Main-owned project-transition lease that blocks new terminal creates,
  drains creates already in flight, snapshots live project sessions, and releases
  its project block idempotently.
- Integrated the lease with the existing serialized ProjectService guard. Project
  close/switch now warns only when the old project owns live PTYs, closes only
  those sessions after approval, and commits new project authority only after
  terminal cleanup succeeds.
- Kept cancellation, renderer loss, timeout, and cleanup failure fail-closed.
  Failed cleanup returns a concise structured error without exposing native
  details or silently changing the current project.
- Ordered Renderer decisions so dirty-buffer Save/Don't Save/Cancel completes
  before the destructive terminal warning. Editor models remain intact until the
  authoritative project-changed event, including when a later terminal decision
  is cancelled.
- Added focused coverage for in-flight create races, project-scoped transition
  blocking, cancellation, cleanup failure, rapid serialized transitions, dialog
  ordering, safe default focus, and clean transitions. Stabilized existing Search
  debounce assertions for constrained parallel test workers without changing
  production Search behavior.
- The full suite passes 249 tests across 29 files. Typecheck, lint, production
  build, and `git diff --check` pass. Phase 2E-F's real Electron/ConPTY smoke
  remains applicable because 2E-G changes only project-transition coordination.
- At Phase 2E-G completion, Phase 2E remained `IN_PROGRESS` because descendant-
  process cleanup and later terminal verification/review work were not yet
  scope-defined. Phase 2E-G did not silently absorb that work.

## Phase 2E-H — Windows Terminal Behavior & Process Cleanup (`COMPLETE`)

- Defined a documentation-only Windows x64 work package for ConPTY/shell
  behavior, Unicode, Ctrl+C, exit/close semantics, controlled child/grandchild
  cleanup, orphan checks, race coverage, and native Electron evidence.
- Separated fake-based automated coverage, targeted Electron-native smoke, and
  non-duplicative manual Windows smoke. Ubuntu CI remains pure-test evidence and
  cannot validate Windows-native behavior.
- Recorded ADR-020 as Proposed and left the minimum Windows/ConPTY baseline,
  Windows CI timing, stronger cleanup strategy if needed, CJK/emoji depth, and
  H/I evidence split as `USER DECISION REQUIRED`.
- Bounded 2E-I to consolidated, non-duplicative terminal acceptance evidence;
  bounded 2E-J to final security/lifecycle/adversarial review and Phase 2E
  completion assessment; retained all packaging/installer work in Phase 7.
- No production source, tests, dependencies, package files, CI workflow, commit,
  or Phase 2E-H implementation was changed by this scope-definition task.
- Reproduced the Windows descendant blocker under Electron 44: node-pty closed
  shell 22796 and child 18376 but left grandchild 26396 alive after three
  seconds; unrelated control 29916 survived while Main had already emitted exit
  and removed ProcessManager ownership.
- Accepted ADR-020 and added a narrow Main-only process-tree terminator. It
  fingerprints the owned PTY root with PID/start time/executable/process name,
  revalidates session ownership and OS identity immediately before absolute
  System32 `taskkill.exe /PID <pid> /T /F`, and uses bounded `execFile` without a
  shell, process name, wildcard, Renderer input, new dependency, or raw error
  exposure. Exit remains pending until tree termination completes, preventing a
  transient false-clean ProcessManager state.
- Corrected and re-ran the controlled tree under actual Electron. The original
  corrected run removed 19276 -> 30408 -> 31956 while control 30688 survived;
  the final ordering run removed 9800 -> 31076 -> 25892 while control 15224
  survived. Close-one, project cleanup, project switch/close, renderer loss, and
  application shutdown also removed every recorded owned shell/child/grandchild
  while common control 16700 survived.
- Verified Windows PowerShell and cmd cwd-with-spaces, Vietnamese/common Unicode,
  required emoji, supplemental CJK, Ctrl+C prompt recovery and reuse, resize,
  clean/non-zero exit, trailing output, concurrent close/exit, close during
  output, Ctrl+C then close, rapid create/close, close-after-exit, and one logical
  exit. An output-active DesktopApplication shutdown stopped shell PID 16508 in
  2,475 ms, emitted one exit, cleared ProcessManager, and reached `STOPPED`.
  Production-build xterm smoke visibly retained scrollback after exit and closed
  a tab with a harmless running process.
- The full suite passes 265 tests across 30 files. Typecheck, lint, production
  build, and `git diff --check` pass. Windows CI remains deferred to 2E-I. At
  that Phase 2E-H checkpoint, Job Objects remained an optional unscheduled
  future evaluation; ADR-020 and Phase 2E-J corrective Step 2 later superseded
  that historical policy with primary Job ownership. Packaging and installer
  claims remain Phase 7.

## Phase 2E-I — Consolidated Terminal Verification Gate (`COMPLETE`)

- Audited FR-019 through FR-021 and terminal security/lifecycle traceability
  across contracts, Main service, IPC/preload, Renderer controller/UI,
  project/application transitions, and Windows owned-process cleanup.
- Reused the same-source 2E-H Windows matrix without ceremonial repetition and
  ran a consolidated Electron 44 / Node 24.18.1 native smoke. Canonical cwd with
  spaces, Vietnamese/common Unicode/emoji, Ctrl+C recovery, resize, trailing
  output, exit code 7, post-exit rejection, multiple-session isolation, focused
  close, and shutdown passed.
- Verified owned trees 4212 -> 7968 -> 12332 and 30072 -> 6784 -> 26632 exited,
  unrelated control PID 16612 survived, each session emitted one exit, and
  ProcessManager reached zero only after cleanup. Temporary harness and fixture
  artifacts were removed after evidence capture.
- Completed a production Electron Bottom Panel smoke covering visible Vietnamese
  and emoji output, two-session creation/switching, closing a session running a
  harmless long process, and continued use of the unaffected session.
- Evaluated Windows CI and selected no Phase 2 Windows job. Ubuntu CI remains the
  portable automated gate; terminal-affecting work requires recorded actual-
  Windows Electron evidence; Phase 7 retains packaged/installed Windows CI and
  release acceptance.
- The full suite passes 265 tests across 30 files. Typecheck, lint, production
  build, and `git diff --check` pass. Non-fatal `node-pty` AttachConsole process-
  list diagnostics are recorded as a limitation; no behavior, cleanup, or
  isolation assertion failed.
- No production feature, dependency, CI workflow, packaging policy, installer,
  custom shell, Job Object, Phase 2E-J review, commit, or push was added.

## Phase 2E-J Corrective Step 2 — Windows Job Object Production Integration (`COMPLETE`)

- Reopened ADR-020 and made a Windows Job Object the primary Windows terminal
  process-tree owner. Pinned `node-pty` exactly to 1.1.0 and added an inspectable,
  deterministic repository patch plus loud patch/rebuild scripts; no dependency,
  fork, vendor copy, Renderer API, preload API, IPC contract, or UI change was
  introduced.
- Extended node-pty's existing ConPTY `STARTUPINFOEX` path with
  `PROC_THREAD_ATTRIBUTE_JOB_LIST`, so the shell is associated atomically at
  `CreateProcessW`. Job/capability/attribute/process creation failures reject
  terminal creation, and the Electron 44 x64 rebuild/load check prevents silent
  use of an upstream unpatched prebuild.
- Added a native opaque-token registry whose Job handle survives root exit.
  Finalization explicitly terminates the Job, polls
  `JobObjectBasicAccountingInformation.ActiveProcesses` to zero, releases the
  handle, then releases ProcessManager/session ownership. `KILL_ON_JOB_CLOSE` is
  disabled; failure retains ownership, and node-pty PID/console-list kill is
  forbidden for established Jobs.
- Unified natural root exit, explicit close, project cleanup, and renderer-owner
  loss behind one in-flight TerminalService finalization task. Root exit no
  longer means cleanup completion; duplicate triggers share work, trailing
  output is flushed before exactly one exit event, and failed cleanup keeps the
  session and ProcessManager entry available for retry.
- Retained the Phase 2E-H fingerprinted `taskkill /PID <pid> /T /F` backend only
  for explicit legacy/unestablished ownership. It still revalidates the OS
  identity immediately before invocation and is forbidden after Job ownership
  or Job termination failure.
- Actual Electron 44 x64 evidence used shell 28332, child 24636, grandchild
  16628, Job-owned conhost helpers 28792 and 25964, and unrelated control 2396.
  The shell PID disappeared naturally while the Job retained four active
  descendants. Job termination removed all descendants/helpers, preserved the
  control process, confirmed zero active processes, and produced one exit event.
- A second Electron smoke bundled and exercised the production `NodePtyPort`,
  `TerminalService`, `WindowsProcessTreeTerminator`, and `ProcessManager` path.
  With shell 33128, child 31128, grandchild 6332, and control 5888,
  ProcessManager remained at one after natural root exit, reached zero only
  after Job finalization, removed both descendants, preserved the control, and
  emitted one terminal exit.
- The full suite passes 285 tests across 31 files. Typecheck, lint,
  electron-vite production build, patch apply/reverse verification, native
  rebuild/capability load, native and production-service Windows natural-root
  smoke, and `git diff --check` pass. At Step 2 completion, Phase 2E-J and Phase
  2E remained `BLOCKED` because corrective Step 3 application-shutdown semantics
  had not begun.

## Phase 2E-J Corrective Step 3 — Application Shutdown Semantics (`COMPLETE`)

- Corrected `DesktopApplication` so `STOPPED` is reached only after every
  mandatory started service stops successfully. Cleanup rejection propagates,
  retains `STOPPING`, and preserves the failed and not-yet-stopped services for
  deterministic retry; concurrent calls share one in-flight shutdown and a
  repeated call after success remains idempotent.
- Preserved reverse dependency cleanup while changing service release from
  pre-emptive list removal to removal after successful `stop()`. A failure now
  stops that cleanup attempt before ProcessManager can duplicate a failed
  TerminalService Job finalization. WindowManager is shutdown-last, leaving the
  existing window close path available to initiate a later retry.
- Added a Main-only Electron quit coordinator. Initial and repeated
  `before-quit` events are prevented during approval/cleanup; success authorizes
  one final `app.quit()` and lets its recursive event/window close pass; failure
  logs through a redacted callback, does not finalize quit, and clears only the
  rejected attempt. BrowserWindow close and non-macOS `window-all-closed` use
  the same path without new Renderer, preload, or IPC authority.
- Added focused DesktopApplication, quit coordinator, WindowManager, and
  TerminalService integration tests for success, failure, retry, concurrency,
  idempotence, final-quit cardinality, recursive-event protection, live Job
  cleanup, natural-root cleanup, and retained Job/ProcessManager ownership.
- Electron 44 Windows x64 production-service smoke passed a live-root shutdown
  (`32972 -> 16304 -> 1756`, control `30836`) and a natural-root-first shutdown
  (`8688 -> 23492 -> 31696`, control `8812`). Both reached `STOPPED` only after
  Job finalization and ProcessManager release, requested one final quit, removed
  every tested owned PID, emitted one terminal exit, and preserved the unrelated
  control process. Failure/retry evidence uses test seams only.
- The full suite passes 297 tests across 32 files. Typecheck, lint, production
  build, and `git diff --check` pass. No dependency, Windows Job strategy,
  node-pty patch policy, force-quit fallback, Renderer/preload/IPC capability,
  packaging, installer, final 2E-J review, commit, or push was added. Corrective
  Step 3 is complete; Phase 2E-J and Phase 2E remain `BLOCKED` until the final
  review is explicitly authorized and rerun.

## Phase 2E-J — Final Consolidated Terminal Review (`COMPLETE`)

- Re-audited the complete terminal security boundary, creation path, shell/cwd
  policy, Windows Job integration, natural-root ownership, ProcessManager,
  explicit/project/renderer/application cleanup, output/exit ordering,
  resize/input races, multiple-session isolation, taskkill gate, documentation,
  and FR-019–FR-021 traceability. No material defect or architecture deviation
  was found; production code was not changed during the review.
- Verified the deterministic patch against pinned `node-pty` 1.1.0, rebuilt the
  patched native module for Electron 44.0.0 x64, loaded its capability marker,
  and passed the electron-vite production build.
- Current native Job evidence used shell/child/grandchild
  `16612 -> 26072 -> 5480`, Job helpers `19248` and `7760`, and unrelated
  control PID `24160`. The root exited naturally while four Job members remained;
  finalization removed the complete owned tree, preserved the control, emptied
  and released the Job, and emitted one exit.
- Current production-service evidence passed live-root application shutdown
  `19452 -> 25648 -> 2672` with control `32508`, and natural-root-first shutdown
  `17768 -> 22220 -> 18304` with control `2316`. Both reached `STOPPED` only
  after Job finalization and ProcessManager release, requested one final quit,
  and left no tested orphan.
- The full suite passes 297 tests across 32 files. Typecheck, lint, production
  build, and `git diff --check` pass. No Search regression was observed. Phase
  2E-J and Phase 2E are complete and ready for user-authorized source-control
  closure; no commit, push, PR, merge, branch deletion, or Phase 2F work was
  performed.

## Phase 2F — Core IDE Stabilization (`COMPLETE`)

- Audited findings 2F-A-001 through 2F-A-011. Corrective packages B–D closed
  the post-approval edit race, preload invoke rejection handling, delete commit
  ordering, unavailable project-root/watcher state, externally deleted-file
  state, expected project-cancellation presentation, renderer subscription and
  terminal resource cleanup, and pointer-resizer unmount cleanup.
- File deletion now retains affected clean or dirty Monaco models until the
  Recycle Bin operation succeeds. Failure preserves the exact buffer and allows
  retry; successful deletion commits Editor disposal before Explorer refresh.
- Added project-scoped filesystem `AVAILABLE`/`UNAVAILABLE` status through the
  validated Main/preload boundary. Watcher startup/runtime failure and active
  root loss visibly disable stale filesystem mutations while existing
  close/reopen or project-switch recovery remains available.
- Externally deleted open files retain their in-memory buffer in an explicit
  disk-missing state. Normal save is blocked, stale reload responses are
  rejected, and no file is silently recreated or discarded.
- Stabilized Search integration tests by separating operation-authority tests
  from debounce timing and checking the 180 ms debounce boundary with fake
  time. Both previously flaky scenarios passed 10 consecutive process-isolated
  runs (20 assertions total). Production Search authority logic was unchanged.
- Verified the integrated project, Explorer, Editor, Search, Terminal, and
  application-lifecycle scenario matrix using focused Renderer, service, IPC,
  cleanup, shutdown, and ownership tests. A 500-file/20-directory disk Search
  emitted exactly the 1,000-match bound and completed with `limitReached`.
- Corrected the node-pty patch verifier to tolerate CRLF/LF checkout differences
  through Git's whitespace-aware patch check without changing the patch or
  Windows Job architecture. The patched Electron 44 x64 capability rebuild,
  native Job smoke, and production TerminalService live-root/natural-root
  shutdown smokes passed. Owned descendants were removed, unrelated controls
  survived, ProcessManager ownership was released only after Job finalization,
  and application state reached `STOPPED` with one final quit.
- Final verification passes 328 tests across 33 files, typecheck, lint,
  electron-vite production build, and `git diff --check`. The test-only jsdom
  canvas diagnostic remains non-blocking; no dependency, Phase 3 feature,
  native architecture change, commit, or push was introduced.
- Recent-project metadata remains the minimal Phase 2 persistence foundation.
  User-facing list management and any product limit policy remain deferred to
  Phase 6 Settings/Recent Projects UX.

## Phase 3A — Language Intelligence Architecture & Feasibility (`COMPLETE`)

- Audited the Phase 2 Monaco/editor baseline, built-in worker capabilities,
  project/model integration, diagnostics ownership, security/resource risks,
  dependency options, and locked Orca reference applicability without changing
  production code or dependencies.
- Approved the current Phase 3 V1 scope as Monaco-native intelligence for
  JavaScript/TypeScript and HTML/CSS/JSON, plus syntax-only C#/PHP. Python and
  Java language support are intentionally deferred to a future authorized phase,
  not permanently removed.
- Selected bounded JavaScript/TypeScript project snapshots/source synchronization;
  rejected wholesale `node_modules` mirroring and canonical project-root exposure
  to Renderer for TypeScript resolution.
- Selected root-`UNAVAILABLE` behavior: stop project intelligence and clear stale
  diagnostics while preserving editor buffers, syntax highlighting, and the open
  project.
- Recorded that current Phase 3 adds no external language-server process,
  Pyright/basedpyright/python-lsp-server, `vscode-jsonrpc`, Python intelligence
  detection/synchronization, or Java-specific provider infrastructure. Future
  external providers remain Main-owned behind a narrow validated bridge and
  independent from `RunService`.
- Reduced the implementation plan to packages 3B–3F. Phase 3 implementation has
  not started; this entry records architecture, feasibility, and approved scope
  documentation only.

## Phase 3B — Language Foundation / Provider Contracts (`COMPLETE`)

- Added the renderer-owned current-provider and capability contracts for
  Monaco-native JS/TS, HTML, CSS, and JSON workers, including documented status
  values. C#/PHP remain syntax-only; Python/Java remain deferred with no provider.
- Centralized safe project-relative URI identity, current language mapping,
  worker routing, deliberate JS/TS defaults, normalized diagnostic identity,
  provider-specific marker ownership, and independent project/provider generation
  checks.
- Added a bounded JS/TS snapshot feasibility state that excludes `node_modules`,
  unsupported languages, and file/count/byte overflow; open Monaco models take
  precedence, stale generations are rejected, and switch/close/root-unavailable/
  renderer-disposal paths clear only the TypeScript provider's project state and
  diagnostics.
- Verified safe virtual-URI same-file completion, TS-to-TS, JS-to-JS, and mixed
  JS/TS relative imports/definitions, JSX/TSX parsing, JS/TS diagnostics, C#/PHP
  tokenizer registration, and marker-owner isolation.
- Measured 1,000 files/8,219,780 UTF-8 bytes through the planner/state in 59 ms
  with a 7,116,248-byte observed heap delta, a 501-file/4,111,341-byte TypeScript
  definition query in 1,184 ms, and a 262,170-byte individual source in 393 ms.
  Recorded initial 3C ceilings of 500 files, 5 MiB total, and 256 KiB per file.
- Added a repeatable Electron production-renderer smoke. The `file://` build loaded
  editor, TypeScript/JavaScript, HTML, CSS, and JSON workers from local hashed
  assets with `contextIsolation: true`, `nodeIntegration: false`, and
  `sandbox: true`.
- Full verification passed 353 tests across 37 files, typecheck, lint, production
  build, Electron worker smoke, and `git diff --check`. No dependency, external
  language server, generic language IPC, canonical-root exposure, commit, push,
  or Phase 3C–3F implementation was introduced.

## Phase 3 V1 Scope Documentation Sync (before 3C)

- Clarified the authoritative V1 matrix: JavaScript/TypeScript are Tier 1,
  HTML/CSS/JSON are Tier 2, and C#/PHP are syntax-only.
- Deferred all Python support, all Java support, and every external
  language-server process from current V1. Python Run/runtime integration is no
  longer a Phase 4 acceptance criterion.
- Retained Main ownership and a narrow validated bridge as future external-server
  architecture only; current Phase 3 remains renderer-owned Monaco/browser
  workers with no generic language IPC.
- Preserved all verified Phase 3A/3B evidence and the initial 3C limits of 500
  JS/TS source files, 5 MiB total UTF-8 content, and 256 KiB per file. This entry
  records documentation decisions only; Phase 3C did not start, no production
  source or dependency changed, and packaged/installed acceptance remains Phase 7.
- Clarified NFR-006 before 3C: current Monaco providers require safe failure,
  disposal, and natural renderer-owned recovery without manual restart UX or
  IPC. Dirty buffers remain authoritative, stale generations remain rejected,
  and manual external-language-server lifecycle UX is future scope.

## Phase 3C — Production JS/TS Language Intelligence (`COMPLETE`)

- Implemented deterministic production discovery for exact `.js`, `.jsx`,
  `.ts`, and `.tsx` sources through the existing project-relative list/stat/read
  capabilities. Discovery excludes `node_modules` and enforces 500 files, 5 MiB
  total UTF-8 content, and 256 KiB per file without new IPC or filesystem
  authority.
- Added renderer-owned project synchronization that creates provider background
  Monaco models while preserving `EditorModelManager` as canonical open-model and
  dirty-state owner. Dirty buffers override disk snapshots; save/reload/close and
  file change/create/delete/rename paths synchronize without writing buffers or
  changing Phase 2 data-safety behavior.
- Added project/provider generation guards and cleanup for open, switch, close,
  root unavailability, renderer disposal, failure, and natural reinitialization.
  Late old-project work is rejected, provider failure does not block edit/save,
  and deleted dirty buffers are retained.
- Verified same-file and cross-file JS/TS, JS-to-JS, TS-to-TS, mixed JS/TS, JSX,
  TSX, completion, hover, signature help, definition, and diagnostics. Existing
  HTML/CSS/JSON worker registration remains passing; C#/PHP remain
  tokenization-only.
- Focused Phase 3 regression passed 49 tests across 5 files. The full suite passed
  365 tests across 38 files; typecheck, lint, production build, Electron worker
  smoke, and `git diff --check` passed. The existing non-blocking jsdom canvas
  diagnostic remains unchanged.
- Added no dependency, package-lock change, external language server, Python or
  Java provider, C#/PHP intelligence, `node_modules` mirroring, full `tsconfig`,
  generic language IPC, canonical-root exposure, Phase 3D work, Phase 4 Run, or
  packaged/installed acceptance claim.

## Phase 3D HTML Diagnostics Scope Decision

- Deferred HTML diagnostics and HTML Problems contribution from current V1 after
  verifying that the approved Monaco HTML provider has no validation support.
- Retained HTML syntax, completion, and provider-supported hover as V1 scope.
  CSS and JSON diagnostics plus their future Phase 3E Problems contribution
  remain required.
- Preserved the renderer-owned Monaco/browser-worker architecture. No custom
  HTML validator/parser, alternate provider, dependency, external LSP, project
  index, IPC, process, filesystem authority, network access, or Phase 3E work was
  added by this documentation decision.

## Phase 3D — HTML/CSS/JSON Language Intelligence (`COMPLETE`)

- Configured the production Monaco web-language defaults explicitly: HTML
  completion/hover with diagnostics disabled; CSS completion/hover/validation;
  and JSON completion/hover/validation with no configured schemas and schema
  requests disabled.
- Verified against the actual Monaco workers that HTML supplies tag/attribute
  completion and useful hover from current dirty model content. HTML validation
  remains unavailable and deferred; no custom validator or alternate provider
  was introduced.
- Verified CSS property/value completion, hover, diagnostic range/severity/source,
  update after edits, clearing after fixes, and model-disposal cleanup.
- Verified local schema-free JSON peer-property completion and syntax diagnostics
  with update/clear/disposal behavior. JSON hover has no useful result without a
  configured local schema, and an explicit remote `$schema` triggers no fetch.
- Focused Phase 3D coverage passed 24 tests across 3 files. The full suite passed
  374 tests across 39 files; typecheck, lint, production build, Electron worker
  smoke, and `git diff --check` passed. The known non-blocking jsdom canvas
  diagnostic remains unchanged.
- Added no dependency, package-lock change, external provider, Python/Java
  provider, C#/PHP intelligence, IPC, filesystem/process authority, project-wide
  Tier 2 index, network access, Problems UI, or packaged/installed acceptance
  claim. Phase 3E remains `NOT_STARTED`.

## Phase 2D Search Corrective Fixes During Phase 3E

- Corrected an intermittent stale-query submit race by keeping the latest input
  value in a renderer ref and reading that value on immediate form submission.
- Corrected the project-reset timing race by moving only the existing
  project-scoped Search reset from passive effect timing to layout-effect timing,
  so reset completes before newly enabled input can be interacted with.
- Preserved SearchService contracts, IPC, debounce behavior, result/navigation
  semantics, canonical model ownership, and dirty-buffer protection. The focused
  Search integration suite passed 57 tests without sleeps, retries, timeouts, or
  weakened assertions.

## Phase 3E — Problems Aggregation and Navigation (`COMPLETE`)

- Added a renderer-owned normalized Problems store and Monaco marker controller
  for existing JavaScript, TypeScript, CSS, and JSON diagnostics. Updates replace
  and clear by provider/file scope, preserve severity/source/range, sort
  deterministically, reject stale project/provider/model generations, and clean
  up on project switch/close, root unavailability, provider disposal, and
  renderer disposal.
- Integrated a Problems tab into the existing Bottom Panel with neutral empty
  state, file grouping, current counts, severity/source/location display, and
  reactive removal. Terminal lifecycle and shell architecture remain unchanged.
- Problem selection opens or reuses the existing canonical Monaco model,
  activates its editor tab, reveals the diagnostic range, preserves dirty
  in-memory content, and fails safely for deleted/stale or old-project targets.
- HTML diagnostics remain deferred because the current provider has no validation
  support. C#/PHP remain tokenization-only; Python, Java, and external LSP remain
  deferred. No validator, provider, dependency, package-lock change, IPC,
  filesystem/process/network authority, project scan, or architecture deviation
  was added.
- Focused Phase 3E coverage passed 11 tests across 3 files; focused Search
  integration passed 57 tests. The full suite passed 385 tests across 42 files;
  typecheck, lint, production build, Electron Monaco worker smoke, and
  `git diff --check` passed. The unchanged jsdom canvas warning remains
  non-blocking. Phase 3 remains `IN_PROGRESS` because Phase 3F is `NOT_STARTED`.

## Phase 3F — Stabilization and Final Verification (`COMPLETE`)

- Audited the full Phase 3 working tree, dependency/package state, security
  boundary, language capability matrix, bounded JS/TS synchronization,
  diagnostics/Problems lifecycle, Search corrections, worker assets, and Phase 2
  regressions. No unrelated accidental change, debug artifact, tracked generated
  output, dependency/package-lock change, or architecture deviation was found.
- Added deterministic lifecycle stress coverage proving repeated JS/TS project
  activate/switch/close/reopen cycles do not accumulate provider background
  models and repeated Problems controller cycles release marker listeners and
  diagnostic state.
- Focused Phase 3 acceptance passed 69 tests across 9 files. The two existing
  Search race corrections each remained stable across two independent 57-test
  integration runs. Two independent full-suite runs each passed 387 tests across
  42 files without retries, sleeps, timeout increases, or weakened assertions.
- Typecheck, lint, production build, Monaco production-worker smoke, and
  `git diff --check` passed. Production `file:` assets loaded editor,
  JavaScript/TypeScript, HTML, CSS, and JSON workers with
  `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
  The unchanged jsdom canvas warning remains non-blocking.
- Phase 3 current V1 acceptance is complete: JS/TS full approved intelligence
  and bounded synchronization; HTML syntax/completion/provider-supported hover
  with diagnostics deferred; CSS/JSON approved Tier 2 behavior; C#/PHP
  tokenization-only; and deterministic Problems aggregation/navigation for
  JS/TS/CSS/JSON. Python, Java, external LSP, HTML diagnostics, broader TypeScript
  project fidelity, and packaged/installed verification remain deferred.
- No Phase 4 implementation, dependency, new IPC, filesystem/process/network
  authority, provider, validator, or commit/push was introduced.

## Phase 4 — Authorized Run Scope Documentation Clarification

- Synchronized the requirements, architecture, ADR-014, capability matrix,
  planned module map, and implementation acceptance scope with explicit user
  decisions: Phase 4 V1 requires Node.js Run only for the current authorized
  JavaScript `.js` file inside the active project.
- Deferred TypeScript Run while preserving Phase 3 TypeScript intelligence.
  No TypeScript runtime, compile/transpile strategy, ts-node, tsx, or Node-native
  execution policy is selected. ADR-014 remains a future decision/verification
  gate and no longer blocks current Phase 4 JavaScript implementation.
- Preserved a narrow internal RunStrategy boundary with only the planned V1
  JavaScriptRunStrategy; future authorized TypeScriptRunStrategy can be added
  without redesigning core RunService. No placeholder production code was added.
- Deferred FR-023 built-in Run Project, npm/package-manager scripts, dev-server
  orchestration, project entry configuration, and framework/project launchers.
  Future Run Project requires an explicit authorized entry/script policy.
- This entry records documentation clarification only, not implemented Run
  behavior or a completed Phase 4 gate. Other Run policies remain subject to
  read-only review and explicit decisions where unresolved. No production source,
  dependency, package-lock, commit, or push change is included.

### Approved Run behavior clarification

- Recorded the subsequent explicit user policies: stop-and-clean before same-target
  re-run without a prompt; block dirty targets until explicit Save; Main process
  PATH-only Node detection with `MISSING` errors; no bundled/configured Node path
  or Node Settings UI in Phase 4.
- Recorded confirmed close/switch waiting for all project Run cleanup, preserving
  project/editor state on cleanup failure, and unavailable-root cleanup with
  stale-event rejection. Recorded one right-aligned editor-header Run button and
  an Output sibling in the existing Bottom Panel, preserving Terminal behavior.
- Added the read-only Windows piped-process ownership feasibility gate. These
  documentation decisions do not claim native/process feasibility, production
  implementation, tests passing, or Phase 4 completion.

## Phase 4A — Run Foundation (`COMPLETE`)

- Added shared exact Run request/session/event validators and an opaque session
  ID type with Main-generated UUIDs. DTOs preserve stdout/stderr identity and
  expose no executable, cwd, arguments, environment, native handle, or root path.
- Added Main-owned immutable Run preparations, renderer-owner access/release
  checks, dirty/unsupported guards, and injected authorization/runtime seams.
  Preparations cannot spawn a process or claim RUNNING. Concrete active-project,
  disk/runtime validation and execution lifecycle remain later packages.
- Added narrow internal RunStrategy and JavaScriptRunStrategy with controlled
  explicit executable/argument preparation and shell disabled. TypeScript Run
  remains deferred with no placeholder implementation or dependency.
- Added typed Main IPC and Preload factories with validation and handler/listener
  cleanup. They are not composed into the live app until execution is ready.
  ProcessManager, Terminal/node-pty behavior, project/shutdown lifecycle, and
  renderer UI/security boundaries were not changed.
- Focused tests passed 37/37. Full regression passed 424/424 across 43 files;
  typecheck, lint, production build, and whitespace checks passed. Existing
  maxWorkers=4 and timeouts were preserved. The known jsdom canvas warning was
  observed without a test failure. Sandbox esbuild EPERM required an approved
  build outside the sandbox; no build configuration workaround was introduced.
- Added lint-only environment/CommonJS metadata to the retained native spike
  fixture; its behavior and evidence remain unchanged. No new dependency,
  package-lock change, production native adapter, UI, commit, or push was added.
  Phase 4 remains IN_PROGRESS; 4B–4F are not complete.

## Phase 4B — PATH Runtime and Native Binding (`COMPLETE`)

- Resumed interrupted 4B implementation: Main PATH-only Node detection, internal
  RunService launch/resource registration, Windows x64 piped-process Node-API
  binding and Electron build artifact integration. Fixed current-drive PATH
  ambiguity and kept native compilation conditional for portable JS builds.
- Native creation establishes Job ownership before user code runs; bounded
  asynchronous stdout/stderr, UTF-8 decoding, root/EOF settlement and explicit
  release were verified through the production Electron entry. ProcessManager
  and Terminal code are unchanged; no live Renderer Run authority was exposed.
- Full suite: 436 tests / 44 files passed. Typecheck, lint, production build and
  whitespace gates passed. Electron 44.0.0 / ABI 149 / Windows x64 smoke passed
  15 output/exit/release cycles plus root-first descendant cleanup and failed
  spawn rollback. Existing jsdom canvas diagnostics remain non-blocking.
- No dependency, lockfile or new ADR decision. App lifecycle, concrete disk
  authority, re-run, Output UI and final Phase 4 acceptance remain 4C–4F;
  packaged/installed and both-platform Windows acceptance remain Phase 7.

## Phase 4C — Run Lifecycle (`COMPLETE`)

- Implemented RunService start/stop/re-run using existing session contracts and
  opaque Main IDs. Canonical same-target requests serialize; other targets remain
  concurrent. Old session callbacks cannot update replacement sessions. Dirty
  targets remain Save-first; no execution authority was added to Renderer.
- ProcessManager's existing per-owner cleanup mechanism now drives exact-session
  lifecycle cleanup. Duplicate Stop shares work; cleanup failures retain STOPPING
  and tracking for retry, blocking replacement. Root/EOF/native release are required
  before one terminal state/exit event; recent completed snapshots are bounded.
- Added 22 deterministic lifecycle tests and production Electron lifecycle smoke.
  Focused 4A–4C: 71/71; full regression: 458/458 in 45 files. Typecheck, lint, build,
  whitespace, existing 4B native smoke, and Monaco production-worker smoke passed.
  Lifecycle smoke verified five real sessions and zero remaining resources under
  Electron 44.0.0 / ABI 149 / Windows x64, including root-first descendant cleanup.
- No ProcessManager redesign, native architecture change, Terminal/renderer change,
  new dependency, lockfile edit, or new ADR. Project/application integration and
  Run/Output UI remain later packages. Phase 4 overall remains IN_PROGRESS.

## Phase 4D — Project / Application Lifecycle (`COMPLETE`)

- Added managed RunProjectLifecycle and Main composition. Existing post-unsaved
  transition guards now await project-owned Run cleanup before switch/close;
  cancellation leaves Run active and failures preserve the project for retry.
- Reused FileSystemService availability notifications and canonical path resolver;
  no Run watcher. Unavailable/teardown events are muted while native accounting
  continues. Generation guards prevent pending starts from surviving transitions
  or shutdown; cleanup promises are awaited through final tracking removal.
- Integrated with existing DesktopApplication/quit-coordinator failure semantics.
  No changes to ProjectService, UnsavedTransitionService, DesktopApplication,
  ApplicationQuitCoordinator, ProcessManager or Terminal implementation.
- Added 16 integration tests. Focused suite: 109/109; final full regression:
  474/474 across 46 files. Typecheck, lint, build, whitespace and Monaco worker
  smoke passed. Native 4D smoke released four sessions across project/application
  scenarios with zero tracked resources; existing lifecycle smoke also passed.
- Kept shared Main chunks beside the entry to preserve native binding lookup.
  Native architecture, dependencies, lockfile, security flags and Renderer invoke
  authority unchanged. Run/Output UI remains 4E; Phase 4 overall is IN_PROGRESS.

## Phase 4E — Run / Output UI (`COMPLETE`, 2026-09-05)

- Wired the existing narrow validated Run capability into Main and Preload.
  Added Main-owned renderer navigation/destruction cleanup with generation guards,
  pending-start invalidation, native release and retained shutdown retry ownership.
- Added one Run entry on the right of the existing editor-tabs header and
  contextual Stop/Retry Stop. Saved active-project .js files run; dirty, missing,
  unavailable, conflicted and unsupported targets have disabled feedback.
  TypeScript copy explicitly describes current V1; Node/spawn errors stay inline
  and safe. Re-run delegates cleanup/replacement to Main.
- Added Output to the existing Bottom Panel with its current height/resizer and
  tokens. Per-target views preserve separate stdout/stderr and delivered order;
  state/exit/error presentation uses Main DTOs. Animation-frame notifications batch
  streaming output. Project/session guards and application-owned subscription
  cleanup prevent stale output or listener growth across panel switches/unmount.
- Added 21 renderer/Preload/service integration cases, three owner-cleanup cases
  and one App panel/subscription case. Updated existing capability/count fixtures
  for the new Run subscription. Full regression passed 499/499 across 47 files;
  maxWorkers=4 and test timeouts/retries remain unchanged. Known jsdom canvas
  diagnostic is non-blocking. Typecheck, lint, production/native build and
  git diff --check passed.
- New production UI smoke verified actual built React/Monaco/Preload/native Run,
  click Run/re-run/Stop, stdout/stderr, exit 0/7 and Problems/Output tab switching.
  Four native sessions released and zero resources remained. Screenshot review
  confirmed the approved header location and existing panel style. Existing
  native smoke (15 cycles), lifecycle smoke (five sessions), project lifecycle
  smoke (four sessions) and Monaco production-worker/security smoke passed.
- No dependency, lockfile, accepted decision, security-flag or shell redesign.
  Terminal/Problems changes only add Output navigation. No commit/push/merge.
  At 4E completion, Phase 4 stayed IN_PROGRESS and 4F required explicit authorization.

## Phase 4F — Stabilization / Final Verification (`COMPLETE`, 2026-09-05)

- Audited all Phase 4 working-tree changes, native source/build integration, spike
  evidence, tests and documentation. No unrelated file, tracked generated binary,
  temporary artifact, log, debug file, secret/private data or local developer path
  remains. Native compiler outputs stay under ignored `out/`; dependencies and lockfile
  are unchanged.
- Reverified 4A–4E contracts, Main ownership, PATH-only Node resolution, creation-time
  Job ownership, separate streams, exit/finalization, re-run, cleanup retry retention,
  project/application cleanup, stale-session rejection, typed Preload IPC, editor Run
  action, Output UI and renderer subscription ownership. Security flags and the strict
  Renderer/Main process boundary remain unchanged.
- Focused Phase 4 coverage passed 180/180 across eight files. Two consecutive full
  suites passed 500/500 across 47 files with `--maxWorkers=4` and unchanged timeout,
  retry and Monaco policy. Representative Terminal, Problems, Search, language,
  editor/save and panel regression coverage passed 147/147 across 16 files.
- Native smoke passed 15 cycles. Run lifecycle smoke passed three repetitions of five
  sessions, project/application lifecycle smoke passed three repetitions of four
  sessions, and the built Electron Run UI smoke passed twice with eight sessions and
  six same-target cycles each. Every run ended with zero tracked resources, released
  native handles and no orphaned descendants; root-first-child cleanup remained PASS.
- Terminal native/service smoke, Monaco production-worker/security smoke, typecheck,
  lint, production build and `git diff --check` passed. Production Main output resolves
  the native binding relatively. Windows 11 NT build 10.0.26200.9168 (25H2) was
  verified; Windows 10 and installed/package verification remain Phase 7 work.
- Phase 4 V1 is complete. TypeScript Run, Run Project, npm scripts, dev servers and
  project entry configuration remain deferred. No commit, push or merge was performed.

## Phase 5A — Git Foundation + Dependency / Repository Detection (`COMPLETE`, 2026-09-06)

- Added side-effect-free Git dependency/repository contracts and one narrow
  `git:get-state` IPC/Preload capability. Requests accept only the active project
  ID; exact validation rejects executable, cwd, argument, command, shell, and
  unknown fields. Responses are exact-validated and expose no canonical path or
  process authority.
- Added a Git-specific Main PATH detector without changing Node detection. It
  checks exact `git.exe` candidates, ignores empty/relative/current-drive entries,
  supports quoted/spaced/Unicode and UNC paths, does not use PATHEXT or cwd search,
  and distinguishes validated `AVAILABLE` from safe-lookup `MISSING`.
  `NOT_CONFIGURED` and configured-path `INVALID_CONFIGURATION` remain reserved for
  future Settings support.
- Added a private finite `GitCommandRunner` using built-in `execFile` with separate
  executable/arguments, `shell: false`, Main-owned cwd, bounded stdout/stderr,
  timeout, cancellation-ready `AbortSignal`, hidden Windows process creation, and
  safe error mapping. Terminal, Run, ProcessManager, and Windows Job semantics are
  unchanged.
- Added GitService repository probing through fixed Main-owned arguments. Main
  authorizes and revalidates the active available project, canonicalizes Git's
  reported top-level, and accepts only exact platform-correct equality with the
  canonical project root. Normal non-Git folders and project subfolders inside a
  parent repository return `NOT_REPOSITORY`; unexpected Git failures remain
  structured errors.
- Final review reopened the premature completion claim for path authorization
  and missing real-process/repository evidence. Remediation strictly validates
  single fully-qualified drive/UNC output before realpath, rejecting malformed
  components, relative/current-drive forms, NUL/control characters and extra
  lines with safe `PROCESS_FAILED`. Dot and drive-relative regressions use the
  actual process cwd as the active root. Existing canonical Windows comparison
  and decisions 1A/2B/3A are unchanged.
- Real-process tests exposed early settlement on spawn failure before child
  close. The local runner fix waits for close and guards duplicate completion;
  deterministic tests cover close-before/callback-before ordering. Six real Git
  process tests verify success, non-zero exit, timeout, cancellation, overflow
  and spawn failure, including dead PIDs, single callback/close, destroyed timer
  resources and removed abort listeners. Overflow uses a live batch process and
  asserts captured output stays within 1024 bytes.
- Three temporary real-Git integrations use production ProjectService identity/
  authorization, GitService, detector, runner and realpath: exact spaced Unicode
  repository root is `REPOSITORY`; ordinary folder and project nested in a parent
  repository are `NOT_REPOSITORY`. Availability is the only stubbed domain port.
  Local Git 2.47.1.windows.2 ran all nine integration tests without skips. The
  Windows/PATH gate explicitly reports unavailable environments; no real UNC
  network-share or packaged/Windows 10 acceptance is claimed.
- After remediation, focused Git/Preload coverage passed 76/76. Full regression
  passed 566/566 across 49 files with the existing `--maxWorkers=4`. Typecheck,
  lint, fresh production/native build and whitespace verification passed.
  Sandboxed test/build spawn EPERM required approved outside-sandbox runs; the
  known jsdom canvas diagnostic remains non-blocking. No test timeout increase,
  assertion weakening, dependency/package-lock change, Phase 5B+ operation,
  Source Control UI, stage, commit or push was introduced. Phase 5A completion
  now includes these remediation gates; Phase 5 overall remains `IN_PROGRESS`.

## Phase 5B — Git Status + Stage / Unstage (`COMPLETE`, 2026-09-06)

- Resumed and completed the interrupted authorized backend package. Added typed
  status and selected-path stage/unstage capabilities with exact IPC/Preload
  validation; Renderer still receives no executable, cwd or command authority.
- Status uses incremental porcelain v2 parsing with staged/unstaged slots,
  untracked files, rename/copy pairs and read-only conflicts. Memory is bounded
  by 1000 retained entries and 128 KiB per token; a complete 1001st entry signals
  truncation and stops the process. Unsupported/malformed output fails closed.
- Main revalidates the exact active repository and canonical selected paths,
  rejects directory expansion, and uses literal pathspecs. Safe unstage handles
  both existing and unborn HEAD without modifying working content or unrelated
  index entries. Rename and copy selection have distinct semantics.
- Process environment strips ambient Git overrides. Streaming timeout,
  cancellation, malformed output, overflow and spawn failure settle after close
  with timer/listener cleanup. Confirmed writes survive failed status refresh;
  unknown mutation outcomes require refresh and are not reported as cancelled.
- Final regression passed 676/676 tests across 53 files with unchanged worker
  settings and no local skips. This includes 18 real 5B repository cases and
  eight real streaming-process cases, plus parser/path/IPC/security coverage.
  Repository evidence includes Unicode/literal paths, staged-plus-modified files,
  additions/deletions, rename/copy, unborn HEAD, conflicts, external index locks,
  nested-root rejection and the 1001-file limit.
- Typecheck, lint, production/native build and whitespace checks passed. Sandbox
  spawn EPERM required approved outside-sandbox tests/build; the existing jsdom
  canvas diagnostic remains non-blocking. No dependency/ADR change or visible UI
  was introduced. Comprehensive owner lifecycle, Source Control UI and remaining
  Git operations stay in 5C–5F. Live UNC, Windows 10 and packaged acceptance are
  not claimed. No project commit, push or merge was performed.

## Phase 5C — Commit + Branch + History (`COMPLETE`, 2026-09-06)

- Implemented the explicitly authorized backend package from the clean,
  committed Phase 5B baseline on `feature/phase-5`. Main/IPC/Preload now expose
  staged-only commit, one local branch snapshot, safe existing-local branch
  switch and bounded local HEAD history. All requests/responses are runtime
  validated; Renderer gains no process or raw Git authority.
- Commit preserves unstaged content and supports first commits and Unicode/
  multiline messages. Invalid messages and Git failures are normalized safely.
  Fixed metadata checks reject commit during merge/rebase/cherry-pick/revert/
  sequencer operations, including a real pending merge verified in tests.
- Branch snapshots distinguish attached, detached and unborn state. Main checks
  fresh local membership before switching, uses no force/discard/creation flags
  and protects ignored files as well as ordinary local changes. A nonzero switch
  can follow an applied switch when post-checkout fails: the approved policy
  reports unknown outcome, requires refresh and never automatically retries.
- History returns full id, subject, author name and authored ISO timestamp from
  HEAD ancestry only. Confirmed unborn history is empty; default/max are 50/100,
  with invalid requests rejected. Fixed NUL framing excludes bodies; typed
  parsing and the existing 1 MiB process-output bound reject malformed/excessive
  output safely. No new history or branch dependency was required.
- Confirmed commit/switch success reuses the 5B applied/refresh-required envelope,
  preserving truth after refresh failure or a project transition. Exact active
  project/root authorization remains in place. Full owner cancellation and
  lifecycle coordination remain Phase 5D.
- Final verification passed: 34 focused 5C tests (23 real Git repository tests),
  176 focused 5A/5B regressions, and all 710 tests across 55 files with unchanged
  `--maxWorkers=4` and no local skips. Typecheck, lint, production/native build
  and whitespace checks passed. Local Git: 2.47.1.windows.2.
- Sandboxed test/build EPERM required approved outside-sandbox execution. An
  initial full run concurrent with build had two new tests exceed the existing
  5-second timeout. History's unnecessary branch enumeration was removed; final
  isolated full-suite verification passed with all assertions/timeouts intact.
  No sleeps, configured retries or skipped tests were added. The existing jsdom
  canvas diagnostic remains non-blocking.
- Updated Implementation Plan and Codebase Map after verification. No dependency,
  package-lock or ADR change; no Source Control UI, remote Git, Phase 5D system,
  repository stage/commit/push, or overall Phase 5 completion is claimed.

### Phase 5C remediation — valid local branch `@` (2026-09-06)

- Corrected the MEDIUM review finding: shared validation and branch snapshots
  accept Git-valid `@` without weakening other name restrictions. Its presence
  no longer prevents switching unrelated local branches.
- Implemented user-approved option 1: normal branches retain safe `git switch`;
  `@` uses Main-generated exact `refs/heads/@` with a native detached switch,
  project/root and HEAD/ref revalidation, then symbolic HEAD attachment and final
  proof. Native post-checkout may see DETACHED, as explicitly approved.
  Failed/interrupted steps or unproven final state return mutation-outcome-unknown
  after a recovery probe, without rollback, retry, hook suppression or read-tree.
- Added real Git evidence for exact target identity, hooks, blocked and harmless
  local changes, ignored-file preservation, attachment lock failure, ref/project
  changes and failed final proof. Existing invalid-input checks still pass.
- Corrective reopening is complete: focused 44/44 (32 real Git cases), 5A/5B
  regression 176/176, full suite 720/720 across 55 files with maxWorkers=4,
  typecheck, lint and production/native build passed. Git 2.47.1.windows.2;
  approved outside-sandbox test/build execution, no timeout inflation or retries.
- No dependency/package-lock change, repository staging/commit/push, Phase 5D,
  Source Control UI or remote Git was introduced.

### Phase 5C resumed verification (2026-09-07)

- Reviewed the existing uncommitted `@` correction; no further production edit
  was needed. Corrected the Implementation Plan overview to list 5D–5F remaining.
- Fresh standalone full suite passed 720/720 tests in 55 files; typecheck, lint
  and production/native Windows build passed. An earlier suite overlapping
  typecheck/lint had three timeouts (717 passed); no assertions, timeouts,
  worker settings or skip/retry settings were changed. Tests/build ran with
  approval outside the sandbox after spawn EPERM.
- 5C remains complete. No ADR, dependency or later-package scope changed.

## Phase 5D — Git lifecycle, cancellation and stale results (`COMPLETE`, 2026-09-08)

- Resumed the authorized unfinished work on `feature/phase-5`, preserving its
  uncommitted implementation and fixtures. Added Main-owned project/window
  generations, latest-read cancellation, mutation serialization and transition/
  shutdown draining around the existing GitService semantic operations.
- Added validated identity framing and Preload receiving guards. Late replies
  are rejected after supersession, project changes, root unavailability or app
  shutdown. Confirmed mutations preserve `applied` while dropping stale status;
  unknown outcomes require refresh and never trigger automatic retries.
- Production Git now uses retained Windows Job ownership with bounded command
  timeouts/output. Root exit terminates surviving hook descendants; release
  requires both pipe EOFs, native settlement and an empty Job. Cleanup failure
  blocks authority release and app shutdown until retry succeeds. The private
  native Git entry shares pipe/Job primitives while preserving Run's original
  single-target entry, separate service and lifecycle.
- Verification passed: 760/760 tests across 59 files, including 40 5D cases;
  real Git hook/descendant, abort/timeout and semantic mutation integration;
  Git native Electron Unicode/argv/commit/history smoke; existing Run native
  smoke with 15 cycles, root-first cleanup and failed spawn. Typecheck, lint,
  final production/native build and whitespace checks passed.
- Evidence host: Windows NT 10.0.26200.0 x64, Git 2.47.1.windows.2 and Electron
  44.0.0. Sandbox EPERM required approved external execution. Earlier suites
  had timeout failures; oversized native scenarios were split into independent
  cases and final standalone verification passed with unchanged worker count,
  timeout limits and configured retries. Existing jsdom canvas noise remains.
  Non-Windows native skips provide no Windows acceptance evidence.
- Updated Architecture, Codebase Map and Implementation Plan. No ADR change,
  added dependency, repository commit/push or Phase 5E/5F implementation.
  Overall Phase 5 remains in progress; Source Control UI is the next package.

### Phase 5D remediation — committed document ownership (2026-09-08)

- Completed resumed verification of the MEDIUM finding where `git:get-context`
  could restore an owner revoked during navigation. Main now observes windows
  before load and restores ownership only on a committed current main document;
  context and semantic IPC reject stale Electron sender-frame identities.
  Shared DTOs and the public Git API are unchanged.
- Six added document regressions verify context rejection, replacement/token
  races, repeated navigation, invalid callers, read cancellation and mutation
  draining. The focused document/lifecycle IPC run passed 16/16 tests; the full
  suite passed 766/766 across 60 files with no skips.
- Real sandboxed Electron Preload/Main smoke passed three reloads on the same
  WebContents, four distinct document frames and three rejected old-document
  requests. Fresh document requests succeeded after each commit.
- Typecheck, lint, production/native build, Git native smoke, Run native smoke
  (15 cycles plus descendant cleanup and failed spawn), and diff whitespace
  checks passed. Test/build sandbox spawn EPERM was resolved by approved
  outside-sandbox execution. Existing jsdom canvas diagnostics were non-blocking.
- Phase 5D returned to COMPLETE after corrective verification. This continuation
  retained the prior implementation without further production changes and
  updated acceptance evidence. No ADR/dependency change, architecture deviation,
  repository commit/push or Phase 5E/5F work.

## Phase 5E — Right sidebar and Source Control (original completion, 2026-09-08)

### Resumed corrective acceptance (2026-09-09)

- Verified the retained whitespace-only Search fix and four regression cases:
  Names restores its tree, Contents remains idle, no empty search is sent, and
  active-query cancellation rejects late results while preserving literal spaces
  in non-empty queries.
- Default parallel `npm test` passed 811/811 in 65 files with unchanged four
  workers, timeouts, assertions and retry settings. Previous Git timeouts did
  not reproduce; no timing root-cause fix is claimed.
- Typecheck, lint, production/native build, both Electron 5E smokes and
  `git diff --check` passed. Inspected four regenerated sidebar screenshots;
  real Git smoke verified semantic actions, sandbox and owned cleanup.
  Tests/build used approved external execution after sandbox spawn failures.
- 5E returns to COMPLETE; 5F remains NOT_STARTED. No dependency, ADR,
  architecture change or repository commit/push.

### Corrective sidebar follow-up (2026-09-08; historical blocker)

- Follow-up icon correction: replaced the Explorer tab's `Folder` with the
  existing Lucide `Files` icon in `App.tsx`, matching `icon: Files` in Orca's
  `src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts`
  at locked commit `4bb337741c335cfcc428d3b4271023566e2dadb8`. Retained the
  16 px icon and existing tab styling. Typecheck, lint, build, 60 Explorer
  integration tests and real Electron sidebar/Git smoke passed; the regenerated
  `explorer-aligned.png` was visually inspected. No dependency or ADR change;
  the previously recorded full parallel-test blocker remains unchanged.
- Finished verification of the resumed Orca-aligned sidebar geometry, search-mode
  strip, compact file rows and trusted file-only Git decorations. Added explicit
  accessible file-row names, including conflict read-only descriptions.
- Expanded the real Electron smoke with accessible labels, DPI-aware geometry,
  220 px keyboard resizing and viewport/content containment. Real Git/UI and
  Names/conflict fixture smoke passed; all four generated screenshots were inspected.
- Focused regression passed 85/85; full sequential diagnostic passed 807/807
  tests across 65 files via `npm test -- --no-file-parallelism`. Typecheck, lint,
  production/native build and whitespace checks passed.
- Default parallel `npm test` still has varying 5-second real Git integration
  timeouts. The corrective package is BLOCKED on that gate, despite successful
  sequential verification; no timeout/assertion/configuration changes were made.
  No new dependency, ADR, architecture deviation, repository commit/push or 5F work.

### Original baseline evidence

- Continued the existing uncommitted 5E work on `feature/phase-5`, preserving
  sidebar, Names/Contents search, Source Control and test changes. The right
  sidebar provides Explorer/Source Control icon tabs with retained session state.
- Source Control presents dependency/repository states, staged/unstaged/untracked
  files, read-only conflicts, selected-file stage/unstage, staged-only commit,
  current/local branch switching and bounded history through the existing Git API.
- Drafts survive tab/Refresh changes; only unchanged successfully submitted text
  is cleared. Newer edits and failed/unknown submissions are retained. Project
  replacement/close resets drafts. Mutations are serialized in the UI; stale reads
  and unsafe follow-up after unknown/unrefreshed outcomes are blocked.
- Corrected initial project-lock recovery and read settlement after unavailable
  roots; added the regression test. Matched Source Control scrolling to existing
  dark semantic styles without redesigning the Orca-aligned shell.
- Verified 802/802 automated tests across 64 files, typecheck, lint, final
  production/native build and whitespace checks. Initial sandbox spawn EPERM
  required approved external execution. A first-run Monaco timeout did not recur
  in the full rerun; no test timeout/worker configuration changed.
- Added `scripts/smoke-git-ui.mjs`: built App + production Preload/Main/document
  ownership/GitService/native runner passed real temporary-repository status,
  stage/unstage, staged-only commit, branch/history, draft retention, project
  replacement/non-repository/close, sandbox and owned cleanup. Component fixture
  smoke separately passed conflict/no-overflow and Names rendering checks.
  Screenshots in `out/phase-5e-ui/` were inspected.
- Updated Codebase Map and Implementation Plan. No new dependency, ADR change,
  architecture deviation or commit/push of this repository. Phase 5E is complete;
  Phase 5F remains NOT_STARTED and overall Phase 5 remains IN_PROGRESS.

## Phase 5F — Stabilization / Final Verification (`COMPLETE`, 2026-09-09)

- Started from clean committed Phase 5A–5E baseline `6af919e` on
  `feature/phase-5` and audited contracts, Main/Preload/Renderer authority,
  repository/path validation, mutation truthfulness, stale-state isolation,
  document ownership, Search/Git separation, process cleanup, UI state and test
  quality. No production defect or architecture/decision change was required.
- Focused tests passed: 5A 66/66, 5B 110/110, 5C 44/44, 5D 46/46, 5E 105/105,
  Phase 2D Search 28/28 and Run 112/112. The combined real-Git matrix passed
  72/72. Full `npm test` passed 811/811 across 65 files with the established
  four workers and no local skips.
- Electron/native evidence passed Git command/Job cleanup, three document reloads,
  built semantic Git/UI workflow, Names/conflict/resize presentation, 15 Run
  native cycles, Run re-run/stop and project/application cleanup. All lifecycle
  smokes finished with zero retained resources.
- Typecheck, lint, production/native build and whitespace checks passed. No retry,
  sleep, timeout, assertion or worker policy changed; no dependency or lockfile
  changed. The managed sandbox required the existing approved external process
  path for test/build execution.
- Confirmed absent/deferred: remote Git and fetch/pull/push, hosted review APIs,
  merge/rebase and conflict resolution, discard/diff, stage-all, branch management,
  worktrees, submodules, polling/watchers, Explorer folder aggregation and context
  menus. Packaged/installed Windows 10/11 verification remains Phase 7.
- Phase 5 is COMPLETE. No commit, push, merge or tag was performed by Phase 5F.

## Phase 5 corrective native-test portability (2026-09-09)

- Ubuntu GitHub Actions exposed that the Phase 5C real local Git integration
  suite ran unconditionally even though production Git detection intentionally
  uses Windows `git.exe` semantics. This was a test-configuration defect; no
  production Git regression was found.
- Correctively reopened Phase 5C and Phase 5F, then guarded the entire 5C native
  suite with the existing non-Windows suite-skip policy. Non-Windows CI now
  skips the Windows-specific suite intentionally. Windows still runs all 32
  tests and treats unavailable Git or any assertion failure as a failure.
- Focused Phase 5C passed 32/32 on Windows. Phase 5A/5B/5D native regression
  passed 32/32. The first unchanged default full run recorded one existing
  5-second timing-sensitive 5C timeout at 5.022 seconds (810/811 passed); an
  independent unchanged rerun passed 811/811 across 65 files.
- Typecheck, lint, production/native build and `git diff --check` passed. No
  assertion, timeout, configured retry, production code, product semantic,
  dependency, lockfile, contract, IPC or ADR changed. Phase 5C and Phase 5F
  returned to `COMPLETE` after local corrective verification.
- The corrected Ubuntu GitHub Actions run remains pending until this uncommitted
  change is pushed. No CI pass, commit, push, merge or tag is claimed here.

## Phase 5.5B C# compatibility hard gate (2026-09-10) — COMPLETE

- Built an isolated Windows spike for real `csharp-ls` stdio LSP behavior using
  trial versions 0.27.0, .NET SDK 10.0.401/runtime 10.0.12,
  `vscode-languageserver-protocol` 3.18.3, and `vscode-jsonrpc` 9.0.2. No
  production dependency or C# service code was added.
- Verified `.sln`, `.slnx`, recursive multi-project mode, paths with spaces/`#`/
  Unicode, UTF-16 dirty incremental sync, completion/resolve/cancellation,
  hover/signature/definition, pull diagnostics, dynamic watched-file
  registration, graceful/unexpected exit, and zero surviving owned processes.
- Verified strict TypeScript, Electron 44 runtime imports, and electron-vite 5.0.0
  production bundling. Project mode also demonstrated that current `csharp-ls`
  recursively loads project files under `bin`, `obj`, `build`, and `out`; Main
  cannot claim ownership of the actual loaded set.
- The initial machine-readable workspace-load failure check did not pass. A
  malformed project initialized and registered normally, stayed alive, returned
  an empty semantic result, and ended work-done progress normally. Only human
  log/progress strings exposed the failure.
- The authorized corrective spike retained `csharp-ls` and verified a structured
  Main-owned preflight: effective SDK exit state, `.sln`/`.slnx` parse exit state,
  bounded `.csproj` discovery, evaluation-only MSBuild property/item JSON, and
  contained/existing `ProjectReference` checks. Valid/broken solution and project,
  unknown/missing SDK, missing reference, targeting, and multi-project cases all
  produced their expected deterministic state without build, restore, target
  execution, temporary solutions, or workspace mutation.
- An unavailable targeting pack intentionally remained a preflight false positive,
  recording the bounded guarantee: `READY` does not certify equivalent Roslyn
  workspace health, and `RUNNING` means only an alive initialized LSP session.
  Valid and broken workspaces both returned empty/null semantic outcomes, so
  semantic emptiness and human log text are excluded from readiness.
- ADR-022 now selects `csharp-ls` 0.27.0, protocol 3.18.3, and JSON-RPC 9.0.2.
  Phase 5.5B is `COMPLETE`, Phase 5.5 is `IN_PROGRESS`, and 5.5C–5.5H remain
  `NOT_STARTED`; no production C# language implementation was added.
- Final verification passed 12/12 structured preflight cases, the full provider
  harness including valid/invalid semantic checks, spike TypeScript/Electron/
  electron-vite gates,
  root typecheck, lint, production/native build, 811/811 tests, and
  `git diff --check`. The first full test attempt had one timing-only Monaco
  timeout; its focused run and the unchanged full rerun passed.

## Phase 5.5C — Contracts + Dependency Foundation (2026-09-10) — COMPLETE

- Added side-effect-free shared contracts and exact validators for C# provider/
  capability ownership, dependency/service/workspace states, safe reason codes,
  project-relative documents, positions/ranges/versions, semantic requests,
  completion/hover/signature/definition/diagnostic DTOs, and opaque completion
  handles. Public shapes expose no executable, canonical-root, process, cwd,
  spawn, raw LSP/JSON-RPC, raw completion-data, or Electron authority.
- Added Main-only PATH resolution and canonical executable validation, finite
  bounded dependency probing, `dotnet --list-sdks` inventory parsing with SDK
  10+ and prerelease-only semantics, and `csharp-ls --version` enforcement for
  the exact approved 0.27.0 provider.
- Enforced development private-provider-first then PATH fallback and packaged
  app-owned-only resolution with no packaged PATH fallback. The packaged
  candidate is supplied by trusted Main composition; Phase 5.5C did not invent
  a payload directory, and Phase 7 retains packaged/installed verification.
- Added exact runtime dependencies `vscode-languageserver-protocol` 3.18.3 and
  `vscode-jsonrpc` 9.0.2 plus 19 focused validation/dependency tests. The full
  test command, typecheck, lint, production/native build, and whitespace gate
  passed without weakening worker, timeout, retry, assertion, or test policy.
- Added no workspace preflight execution, long-running language session, LSP
  connection, provider spawn lifecycle, document synchronization, IPC/Preload,
  Monaco semantic integration, diagnostics/Problems UI, or Phase 5.5D+ work.

## Phase 5.5D — Main LSP core and C# adapter (2026-09-10) — COMPLETE

- Implemented Main-only pinned JSON-RPC stdio transport, request correlation,
  cancellation/deadlines, server handlers, protocol error normalization and
  disposal. The C# adapter captures UTF-16 initialize capabilities and maps
  completion/resolve, hover, signature, definition and pull document diagnostics.
  Completion data and diagnostic result IDs remain in Main.
- Implemented the dependency-backed one-session manager, generation/stale-result
  guards, crash handling without automatic restart, graceful shutdown and
  retained cleanup failure ownership. Added only low-level document/watched-file
  notification primitives; no production synchronization orchestration.
- Applied the separately authorized native C# process decision: writable stdin,
  stdout/stderr pipes, atomic Windows Job creation and terminate/empty/release
  ownership. Run, Git, Terminal and ProcessManager behavior are unchanged.
- Verified 33 deterministic LSP/adapter/lifecycle tests. Production Electron
  smoke proved surviving descendant ownership after hard-killing root 27124,
  rejected early release, descendant 19404 termination, an unaffected unrelated
  control, and blocked stdin write settlement before release. Real csharp-ls
  0.27.0 on SDK 10.0.401 advertised all required V1 capabilities with the minimal
  client and shut down with zero retained registrations.
- Typecheck, lint, production/native build and whitespace checks passed.
  The initial final full suite passed 862/863; one unchanged Phase 5C Git integration
  test timed out at 5000 ms despite passing in isolation. Full-suite acceptance
  was BLOCKED at that point. No assertion, timeout, worker setting or retry was weakened;
  canonical TEMP casing was used for the test process after diagnosing existing
  case-sensitive fixture expectations.
- Corrective investigation reproduced the Git timeout in the existing real-Git
  harness: the affected case took 4044 ms alone and 5024 ms under concurrent Git
  suites, while language + Git passed at 3881 ms and no C#, native or Git child
  survived. Repeated repository setup subprocesses across four workers caused
  resource contention; no Phase 5.5D lifecycle leak was found.
- The Phase 5B/5C/5D real-Git harnesses now reuse one prepared baseline per suite
  while copying an isolated repository for each test. This retains every real
  Git operation and assertion while removing redundant init/config/add/commit
  setup. No timeout, retry, sleep, worker, skip, assertion or production Git
  behavior changed.
- Focused local Git passed 32/32; the exact Git-suite reproduction passed
  266/266; the combined changed harnesses passed 55/55. Two consecutive canonical-
  TEMP full suites passed 863/863 in 51.31 s and 48.96 s. Typecheck, lint,
  production/native build and whitespace checks passed.
- No workspace selection/preflight orchestration, language IPC/Preload, Renderer
  providers, Problems/status UI, or Phase 5.5E+ work was started.

## Phase 5.5E — Workspace and document synchronization (2026-09-11) — COMPLETE

- Implemented Main-owned bounded workspace discovery, saved valid .sln/.slnx
  selection, opaque multi-candidate choices, project mode and syntax-only fallback.
  Per-project selection uses versioned atomic persistence and backup recovery.
  Preflight uses fixed evaluation-only commands, structured exit/JSON results,
  canonical containment and ProjectReference checks. No target/build/restore or
  intentional workspace write is requested; the trusted-project limitation is
  unchanged.
- Added finite native preflight commands with bounded output/deadlines and
  terminate/drain/empty/release Job ownership. Cleanup failure is retained and
  blocks conflicting commands. Main composes the lazy session with project,
  root, renderer-owner and application lifecycle.
- Internal document synchronization retains authoritative text and ordered
  incremental UTF-16/model versions, flushes before semantic work, rejects stale
  results and orders saves through FileSystemService. Watcher events honor
  open-document precedence and dynamic registration/kind masks.
- Real Electron smoke found expected stale watcher cancellation being reported
  as cleanup failure on project close. Only stale-session errors from a replaced
  watcher are now suppressed; live I/O/protocol/cleanup failures remain visible.
- Focused tests: 47/47 PASS, covering workspace policy/persistence, malformed
  evaluation and reference failures, canonical escape, dirty buffers, Unicode,
  batching/version order, save races, rename/delete, switch/close/root loss,
  close during provider startup, renderer loss, stale results, crash/no restart
  and retained cleanup failures.
- Standard npm test: 910/910 tests in 70 files PASS (53.34 s), without altered
  workers/timeouts/assertions/retries or environment overrides. Four existing
  filesystem/project/search test fixture helpers canonicalize TEMP with realpath;
  assertions are unchanged. Existing jsdom canvas noise remains non-blocking.
- Typecheck, lint, production/native build and git diff --check PASS.
  scripts/smoke-csharp-preflight.mjs passed real Electron/native SDK 10.0.401
  .sln/.slnx evaluation, unchanged fixture hashes and malformed-project rejection.
  scripts/smoke-csharp-workspace.mjs passed real csharp-ls 0.27.0 solution/.slnx/
  project-mode cycles with Unicode/space/# paths, dirty UTF-16 versions,
  flush-before-request, FileSystemService save, close/stale-handle rejection,
  zero retained provider registrations and syntax-only fallback without a process.
  Smoke exercises production Main modules; user-facing integration remains 5.5F–G.
- Existing scripts/smoke-csharp-native.mjs also PASS: hard-killed root 11104,
  surviving descendant 21660 retained until Job termination, empty-before-release,
  unrelated control preserved, blocked stdin settled and real provider shutdown.
- No new dependency/ADR resolution, architecture deviation, language IPC/Preload,
  Renderer provider, diagnostics/Problems/status UX, C# Run or trust UX. Phase 7
  retains packaged/installed acceptance. 5.5E is COMPLETE; 5.5F still requires
  separate authorization.

- Updated actual module map and implementation/language status. No commit, push
  or merge was performed.

## Phase 5.5F — IPC, Preload and Monaco semantic providers (2026-09-11) — COMPLETE

- Added exact-validated, committed-frame-owned C# language IPC and a narrow
  Preload API for workspace selection, document synchronization, completion,
  completion resolve, hover, signature help, definition and cancellation.
- Added Main semantic mapping with bounded opaque completion handles, safe
  presentation text, stale-result guards and canonical active-project
  containment for definition targets.
- Added Renderer-session synchronization and separate Monaco completion, hover,
  signature-help and definition providers using negotiated capabilities/triggers
  and explicit UTF-16 range/enum conversion.
- Focused 5.5E–F regression tests passed 150/150; the full suite passed 947/947
  in 72 files. Typecheck, lint, production/native build and `git diff --check`
  passed without changing test policy.
- Diagnostics/Problems/status UX, C# Run, public restart/raw logs and all other
  deferred capabilities remain outside 5.5F. No dependency, ADR or architecture
  deviation was introduced.

## Phase 5.5G — Diagnostics, Problems and status UX (2026-09-12) — COMPLETE

- Added exact-validated open-document diagnostic IPC/Preload routing. Main
  serializes pulls after document synchronization, retains `resultId` privately,
  normalizes bounded severity/code/source/message/ranges, and rejects cancelled or
  stale owner, project, session, document and model-version work.
- Added the C# Renderer diagnostic controller with a dedicated Monaco marker
  owner, existing Problems aggregation/navigation, dirty-model preservation,
  provider/project generation guards, and scoped clear/disposal. Post-edit
  `unchanged` reports use bounded settling pulls until a fresh full report arrives.
- Added status-bar UX that presents dependency, workspace and service lifecycle
  independently, including solution selection, loading/failure, syntax-only
  fallback and `CRASHED`, without public restart, process or raw-log authority.
- Focused diagnostics/Problems/status coverage passed 128/128. The full suite
  passed 1004/1004 tests in 74 files; the existing jsdom canvas warning remained
  non-blocking. Typecheck, lint and production/native build passed without
  changing test workers, timeouts, assertions or retry policy.
- No dependency, ADR or architecture deviation was introduced. C# Run, workspace
  diagnostics, Razor, metadata navigation, public/manual restart, raw logs and all
  other deferred capabilities remain absent. Windows Electron smoke, repeated
  cycles/performance review and final Phase 5.5 verification remain Phase 5.5H.

## Phase 5.5F/G corrective runtime verification (2026-09-12) — IN_PROGRESS

- Reopened after failed manual hover/diagnostics acceptance. Preserved canonical
  C# document/watcher URI casing on the wire, keeping decoded case-insensitive
  Windows ownership checks and duplicate rejection. Previous adapter comparison
  reproduced null hover/empty diagnostics only with lowercased wire identity.
- Added `scripts/smoke-csharp-acceptance.mjs`: a fresh dotnet console fixture,
  actual Electron application/Preload/Monaco/csharp-ls, private build-only trace,
  capability/registration/security checks, marker/Problems checks and screenshots.
  All five requested workflows passed in automated real-app verification.
- Focused regression: 170/170; full suite: 1005/1005 in 74 files; typecheck, lint,
  production/native build and diff-check passed. No production architecture,
  public contract, scheduling or lifecycle change was needed in this resumption.
- Manual pointer/keyboard reacceptance is still unverified because Windows
  Computer Use's native pipe was unavailable. Automated evidence does not replace
  that claim. F/G remain IN_PROGRESS; 5.5H remains NOT_STARTED.

## Phase 5.5F/G development-launch correction (2026-09-13) — VERIFIED

- Identified the first launch divergence: the real-app acceptance harness pinned
  the Phase 5.5B private .NET 10.0.401/provider stack, while `npm run dev`
  inherited its caller's `DOTNET_ROOT` and PATH. The inspected dev environment
  resolved system .NET 10.0.112 and did not contain the project-private provider.
- Added a development-only launcher that uses the complete validated private pair
  when present and preserves PATH fallback otherwise. Production composition,
  IPC, security, diagnostics, scheduling and lifecycle logic did not change.
- A real `npm run dev` trace verified CS0029 from provider through Monaco and
  Problems for `int b = "aaa";`, then verified CS0029 cleared for `int b = 123;`.
  Focused tests passed 171/171; the final full suite passed 1009/1009; typecheck,
  lint, production/native build and `git diff --check` passed. Phase 5.5H remains
  NOT_STARTED.

## Phase 5.5H — Stabilization and final verification (2026-09-13) — COMPLETE

- Final verification passed: focused 227/227 tests (14 files), full 1009/1009
  (75 files), typecheck, lint, production/native build and git diff --check.
- Real Windows native ownership/descendant cleanup, blocked stdin settlement,
  provider lifecycle, workspace/preflight, Unicode/UTF-16, document sync/save
  and repeated cleanup passed. Controlled real-provider crash reached CRASHED,
  rejected the old adapter and released all test-owned resources.
- Final security audit confirmed sandbox settings, runtime validation, trusted
  frame/project/path/version ownership and Main-only protocol/process authority.
- The user confirmed manual completion, hover, signature help, definition,
  markers/Problems, correction clearing, project switching, document reopening
  and npm run dev acceptance PASS, and confirmed all remaining H gates satisfied.
  This supersedes the historical manual-pending F/G and H records above.
- Phase 5.5A–5.5H and overall Phase 5.5 are COMPLETE. Final closure changed
  documentation only; no production code or architecture changed. Phase 6/7
  remain NOT_STARTED. Packaged/installed C# acceptance remains Phase 7.

## Phase 6 — Settings & UX (2026-09-14) — COMPLETE

- Completed the existing SettingsService/IPC/preload and Settings dialog work:
  Light/Dark/System, editor font/tab preferences, fixed shortcut guidance and
  dispatch, and the user-approved dependency guidance scope.
- Implemented ADR-023 Auto Save through existing version-aware saves, with
  1000 ms debounce, rename/disposal handling and dirty/conflict preservation.
- Completed unbounded MRU Recent Projects list/open/remove. Missing folders
  provide recovery guidance; history removal does not delete source or close
  the active project. New history and settings endpoints authorize the current
  Main frame and validate exact payloads.
- Migrated app metadata v1 to v2, preserving history and applying defaults.
  Queued state transformations prevent concurrent Settings/history lost updates;
  backup/default recovery is visible and corrupt primary evidence is preserved.
- Added service/IPC/preload, renderer settings/shortcut, Auto Save and project
  regression coverage. Full suite: 1032/1032 tests in 78 files PASS; typecheck,
  lint, production/native build and diff checks PASS.
- Windows Electron 44 production-stack smoke passed initial save/Auto Save,
  separate-process restart and corrupt-JSON recovery. Light/Dark screenshots
  were inspected. The test-only model observation point and fixture artifacts
  remain under ignored out directories, outside the shipped application.
- No dependency, accepted architecture change, executable-path selection, source
  persistence authority or Phase 7 packaging work was introduced. Phase 7
  remains NOT_STARTED and ready for separate authorization.
## Explorer context-menu follow-up (2026-09-25)

- Replaced Explorer toolbar Rename/Delete buttons with file/folder context-menu
  actions. New File, New Folder and Refresh remain in the toolbar.
- Added independent compact floating menus with viewport clamping, separators,
  lucide icons, destructive Delete color, light/dark semantic tokens, Escape,
  outside dismissal, arrow navigation and right-button release protection.
- Captured the clicked entry and creation directory explicitly; row right-click
  selects without opening files or toggling folders. Background creation uses
  the project root. Existing dialogs, Recycle Bin and dirty-editor guards remain.
- Copy Path uses the browser clipboard for project-relative paths and reports
  failures. No Main/Preload/contracts, dependencies or security settings changed.
  No View File, preview tabs or other excluded actions were introduced.
- Visual/interaction evidence: Orca locked commit
  `4bb337741c335cfcc428d3b4271023566e2dadb8`,
  `src/renderer/src/components/right-sidebar/file-explorer-row-context-menu.tsx`
  (`FileExplorerRowContextMenu`, `stopRightButtonMenuSelection`); independently
  adapted grouping/surface/release behavior without copying modules or stores.
- Verified: 1039/1039 tests across 78 files (69 Explorer/App integration tests),
  typecheck, lint, production/native Windows build and scoped diff whitespace
  checks. Final repository-wide diff check reports trailing whitespace at
  `src/renderer/src/App.tsx:263` in an unrelated concurrent edit, left untouched.
  Live Electron visual QA was not performed. Preserved the pre-existing unrelated
  Problems/Output hover CSS change; no commit or push was performed.
## Local AI Chat UI V1 — 2026-09-25

- Added a Sparkles toggle and a right-sidebar-only chat overlay, preserving
  mounted Explorer/Git state and keeping the sidebar resizer interactive.
- Added static C# example messages and ephemeral mock prompt/reply behavior;
  closing the panel discards the conversation. qwen3:1.7b is display text only.
  No Ollama, AI IPC/preload/backend, file context, tools or persistence.
- Per user correction, retained stock beUI Message, MessageBubble,
  MessageScroller, PromptInput and StreamingResponse source/UI with local import
  rewiring and required upstream support modules. Removed bespoke component CSS;
  only the surrounding chat background follows the project. Semantic Tailwind
  tokens and scrollbar-hide support the upstream classes. Preserved MIT notice
  and source URLs in components/ai. No full shadcn app or demo was imported.
- Added clsx 2.1.1, motion 13.4.3 and tailwind-merge 3.7.0. npm audit reports
  existing Monaco/DOMPurify low/moderate findings; no unrelated upgrades applied.
- Renderer checks: 73/73 passed. Full suite: 1043/1043 across 79 files passed on
  rerun; first concurrent build/test run timed out one real-Git first-commit test
  at 5000ms. Typecheck/lint passed. Light/dark Electron harness renders inspected
  with stock 14px text/16px bubble and prompt radii. Final production/native build
  and diff checks passed. No commit/push/merge.

## C# Project Run M1-01 — Semantic Contracts & Validation (2026-10-07)

- Added side-effect-free, discriminated JavaScript file/C# project target,
  semantic start/session, execution phase, candidate/dependency/resolution and
  safe failure DTOs with exact validators in shared/contracts/run.ts. Validation
  covers lexical Windows paths, suffix/type, bounds, required/extra fields,
  candidate membership/project match and inconsistent dependency/result variants.
- Kept live JavaScript Run API/channels and legacy request/session/event behavior
  intact. New DTOs are additive and intentionally rejected by legacy validators;
  actual C# Run execution, Main authorization and IPC composition remain later work.
  No RunService, native, UI, stdin, dependency or accepted ADR change.
- Verified 178/178 focused/regression tests in six files; final new-contract rerun
  74/74 PASS. Typecheck, final lint, production/native Windows build and diff checks
  PASS. Full automated suite and live C# Windows acceptance were not run or claimed
  for this contracts-only task. No commit/push/merge.
- M1-01 COMPLETE; overall C# Run/M1 IN_PROGRESS. Every later task, including M1-02,
  is NOT_STARTED and requires explicit authorization. M1-04 hard gate is unexecuted.

## C# Project Run M1-02 — Identity & Runtime Foundations (2026-10-07)

- Replaced RunService argv-derived identity with Main-authorized project/kind/
  canonical-path identity. Immutable execution snapshots and SHA-256 fingerprints
  reject target/runtime/execution drift between resolution, preparation and launch.
- Injected fixed trusted strategies at construction; contextual runtime resolution
  receives authorized target and kind. Main still composes JavaScript only.
- Preserved public Run API, saved-file behavior, owner/session checks, re-run,
  project transitions, shutdown and retained ownership on cleanup failure.
- Added identity/runtime tests and re-run/fingerprint lifecycle regressions;
  migrated existing test/smoke constructors. No native, IPC, UI or dependency change.
- Verified: 202 focused tests, full suite 1185 tests / 84 files, typecheck, lint,
  build and diff checks PASS. Three real Electron Windows JS smokes (native,
  lifecycle, project lifecycle) PASS, including released resources/descendants.
- M1-02 COMPLETE; M1 and overall C# Run remain IN_PROGRESS. M1-03 and M1-04
  native/SDK work remain unimplemented. No ADR change, commit, push or merge.

## C# Project Run M1-03 — Windows Native Argument Arrays (2026-10-07)

- Added dedicated private native createRun argv entry while preserving legacy
  Run/Git/LSP signatures. Main sends its immutable prepared array unchanged;
  no public process authority, shell, Output UI or C# strategy is introduced.
- Allows empty arguments and 0–1024 items. Validates fully qualified existing
  executable/cwd, rejects NUL/invalid types, and bounds the quoted command line
  to 32766 UTF-16 units plus NUL before allocating handles. Retains filtered
  Main environment without additions, bounded native environment and NUL stdin.
- Added focused adapter tests and native argv/tree fixtures. Windows smoke
  verifies Unicode/spaces/#/quotes/backslashes, exact count/length boundaries,
  30 invalid-input cases, EOF/environment, 23 round-trips and 15 JS cycles.
  Repeated handle counts stayed 688→688; both multi-argument Stop and root-first
  cleanup released the Job with root/descendant PIDs gone.
- Typecheck/lint/build/diff checks PASS; focused suite 212/212 in eight files and
  full suite 1195/1195 across 85 files PASS.
  First full run timed out one real-Git test under concurrent smoke load; isolated
  32/32 Git rerun and subsequent unchanged full suite passed. Native Run lifecycle,
  project lifecycle, Terminal, Git and existing C# LSP/provider smokes all PASS.
- Manual UI, packaged Win10/Win11 and live UNC-share execution not performed.
  M1-03 COMPLETE; M1/overall C# Run IN_PROGRESS. M1-04 remains NOT_STARTED and
  requires separate authorization. No new dependency, ADR change or Git write.

## C# Project Run M1-04 — Isolated Windows/.NET Evidence (2026-10-07)

- Added `spikes/csharp-project-run/` with a separate native probe, SDK harness,
  Console/build-hold fixtures, reproducible instructions and JSON evidence.
  Production source, Run IPC/UI, SDK resolver, strategy and dependencies unchanged.
- Real Windows 11 x64 build 10.0.26200, SDK 8.0.410/net8.0 and 10.0.112/net10.0:
  32/32 compatibility cases PASS. Verified fixed build/execute flags, no-node-reuse
  workers, evaluation JSON, Unicode paths, streams/exits, actual NuGet restore
  cancellation, build Stop, root/descendant cleanup and isolated stdin/EOF/blocked
  write feasibility. No SDK installed and no global server/process-name kill used.
- Final resources/new surviving .NET processes: 0/0. Every native session released
  all handles and settled writes. Eight measured cycles per SDK had flat handle
  counts (700 for SDK 8, 696 for SDK 10); unrelated control owner survived.
- Production build, typecheck, lint, diff checks, full suite 1195 tests/85 files,
  and native JS Run/lifecycle/project, Git, C# LSP/provider and Terminal regression
  smokes PASS. Harness setup/observation corrections are disclosed in REPORT.md.
- At the time of this evidence run, M1-04 was BLOCKED: §13.7 required Windows 10/11 evidence,
  but only Windows 11 was available. Manual UI/packaged acceptance not claimed.
  No observed host incompatibility requires ADR-024 reopening. M1-05 and later
  production work remain NOT_STARTED; overall C# Run remains IN_PROGRESS.
  No repository commit, push or merge.

## C# Project Run platform scope revision — 2026-10-07

- Revised C# Project Run's verified acceptance platform to Windows 11 x64 through
  an explicit ADR-024 amendment; removed Windows 10 evidence from M1-04's scope.
  Windows 10 is outside the verified baseline; compatibility is not claimed.
  This is a scope decision, not a compatibility failure; other IDE obligations remain.
- Existing Windows 11 32/32 evidence now satisfies M1-04: COMPLETE. Raw evidence
  and technical findings are unchanged; historical BLOCKED metadata is preserved.
- No production code changed or spike rerun. Overall C# Run/M1 remain IN_PROGRESS;
  M1-05 prerequisites are satisfied, but M1-05 remains NOT_STARTED.

## C# Project Run M1-05 — Run SDK resolution and evaluation (2026-10-07)

Completion revalidated on 2026-10-08 without source changes: full suite 1255/1255
(86 files), typecheck/lint/build/diff checks and real Windows production smoke
20/20 PASS. All 77 native sessions released; resources and new surviving .NET
processes 0; eight handle counts 677. Source hashes match the original evidence.
See `spikes/csharp-project-run/M1-05-REPORT.md` for the new captured evidence and
the distinction between rerun checks and prior native regression evidence.
M1-05 remains COMPLETE; M1-06 NOT_STARTED. No commit/push.

- Added production Main-only Run SDK resolver, single-project structured MSBuild
  evaluation and bounded Run-owned probe. Candidate cwd/global.json controls CLI
  SDK selection; stable Run SDK >=8 remains independent of language SDK >=10.
  Added bounded global.json syntax/field diagnostics for host fallback behavior.
- Reused FileSystemService authorization and existing Run native Job/closed-pipe
  cleanup; no new wire contract, native change, dependency, SDK installation,
  target discovery/classification, CSharpRunStrategy or UI/input implementation.
- 60 new focused tests, 214 focused/regression tests and final full suite
  1255/1255 PASS; typecheck/lint/build/diff checks PASS. Windows 11 real SDK 8/10
  smoke 20/20 PASS, 77 sessions released, 0 retained resources/new surviving
  .NET processes, eight repeated handle counts all 682. Native Run/Git/C# language
  and Terminal regressions PASS. Earlier smoke fixture/configuration findings,
  one concurrent-build test timeout and one transient temp-file deletion error
  are disclosed in `spikes/csharp-project-run/M1-05-REPORT.md`.
- M1-05 COMPLETE; M1-06 READY but NOT_STARTED. M1 and overall C# Run IN_PROGRESS.
  No later task, commit, push or merge. Manual UI/packaged acceptance not claimed.

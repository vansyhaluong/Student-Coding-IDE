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

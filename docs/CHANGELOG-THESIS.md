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

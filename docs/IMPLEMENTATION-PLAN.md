# Student Coding IDE Implementation Plan

## 1. Purpose

This document converts the accepted Student Coding IDE requirements and
architecture into an ordered execution plan. It defines ownership, dependencies,
decision gates, tests, acceptance criteria, and phase exit conditions from Phase
2 through Phase 7.

It is not a replacement for requirements or architecture, does not authorize
implementation by itself, and does not resolve decisions that remain open. All
Phase 2+ implementation work is initially `NOT_STARTED`.

## 2. Planning authority and document relationships

The authority order is:

```text
docs/REQUIREMENT.md
    -> docs/ARCHITECTURE.md
    -> docs/DECISIONS.md
    -> docs/CODEBASE-MAP.md
    -> docs/LANGUAGE-SUPPORT.md
    -> docs/IMPLEMENTATION-PLAN.md
```

Traceability uses functional requirement IDs where they exist, architecture
section names, and ADR numbers. This plan must not silently override a higher
authority. `docs/ORCA-ANALYSIS.md` and `docs/REFERENCE-BASELINE.md` remain
reference evidence, not source or runtime dependencies.

## 3. Current baseline

- Phase 0 and Phase 1 documentation are complete.
- Phase 2A provides application/window lifecycle, shared contracts, validated
  IPC, persistence, internal cleanup, and automated-test foundations. Phase 2B
  provides one active local project, project-scoped filesystem operations,
  bounded watcher awareness, narrow project/file bridges, and the lazy Explorer.
- Phase 2C provides retained canonical Monaco models, tabs, dirty/version/view
  state, manual save, clean external reload, dirty external conflict protection,
  and fail-closed unsaved coordination for tab, project, and application close.
- Phase 2D is complete with Main-owned bounded disk-content search, typed
  search IPC/preload contracts, Explorer/Search sidebar tabs, stale-operation
  guards, and retained-model result navigation. A cross-cutting Orca UI parity
  corrective pass has also aligned the visible Phase 2Bâ€“2D shell at the locked
  reference commit without changing feature ownership. The explicitly authorized
  `lucide-react` and license-compatible Geist font packages support the shared
  icon and typography system. Automated gates, adversarial review, and manual
  Electron visual/functional smoke all passed.
- The current BrowserWindow enables `contextIsolation`, disables
  `nodeIntegration`, and enables sandboxing.
- Phase 2E provides the integrated terminal through completed packages
  2E-A–2E-J and corrective Steps 1–3. The final consolidated review passed;
  no language provider, Run service, Git service, or Settings UX has been
  implemented.
- No Orca source, module, submodule, or runtime dependency is present.
- Existing quality commands are `npm run typecheck`, `npm run lint`, and
  `npm run build`.
- Vitest is the Phase 2A unit/main/service/adapter integration test runner.
  `npm test` is the stable non-watch test command and runs in CI.

## 4. Implementation principles

Accepted technical directions remain Electron, React, TypeScript,
`electron-vite`, Tailwind CSS, Monaco Editor, xterm.js + `node-pty`, local Git
CLI behind typed GitService, and main-owned versioned JSON persistence. This plan
does not reopen those choices.

1. Define contracts and privileged boundaries before renderer integration.
2. Keep the renderer sandboxed and free of Node, raw `ipcRenderer`, unrestricted
   filesystem access, generic shell execution, and arbitrary child-process
   capability.
3. Keep preload narrow, typed, capability-scoped, and free of business state.
4. Runtime-validate every renderer-to-main request before domain services receive
   it. Type assertions are not validation (ADR-003 and ADR-016).
5. Keep Terminal, Run, and Language Server processes as separate lifecycle
   domains (ADR-008).
6. Use one active local folder project in V1 (ADR-004).
7. Preserve version-aware editor state and main-owned disk access (ADR-006).
8. Treat Windows 10 and Windows 11 as V1 acceptance platforms.
9. Implement one work package at a time and satisfy its exit gate before starting
   dependent work.
10. Record only implemented and verified work in `docs/CHANGELOG-THESIS.md`.

## 5. Planning blockers / documentation conflict

Phase 2E-J corrective review reopened ADR-020 after natural root exit proved that
PID ownership could disappear before descendant cleanup. Step 1 ProcessManager
ownership correction, Step 2 Windows Job Object/natural-root correction, and
Step 3 fail-closed application-shutdown semantics are complete. The explicitly
authorized final consolidated review passed, so Phase 2E-J and Phase 2E are
`COMPLETE`. V1 remains Windows 10/11 x64, and Windows CI plus packaged
acceptance remain Phase 7.

Other open decisions recorded in Section 14 are expected gates, not
documentation conflicts. If implementation discovers another conflict, it must
identify the exact files and sections here and follow Section 20 change control
before affected work continues.

## 6. High-level roadmap and status

| Work | Initial status | Primary outcome |
|---|---|---|
| Phase 2A — Core Contracts & Application Foundation | `COMPLETE` | Secure contracts and application/service foundation |
| Phase 2B — Project & File Explorer | `COMPLETE` | One authorized local project and file operations |
| Phase 2C — Monaco Editor, Tabs & Save | `COMPLETE` | Safe multi-tab editing and unsaved protection |
| Phase 2D — Project Search | `COMPLETE` | Responsive, cancellable project search |
| Phase 2E — Integrated Terminal | `COMPLETE` | 2E-J corrective Steps 1–3 and final consolidated review passed |
| Phase 2F — Core IDE Stabilization | `NOT_STARTED` | Integrated Core IDE workflow and cleanup |
| Phase 3 — Language Intelligence | `NOT_STARTED` | Tier 1/2 intelligence, diagnostics, and Problems |
| Phase 4 — Run & Output | `NOT_STARTED` | Trusted Run strategies, output, stop, and cleanup |
| Phase 5 — Git Integration | `NOT_STARTED` | Basic local Git workflow through typed GitService |
| Phase 6 — Settings & UX | `NOT_STARTED` | Settings, dependency configuration, and Recent Projects UX |
| Phase 7 — Testing, Stabilization & Windows Packaging | `NOT_STARTED` | V1 acceptance, packaging, installer, and final review |

Allowed tracking states are `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, and
`COMPLETE`. A status may become `COMPLETE` only after its exit gate passes.

Phase 2B was correctively reopened from `COMPLETE` to `IN_PROGRESS` after its
final adversarial review found four acceptance defects: concurrent project
transitions could bypass the transition guard, Create Project was not atomic
when persistence failed after directory creation, stale file-preview responses
could overwrite the latest selection, and Renderer user-facing behavior lacked
component/integration coverage. This reopening is limited to correcting those
verified Phase 2B defects and does not authorize Phase 2C work.

The Renderer integration-test dependency gate was resolved by explicit user
approval and manual installation of `jsdom`, `@testing-library/react`, and
`@testing-library/dom` as development-only dependencies. Main, service,
security, and IPC tests remain in the Node environment; only Renderer component
integration tests use jsdom.

The corrective review returned Phase 2B to `COMPLETE` after serialized project
transitions, safe empty-directory compensation, stale-response protection, and
Renderer component integration coverage passed the original exit gate and the
new regression checks. Phase 2C began with explicit authorization after its
Monaco integration and data-safety policies were approved and recorded in
ADR-019. Its dirty-descendant deletion policy, external-reload races, Monaco
layout defect, and development Fast Refresh editor-reset defect were corrected
without changing retained-model ownership or weakening dirty-buffer protection.
The Phase 2C automated gates and manual Electron smoke passed before it moved to
`COMPLETE`. Phase 2D began with explicit authorization and fixed product choices
for case-insensitive literal search and shared Explorer/Search sidebar tabs. Its
bounded search, navigation, Orca/STYLEGUIDE corrective UI pass, automated gates,
adversarial review, and manual Electron smoke passed before it moved to
`COMPLETE`. Phase 2E-A through Phase 2E-J are `COMPLETE`; corrective Steps 1–3
and the explicitly authorized final consolidated review passed. Phase 2E is
`COMPLETE`; Phase 2F and later work remain `NOT_STARTED`.

## 7. Dependency graph

```text
Phase 2A — contracts, security, lifecycle, minimal project/persistence foundation
  |---> Phase 2B — project and filesystem authorization
  |       |---> Phase 2C — editor reads/saves through FileSystemService
  |       |---> Phase 2D service — project-scoped search
  |       `---> Phase 2E — terminal cwd and ownership use active project
  |
  |---> Phase 2C decision gate and renderer integration
  `---> Phase 2E IPC/session foundation

Phase 2C ---> Phase 2D result navigation

Phase 2B + 2C + 2D + 2E ---> Phase 2F integration and stabilization

Phase 2 complete ---> Phase 3 Language Intelligence
Phase 3 complete ---> Phase 4 Run & Output
Phase 4 complete ---> Phase 5 Git Integration
Phase 5 complete ---> Phase 6 Settings & UX
Phases 2–6 complete ---> Phase 7 final V1 acceptance and packaging
```

Service work may be prepared only when its prerequisite contracts exist. The
roadmap remains phase-sequenced even where later services are architecturally
independent, so acceptance and documentation remain reviewable.

## 8. Phase 2 — Core IDE

Phase 2 implements FR-001, FR-002, FR-004 through FR-016, and FR-019 through
FR-021 within the boundaries of `docs/ARCHITECTURE.md`. It establishes only the
internal recent-project metadata foundation needed by ProjectService; the
user-facing FR-003 experience remains Phase 6. Phase 2 does not implement
Language Intelligence, Problems, Run, Git, or Settings UX.

### 8.1 Phase 2A — Core Contracts & Application Foundation

#### Goal

Establish the secure application, contract, validation, lifecycle, and minimal
state foundations required by all later Phase 2 work.

#### User-visible outcome

The existing application continues to start safely. No complete Core IDE feature
is promised by this package; later packages gain a stable foundation.

#### Scope

- Organize application readiness, window lifecycle, service initialization, and
  shutdown ownership.
- Establish WindowManager security, navigation, and external-URL policy.
- Define side-effect-free shared request/result/event/error contracts.
- Define the `AppError` contract and `INVALID_INPUT` mapping.
- Apply `<domain>:<verb-or-event>` IPC naming.
- Establish runtime validation at the privileged boundary.
- Organize main handler registration and narrow preload domain APIs.
- Require every event subscription to return cleanup.
- Establish only the limited internal ProcessManager ownership registry and safe
  cleanup primitives required by later PTY/Run domains; expose no public process
  executor.
- Establish ProjectService identity and canonical-root foundations without the
  full project UI workflow.
- Introduce only the minimal versioned persistence foundation required for
  project identity/recent metadata, including serialized atomic replacement,
  backup/recovery, and `schemaVersion`.

#### Out of scope

- Full Explorer UI or filesystem feature completion.
- Monaco, tabs, editing, or save.
- Search UI or full SearchService.
- Terminal or `node-pty` installation.
- Run, Git, Language Intelligence, Problems, or Settings UX.
- User-facing Recent Projects UX and management.
- Arbitrary command/process execution.

#### Dependencies

- Phase 0 Electron/React/electron-vite foundation.
- ADR-001 through ADR-004, ADR-010, ADR-012, and the accepted principles of
  ADR-016.

#### Architecture constraints

- Main owns privileged capabilities and service lifetime.
- Preload exposes finite domain methods, never raw IPC.
- Renderer receives no Node or generic command capability.
- Contracts contain no side effects or Electron runtime objects.
- Main validates payload shape, project/session ownership, and allowed action
  before dispatch.
- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` remain
  enforced.

#### Planned modules

- `DesktopApplication` under `src/main/app/`.
- `WindowManager` under `src/main/window/`.
- Domain contracts under `src/shared/contracts/`.
- Domain bridges under `src/preload/bridge/`.
- Main IPC adapters/registration following the shared contracts.
- Limited ProcessManager internals under `src/main/services/process/`.
- ProjectService foundation under `src/main/services/project/`.
- PersistenceService foundation under `src/main/services/persistence/`.

Paths are planning targets from `docs/CODEBASE-MAP.md`; implementation may not
change dependency direction without an ADR/document update.

#### Decision gates

- **ADR-011 — Renderer state management:** resolve during early Phase 2 before
  shared shell/project/editor state expands. Compare actual cross-feature needs;
  do not add a state library by default.
- **ADR-016 — IPC runtime validation mechanism:** resolved in Phase 2A. Small
  explicit validators are used for the current contract scale; a schema library
  requires reopening the ADR if later scale provides contrary evidence.
- **Test Infrastructure Gate:** resolved in ADR-018. Vitest in its Node
  environment covers unit, main/service, contract, persistence, and adapter-level
  IPC integration tests through `npm test`. Electron ports/factories keep tests
  meaningful without introducing a full E2E stack before renderer workflows
  require one; CI executes the same stable command.

#### Implementation sequence

1. Confirm lifecycle and security acceptance against current BrowserWindow
   behavior.
2. Define shared error and domain-contract conventions.
3. Complete the ADR-016 mechanism gate and record its result.
4. Complete the Test Infrastructure Gate and record the selected setup and
   command(s).
5. Establish main-side handler registration and validation flow.
6. Establish narrow preload domain bridge conventions and cleanup behavior.
7. Organize application/service startup and deterministic shutdown.
8. Establish project identity, canonical-root, and minimal persistence
   foundations.
9. Add the required Phase 2A unit, main/service, IPC integration, and genuinely
   needed renderer coverage.
10. Run the selected automated tests and applicable quality/security gates.

#### Error and edge cases

- Invalid or unknown IPC payload maps to `INVALID_INPUT`.
- Duplicate handler/listener registration is prevented.
- Renderer destruction removes owned subscriptions.
- Startup failure reports a bounded, actionable error and does not leave owned
  processes/listeners behind.
- Corrupt or incompatible persisted metadata loads defaults and preserves a
  recoverable backup.
- Canonical paths account for drive-letter case, separators, and supported UNC
  paths.

#### Tests

- Unit: DTO/runtime validation, `AppError` serialization, path identity,
  persistence schema/migration/recovery.
- Main/IPC integration: valid and invalid request flow, authorization, error
  mapping, subscription cleanup, renderer destruction, shutdown order.
- Security inspection: BrowserWindow flags, navigation handling, no raw IPC or
  generic command exposure.
- Automated test framework/tooling: Vitest, selected by ADR-018. Stable command:
  `npm test`; tests use the `*.test.ts` convention and run in CI.

#### Acceptance criteria

- Later domains can define typed, validated contracts without widening preload.
- Invalid renderer input cannot reach a domain service.
- Application startup/shutdown ownership is explicit and leak-free under tests.
- Minimal project identity and persistence foundations are usable by Phase 2B.
- No prohibited Phase 2B–2E or later-phase feature is implemented.

#### Exit gate

- ADR-011 is resolved only if shared-state implementation is about to require it;
  otherwise its decision remains explicitly pending before expansion.
- ADR-016 mechanism is recorded before broad IPC implementation.
- A real automated test infrastructure is selected and recorded through the Test
  Infrastructure Gate.
- Required Phase 2A automated tests exist and pass using documented project test
  command(s).
- CI can execute the selected test command(s) where applicable.
- Security acceptance passes.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Phase 2A may not be marked `COMPLETE` based only on typecheck, lint, and build.

#### Documentation updates

- Record completed foundation work in `docs/CHANGELOG-THESIS.md` only after
  verification.
- Update `docs/CODEBASE-MAP.md` for paths that actually exist.
- Update ADR-011 only if its gate becomes necessary. ADR-016, ADR-017, and
  ADR-018 record the validation, external-URL, and test-infrastructure decisions.

### 8.2 Phase 2B — Project & File Explorer

#### Goal

Implement one active local folder project and safe project-scoped filesystem
operations for FR-001 through FR-008.

#### User-visible outcome

A user can open/create a local project, browse its tree, read files, create files
or folders, rename, delete with required confirmation, refresh, close, and switch
projects.

#### Scope

- Open/create/close/switch one local folder project.
- Create a project by selecting a parent directory and creating a uniquely named
  empty child directory; fail if that target already exists.
- Validate and canonicalize the project root.
- Use project IDs plus project-relative paths for all file operations.
- Lazy-load typed file/directory entries.
- Read, create file/folder, rename, delete, stat, and refresh.
- Delete only by moving the authorized target to the operating-system Recycle
  Bin after renderer confirmation; never fall back to permanent deletion.
- Persist only minimal recent-project metadata required internally by
  ProjectService.
- Add minimal project-scoped watcher behavior only for Explorer refresh and
  required external-file awareness.
- Define coordination hooks for unsaved-change protection; Phase 2C owns editor
  prompts and dirty-buffer decisions.

#### Out of scope

- Full Recent Projects UX/management (Phase 6).
- Monaco models, editing, and save behavior (Phase 2C).
- Full-text search (Phase 2D).
- Advanced watcher overflow recovery, replay, remote dispatch, or Orca-level
  watcher orchestration.
- Multi-root projects, worktrees, remote workspaces, cloud sync, and collaboration.

#### Dependencies

- Phase 2A contracts, validation, project identity, lifecycle, and persistence
  foundation.
- ADR-004 and ADR-005.

#### Architecture constraints

- FileSystemService in Main owns disk operations.
- Renderer never submits unrestricted absolute filesystem paths.
- Every resolved target must remain inside the authorized project root.
- Symlinks are explicit and are not followed outside the root by default.
- Filesystem work is asynchronous and must not block Renderer.

#### Planned modules

- ProjectService under `src/main/services/project/`.
- Project UI under `src/renderer/src/features/project/`.
- FileSystemService under `src/main/services/filesystem/`.
- Explorer UI under `src/renderer/src/features/explorer/`.
- Project/file shared contracts and preload bridges.

#### Decision gates

- No dependency selection gate is introduced here.
- Any need for a watcher package or scope beyond the minimal V1 behavior requires
  evidence and an ADR/update before addition.

#### Implementation sequence

1. Complete ProjectService open/create/close/switch behavior and root validation.
2. Define project-scoped filesystem contracts and runtime validators.
3. Implement safe path resolution and typed list/read/stat operations.
4. Implement create/rename/delete with immediate target revalidation.
5. Add minimal watcher/refresh behavior and cleanup on project switch/shutdown.
6. Expose narrow preload APIs.
7. Integrate Project and Explorer UI after service/security contracts pass.
8. Add unit, IPC integration, renderer-state, and Windows-path tests.
9. Run quality and security gates.

#### Error and edge cases

- Reject `..` traversal and absolute-path privilege escalation.
- Reject symlink escape outside the authorized root where applicable.
- Handle missing, renamed, locked, inaccessible, and concurrently changed files.
- Handle Windows drive-letter case, separators, reserved names, long paths, and
  supported UNC paths.
- Project close/switch exposes a lifecycle coordination hook that Phase 2C can
  later use to request or block the transition; Phase 2B does not decide dirty
  editor behavior.
- Watchers are disposed when their project or WebContents owner disappears.

#### Tests

- Unit: canonicalization, root containment, traversal rejection, symlink policy,
  typed entries, error mapping.
- Main/IPC integration: authorization, mutations, project switch, watcher cleanup,
  invalid payloads, coordination-hook invocation, and no bypass path.
- Renderer: lazy expansion, loading/error/empty states, refresh, confirmations.
- Windows integration: drive letters, separators, locks, reserved names, and UNC
  behavior where supported.
- Use and extend the automated test command(s) established by the Phase 2A Test
  Infrastructure Gate.

#### Acceptance criteria

- FR-001 through FR-008 work through the authorized boundary.
- No renderer path can escape the active project root.
- Large directory traversal is lazy and does not freeze Renderer.
- Minimal recent metadata is stored without implementing Phase 6 UX.
- Watcher behavior remains bounded to V1 needs and cleans up reliably.
- Project close/switch provides a defined coordination boundary without claiming
  complete unsaved-change protection.

#### Exit gate

- Security/path tests and project lifecycle integration pass.
- Project close/switch exposes a defined coordination boundary that Phase 2C can
  use to request or block lifecycle transitions.
- Phase 2B does not claim complete unsaved-change protection before Phase 2C.
- No Phase 2B close/switch path bypasses the coordination hook.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Selected automated test command(s) are documented and relevant tests pass.

#### Documentation updates

- Update the codebase map for implemented project/filesystem modules.
- Record only verified behavior in the thesis changelog.
- Document any accepted watcher-scope deviation before implementation expands.

### 8.3 Phase 2C — Monaco Editor, Tabs & Save

#### Goal

Implement FR-009 through FR-015 and the editor-side unsaved protection required
by FR-013, while preserving separate Editor UI, EditorModelManager, and
FileSystemService ownership.

#### User-visible outcome

A user can open files in Monaco, work across tabs, edit and save safely, preserve
view state, and receive Save/Don't Save/Cancel protection when closing tabs,
projects, or the application.

#### Scope

- Monaco integration and language ID assignment for syntax highlighting.
- One Monaco model per canonical file identity.
- Tab open, active tab, switching, closing, and dirty indicator.
- Cursor, selection, scroll, and required view-state preservation.
- Manual save and settings-ready Auto Save boundary.
- Version-aware save: only mark clean when the saved model version is still
  current.
- Close-tab, project close/switch, and application-close unsaved protection.
- Model/subscription disposal.
- V1 external-file change/conflict policy.
- In-file search through Monaco capabilities.

#### Out of scope

- Save As, because no current functional requirement requires it.
- Project search (Phase 2D).
- Completion, hover, signature help, definition, diagnostics, and Problems
  (Phase 3).
- Formatter, debugger, refactoring, and extension host.
- Direct renderer disk access.

#### Dependencies

- Phase 2A contracts/preload/error foundation.
- Phase 2B ProjectService and FileSystemService read/write operations.
- ADR-006.

#### Architecture constraints

- Editor UI translates interactions; EditorModelManager owns model identity,
  dirty/version/view state, and disposal; FileSystemService alone owns disk I/O.
- Project close/switch cannot bypass unsaved protection.
- External disk changes never blindly overwrite a dirty model.
- Monaco models and subscriptions have explicit ownership and cleanup.

#### Planned modules

- EditorModelManager under `src/renderer/src/features/editor/models/`.
- Editor UI under `src/renderer/src/features/editor/`.
- Application Shell under `src/renderer/src/app-shell/`.
- File read/write contracts through the existing Phase 2B boundary.

#### Decision gates

- **React Monaco integration:** before Editor implementation, compare
  `@monaco-editor/react` with a small local adapter. Verify model ownership,
  mount/disposal control, worker/build behavior, view-state control, bundle
  impact, and Electron development behavior. Record the decision before adding a
  dependency. This gate does not select an option in this plan.
- ADR-011 must be resolved before shared editor/shell state expands beyond focused
  local stores.

#### Implementation sequence

1. Complete and record the React Monaco integration gate.
2. Define canonical file identity and EditorModelManager lifecycle.
3. Integrate asynchronous file open through FileSystemService.
4. Add tabs, active selection, view-state restore, and model reuse.
5. Add dirty/version tracking and version-aware manual save.
6. Add unsaved guards for tab, project, and application lifecycle.
7. Add model/subscription disposal and V1 external-change handling.
8. Add renderer and IPC integration coverage.
9. Run quality, lifecycle, and security gates.

#### Error and edge cases

- File disappears or becomes unreadable between listing and open.
- Buffer changes while save is in flight.
- Disk content changes while a model is clean or dirty.
- Rename/delete affects an open model.
- Duplicate path forms resolve to one canonical model.
- Closing multiple dirty tabs does not skip or duplicate decisions.
- Large files remain editable/savable even if expensive features are later
  disabled.

#### Tests

- Unit: canonical model identity, dirty/version transitions, save race behavior,
  view-state ownership, disposal.
- Renderer: tab lifecycle, active tab, dirty indicator, unsaved prompts, in-file
  search.
- Main/IPC integration: open/read/save errors and project-switch coordination.
- Manual Electron smoke: edit/save/reopen and application-close protection.
- Use and extend the automated test command(s) established by the Phase 2A Test
  Infrastructure Gate.

#### Acceptance criteria

- FR-009 through FR-015 pass within current scope.
- One canonical file maps to one live model.
- A stale save cannot incorrectly clear dirty state.
- No close/switch/shutdown path silently discards source changes.
- Renderer performs no direct disk I/O.

#### Exit gate

- Monaco decision is recorded and its integration constraints pass.
- Editor lifecycle, unsaved protection, and save-race tests pass.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Selected automated test command(s) are documented and relevant tests pass.

#### Documentation updates

- Update ADR/dependency register with the Monaco integration decision.
- Update the codebase map and thesis changelog after verification.
- Document the implemented V1 external-file policy if it narrows an existing
  architecture option.

#### Completion evidence

- `@monaco-editor/react` remains a thin mount over the locally bundled Monaco
  instance and local development/production workers; EditorModelManager owns one
  canonical model per normalized project/file identity.
- Version-aware save, dirty baselines, view state, tab lifecycle, consolidated
  unsaved decisions, project/application transition ownership, timeout/failure
  behavior, and model/listener disposal pass automated coverage.
- Clean external changes reconcile the retained model and remain clean; dirty
  buffers remain untouched and surface a conflict. Generation/model-identity
  guards reject out-of-order reloads, project-switch responses, disposed models,
  and responses owned by a pre-refresh hook instance.
- Corrective runtime review fixed the Monaco flex-row sizing defect and moved the
  model manager to renderer-session ownership so React/Vite effect refreshes do
  not clear active tabs. The manager is disposed on actual renderer page unload.
- Manual Electron smoke passed edit/save/reopen, clean reload, dirty conflict,
  application-close decisions, tab/model/undo/view retention, resize/layout,
  Fast Refresh retention, and Monaco worker behavior.
- Final verification passed 134 Vitest tests across 18 files, typecheck, lint,
  production build, adversarial review, and `git diff --check`.

### 8.4 Phase 2D — Project Search

#### Goal

Implement FR-016 as a project-scoped, asynchronous, cancellable search that does
not freeze Renderer.

#### User-visible outcome

A user can search project text, see bounded file/line/match results, cancel the
operation, and navigate a result into the editor.

#### Scope

- Search query/results/loading/error/empty UI.
- Main-owned SearchService scoped by project ID.
- Asynchronous traversal and matching outside Renderer.
- Result limits or batching, progress where useful, cancellation, and operation
  IDs.
- Stale-result protection when a search is replaced or a project changes.
- Result navigation into Phase 2C editor models.
- Default exclusions: `.git/`, `node_modules/`, `dist/`, `build/`, and `out/`.

#### Out of scope

- Persistent indexing, search databases, remote search, semantic/code search, or
  Orca-level background indexing.
- Replace-in-files unless separately required later.

#### Dependencies

- Phase 2A operation/event/cancellation contracts.
- Phase 2B project authorization and path handling.
- Phase 2C for result navigation; service work may precede UI navigation only.
- ADR-005 and ADR-012.

#### Architecture constraints

- SearchService owns traversal; Renderer never walks the project filesystem.
- Every operation is project-scoped and bounded.
- Events carry an operation ID and late/stale results are ignored.
- Cancellation is search-specific, not a generic command API.

#### Planned modules

- SearchService under `src/main/services/search/`.
- Search UI under `src/renderer/src/features/search/`.
- Search contracts, preload bridge, and main adapter.

#### Decision gates

- No index/database decision is needed for V1. Evidence of unacceptable bounded
  traversal performance would require a documented decision before scope grows.

#### Implementation sequence

1. Define query/result/progress/cancel contracts and limits.
2. Implement project-scoped traversal, exclusions, batching, and cancellation.
3. Add stale-event protection and lifecycle cleanup.
4. Expose the narrow preload API.
5. Integrate search UI and result navigation after editor contracts exist.
6. Add service, IPC, renderer-state, and responsiveness tests.
7. Run quality and security gates.

#### Error and edge cases

- Project switches or closes during search.
- Files disappear, become locked, or are unreadable during traversal.
- Binary/oversized files and excluded directories are handled by explicit policy.
- Large result sets are bounded and do not exhaust Renderer memory.
- Cancellation and replacement cannot leak late events into the current query.

#### Tests

- Unit: exclusions, limits, cancellation state, result normalization.
- Main/IPC integration: project authorization, batching/progress, stale events,
  cleanup.
- Renderer: query transitions, cancellation, result navigation.
- Performance smoke: representative large project remains responsive.
- Use and extend the automated test command(s) established by the Phase 2A Test
  Infrastructure Gate.

#### Acceptance criteria

- FR-016 result data and exclusions are satisfied.
- Search does not block Renderer and can be cancelled.
- Stale events cannot update a replacement query or project.
- Selecting a result opens the correct file and line.

#### Exit gate

- Responsiveness, cancellation, authorization, and navigation checks pass.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Selected automated test command(s) are documented and relevant tests pass.

#### Documentation updates

- Record actual limits/exclusion policy and implemented modules.
- Update the thesis changelog only after verification.

#### Completed implementation evidence

- Search reads project files from disk in Main; it does not merge unsaved Monaco
  buffers into results. Navigation reuses the current canonical model and never
  overwrites dirty content.
- Search is literal and case-insensitive. Default excluded directories are
  `.git`, `node_modules`, `dist`, `build`, and `out`; symbolic links, obvious
  binary files, NUL-containing files, and files over 1 MiB are skipped.
- Defensive bounds are 256 query characters, 10,000 scanned text files, 50,000
  visited entries, 1,000 matches, 50 matches per event batch, and 240 preview
  characters.
- A newer owner search cooperatively cancels the older operation. Main checks
  project and renderer ownership throughout traversal; Renderer independently
  ignores mismatched operation IDs and project IDs. In-flight filesystem reads
  are not claimed to be forcibly cancelled.
- Automated contract, service, IPC/preload, renderer, navigation, and race
  coverage is present. The full 157-test suite, typecheck, lint, production
  build, `git diff --check`, final adversarial review, and manual Electron
  visual/functional smoke passed. Phase 2D is `COMPLETE`.

### 8.5 Phase 2E — Integrated Terminal

#### Work-package status

| Work package | Status | Evidence |
|---|---|---|
| Phase 2E-A — dependency and terminal-policy preparation | `COMPLETE` | Approved xterm.js and `node-pty` versions and Windows V1 policies recorded |
| Phase 2E-B — Windows / Electron native compatibility spike | `COMPLETE` | Electron 44 Windows x64 native smoke and electron-vite externalization smoke passed |
| Phase 2E-C — terminal contracts and validators | `COMPLETE` | Shared contracts, strict validators, typed events/states, Main-only PTY port, and deterministic fake verified |
| Phase 2E-D — production TerminalService | `COMPLETE` | Main-owned registry, node-pty adapter, shell resolution, batching, ownership, and cleanup verified |
| Phase 2E-E — terminal IPC and preload bridge | `COMPLETE` | Strict Main handlers, owner-only typed events, narrow validated preload API, and WebContents cleanup verified |
| Phase 2E-F — Renderer terminal UI | `COMPLETE` | Renderer-session controller, xterm/FitAddon Bottom Panel, multiple-session controls, focused tests, and real Electron smoke verified |
| Phase 2E-G — terminal transition/lifecycle policy | `COMPLETE` | Fail-closed project transition lease, terminal warning, ordered dirty/terminal decisions, project-scoped cleanup, and focused regressions verified |
| Phase 2E-H — Windows Terminal Behavior & Process Cleanup | `COMPLETE` | Verified Main-only targeted Windows process-tree cleanup, native behavior/race matrix, controlled PID safety, and production-build UX smoke |
| Phase 2E-I — consolidated terminal verification gate | `COMPLETE` | FR-019–FR-021 traceability, full regression/common gates, consolidated Windows native evidence, and end-user workflow smoke passed |
| Phase 2E-J — final terminal security/lifecycle review | `COMPLETE` | Corrective Steps 1–3 and final consolidated review passed |

#### Goal

Implement FR-019 through FR-021 as a distinct PTY subsystem using the accepted
xterm.js renderer and main-process `node-pty` direction (ADR-007).

#### User-visible outcome

A user can create and use multiple terminal sessions rooted at the active project,
resize them, close them, and exit the application without leaving IDE-owned PTYs.

#### Scope

- TerminalService and authoritative PTY session registry in Main.
- xterm.js presentation in Renderer.
- Session ID, create, input, resize, data, exit, and close contracts.
- Lifecycle states `CREATING`, `RUNNING`, `CLOSING`, `EXITED`, and `FAILED`.
- Multiple sessions as required by FR-020.
- Initial cwd at active project root.
- Valid `pwsh`, Windows PowerShell, then `ComSpec`/`cmd.exe` fallback order.
- No configured custom shell in Phase 2E; user-configurable shell selection is
  deferred to Phase 6 Settings.
- Renderer subscription cleanup and application shutdown cleanup.
- Windows/native compatibility spike before Terminal implementation is accepted.

#### Out of scope

- Run-button execution semantics, Output panel, language servers, agent terminals,
  remote terminals, live-session restoration, replay infrastructure, full release
  packaging, installer work, or release artifacts.

#### Dependencies

- Phase 2A contracts, validation, subscriptions, lifecycle, and ProcessManager
  cleanup foundation.
- Phase 2B active-project identity and root cwd.
- ADR-007, ADR-008, and ADR-012.

#### Architecture constraints

- Main owns PTYs and session state; xterm is a view.
- Terminal IPC is session-scoped and never exposes a generic shell executor.
- Session ownership and input/resize/close payloads are runtime-validated.
- Cleanup targets only IDE-owned sessions and never kills by broad process name.

#### Planned modules

- TerminalService under `src/main/services/terminal/`.
- Terminal UI under `src/renderer/src/features/terminal/`.
- Limited shared ProcessManager internals under `src/main/services/process/`.
- Terminal contracts, preload bridge, and main adapter.

#### Decision gates

- **ADR-007 Windows/native compatibility gate:** before Terminal acceptance,
  verify package installation, Electron ABI compatibility, PTY launch inside
  Electron, PowerShell startup, `cmd.exe` startup/fallback, input/output, resize,
  close, application shutdown cleanup, and that no unrelated process is killed.
  If this spike fails, stop Terminal work and reopen ADR-007 with evidence.

Phase 2E-B completed on Windows x64 on 2026-08-30. `node-pty` 1.1.0 loaded from
its shipped Windows x64 prebuild under Electron 44.0.0 (bundled Node 24.18.1,
module ABI 149) without a rebuild. A real Windows PowerShell PTY started at the
repository root, accepted deterministic input, emitted ordered output, remained
usable after an 80x24 to 100x30 resize, returned control after terminal byte
`0x03`, emitted one exit event with code 0, released its owned PID, and allowed
Electron to exit cleanly. `pwsh` was unavailable and Windows PowerShell was
therefore selected ahead of the available `cmd.exe` fallback. A main-only
electron-vite build preserved `node-pty` as an external dependency and the built
Main entry repeated the successful Electron-native smoke. No
`@electron/rebuild`, native build-chain step, configuration change, production
terminal code, or additional dependency was required. Full session-tree cleanup
and packaged/installed-app verification remain assigned to Phase 2E-H and Phase
7 respectively.

Phase 2E-H is defined below. Phase 2E-G did not absorb descendant-tree cleanup
or authorize a stronger Windows termination strategy.

Phase 2E-C completed the side-effect-free terminal contract foundation without
starting production terminal wiring. It defines opaque branded session IDs,
bounded dimensions and UTF-8 input, exact create/input/resize/close payloads, a
`data | exit | error` event union, normalized nullable exit metadata, and the
five accepted lifecycle states with a pure transition predicate. Successful
create is the single readiness boundary and returns `RUNNING`, so no redundant
`ready` event is defined. Main-only PTY port types isolate future native adapter
details from shared/browser code, while a timer-free fake provides deterministic
spawn failure, input, resize, data, exit, late-event, duplicate-exit, close, and
disposal behavior for service tests. Focused tests and the full 183-test suite,
typecheck, lint, production build, and whitespace checks passed. Phase 2E-D
remains `NOT_STARTED`.

Phase 2E-D completed the production Main backend without exposing it through IPC
or Renderer code. `NodePtyPort` is the only module that imports `node-pty` and
adapts native spawn, data, exit, write, resize, close, and disposal to the 2E-C
port. The Windows resolver checks valid `pwsh`, Windows PowerShell, then absolute
`ComSpec`/system `cmd.exe` paths without executing discovery commands. Main
supplies the canonical active-project root and a copy of its environment with
undefined values removed.

`TerminalService` owns opaque IDs, renderer/project authorization context,
session state, PTY handles, dimensions, per-session sequence numbers, and
ProcessManager registrations. Output uses an 8 ms batching window with a 64 KiB
UTF-8 queue bound, forced trailing flush before exit, and no history/replay.
Exited/failed metadata is bounded to 256 tombstones for idempotent close. Close
uses the semantic PTY close plus a two-second bounded exit wait; timeout retains
the owned ProcessManager fallback and does not introduce broad process-tree
killing. Owner, project, and shutdown cleanup continue after individual errors.

The full 207-test suite, typecheck, lint, production build, and whitespace checks
passed. A temporary Main-only Electron 44 smoke built the production adapter with
external `node-pty`, selected Windows PowerShell, received deterministic output,
resized, emitted one exit with code 0, and left no owned PID. The harness was
removed.

Phase 2E-E completed the production capability boundary without adding terminal
UI. Main registers the four exact terminal request handlers once through the
central IPC registry, derives renderer ownership only from `event.sender.id`,
uses immutable Main session metadata for later project ownership, serializes all
failures as AppResult/AppError values, and routes validated `terminal:event`
objects only to the owning live WebContents. Destroyed owners and real main-frame
reloads trigger idempotent owner-scoped cleanup; React remounts and in-place
navigation do not.

The typed preload surface now exposes only create, input, resize, close, and an
unsubscribe-returning event subscription. It validates outgoing requests,
incoming responses, and incoming events, and fans all local subscribers out from
one underlying terminal listener without exposing raw IPC. The full 219-test
suite, typecheck, lint, production build, whitespace checks, dependency/scope
review, and adversarial security review passed. That package introduced no
Renderer terminal UI.

Phase 2E-F completed the visible Renderer terminal without changing the approved
IPC/preload contracts. A Renderer-session `TerminalController` owns stable xterm
and FitAddon instances, one terminal-event subscription, monotonic sequence
acceptance, bounded serialized writes, exact input forwarding, visible-only
fitting, deduplicated resize propagation, and exact-once local disposal. React
owns only Bottom Panel visibility, active-session presentation, controls, and
user-initiated focus requests, so ordinary remounts neither create nor close
Main sessions.

The initially closed Bottom Panel provides a bounded horizontal resizer, dense
session tabs, New/Close controls, quiet empty/project-required states, and
retained exit/error scrollback. The full 236-test suite across 29 files,
typecheck, lint, production build, and whitespace checks passed. A real Electron
44 smoke selected Windows PowerShell at the repository project root, verified
prompt/input/output, `Get-Location`, Vietnamese Unicode, Ctrl+C recovery,
panel/window/sidebar resizing, two-session selection and isolation, exit,
close/reopen, and an unclipped usable Monaco editor.

Phase 2E-G completed project-transition coordination without broadening the
terminal IPC surface. `TerminalService` now issues a project-scoped transition
lease that blocks new creates, drains creates already in flight, snapshots
whether live PTYs remain, and releases its block idempotently. The existing
serialized ProjectService guard asks the owning renderer only when a live
terminal exists, closes only the old project's sessions after confirmation,
and does not commit the project switch/close until cleanup succeeds. Cancel,
renderer loss, timeout, and cleanup failure all fail closed and preserve the
current project authority.

Renderer resolution remains ordered: dirty-buffer Save/Don't Save/Cancel is
resolved first, the destructive terminal confirmation is shown second, and
discarded editor models are retained until Main commits the transition. Focused
service and Renderer tests cover in-flight create races, cancellation, cleanup
failure, rapid serialized transitions, safe default focus, dialog ordering,
and clean transitions. The full 249-test suite across 29 files, typecheck, lint,
production build, and whitespace checks passed. The earlier Phase 2E-F real
Electron/ConPTY smoke remains the native UI/process evidence; Phase 2E-G changed
only project-transition coordination around that verified terminal lifecycle.

#### Phase 2E-H — Windows Terminal Behavior & Process Cleanup

**Status:** `COMPLETE`.

##### Goal

Determine and, only where evidence and an explicit decision authorize it,
correct the remaining Windows x64 terminal robustness and owned-process cleanup
behavior. Reuse the completed 2E-B–2E-G contracts, service, IPC, UI, lifecycle,
and tests; do not reimplement them.

##### Known facts and assumptions

- **Fact:** V1 acceptance targets Windows 10 and Windows 11 on x64. Electron 44
  and `node-pty` 1.1.0 already passed a Windows x64 native compatibility smoke.
- **Fact:** The accepted shell order is valid `pwsh`, Windows PowerShell, then
  `ComSpec`/`cmd.exe`; custom shell configuration remains Phase 6.
- **Fact:** Current CI is Ubuntu-only. It can run pure tests but cannot validate
  ConPTY, Windows shell, or Windows process-tree behavior.
- **Fact:** Existing service tests prove semantic session ownership, batching,
  exit ordering, close timeouts, and lifecycle coordination with a fake PTY;
  they do not prove descendant termination on Windows.
- **Decision:** V1 targets Windows 10/11 x64 without declaring a minimum build in
  Phase 2E-H. The recorded evidence host is not the product minimum.
- **Evidence:** Current `node-pty` close/kill left one controlled grandchild alive;
  ADR-020 therefore initially accepted verified targeted taskkill behind a
  Main-only seam. Phase 2E-J corrective Step 2 later superseded that primary
  policy with atomic Windows Job ownership; taskkill is now legacy-only.
- **Decision:** Windows CI is deferred to Phase 2E-I evaluation. Emoji is required,
  CJK is supplemental, and the approved H/I/J responsibility split remains in
  force.

##### In scope

- Verification of the accepted Windows shell fallback chain without redesigning
  it or installing a shell solely for the test.
- ConPTY behavior under real Electron for bounded input/output, resize, close,
  self-exit, trailing output, and concurrent close/exit cases.
- Controlled owned-process inspection for one PTY shell, one harmless long-running
  child, and, where practical, one harmless child-created grandchild.
- Orphan checks after closing one terminal, project close, project switch,
  renderer loss/main-frame replacement, and application shutdown.
- Vietnamese, common Unicode, required emoji input/output, paths containing
  spaces, and PowerShell and `cmd.exe` output. CJK is supplemental.
- Ctrl+C as exact terminal input byte `\x03`, interruption of a harmless
  foreground long-running process, return to a usable shell prompt, and repeat
  input after recovery. Verify with the selected PowerShell and with `cmd.exe`
  where practical.
- Long-running foreground-process behavior and the focused Windows race matrix
  below.
- Verification-only outcomes where current production behavior passes.
- The narrowly scoped production correction authorized after the blocker spike:
  Main-only verified targeted process-tree termination under ADR-020.

##### Explicitly out of scope

- Custom shell settings or Phase 6 Settings work.
- Terminal replay, reattach, live-session persistence, split terminals, terminal
  search, shell integration, command decorations, cwd tracking, or link providers.
- RunService, Language Server, Git integration, or a public generic process
  executor/signal API.
- Packaging or installer implementation, ASAR policy, release artifacts,
  installer/uninstaller tests, signing, or any other Phase 7 release work.
- ARM64 support unless separately re-authorized.
- Repetition of completed 2E-B–2E-G production design or pure tests unless a
  Windows finding requires a focused regression.

##### Windows target and shell verification

- Run native evidence on actual Windows x64 under the repository Electron
  runtime and record Windows edition, version/build, architecture, Electron,
  bundled Node/module ABI, `node-pty`, selected shell executable, and whether
  `pwsh`, Windows PowerShell, and `cmd.exe` were available.
- Do not claim a minimum Windows/ConPTY build until the user selects it.
- Preserve the fallback order exactly. Resolver tests remain authoritative for
  unavailable candidates; native smoke must launch the selected PowerShell and
  must exercise the `cmd.exe` fallback where practical. An unavailable `pwsh`
  is recorded, not installed as an unapproved test dependency.
- Project cwd must equal the authorized canonical root, including a controlled
  project path containing spaces.

##### Unicode, Ctrl+C, exit, and close behavior

- **Required:** Vietnamese and representative common Unicode round-trip through
  xterm, preload/IPC, PTY, and the selected shell; PowerShell and `cmd.exe`
  output; and a project path containing spaces.
- **Required:** emoji smoke. **Supplemental:** CJK; a CJK-only limitation does not
  block H unless it demonstrates a general Unicode regression.
- Ctrl+C sends `\x03` unchanged, interrupts only the foreground harmless test
  process, returns to a prompt, and leaves the session usable. No generic signal
  method is introduced.
- Evidence covers clean shell exit, non-zero self-exit, terminal-tab close,
  process self-exit, close concurrent with exit, trailing output before the one
  final exit event, duplicate-exit suppression, rejected/no-op input and resize
  after exit as already contracted, and retained Renderer scrollback.
- Windows-native evidence supplements rather than duplicates pure service tests;
  add a focused regression only for a Windows-specific finding or adapter seam.

##### Process-tree cleanup decision spike

Use uniquely identifiable, harmless processes created by the smoke and record
their exact PIDs. The minimum scenario is:

```text
owned PTY shell
  -> harmless long-running child
       -> optional harmless long-running grandchild
```

For each cleanup trigger below, capture the owned PID set before the trigger,
perform only the scoped IDE action, wait a bounded documented interval, and
verify each recorded process exited. Also verify a separately created unrelated
control process remains alive. Never kill by process name or inspect/terminate
unrelated system-wide processes.

| Trigger | Required observation |
|---|---|
| Close one terminal tab | That terminal's PTY/shell and tested descendants exit; another terminal and the unrelated control remain alive |
| Close all terminals for project | Every PTY/shell and tested descendant owned by the old project exits; foreign/unrelated processes remain alive |
| Renderer loss/main-frame replacement | Only sessions owned by that WebContents and their tested descendants exit |
| Project close | Confirmed old-project sessions and tested descendants exit before project authority changes |
| Project switch | Same as project close; the new project receives no stale terminal event or old process |
| Application shutdown | All IDE-owned PTY/shell processes and tested descendants exit within the bounded shutdown observation window |

The initial evidence measured current `node-pty` close/kill plus ProcessManager
behavior and found grandchild PID 26396 alive after shell 22796 and child 18376
exited. Unrelated control PID 29916 remained alive. The user then selected the
ADR-020 Windows V1 strategy below:

| Candidate | Benefit | Material risk/cost |
|---|---|---|
| Existing `node-pty` close/kill | Smallest change; preserves current ownership model | May not prove or guarantee descendant termination |
| `taskkill /PID <owned-pid> /T` | Built into Windows; explicit tree intent | PID reuse/ownership validation, command invocation, force semantics, and race risk |
| Owned process-tree enumeration | Can validate every targeted PID before termination | Enumeration races, permissions, more code, and incomplete ancestry snapshots |
| Windows Job Objects | Strong lifecycle containment and kill-on-close semantics | Native integration/dependency, Electron ABI, nesting, maintenance, and packaging impact |

The current production backend uses a dedicated Windows Job Object assigned
atomically by `PROC_THREAD_ATTRIBUTE_JOB_LIST` at node-pty's ConPTY
`CreateProcessW` boundary. Patched capability absence or Job establishment
failure rejects creation. Natural root exit retains the opaque native Job token,
session, and ProcessManager resource until explicit Job termination, bounded
empty confirmation, and handle release succeed. `KILL_ON_JOB_CLOSE` is disabled.
The fingerprinted targeted-taskkill implementation remains only for explicit
legacy/unestablished ownership and cannot run after Job establishment or Job
termination failure. Renderer/preload/IPC authority is unchanged.

##### Focused Windows race matrix

| Race | Required result |
|---|---|
| Resize during sustained output | Ordered usable output; bounded resize behavior; no crash/hang |
| Close during sustained output | Bounded close; no post-final output/event leak; no orphan |
| Close concurrent with process exit | One final exit outcome; idempotent cleanup |
| Ctrl+C then immediate close | No stuck prompt/process and no orphan |
| Project switch while child runs | Existing confirmation/lease order holds; old owned tree exits or transition fails closed |
| Renderer loss while child runs | Owner-scoped cleanup; no cross-session termination |
| App shutdown while output is emitted | Trailing output handling remains bounded; shutdown completes; no owned orphan |
| Rapid terminal create/close | No unregistered PTY, stale session, or cross-session event |
| Close after process already exited | Idempotent close; retained scrollback; no duplicate exit |

##### Test strategy

**A. Automated unit/integration**

- Reuse fake PTY tests for deterministic states, ownership, failure, batching,
  trailing output, duplicate exit, late callbacks, project/owner cleanup, and
  close races.
- Add Windows-specific automated coverage only where it uniquely proves adapter,
  process-inspection, quoting/path-with-spaces, or cleanup behavior.
- Do not convert a native Windows claim into a fake-only assertion.

**B. Electron native smoke on Windows**

- Run actual Electron on Windows x64 and verify native PTY load, recorded shell
  selection, canonical cwd with spaces, input/output, required Unicode, Ctrl+C,
  resize, clean/non-zero/self exit, terminal close, and descendant cleanup.
- Use controlled marker output and PID files/records only for smoke-owned
  processes; remove temporary harness artifacts after evidence is captured.
- Record pass/fail per scenario and any surviving owned PID. A survivor is a
  blocker, not a warning to ignore.

**C. Manual Windows smoke**

- Use the real Bottom Panel only for behavior difficult or unreliable to
  automate: visible Unicode rendering, prompt recovery after Ctrl+C, retained
  scrollback, responsive resize during output, and user-driven project
  close/switch confirmation with a running child.
- Do not repeat 2E-F's general layout, tab-selection, focus, or basic multiple-
  session smoke unless H changes those paths or a regression appears.

##### CI boundary

- Ubuntu CI continues to run pure tests, typecheck, lint, and build; it provides
  no Windows-native acceptance evidence.
- Adding a Windows CI job is not authorized in 2E-H. Windows-native CI evaluation
  is explicitly deferred to Phase 2E-I; Phase 7 retains packaged/installed
  Windows acceptance.

##### Boundary with Phase 2E-I, Phase 2E-J, and Phase 7

- **2E-H:** low-level Windows/ConPTY behavior, owned descendant-process evidence,
  decision spike, and only an explicitly authorized cleanup correction plus its
  focused regressions.
- **2E-I:** terminal-wide consolidated test/evidence audit and end-user Electron
  acceptance gate. It runs only missing matrix cells or regression-sensitive
  scenarios. Passing H native evidence from the same commit/environment is
  reused rather than repeated. The user must approve this exact split.
- **2E-J:** final terminal security/lifecycle/adversarial review, documentation
  reconciliation, and final Phase 2E completion assessment. It does not serve as
  a hidden feature package or replace unresolved H/I evidence.
- **Phase 7:** full packaging, ASAR/native inclusion policy, packaged/installed
  runtime, release artifacts, signing, installer/uninstaller, and Windows 10/11
  release acceptance. H uses development/production-build Electron only and
  does not claim packaged or installed behavior.

##### Acceptance criteria

1. Evidence is collected under actual Electron on Windows x64 with the exact OS,
   Electron/Node ABI, `node-pty`, and shell environment recorded.
2. The accepted `pwsh` -> Windows PowerShell -> `ComSpec`/`cmd.exe` chain remains
   unchanged and is verified at resolver and available-native-shell layers.
3. Canonical project cwd, including a controlled path with spaces, passes.
4. Vietnamese, common Unicode, PowerShell output, and `cmd.exe` output pass; the
   selected CJK/emoji classification is recorded and satisfied.
5. Ctrl+C is delivered as `\x03`, interrupts the harmless foreground process,
   returns to a prompt, and leaves the PowerShell session usable; `cmd.exe` is
   covered where practical and any limitation is recorded.
6. Resize/output, clean and non-zero self-exit, tab close, concurrent close/exit,
   trailing output, duplicate suppression, post-exit input/resize behavior, and
   retained scrollback satisfy the documented contracts.
7. Close-one, project cleanup, renderer loss, project close/switch, and app
   shutdown leave no tested owned PTY/shell process behind.
8. The controlled child/grandchild scenario explicitly establishes whether
   current cleanup terminates descendants; no owned PID survives a scenario
   claimed as passing.
9. Cleanup failure remains bounded and safe: project transitions fail closed,
   errors remain structured/redacted, and no unrelated process is terminated.
10. Multiple sessions remain isolated; another session and the unrelated control
    process survive every single-session/project-scoped cleanup scenario.
11. No Renderer privilege, raw IPC, generic spawn/signal API, broad process-name
    kill, or `node-pty` import outside Main is introduced.
12. No dependency or stronger Windows cleanup strategy is added without separate
    authorization and recorded decision change.
13. Applicable automated tests plus `npm run typecheck`, `npm run lint`,
    `npm run build`, and `git diff --check` pass.
14. Windows evidence, limitations, exact commands/harness ownership, PID results,
    and cleanup timing are documented without claiming Phase 7 packaging.

##### Exit gate

Phase 2E-H becomes `COMPLETE` only when:

1. every approved H Windows scenario and applicable race-matrix cell passes;
2. descendant behavior is either verified safe with the current implementation,
   or corrected using an explicitly authorized strategy and then re-verified;
3. no PTY, shell, child, or tested grandchild owned by a passing smoke remains,
   and no unrelated control/cross-session process is terminated;
4. all automated and common quality gates pass and Windows evidence is recorded;
5. the minimum Windows/ConPTY, Unicode depth, Windows CI timing, cleanup strategy
   (if needed), and H/I boundary decisions are resolved; and
6. no unresolved Windows/native blocker remains.

If stronger cleanup is required but not authorized, or a controlled owned
descendant remains, set 2E-H to `BLOCKED`; do not mark partial verification
`COMPLETE`.

##### Completion evidence

- Environment: registry-reported Windows 10 Home Single Language 25H2, build
  10.0.26200.9168, x64; Electron 44.0.0 with bundled Node 24.18.1; `node-pty`
  1.1.0. This build is evidence only, not the product minimum.
- Shells: `pwsh` unavailable; Windows PowerShell and `cmd.exe` available; the
  resolver selected Windows PowerShell. Both shells passed cwd-with-spaces,
  Vietnamese/common Unicode, required emoji, input/output, and Ctrl+C recovery.
  CJK supplemental smoke also passed.
- Original corrected tree: shell 19276 -> child 30408 -> grandchild 31956 all
  exited; unrelated control 30688 survived. The final ordering retest used shell
  9800 -> child 31076 -> grandchild 25892 with control 15224 and the same result.
- Cleanup matrix control PID 16700 survived close-one (20196/17844/32580), close
  project terminals (15892/21568/16672), project switch
  (16444/12048/32960), project close (31236/5152/3636), renderer/main-frame loss
  (32660/33432/31996), and application shutdown (32004/24696/13308). Every owned
  PID was absent after the bounded wait, each scenario emitted one logical exit,
  and ProcessManager was zero only after tree termination completion.
- Native behavior passed resize during sustained output, close during output,
  close concurrent with exit, Ctrl+C then close, rapid create/close, close after
  exit, clean exit 0, non-zero exit 7, trailing output ordering, duplicate-exit
  suppression, and post-exit input/resize rejection. Renderer tests preserve
  exited scrollback and suppress stale mutations. A separate actual-Electron
  shutdown race observed output before shutdown, stopped shell PID 16508 in
  2,475 ms, emitted one exit, left ProcessManager at zero, and reached
  DesktopApplication `STOPPED`.
- Production-build Electron Bottom Panel smoke visibly verified Vietnamese and
  emoji rendering, Ctrl+C recovery, output through resize marker 500, retained
  `UI_SCROLL_KEEP` after exit code 7, and closing a tab running `Start-Sleep`.
  Project transition UX was not repeated against the developer's active real
  project; controlled native transition scenarios and existing 2E-G integration
  tests provide that evidence without risking user data.
- Automated result: 265 tests across 30 files pass. Typecheck, lint, production
  build, and `git diff --check` pass. No dependency, CI workflow, Renderer API,
  Job Object implementation, packaging policy, or installer work was added.

##### Resolved Phase 2E-H decisions

1. Windows 10/11 x64 remains the V1 target; Phase 2E-H does not invent a minimum
   Windows/ConPTY build.
2. Windows CI is deferred to Phase 2E-I evaluation.
3. ADR-020 selects verified targeted `/PID <owned-root-pid> /T /F` termination.
4. Vietnamese/common Unicode and emoji are required; CJK is supplemental.
5. H owns Windows behavior/correction, I consolidated verification, and J final
   review/completion assessment.

#### Phase 2E-I — Consolidated Terminal Verification Gate

**Status:** `COMPLETE`.

**Dependency:** Phase 2E-H is `COMPLETE` and its applicable decisions are
resolved. The proposed H/I split must be user-approved before I begins.

**Scope:** Audit traceability and evidence across 2E-B through 2E-H; run the full
automated terminal/regression suite and common quality gates; execute only the
Windows/Electron matrix cells that are missing, stale after an H correction, or
required on an additional approved Windows environment; and perform one concise
end-user terminal workflow smoke. H evidence from the same commit, runtime, and
environment is accepted directly and is not repeated for ceremony.

**Out of scope:** New terminal features, a new cleanup strategy, hidden defect
fixes, final adversarial sign-off, and Phase 7 packaging. A defect reopens the
owning package or returns to an explicitly authorized corrective task.

**Acceptance/exit gate:** Every FR-019–FR-021 and terminal security/lifecycle
criterion maps to current passing evidence; no required Windows matrix cell is
missing; all automated/common gates pass; the approved Windows-environment/CI
policy is satisfied; and limitations are documented. I cannot replace failed or
blocked H descendant-cleanup evidence.

##### Phase 2E-I completion evidence

- **Traceability:** FR-019 maps to the Main-owned `TerminalService`, strict
  terminal IPC/preload capability, Renderer `TerminalController`, and xterm
  Bottom Panel evidence. FR-020 maps to isolated Main/Renderer session registries,
  multiple-session controls, cross-session ownership tests, and native two-session
  smoke. FR-021 maps to active-project authorization, canonical project-root cwd,
  resolver/service tests, and actual Electron cwd-with-spaces evidence.
- **Security/lifecycle:** Contract, service, IPC, preload, Renderer, transition,
  and Windows terminator tests cover exact payload validation, immutable project
  and WebContents ownership, stale-event rejection, no raw IPC or generic process
  authority, bounded/redacted failure, project/owner/application cleanup, one
  final exit, and unrelated-process survival. The passing 2E-H matrix remains
  current on the same source, Electron runtime, and Windows environment.
- **Consolidated native gate:** Electron 44.0.0 / bundled Node 24.18.1 on Windows
  x64 selected Windows PowerShell and passed canonical cwd with spaces, normal
  output, Vietnamese/common Unicode/emoji, Ctrl+C recovery, resize, trailing
  output, non-zero exit 7, post-exit input/resize rejection, multiple-session
  isolation, and isolated close. Owned trees 4212 -> 7968 -> 12332 and
  30072 -> 6784 -> 26632 were removed for focused close and application shutdown;
  unrelated control PID 16612 survived, each session emitted one exit, and
  ProcessManager reached zero only after cleanup.
- **End-user workflow:** The production Electron preview passed a concise manual
  Bottom Panel workflow: open the terminal, render `2E-I UI Tiếng Việt 😀`, create
  and switch between two sessions, close one session running `Start-Sleep`, and
  continue using the unaffected session.
- **Automated/common gates:** 265 tests across 30 files pass. `npm run typecheck`,
  `npm run lint`, `npm run build`, and `git diff --check` pass. The initial
  sandboxed test/build attempts were infrastructure-denied with `spawn EPERM`;
  the required commands passed when rerun with process-spawn permission.
- **Windows CI policy:** Phase 2 does not add a Windows CI job. Ubuntu CI remains
  the portable automated gate, while terminal-affecting work requires recorded
  actual-Windows Electron evidence. The current local gate supplies that evidence;
  Phase 7 still owns packaged/installed Windows CI and release acceptance.
- **Limitations:** The native smoke observed non-fatal `node-pty`
  `conpty_console_list_agent` `AttachConsole failed` diagnostics during process
  list probing; PTY behavior, targeted descendant cleanup, exit ordering, and
  control-process isolation still passed. No packaging, installer, Windows ARM64,
  custom shell, Job Object, or Phase 2E-J claim is made.

#### Phase 2E-J — Final Terminal Security/Lifecycle Review

**Status:** `COMPLETE` — corrective Steps 1–3 and the final consolidated review
passed.

**Dependency:** Phase 2E-I is `COMPLETE`.

**Corrective sequence:** Step 1 corrected ProcessManager so pending or failed
cleanup remains registered. Step 2 introduced atomic Windows Job ownership and
made natural root exit retain authority through explicit Job finalization. Step
3 corrected application shutdown so cleanup failure retains `STOPPING`, service
and process/Job ownership, and Electron quit interception; a later graceful quit
retries retained cleanup. All three corrective steps and the separately
authorized final 2E-J review are complete.

##### Corrective Step 3 completion evidence

- `DesktopApplication.shutdown()` now shares one in-flight stop, removes each
  started service only after successful cleanup, retains `STOPPING` and the
  failed/not-yet-stopped services after rejection, and permits deterministic
  retry. `STOPPED` is emitted only after every mandatory service succeeds.
- Reverse dependency cleanup remains intact. TerminalService finalization runs
  before ProcessManager; a terminal/Job failure stops that attempt before a
  duplicate ProcessManager retry. WindowManager is explicitly shutdown-last so
  cleanup failure does not destroy the only graceful retry surface.
- A Main-only `ApplicationQuitCoordinator` prevents the first and repeated
  `before-quit` events while approval/cleanup is pending. Success authorizes one
  final `app.quit()` and lets its recursive event/window close pass. Failure logs
  through a redacted callback, does not call final quit, and clears the rejected
  attempt for a later user-driven retry. `window-all-closed` continues through
  the same intercepted quit path.
- Focused DesktopApplication, coordinator, WindowManager, and terminal
  integration coverage verifies success, failure, retry, concurrency,
  idempotence, recursive-event protection, retained Job/ProcessManager
  ownership, live-root shutdown, and natural-root finalization. The full suite
  passes 297 tests across 32 files.
- Electron 44 Windows x64 production-service native smoke passed live-root tree
  `32972 -> 16304 -> 1756` with control PID `30836`, and natural-root tree
  `8688 -> 23492 -> 31696` with control PID `8812`. In the second scenario the
  root exited while both descendants and ProcessManager ownership remained;
  shutdown then terminated and emptied the Job, released ProcessManager,
  reached `STOPPED`, and requested one final quit. Both control processes
  survived and no tested owned PID remained.
- Cleanup-failure/retry evidence uses test seams only; no production failure
  injection remains. Typecheck, lint, production build, and `git diff --check`
  pass. No dependency, native strategy, Renderer/preload/IPC authority,
  force-quit policy, packaging, installer, or final 2E-J review was added.

##### Final consolidated review evidence

- The complete Renderer → preload → IPC → Main terminal boundary, creation
  policy, Job ownership, natural-root finalization, ProcessManager retention,
  explicit/project/renderer/application cleanup paths, output/exit ordering,
  resize/input races, multiple-session isolation, and legacy taskkill gate were
  re-audited without a material finding.
- The repository patch verified against pinned `node-pty` 1.1.0, a fresh native
  rebuild produced and loaded the patched Electron 44 x64 artifact, the marker
  was enforced, and electron-vite production build passed.
- Current Windows Job smoke used `16612 -> 26072 -> 5480`, Job-owned helpers
  `19248` and `7760`, and unrelated control PID `24160`. Natural root exit left
  four active Job members; finalization emptied the Job, removed every owned
  process, preserved the control, and emitted one exit.
- Current production-service shutdown smoke passed live-root tree
  `19452 -> 25648 -> 2672` with control PID `32508`, and natural-root tree
  `17768 -> 22220 -> 18304` with control PID `2316`. Both released
  ProcessManager only after Job finalization, reached `STOPPED`, requested one
  final quit, and left no tested orphan.
- The full suite passes 297 tests across 32 files. Typecheck, lint, production
  build, and `git diff --check` pass. The unchanged Phase 2E-I native/UI matrix
  remains the same-source evidence for cwd with spaces, Unicode/emoji/CJK,
  PowerShell/cmd, Ctrl+C, resize, multiple sessions, project transitions, and
  renderer-loss cleanup. No Search regression or unresolved blocker was found.

**Scope:** Perform the final adversarial review of renderer privilege, IPC
validation/ownership, stale events, lifecycle cleanup, cross-session isolation,
error redaction, and documentation/evidence consistency. Reconcile the
architecture, decisions, codebase map, implementation plan, and thesis changelog,
then assess the complete Phase 2E exit gate.

**Out of scope:** Feature implementation, cleanup-strategy selection, repeated
native smoke without a review finding, or any Phase 7 packaging/release task. A
verified defect reopens the owning package under change control; J does not hide
the correction inside a documentation sign-off.

**Acceptance/exit gate:** No unresolved critical security, lifecycle, native,
or documentation finding remains; A–I retain passing evidence; the overall
Phase 2E acceptance/exit gate passes; Phase 2E is `COMPLETE`.

#### Implementation sequence

1. Run and record the ADR-007 native compatibility spike without treating it as
   full release packaging.
2. Define terminal session/event/error contracts and validators.
3. Implement main-owned session lifecycle, shell selection, and cwd handling.
4. Implement input, resize, data, exit, close, and shutdown cleanup.
5. Expose narrow preload methods and unsubscribe-returning event APIs.
6. Integrate xterm.js views and multiple-session controls.
7. Add lifecycle, IPC, renderer, and Windows integration coverage.
8. Run quality, security, and cleanup gates.

#### Error and edge cases

- `node-pty` install or ABI mismatch.
- `pwsh` or Windows PowerShell missing, `ComSpec` invalid, or `cmd.exe` fallback
  unavailable.
- Project closes while terminals exist.
- Renderer is destroyed while a PTY emits data.
- Resize/input arrives for an exited or foreign session.
- Close/shutdown encounters child processes or delayed exit.

#### Tests

- Unit: state transitions, shell selection, session ownership, error mapping.
- Main/IPC integration: create/input/resize/data/exit/close and listener cleanup.
- Windows integration: Electron ABI, PowerShell, `cmd.exe`, cwd, process cleanup.
- Manual Electron smoke: multiple sessions and application shutdown.
- Use and extend the automated test command(s) established by the Phase 2A Test
  Infrastructure Gate.

#### Acceptance criteria

- FR-019 through FR-021 pass on Windows 10/11 acceptance environments.
- Required lifecycle transitions and final exit behavior are observable.
- Multiple sessions remain isolated.
- Project cwd and shell fallback behave as documented.
- Closing sessions/application leaves no IDE-owned PTY and kills no unrelated
  process.

#### Exit gate

- ADR-007 compatibility evidence passes; a failure reopens the ADR and blocks the
  package.
- PTY lifecycle, cleanup, subscription, and Windows smoke checks pass.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Selected automated test command(s) are documented and relevant tests pass.

#### Documentation updates

- Record native-spike evidence and implemented behavior without claiming Phase 7
  packaging completion.
- Update the codebase map and thesis changelog after verification.

### 8.6 Phase 2F — Core IDE Stabilization

#### Goal

Verify Phase 2 as one secure, responsive workflow rather than a collection of
isolated features.

#### User-visible outcome

The integrated workflow is reliable:

```text
Open project -> Explorer -> Open file -> Edit -> Save -> Search -> Terminal
```

#### Scope

- Cross-package integration, error paths, cleanup, and lifecycle correction.
- Project close/switch with dirty editors, watchers, search operations, and PTYs.
- Windows path and locked-file behavior.
- Listener/subscription leak and stale-event checks.
- Application shutdown coordination.
- Performance smoke tests for representative larger projects.
- Phase 2 documentation and acceptance review.

#### Out of scope

- Language Intelligence, Problems, Run, Git, Settings UX, Phase 6 Recent Projects
  UX, and Phase 7 full packaging/installer work.

#### Dependencies

- Phase 2A through Phase 2E exit gates.

#### Architecture constraints

- Integration fixes may not bypass established service/IPC boundaries.
- Terminal remains separate from future Run and Language Server domains.
- No generic privileged renderer capability may be added as a shortcut.

#### Planned modules

- Existing Phase 2 modules only, plus test/support fixtures in `tests/` or
  colocated `*.test.ts` as later selected.

#### Decision gates

- All Phase 2 decision gates must be recorded or explicitly remain pending only
  where no blocked implementation uses them.
- Any required architecture deviation triggers Section 20 change control.

#### Implementation sequence

1. Exercise the full workflow and project-switch/shutdown variants.
2. Fix ownership, error, stale-event, and cleanup defects within accepted
   boundaries.
3. Run security regression checks.
4. Run Windows path, shell, lock, and responsiveness checks.
5. Run all available unit/integration/renderer/manual smoke suites.
6. Run typecheck, lint, and production build.
7. Review Phase 2 documentation and evidence against its Definition of Done.

#### Error and edge cases

- Project changes during save/search/terminal activity.
- Multiple dirty tabs and cancellation paths.
- WebContents destruction and application shutdown during active operations.
- Locked files, antivirus delays, watcher timing, and stale events.
- Repeated open/close cycles reveal listener or model leaks.

#### Tests

- End-to-end Electron smoke of the combined workflow.
- Cross-domain integration and shutdown/cleanup tests.
- Security regression and Windows acceptance checks.
- Use and extend the automated test command(s) established by the Phase 2A Test
  Infrastructure Gate.

#### Acceptance criteria

- The combined Phase 2 workflow passes without silent data loss or renderer
  blocking.
- Project switching and shutdown clean all owned resources.
- Security flags and privileged-boundary validation remain intact.
- No Phase 3+ feature is required to make Phase 2 stable.

#### Exit gate

- Phase 2 Definition of Done in Section 19 passes.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- All defined Phase 2 tests and Windows smoke checks pass.
- Phase 2 documentation and changelog describe only verified behavior.

#### Documentation updates

- Mark Phase 2 packages complete only after their evidence passes.
- Update `docs/CODEBASE-MAP.md` and `docs/CHANGELOG-THESIS.md` to the implemented
  state.

## 9. Phase 3 — Language Intelligence

### Goal

Implement FR-011, FR-017, and FR-018 according to
`docs/LANGUAGE-SUPPORT.md`, without coupling editor availability to a runtime or
provider process.

### Dependencies

- Phase 2 editor models, project lifecycle, contracts, editor navigation target,
  and stabilization exit gate.
- ADR-013 and ADR-015.

### Decision gates

- Select and record JS/TS/HTML/CSS/JSON provider(s) before implementation.
- Select and record the Python provider, distribution, executable discovery, and
  lifecycle strategy before Python implementation.
- Decide large-file language-intelligence thresholds using measured responsiveness
  while preserving edit/save.
- Verify capability coverage, multi-file behavior, document synchronization,
  Windows URI/path handling, lifecycle, cancellation, logs, cleanup, development
  and production-build behavior, worker/server resource discovery,
  bundling/distribution assumptions, child-process/provider executable discovery,
  required assets, license, and maintenance risk.
- If feasibility cannot otherwise be established, run only a
  minimal provider packaging feasibility spike. Full application packaging,
  installer creation,
  release artifacts, and installed-app acceptance remain Phase 7 responsibilities.

### Key deliverables

- LanguageServiceManager, Provider Registry, capability routing, document sync,
  normalized diagnostics, lifecycle/status/logs, crash handling, and restart.
- Completion, Hover, Signature Help, and Go to Definition for Tier 1 JavaScript,
  TypeScript, and Python.
- Tier 2 HTML/CSS/JSON capabilities exactly as committed in the matrix.
- Diagnostics markers and Problems UI/navigation.
- Tier 3 Java/C#/PHP syntax-only V1 support where available; no Tier 3
  intelligence/run commitment.
- Language-service states: `NOT_CONFIGURED`, `MISSING`, `STARTING`, `RUNNING`,
  `STOPPED`, `CRASHED`, `INVALID_CONFIGURATION`.
- Runtime/dependency states: `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`,
  `INVALID_CONFIGURATION`.
- Independent runtime and language-service detection/UX.

### Acceptance criteria

- Capability matrix acceptance passes per language/tier.
- Missing, starting, stopped, crashed, or invalid service never prevents editing
  and saving.
- One provider failure does not break another language.
- Diagnostics update without blocking Renderer and Problems navigation reaches the
  correct file/range.
- Lifecycle, restart, logs, dependency UX, and cleanup pass on Windows.
- Provider distribution feasibility is demonstrated for development and
  production builds without claiming full packaged/installed acceptance.

### Exit gate

- All provider decisions are recorded; no provider remains implicitly selected.
- Required provider feasibility evidence passes; full packaged/installed provider
  verification remains a Phase 7 exit condition.
- Phase 3 Definition of Done in Section 19 passes.
- Typecheck, lint, build, defined tests, and Windows provider smoke tests pass.

## 10. Phase 4 — Run & Output

### Goal

Implement FR-022 through FR-026 as a trusted, non-interactive Run domain separate
from Terminal.

### Dependencies

- Stable project/editor/output targets and ProcessManager primitives from Phase 2.
- Runtime/dependency status UX foundation from Phase 3 where shared conceptually,
  while runtime operation remains independent of Language Services.
- ADR-008, ADR-012, and ADR-014.

### Decision gates

- Resolve ADR-014 before TypeScript Run implementation. Compare `tsx`, `ts-node`,
  `tsc` + Node, and compatible Node native TypeScript support for single-file and
  project runs, Node versions, ESM/CommonJS, `tsconfig`, error/source locations,
  startup speed, Windows paths, stop, and descendant cleanup.
- Do not add a runner dependency until the ADR records the selected strategy.

### Key deliverables

- Main-owned RunService with trusted language/project strategies.
- Explicit executable, argument array, cwd, controlled environment additions, and
  `shell: false` where possible.
- Separate stdout, stderr, exit code, stop/cancellation, and final exit metadata.
- Output UI and actionable missing/invalid runtime states.
- Windows owned-process-tree cleanup without a public generic `executeCommand`.
- Node.js and configured Python project/file support within current V1 scope;
  TypeScript only after ADR-014.

### Acceptance criteria

- Run remains distinct from Terminal and Language Server lifecycles.
- Output/error/exit behavior and runtime-missing UX satisfy FR-022–FR-026.
- Stop terminates the IDE-owned process tree without killing unrelated processes.
- Application shutdown leaves no IDE-owned Run process.

### Exit gate

- ADR-014 is resolved and verified before TypeScript Run is accepted.
- Phase 4 Definition of Done in Section 19 passes.
- Typecheck, lint, build, defined tests, and Windows process cleanup checks pass.

## 11. Phase 5 — Git Integration

### Goal

Implement FR-027 through FR-032 using the accepted local Git CLI behind a typed
GitService (ADR-009).

### Dependencies

- Stable project identity, IPC validation, errors, cancellation/timeouts, and
  renderer shell.
- Phase 4 exit gate under the roadmap sequence.

### Decision gates

- No Git implementation strategy decision remains open. Configuration UX may be
  deferred to Phase 6, but GitService must expose explicit dependency states.

### Key deliverables

- Detect Git and repository state.
- Dependency states `NOT_CONFIGURED`, `MISSING`, `AVAILABLE`, and
  `INVALID_CONFIGURATION`, consistent with current requirement/ADR terminology.
- Status, stage, safe unstage, commit, current/list branches, switch branch, and
  bounded history.
- Executable plus argument-array invocation; no shell-concatenated commands.
- Source Control UI with explicit unavailable/error states.

### Acceptance criteria

- Git absence or invalid configuration never breaks the editor.
- V1 Git operations produce typed results and actionable errors.
- Credentials/authentication remain delegated to Git/OS.
- No hosted review, forge API, credential store, remote relay, or worktree
  orchestration is introduced.

### Exit gate

- Phase 5 Definition of Done in Section 19 passes.
- Typecheck, lint, build, defined tests, and representative local-repository smoke
  checks pass.

## 12. Phase 6 — Settings & UX

### Goal

Complete FR-003 and FR-033 through FR-037 user-facing configuration and
persistence UX without changing the main-owned versioned JSON strategy.

### Dependencies

- Persistence foundation and minimal recent metadata from Phase 2.
- Actual runtime, language-service, and Git configuration needs from Phases 3–5.

### Decision gates

- Settings schemas must reflect implemented providers/runners rather than resolve
  their earlier ADRs retroactively.
- Any helper package requires a recorded decision; no database server is allowed.

### Key deliverables

- SettingsService validation/default/update and Settings UI.
- Theme, editor font size, tab size, Auto Save, and keyboard-shortcut UX within
  current requirements.
- Runtime, language-service, and Git executable/configuration paths where needed.
- User-facing Recent Projects UX and management using Phase 2 metadata.
- Dependency-state guidance and recoverable configuration errors.
- Versioned JSON with `schemaVersion`, serialized atomic writes, backup/recovery,
  migrations, defaults, and corruption recovery.

### Acceptance criteria

- Settings survive restart and invalid/corrupt state recovers without source loss.
- Recent Projects UX does not alter the one-active-project model.
- Missing/invalid dependencies show actionable configuration guidance.
- No database server, cloud account, or source-buffer authority is introduced.

### Exit gate

- Phase 6 Definition of Done in Section 19 passes.
- Persistence recovery/migration, UX, typecheck, lint, build, and defined tests
  pass.

## 13. Phase 7 — Testing, Stabilization & Windows Packaging

### Goal

Complete final V1 integration, security, Windows 10/11 acceptance, native
dependency packaging, application packaging, installer, and documentation review.

### Dependencies

- All Phase 2–6 exit gates and recorded decisions.

### Decision gates

- Select packaging/installer mechanics only when release implementation begins and
  record any architecture/dependency decision they require.
- Phase 2 `node-pty` compatibility evidence is prerequisite but does not replace
  packaged-app and installer verification.

### Key deliverables

- Full integration/regression suite and manual Electron workflow smoke tests.
- Windows 10 and Windows 11 acceptance.
- Production build, full application packaging, native dependency inclusion,
  packaged `node-pty` verification, release artifact, installer, and installer
  smoke test.
- Startup, project open, edit/save, terminal, language services, Run, Git,
  provider/resource discovery, settings persistence, and process cleanup
  verification in the fully packaged and installed app.
- Upgrade/reinstall considerations where the selected installer requires them.
- Final IPC/security, navigation, data-safety, logging/redaction, dependency-state,
  and documentation review.

### Acceptance criteria

- All V1 functional and non-functional requirements pass in supported Windows
  environments.
- Native modules and managed processes work and clean up in packaged/installed
  operation.
- Installer smoke, application startup, core workflow, and persistence recovery
  pass.
- No critical runtime/security/data-loss defect remains.

### Exit gate

- Phase 7 Definition of Done in Section 19 passes.
- Production build, packaging, installer, installer smoke, all required tests,
  security review, and final documentation review pass.
- V1 milestone evidence is recorded before merge/tag/release actions are
  separately authorized.

## 14. Decision Gate Register

| Decision | Related ADR | Required before | Current status | What must be verified |
|---|---|---|---|---|
| Renderer state management | ADR-011 | Shared Phase 2 shell/project/editor state expands | Proposed; unresolved | Actual cross-feature update needs, lifecycle ownership, complexity, bundle/dependency cost |
| IPC runtime validation mechanism | ADR-016, ADR-003 | Production IPC handlers multiply in early Phase 2 | RESOLVED Phase 2A — explicit validators | Current contracts are small; validators provide normalized issues and audited narrowing without schema runtime cost |
| React Monaco integration | ADR-006, ADR-019 | Phase 2C Editor implementation | RESOLVED Phase 2C — thin `@monaco-editor/react` mount over local `monaco-editor` | Model/view ownership remains with EditorModelManager; local workers, development/build behavior, and disposal must pass the Phase 2C gate |
| JS/TS/HTML/CSS/JSON providers | ADR-013, ADR-015 | Phase 3 implementation | Proposed; unresolved | Matrix capabilities, cross-file behavior, sync, lifecycle, development/production-build behavior, provider distribution feasibility, license/maintenance; full packaged/installed verification is Phase 7 |
| Python/Pyright strategy | ADR-013, ADR-015 | Python Phase 3 implementation | Candidate only; unresolved | Distribution, executable/config discovery, lifecycle, development/production-build behavior, minimal packaging feasibility if needed, logs, Windows behavior, license; full packaged/installed verification is Phase 7 |
| Large-file language thresholds | Architecture §8 | Phase 3 acceptance for expensive features | TBD | Measured responsiveness/memory while edit/save remains available |
| TypeScript Run strategy | ADR-014 | TypeScript Phase 4 implementation | Proposed; unresolved | Node versions, ESM/CJS, `tsconfig`, errors/maps, startup, Windows paths, stop/tree cleanup |
| Test infrastructure and command | ADR-018 / Requirement Phase 7 | Phase 2A acceptance, before Phase 2A automated tests are considered complete | RESOLVED Phase 2A — Vitest; `npm test` | Node-environment unit/main/service/IPC adapter coverage, Vite/TypeScript compatibility, CI Node 22, and later opt-in renderer/Electron E2E tooling only when required |
| Windows terminal cleanup strategy | ADR-007, ADR-008, ADR-020 | Phase 2E-J corrective Step 2 | RESOLVED — Windows Job Object primary | Atomic `PROC_THREAD_ATTRIBUTE_JOB_LIST`, fail-closed capability/spawn, retained natural-root ownership, explicit terminate/empty/release; taskkill legacy-only |
| Minimum Windows/ConPTY baseline | ADR-007, ADR-020 | Phase 2E-H completion | RESOLVED Phase 2E-H — no exact minimum build introduced | V1 remains Windows 10/11 x64; recorded build is evidence only |
| Windows terminal CI timing | ADR-018, ADR-020 | Phase 2E-I completion | RESOLVED Phase 2E-I — no Phase 2 Windows job | Ubuntu CI remains the portable automated gate; terminal-affecting work requires recorded actual-Windows Electron evidence; Phase 7 retains packaged/installed Windows CI and release acceptance |
| Terminal Unicode depth | ADR-020 | Phase 2E-H completion | RESOLVED Phase 2E-H — Vietnamese/common Unicode/emoji required; CJK supplemental | Native PTY and production-build xterm smoke passed the selected depth |
| Phase 2E-H/2E-I evidence split | ADR-020 | Phase 2E-H implementation prompt | RESOLVED — H native behavior/correction, I consolidated verification, J final review | I reuses same-commit H evidence and runs only missing/stale cells |

Decision-gate completion records evidence in `docs/DECISIONS.md` or the relevant
decision register. This plan does not select any unresolved option.

## 15. Risk Register

| Risk | Phase | Impact | Mitigation / gate |
|---|---:|---|---|
| `node-pty` native Electron compatibility | 2E, 7 | Terminal blocked or packaged failure | ADR-007 Phase 2 Windows/native spike; Phase 7 packaged/installer verification |
| Monaco integration and model lifecycle | 2C | Data loss, duplicate models, leaks | Integration decision gate; canonical identity, save-race, disposal tests |
| Windows filesystem/path handling | 2A–2D | Escape, wrong file, failed operations | Root containment, canonicalization, symlink policy, Windows path/lock tests |
| IPC privilege boundary | 2A onward | Arbitrary privileged access | ADR-016 validation, narrow preload, ownership checks, security regression |
| Process-tree cleanup | 2E, 4, 7 | Orphans or unrelated process termination | Owned registry, bounded escalation, Windows descendant tests |
| Language-provider packaging | 3, 7 | Intelligence works only in development or fails after distribution | Phase 3 provider distribution-feasibility gate and minimal spike if needed; Phase 7 full packaged/installed provider/resource verification |
| Python/Pyright distribution | 3, 7 | Missing/broken Python intelligence | Explicit provider/distribution decision and Windows dependency UX tests |
| TypeScript Run strategy | 4 | Inconsistent execution/config behavior | ADR-014 spike before implementation |
| Large-project search responsiveness | 2D, 2F | Frozen UI or memory growth | Async bounded batches, exclusions, cancellation, representative performance smoke |
| JSON corruption/recovery | 2A, 6, 7 | Lost settings/workspace convenience state | Atomic serialized writes, backup, schema migration, corruption tests |
| Listener/model/process leaks | 2–4 | Degraded repeated use or shutdown | Ownership IDs, unsubscribe contracts, disposal and repeated-cycle tests |
| Antivirus/file-lock delays | 2B, 6, 7 | Intermittent Windows failures | Actionable retries/errors and locked-file/atomic-replace integration tests |

No risk entry represents a fabricated test result; all mitigation evidence must be
produced by the named implementation phase.

## 16. Quality and Testing Strategy

### Test layers

- **Unit tests:** path validation, state machines, DTO/runtime validation,
  persistence migration/recovery, parsing, model/version logic, and pure domain
  functions.
- **Main/IPC integration:** renderer request contract -> preload -> IPC adapter ->
  service, including authorization, error serialization, events, cancellation,
  ownership, and cleanup.
- **Renderer tests:** valuable interactive state such as tabs, unsaved prompts,
  search states, Problems navigation, and dependency/status UX. Trivial visual
  presentation does not require excessive tests.
- **Windows integration:** paths, locks, executable detection, shell launch,
  `node-pty`, process trees, provider processes, Git, and persistence replacement.
- **Manual Electron smoke:** complete user workflows in development and, during
  Phase 7, packaged/installed operation.

### Common package gates

Every implementation package runs:

```text
npm run typecheck
npm run lint
npm run build
```

Test infrastructure is mandatory during Phase 2A because Phase 2A already
requires automated validation of contracts, security, persistence, services, and
IPC behavior. The Phase 2A Test Infrastructure Gate selects and records the
framework/tooling, Electron-specific approach where required, CI implications,
and stable project test command(s). Later phases reuse and extend that setup.

Do not treat the current failing placeholder `npm test` as a valid test suite.
Phase 2A cannot pass without executable automated tests, and no later work
package passes merely because compilation succeeds. Functional, security,
lifecycle, platform, and relevant automated test acceptance must also pass.
Renderer testing remains proportional and is required only where it provides
meaningful behavioral coverage.

## 17. Security Gates

Every privileged work package must verify:

- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`;
- runtime validation before domain dispatch;
- authorized project identity and path scope;
- operation/session ownership;
- unsubscribe and WebContents destruction cleanup;
- safe navigation and validated external URL handling;
- no raw `ipcRenderer`, unrestricted filesystem bridge, generic shell execution,
  or arbitrary child-process capability;
- executable plus argument arrays and `shell: false` where possible;
- redacted logs without secrets, environment dumps, credentials, or file content;
- cleanup of watchers, models, PTYs, Run processes, and provider processes by
  their owner.

An API equivalent to `window.api.execute(command)` is prohibited.

## 18. Windows Acceptance Strategy

V1 acceptance targets Windows 10 and Windows 11. Relevant packages must test:

- drive letters and case-insensitive canonical comparisons;
- Windows separators and supported UNC paths;
- reserved names, long paths, locked files, and antivirus/file-lock delays where
  applicable;
- configured absolute executable paths and effective `PATH` lookup;
- PowerShell and `cmd.exe` with their distinct argument/quoting behavior;
- native `node-pty` Electron ABI compatibility;
- descendant process cleanup without broad process-name killing;
- atomic-replace fallbacks and persistence recovery.

The design should avoid unnecessary Windows-only coupling, but Linux/macOS
acceptance work is not a V1 exit requirement.

## 19. Phase Definitions of Done

### Phase 2 Definition of Done

- Open/create/close/switch project and Explorer/file operations pass.
- Monaco opens/edits files, tabs and view state work, save is version-aware, and
  unsaved protection prevents silent loss.
- Project search is scoped, responsive, bounded, cancellable, and navigable.
- Multiple integrated terminal sessions work with required Windows shell/cwd and
  cleanup behavior.
- Minimal recent metadata exists without Phase 6 UX.
- IPC/path/session security and application shutdown gates pass.
- Phase 2 integrated workflow, defined tests, typecheck, lint, and build pass.
- Codebase map and changelog reflect only implemented, verified work.

### Phase 3 Definition of Done

- Provider decisions are recorded and Tier 1/2 matrix capabilities pass.
- Completion, hover, required signature/definition behavior, diagnostics, and
  Problems/navigation pass.
- Provider start/stop/restart/crash/log/status and missing/invalid UX pass.
- Runtime and Language Service remain independent; editor/save survive all
  required service failure states.
- Defined tests, Windows smoke, typecheck, lint, and build pass.

### Phase 4 Definition of Done

- Trusted JS/Python and decided TypeScript Run strategies satisfy current V1
  file/project scope.
- stdout, stderr, exit code, Output UI, runtime errors, stop, cancellation, and
  Windows process-tree cleanup pass.
- No generic executor exists and Terminal remains separate.
- Defined tests, typecheck, lint, and build pass.

### Phase 5 Definition of Done

- Git/repository detection, status, stage/unstage, commit, branch/current/switch,
  and bounded history pass.
- Missing/invalid Git leaves the editor usable and shows an actionable state.
- Authentication remains delegated to Git/OS; hosted/remote/worktree features are
  absent.
- Defined tests, typecheck, lint, and build pass.

### Phase 6 Definition of Done

- Theme/editor/Auto Save settings, dependency paths, Recent Projects UX, and
  dependency guidance pass.
- Versioned JSON validation, migration, atomic write, backup, and recovery pass.
- Restart persistence and recoverable corrupt/invalid configuration behavior pass.
- Defined tests, typecheck, lint, and build pass.

### Phase 7 Definition of Done

- All V1 requirements and critical integration/security/data-safety tests pass.
- Windows 10/11 acceptance, production build, packaged app, native dependencies,
  installer, and installer smoke pass.
- Installed workflows for project, editor/save, terminal, Language Intelligence,
  Run, Git, settings, and cleanup pass.
- No critical defect remains; final architecture, decisions, codebase map,
  requirements traceability, and changelog review pass.

## 20. Change Control

If implementation evidence shows that an accepted architecture decision must
change:

1. Stop the affected implementation.
2. Update or reopen the relevant ADR in `docs/DECISIONS.md`.
3. Record the evidence, failed gate, options, and consequences.
4. Obtain and record the new decision.
5. Update `docs/ARCHITECTURE.md` if necessary.
6. Update this implementation plan and affected traceability.
7. Only then continue implementation.

This plan never becomes the architecture authority and may not silently absorb a
design deviation.

## 21. Workflow and progress reporting

Conceptual delivery flow:

```text
feature work -> develop -> CI -> PR -> main
```

`main` represents milestone/stable history. Branch, PR, merge, tag, and release
operations require their own authorization and are not performed by this plan.

For each completed package:

- update its status only after the exit gate passes;
- update `docs/CODEBASE-MAP.md` to actual paths;
- add only implemented and verified work to `docs/CHANGELOG-THESIS.md`;
- record decision evidence and remaining blockers;
- do not pre-fill future changelog entries as completed.

## 22. Future / Out-of-Scope Work

The following are not scheduled into V1:

- Formatter and Format on Save.
- Debugger and DAP workflows.
- AI tutor, coding agents, provider orchestration, auto-edit, and auto-run.
- Cloud or remote workspaces and synchronization.
- Collaboration and mobile functionality.
- Extension host or marketplace.
- Worktree or multi-agent orchestration.
- Hosted Git review/forge APIs and credential storage.
- Multi-root workspaces and remote terminals/execution.

Future work must receive explicit requirements, architecture, decisions, and an
updated implementation plan before implementation begins.

# Student Coding IDE Implementation Plan

## 1. Purpose

This document converts the accepted Student Coding IDE requirements and
architecture into an ordered execution plan. It defines ownership, dependencies,
decision gates, tests, acceptance criteria, and phase exit conditions from Phase
2 through Phase 9, including Phase 5.5 C# intelligence, Phase 8 Local AI Chat,
and the approved Phase 9 Learning roadmap. This documentation update does not
authorize Phase 9 implementation.

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

### Local AI Chat UI V1 — 2026-09-25

Status: `COMPLETE`. Explicitly authorized renderer-only mock UI on `develop`,
using completed shell/sidebar/theme foundations. Requirement Section 20 records
the bounded scope exception. No unresolved decision gate. The user's correction
requires stock beUI UI, with only the conversation background matching the IDE.
Added its required clsx, motion and tailwind-merge dependencies after source review;
no native/runtime service dependency or full shadcn initialization.
App owns the toggle/overlay; stock beUI components and AiChatPanel own
ephemeral presentation. Explorer/Git stay mounted, inaccessible under the overlay;
the sidebar resizer remains available. Closing discards the mock conversation.
No backend, IPC, model calls, streaming, file context, history or persistence.
Acceptance: toggle/close, transcript, Enter/Shift+Enter, cleared input, preserved
sidebar state, resize; renderer/full tests, typecheck, lint, build, diff checks.

Verified: 73 renderer tests and 1043 total tests in 79 files passed; full suite
rerun passed after one 5000ms real-Git timeout during concurrent build/test.
Typecheck, lint, final production/native Windows build and diff checks passed.
Light/dark Electron harness renders inspected; stock 14px component text and
16px bubble/composer radii confirmed. No backend or accepted architecture change.

### Authorized Explorer context-menu follow-up — 2026-09-25

Status: `COMPLETE`. The user explicitly authorized a renderer-only follow-up
to the completed Explorer/editor foundations (FR-004–FR-009), on `develop`.
Scope: file/folder/background context menus; move Rename/Delete out of the
toolbar; preserve existing open, create, rename, refresh and guarded Recycle Bin
flows; copy project-relative paths through the browser clipboard API.
No new decision gate, dependency, filesystem/IPC authority, preview tabs, View
File, Git actions or Phase 7 work is authorized by this follow-up.
Acceptance: requested menu/selection/target/lifecycle/lock regression tests,
existing dirty-editor protection tests, typecheck, lint, build and diff checks.
Orca evidence is limited to visual grouping, translucency and right-button
release handling in `file-explorer-row-context-menu.tsx` at the locked baseline;
the implementation is independent.

Verification: all 1039 tests in 78 files passed, including 69 Explorer/App
integration tests and dirty-editor deletion regressions. Typecheck, lint,
production/native Windows build and scoped `git diff --check` passed. The final
repository-wide diff check reports trailing whitespace in an unrelated concurrent
user edit at `src/renderer/src/App.tsx:263`; that edit was preserved. Live visual
inspection in Electron was not performed; light/dark styling uses existing
semantic tokens. No existing phase status or architecture decision was changed.

### Previously completed baseline

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
- Phase 2F packages A–E are complete. The audit and corrective passes closed
  the Phase 2 data-loss, boundary-error, unavailable-root, deleted-file,
  cancellation, cleanup, integration, Search-test timing, native-verification,
  and documentation findings. Recent-project list management remains Phase 6
  scope, and the jsdom canvas diagnostic remains non-blocking test noise.
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
5. Keep Terminal, Run, and the Phase 5.5 Main-owned C# LanguageServiceManager as
   three separate lifecycle domains (ADR-008 and ADR-022).
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
| Phase 2F — Core IDE Stabilization | `COMPLETE` | Integrated Core IDE workflow and cleanup |
| Phase 3 — Language Intelligence | `COMPLETE` | 3A–3F complete; current V1 acceptance passed |
| Phase 4 — Run & Output | `COMPLETE` | 4A–4F complete; final stabilization and Phase 4 exit gate passed |
| Phase 5 — Git Integration | `COMPLETE` | Corrective Phase 5C native-test portability fix and Phase 5F re-verification passed locally |
| Phase 5.5 — C# Language Intelligence | `COMPLETE` | 5.5A–5.5H complete; automated verification and user-confirmed manual acceptance PASS |
| Phase 6 — Settings & UX | `COMPLETE` | Settings, dependency guidance and Recent Projects; verified 2026-09-14 |
| Phase 7 — Testing, Stabilization & Windows Packaging | `NOT_STARTED` | V1 acceptance, packaging, installer, and final review |
| Phase 8 — Local AI Chat | `COMPLETE` | Existing 8A–8C completion evidence in Section 13.5 |
| Phase 9 — Learning / Programming Techniques | `NOT_STARTED` | Planned 9A–9G; Section 13.6; explicit implementation authorization required |
| C# Project Run extension — M1 + M2 | `IN_PROGRESS` | M1-01 through M1-08 COMPLETE; Windows 11 x64 scope; M1-09a/M1-09 and remaining tasks NOT_STARTED; Section 13.7 |

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
`COMPLETE`. Phase 2F completed its A–E audit, corrective, resource, integration,
native, performance, security, and documentation gates. Phase 3A architecture
and feasibility audit, Phase 3B language foundation, Phase 3C production JS/TS
synchronization, Phase 3D HTML/CSS/JSON intelligence, Phase 3E Problems
aggregation/navigation, and Phase 3F final verification are `COMPLETE`; all
Phase 4 and Phase 5 packages are also `COMPLETE`. Phase 5.5A is complete. Phase
5.5B and its corrective structured workspace-readiness spike passed on Windows.
Exact provider/transport versions are selected and the 5.5C contracts and
dependency foundation, 5.5D Main LSP core and 5.5E workspace/document sync are
complete. 5.5F–5.5H are COMPLETE after corrective runtime verification and user-confirmed manual acceptance.
Phases 6–7 have not started.

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
Phase 5 complete ---> Phase 5.5 C# Language Intelligence
Phase 5.5A complete ---> Phase 5.5B compatibility spike (hard gate)
Phase 5.5B PASS ---> Phase 5.5C–5.5H
Phase 5.5 complete ---> Phase 6 Settings & UX
Phases 2–6 including 5.5 complete ---> Phase 7 final V1 acceptance and packaging
```

Phase 9 follows Phase 8 in the roadmap. Its internal dependencies and foundation
gates are recorded in Section 13.6; this does not waive Phase 7 acceptance.

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

**Status:** `COMPLETE`

Phase 2F-A recorded findings 001–011. Phase 2F-B corrected boundary/lifecycle
handling, Phase 2F-C corrected renderer resource cleanup and deferred
Recent Projects policy to Phase 6, Phase 2F-D corrected delete commit safety,
filesystem unavailability, external deletion state, and expected-cancellation
presentation, and Phase 2F-E completed the integrated verification. Final
evidence passed 328 tests across 33 files, typecheck, lint, production build,
patch/rebuild capability checks, Windows Job and production-service smokes,
bounded 500-file Search smoke, and `git diff --check`.

| Audit finding | Final status | Resolution |
|---|---|---|
| 2F-A-001 | `CLOSED` | Post-approval interaction lock and authoritative transition settlement prevent edit-loss races. |
| 2F-A-002 | `CLOSED` | Cross-feature workflow, transition, reload, shutdown, and stale-event scenarios have layered integration coverage. |
| 2F-A-003 | `CLOSED` | STOPPING locks new work and preload invoke rejection/response failures normalize safely. |
| 2F-A-004 | `CLOSED` | Editor disposal commits only after successful Recycle Bin deletion. |
| 2F-A-005 | `CLOSED` | Active filesystem authority publishes project-scoped `AVAILABLE`/`UNAVAILABLE` state. |
| 2F-A-006 | `CLOSED` | External deletion retains the buffer in an explicit disk-missing state and blocks normal save. |
| 2F-A-007 | `CLOSED` | Known user-cancelled project transitions are neutral; unrelated failures remain visible. |
| 2F-A-008 | `CLOSED` | Pointer resize listeners and body state are removed idempotently on unmount. |
| 2F-A-009 | `DEFERRED` | Phase 2 metadata remains minimal; Recent Projects management/limit policy belongs to Phase 6. |
| 2F-A-010 | `CLOSED` | Phase 2 status, implemented behavior, and final verification counts match current evidence. |
| 2F-A-011 | `POLISH` | Stray test comment removed; unsupported jsdom canvas diagnostic retained as non-blocking noise without a dependency. |

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
external provider process. Current Phase 3 V1 covers JavaScript/TypeScript,
HTML/CSS/JSON, and syntax-only C#/PHP. Python and Java language support are
deferred to a future authorized phase, not permanently removed.

### Dependencies

- Phase 2 editor models, project lifecycle, contracts, editor navigation target,
  and stabilization exit gate.
- ADR-013 and ADR-015.

### Decision gates

- ADR-015 has selected Monaco-native providers for JS/TS/HTML/CSS/JSON, bounded
  JS/TS project snapshots, and the project-root `UNAVAILABLE` behavior.
- Phase 3B resolved the initial large-project bounds at 500 JS/TS source files,
  5 MiB total UTF-8 content, and 256 KiB per file. Re-measure during 3C while
  preserving edit/save.
- Phase 3B recorded bounded snapshot exclusions, safe virtual URI mapping,
  dirty-model precedence, and stale project/provider generation protection.
  Wholesale `node_modules` mirroring and canonical-root exposure to Renderer are
  prohibited.
- Phase 3B recorded an offline, deny-by-default JSON schema policy.
- Verify capability coverage, multi-file behavior, document synchronization,
  Windows virtual URI/path handling, cancellation, cleanup, worker recovery,
  development behavior, and production-build worker/resource discovery.
- Full application packaging, installer creation, release artifacts, and
  installed-app acceptance remain Phase 7 responsibilities.

### Key deliverables

- Renderer-side LanguageProviderManager/provider contracts, capability routing,
  bounded document synchronization, normalized diagnostics, worker status, and
  cleanup.
- Completion, Hover, Signature Help, and Go to Definition for Tier 1 JavaScript,
  and TypeScript.
- Tier 2 HTML/CSS/JSON capabilities exactly as committed in the matrix.
- Diagnostics markers for JavaScript, TypeScript, CSS, and JSON plus
  Problems UI/navigation; HTML has no current diagnostic source.
- Tier 3 C#/PHP syntax-only V1 support; no Tier 3 intelligence/run commitment.
- Language-service states: `NOT_CONFIGURED`, `MISSING`, `STARTING`, `RUNNING`,
  `STOPPED`, `CRASHED`, `INVALID_CONFIGURATION` where applicable to a current
  worker provider.
- Explicit project-scoped cleanup. Root `UNAVAILABLE` stops project intelligence
  and clears stale diagnostics while preserving buffers, syntax, and project
  state.
- No external language-server process or Python/Java provider dependency.

### Acceptance criteria

- Capability matrix acceptance passes per language/tier.
- Missing, starting, stopped, crashed, or invalid provider states that apply to a
  current provider never prevent editing and saving.
- Current provider recovery uses safe disposal and renderer-owned
  reinitialization where Monaco naturally supports it. No manual restart button,
  command, menu item, IPC endpoint, or new lifecycle UX is required. Dirty
  buffers remain authoritative and stale project/provider generations remain
  rejected during recovery.
- One provider failure does not break another language.
- JavaScript, TypeScript, CSS, and JSON diagnostics update without blocking
  Renderer, and their Problems navigation reaches the correct file/range.
  HTML diagnostics/Problems contribution are deferred because the current
  Monaco HTML provider has no validation support.
- Project switch/close, root `UNAVAILABLE`, renderer reload, worker recovery, and
  stale diagnostics cleanup pass on Windows.
- Provider/worker resource discovery is demonstrated for development and
  production builds without claiming full packaged/installed acceptance.

### Work packages

#### 3A — Architecture and feasibility audit — `COMPLETE`

- Audited the Phase 2 Monaco/editor baseline, provider options, project and
  diagnostics ownership, security, resources, and Orca reference applicability.
- Resolved ADR-015 for the approved current scope. No production code or
  dependencies were changed.

#### 3B — Language foundation and provider contracts — `COMPLETE`

- Configure the Monaco provider foundation and current extension/language map.
- Add capability, provider-status, normalized-diagnostic, ownership, and cleanup
  contracts without adding external process control.
- Define safe virtual URI mapping and the narrow project-scoped data flow needed
  for bounded snapshots; Renderer receives no canonical root or arbitrary
  filesystem access.
- Fix bounded snapshot file/count/byte thresholds, exclusions, and behavior when
  the active root is `UNAVAILABLE`.
- Dependencies: existing `monaco-editor`, Phase 2 project/filesystem and editor
  contracts; no new package or external runtime expected.
- Complexity: MEDIUM.
- STOP if bounded project data cannot be supplied through existing or narrow
  validated project-scoped capabilities, if a new dependency becomes necessary,
  or if security boundaries would change.

Completion evidence:

- The renderer-owned Monaco worker map covers editor, JS/TS, HTML, CSS, and JSON
  using local build assets. A production renderer `file://` Electron smoke loaded
  every worker with the required BrowserWindow security flags.
- Capability/provider/status contracts cover only the approved current matrix;
  C#/PHP remain tokenization-only and Python/Java remain deferred.
- Safe project-scoped virtual URIs resolve same-file and TS/JS/mixed cross-file
  definitions without exposing a canonical root. JSX/TSX and deliberate JS/TS
  diagnostics/defaults passed focused worker tests.
- The bounded snapshot prototype excludes `node_modules`, non-JS/TS sources,
  over-limit files/count/bytes, gives open models (including dirty models)
  precedence, and rejects stale project/provider generations. Project switch,
  close, root `UNAVAILABLE`, and renderer disposal clear only owned state and
  diagnostics.
- Measurements: the snapshot planner/state processed 1,000 files and 8,219,780
  UTF-8 bytes in 59 ms with a 7,116,248-byte observed heap delta; the TypeScript
  worker resolved a 501-file, 4,111,341-byte virtual project in 1,184 ms and
  parsed a 262,170-byte individual source in 393 ms. The initial 3C ceilings are
  500 files, 5 MiB total, and 256 KiB per file.
- Candidate discovery can reuse current validated FileSystemService list/stat/read
  operations with project IDs and relative paths. No new IPC, raw filesystem,
  canonical-root exposure, process authority, dependency, or external provider
  is required.
- Full verification passed 353 tests across 37 files, typecheck, lint, production
  build, Electron worker smoke, and `git diff --check`.

#### 3C — JavaScript/TypeScript intelligence — `COMPLETE`

- Implement production bounded JS/TS source discovery and the production project
  snapshot using the initial 500-file, 5-MiB-total, and 256-KiB-per-file ceilings.
- Synchronize JavaScript/TypeScript sources with Monaco's TypeScript worker,
  including live updates and existing-scope file create/delete/rename/change
  handling. Dirty Monaco models take precedence over disk snapshot content.
- Handle project open/switch/close cleanup, root-`UNAVAILABLE` degradation, and
  rejection of stale project/provider generations.
- Deliver same-file and cross-file JS/TS intelligence, mixed JS/TS, JSX and TSX:
  completion, hover, signature help, Go to Definition, and diagnostics.
- Keep declaration/configuration behavior bounded to evidence-backed behavior.
  Full `tsconfig` support, full `node_modules` mirroring, arbitrary package
  discovery, unrestricted external type loading, arbitrary filesystem access,
  canonical project-root exposure, and generic language IPC are not authorized.
- Dependencies: 3B; no new package or external runtime expected.
- Complexity: LARGE.
- STOP if required multi-file behavior cannot fit the approved bounded snapshot,
  would require wholesale `node_modules` mirroring/canonical-root exposure, or
  needs an external TypeScript service.

Completion evidence:

- Production discovery traverses through existing project-ID plus relative-path
  list/stat/read capabilities, selects exact `.js`, `.jsx`, `.ts`, and `.tsx`
  sources, excludes `node_modules`, and enforces 500 files, 5 MiB total UTF-8
  content, and 256 KiB per individual file without adding IPC or disk authority.
- A renderer-owned TypeScript project controller creates provider-owned
  background Monaco models, lets `EditorModelManager` adopt canonical URI models,
  preserves dirty/open buffer precedence, and incrementally refreshes changed
  sources. Existing coarse watcher rename events trigger bounded rescan/diff for
  create, delete, and filesystem rename synchronization; no polling or second
  watcher was added.
- Project open/switch/close, root unavailability, renderer disposal, model
  open/change/save/reload/close/rename, provider failure/reinitialization, and
  stale project/provider generations have focused deterministic coverage. Late
  old-project reads cannot populate the active provider, and deleted dirty
  buffers retain Phase 2 disk-missing/data-safety semantics.
- Monaco worker evidence passes same-file and cross-file JS/TS, JS importing JS,
  TS importing TS, mixed JS/TS, JSX, TSX, completion, hover, signature help,
  definition, and JavaScript/TypeScript diagnostics. HTML/CSS/JSON registration
  remains passing and C#/PHP remain tokenization-only.
- Focused Phase 3 regression passed 49 tests across 5 files. The full suite passed
  365 tests across 38 files; typecheck, lint, production build, Electron
  production-worker smoke, and `git diff --check` passed. The known jsdom canvas
  diagnostic remains non-blocking. Sandboxed test/build attempts that required
  child-process creation were rerun successfully with process-spawn permission.
- No dependency, `package-lock.json`, privileged API, generic language IPC,
  canonical-root exposure, external service, Python/Java provider,
  `node_modules` mirroring, full `tsconfig`, or Phase 3D/4 implementation was
  introduced. Full packaged/installed verification remains Phase 7.

#### 3D — HTML/CSS/JSON intelligence — `COMPLETE`

- Verify Monaco-native HTML completion and hover. HTML diagnostics and Problems
  contribution are deferred because the current provider has no validation
  support; no replacement validator/provider is part of this package.
- Enable/verify Monaco-native CSS and JSON completion, diagnostics, and
  provider-supported hover using current in-memory models.
- Apply the trusted/offline JSON schema policy and verify provider cleanup and
  stale-diagnostic removal.
- Dependencies: 3B; no new package or external runtime expected.
- Complexity: MEDIUM.
- STOP if schema behavior requires unapproved network trust, a new dependency,
  or privileged Renderer authority.

Completion evidence:

- Production defaults enable Monaco-native HTML completion/hover while leaving
  HTML diagnostics disabled, enable CSS completion/hover/validation, and enable
  JSON completion/hover/validation with an empty schema list and schema requests
  disabled.
- Actual-worker tests verify HTML tag and attribute completion plus hover from
  current dirty content. The HTML worker exposes no validation operation, so
  diagnostics and its Problems contribution remain deferred without a custom
  validator or alternate provider.
- Actual-worker tests verify CSS property/value completion, hover, diagnostic
  source/severity/range, update after editing, clearing after a fix, and model
  disposal. JSON tests verify local schema-free peer-property completion, syntax
  diagnostics, update/clear/disposal, no useful schema-free hover, and no network
  access even when a document contains a remote `$schema`.
- Tier 2 stays model-local and uses `EditorModelManager` models and existing
  switch/close/disposal ownership. No project index, new IPC, filesystem/process
  authority, dependency, package-lock change, or Phase 3E Problems work was
  introduced.
- Focused Phase 3D tests passed 24 tests across 3 files. The full suite passed
  374 tests across 39 files; typecheck, lint, production build, Electron
  production-worker smoke, and `git diff --check` passed. The unchanged jsdom
  canvas diagnostic remains non-blocking. Full packaged/installed acceptance
  remains Phase 7.

#### 3E — Problems and diagnostics integration — `COMPLETE`

- Add the normalized Problems store, marker aggregation, project/file scoping,
  stale cleanup, severity/source display, and navigation to file/range.
- Dependencies: 3C and 3D.
- Complexity: MEDIUM.
- STOP if diagnostics ownership conflicts with Monaco/model lifecycle or if
  Problems behavior requires an unapproved product decision.
- Implemented a renderer-owned normalized store and Monaco marker controller for
  JavaScript, TypeScript, CSS, and JSON. Provider/file replacement and clearing,
  deterministic file/range ordering, severity/source preservation, deduplication,
  stale project/provider/model-version rejection, and lifecycle cleanup pass.
- Integrated Problems into the existing Bottom Panel without changing Terminal
  ownership. The panel provides neutral empty state, file grouping, counts,
  severity/source/location display, and current-state updates. HTML contributes
  no diagnostics; C#/PHP remain tokenization-only; Python/Java/external LSP stay
  deferred.
- Navigation reuses the existing editor workspace and canonical model, activates
  the correct tab, reveals the diagnostic range, preserves dirty content, and
  fails safely for deleted/stale and old-project targets.
- Focused Phase 3E coverage passed 11 tests across 3 files. The full suite passed
  385 tests across 42 files; typecheck, lint, production build, Electron Monaco
  worker smoke, and `git diff --check` passed. The unchanged jsdom canvas warning
  remains non-blocking. No dependency, package-lock change, IPC, filesystem,
  process, network, validator, language provider, or architecture deviation was
  introduced.

#### 3F — Stabilization and final verification — `COMPLETE`

- Run integration, lifecycle, performance/resource, security, Windows,
  development/production-build, and documentation gates for current languages.
- Verify C#/PHP syntax assignment and confirm all Python/Java support remains
  outside current acceptance without weakening future extensibility.
- Dependencies: 3B–3E.
- Complexity: MEDIUM.
- STOP on failed current-scope acceptance, resource leaks, stale diagnostics,
  boundary violations, or undocumented scope/dependency changes.

Completion evidence:

- Audited all uncommitted Phase 3 changes and classified them as Phase 3A/3B
  foundation, Phase 3C JS/TS synchronization, Phase 3D HTML/CSS/JSON, Phase 3E
  Problems, the two authorized Phase 2D Search corrections, tests, or
  documentation. No accidental unrelated file, temporary/debug code, dead
  helper, package change, or generated tracked artifact was found.
- Reverified the renderer-only Monaco/provider boundary, project-relative file
  flow, no language IPC/canonical-root exposure, offline JSON behavior, and
  secure BrowserWindow configuration. No new filesystem, process, network, raw
  IPC, dependency, validator, external provider, Python, or Java authority exists.
- Added two focused deterministic stabilization tests. Repeated JS/TS project
  activate/switch/close/reopen cycles do not accumulate background models;
  repeated Problems controller cycles release marker listeners and diagnostics.
  Focused Phase 3 acceptance passed 69 tests across 9 files.
- Both authorized Search race regressions passed in two independent 57-test
  integration runs. Two independent full-suite runs each passed 387 tests across
  42 files with no retry configuration or timing sleeps.
- Typecheck, lint, production build, Electron production-worker smoke, and
  `git diff --check` passed. The smoke loaded editor, JavaScript/TypeScript,
  HTML, CSS, and JSON workers from production `file:` assets with
  `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
  The unchanged jsdom canvas warning remains non-blocking.
- Current Phase 3 V1 acceptance is complete. HTML diagnostics, full `tsconfig`,
  bare-package/`node_modules` resolution, unrestricted declaration loading,
  Python, Java, external LSP, and packaged/installed acceptance remain explicitly
  deferred. No Phase 4 implementation was started.

### Exit gate

- All current-scope provider decisions are recorded; deferred Python/Java and
  external-server decisions are not an exit blocker.
- Required provider feasibility evidence passes; full packaged/installed provider
  verification remains a Phase 7 exit condition.
- Phase 3 Definition of Done in Section 19 passes.
- Typecheck, lint, build, defined tests, and Windows provider smoke tests pass.

## 10. Phase 4 — Run & Output

### Authorized execution packages

- 4A — Run contracts/service/strategy foundation: `COMPLETE`.
- 4B — PATH runtime detection/native adapter/Electron binding: `COMPLETE`.
- 4C — Run execution lifecycle/re-run/cleanup: `COMPLETE`.
- 4D — Project/application lifecycle integration: `COMPLETE`.
- 4E — Editor-header Run and Bottom Panel Output: `COMPLETE`.
- 4F — Stabilization/security/regression/build/native verification: `COMPLETE`.

The user accepted the isolated Windows native spike as feasibility evidence and
authorized production integration. Baseline diagnostics classified the Monaco
registration timeout as test-infrastructure/resource contention; two subsequent
full suites passed 387/387. Keep maxWorkers=4 and existing test timeouts. The user
subsequently authorized continuation of interrupted 4B work; IPC/bridge factories are not composed
into the live application until execution is ready. Native, lifecycle, and UI
acceptance must be verified separately from spike evidence.

4A verified scope: exact shared request/session/event validators; Main-generated
opaque session IDs; owner-scoped immutable preparation records; narrow
RunPreparationAuthority and RunStrategy seams; JavaScript-only explicit
executable/argument preparation; uncomposed typed Main IPC and Preload adapters.
No actual Node detection, filesystem authorization implementation, process spawn,
stop/re-run execution, native binding, project/shutdown wiring, or UI is claimed.
Focused tests passed 37/37; full regression passed 424/424 across 43 files.
Typecheck, lint, production build, and whitespace checks passed. Vitest remains
maxWorkers=4 with unchanged timeouts/retry behavior. Spike fixture lint metadata
was corrected without changing fixture behavior. Dependencies/package-lock,
ProcessManager, Terminal, Renderer runtime capability, and security flags are unchanged.

4B completion evidence (2026-09-05):

- PATH-only Node detection rejects empty, relative and current-drive-rooted entries,
  supports quoted/spaced and UNC directories, and returns safe missing/invalid errors.
- Main-only Node-API 8 Windows x64 adapter uses creation-time Job membership,
  separate bounded asynchronous stdout/stderr delivery, UTF-8 streaming decoding,
  root exit and EOF settlement, and explicit native release. The internal RunService
  seam rechecks injected authority, registers before creation, rolls back failed
  spawn registration, and retains ownership on cleanup failure. No app/IPC wiring.
- `npm run build` compiles `out/main/native/run-process.node` with existing MSVC,
  Electron headers/import library and npm's delay-load hook, without downloads or
  dependencies. Native compilation is Windows x64 only; other hosts retain JS
  builds and fail closed if the adapter is constructed. Ubuntu execution was not
  performed in this Windows session. Packaged/installed acceptance remains Phase 7.
- `node_modules/.bin/electron.cmd scripts/smoke-run-native.mjs` passed using the
  production Main entry and native artifact under Electron 44.0.0, ABI 149, x64.
  Fifteen cycles verified asynchronous independent streams, Unicode, exit 0/7,
  single exit/EOF delivery, concurrent/idempotent close, and native release.
  Additional checks proved a surviving descendant remains Job-owned after root
  exit, ProcessManager cleanup empties/releases it, and native spawn failure leaves
  no registered resource. This is production-binding evidence, not reused spike output.
- Full suite passed 436/436 across 44 files; typecheck, lint, production build,
  and `git diff --check` passed. Worker count/timeouts/retries are unchanged.
  Existing jsdom canvas diagnostic remains non-blocking. Sandbox spawn EPERM
  required approved execution outside the sandbox for build/tests/native smoke.
- No new decision, dependency, package-lock, ProcessManager, Terminal, or security
  flag changes. Concrete filesystem authorization, execution/re-run state,
  project/shutdown composition and UI remain 4C–4E; 4F retains final integration
  verification. Phase 4 as a whole is not complete.

4C completion evidence (2026-09-05):

- Implemented Main-only semantic start/stop, immutable existing RunSession state
  transitions, opaque IDs, and canonical-target serialized re-run. Different
  targets remain concurrent; a replacement cannot start until old cleanup succeeds.
  Dirty/unsupported/invalid targets and missing runtime fail before spawn. The
  injected Main authority/runtime seams are rechecked before execution; concrete
  authority/application composition is not claimed by this package.
- Exact session and active-target record guards reject old stdout/stderr/exit/error
  callbacks. Output preserves stream identity and adapter delivery order. Natural
  exit initiates descendant cleanup; terminal state/exit is emitted once only after
  root exit, both EOFs and native resource release. Exit 0 is EXITED, non-zero or
  observation failure is FAILED, and explicit Stop before root exit is CANCELLED.
- ProcessManager remains unchanged. Unique per-session resource-owner keys use its
  existing cleanupOwner await/deduplication/retry behavior. Failed cleanup remains
  STOPPING with safe retryable errors and retained tracking; no terminal event or
  replacement occurs. Recent completed-session tombstones (bounded to 128 snapshots,
  no output/native resources) support duplicate Stop; foreign/unknown IDs fail closed.
- Focused deterministic 4A–4C tests passed 71/71, including 22 new lifecycle cases:
  individual cleanup gates, duplicate Stop, Stop during STARTING, cleanup retry,
  spawn failure, safe valid error events, owner rejection, same-target concurrent
  requests/case aliases, different-target concurrency, and late stale callbacks.
  Full regression passed 458/458 across 45 files with maxWorkers=4 and unchanged
  timeouts/retries; no sleeps/skips/tooling changes. Known jsdom canvas noise remains
  non-blocking. Typecheck, lint, production build and git diff --check passed.
- Production Electron 44.0.0 / ABI 149 / Windows x64 lifecycle smoke passed five
  sessions covering natural exit 0/7, streams, Stop/duplicate Stop, same-target
  replacement and root-first descendant cleanup; final resource count was zero.
  Reproduction: build, then
  `node_modules/.bin/electron.cmd scripts/smoke-run-lifecycle.mjs`.
  Existing 4B native smoke passed 15 cycles plus root-first/failed-spawn checks.
  `npm run smoke:monaco-workers` passed editor/JS/TS/HTML/CSS/JSON discovery from
  production file assets with the three required Electron security flags.
- No ProcessManager/native architecture/Terminal/renderer/security changes, new
  dependency, lockfile edit, or new ADR decision. Project switch/close, application
  shutdown, live IPC composition and Run/Output UI remain unimplemented 4D–4E work.
  No commit/push/merge; 4D requires separate explicit authorization.

4D completion evidence (2026-09-05):

- Main composes RunService, PATH detector, lazy native adapter and the managed
  RunProjectLifecycle. Its existing ProjectService guard runs after the unsaved
  and Terminal guard. Cancel leaves Run active; approval blocks new starts and
  awaits all project-owned cleanup before mutation. The lease remains held until
  existing project-changed/transition-failed notifications, including persistence
  awaits. Failure preserves the current project and returns a retryable domain error.
- Existing FileSystemService status subscriptions stop/mute unavailable-project
  runs without a new watcher. Main-only authorizeRunFile validates regular-file,
  canonical containment and availability using the existing resolver. Generation
  guards invalidate pending starts across transition/unavailability/reopen and at
  the final pre-spawn boundary. Cleanup requests remain tracked through the gap
  between session finalization and ProcessManager promise/tracking completion.
- DesktopApplication STOPPING blocks Run starts/events immediately. Run cleanup
  remains in existing managed-service order; failed cleanup retains STOPPING,
  dependencies and the window for ADR-021 retry. ProjectService, unsaved service,
  quit coordinator, DesktopApplication, ProcessManager and Terminal were not redesigned
  or modified. No global transition queue or independent shutdown owner was added.
- Sixteen deterministic 4D tests cover switch/close approval and cancellation,
  cleanup failure/retry without mutation, overlapping transitions, multiple targets,
  project scoping, unavailable/reopen/stale events, pending-authority/runtime races,
  concrete file authority, duplicate shutdown and real quit-coordinator retry.
  Focused 4A–4D/unsaved/shutdown suite passed 109/109 across seven files. Final full
  regression passed 474/474 across 46 files. Typecheck, lint, production build and
  git diff --check passed; maxWorkers=4, test timeouts/retries unchanged. Existing
  jsdom canvas diagnostic remains non-blocking.
- `node_modules/.bin/electron.cmd scripts/smoke-run-project-lifecycle.mjs` passed
  with production services and native adapter under Electron 44.0.0 / ABI 149:
  cancel, confirmed switch, close, unavailable, reopen and shutdown; four native
  sessions released, zero resources remaining. Existing Run lifecycle smoke passed
  five sessions, including natural exit/non-zero/re-run/root-first cleanup. Monaco
  production-worker smoke passed editor/JS/TS/HTML/CSS/JSON with secure window flags.
- Main shared build chunks are emitted beside the entry so native binding relative
  paths remain valid after Run becomes shared by app and smoke entry. Native process
  creation/cleanup architecture is unchanged. No dependency/lockfile/ADR change,
  Renderer invoke authority, Run button, Output UI, commit, push or merge. 4E requires
  separate explicit authorization; full Phase 4 and packaged acceptance are not claimed.

4E completion evidence (2026-09-05; authorized after 4D acceptance):

- Registered the existing validated Run IPC adapter and exposed only typed
  start/stop/onEvent through studentIde.run. Main observes renderer navigation and
  destruction; owner-generation invalidation rejects pending launches and owned
  cleanup mutes old events, awaits release, and retains failures for shutdown retry.
  No generic IPC, process options, renderer Node access, or new wire DTOs.
- One Run entry point sits at the right of the existing editor-tabs header.
  The normal file-model surface is unambiguous; no extra shell/header was added.
  Saved active-project .js targets can run; dirty, missing, unavailable, conflicted,
  and unsupported targets are disabled with feedback. TypeScript copy explicitly
  says current V1. Missing Node/spawn failures use safe inline Output feedback.
- The same header group exposes Stop for an active target. Run again delegates
  replacement to Main; pending invokes and STARTING/STOPPING disable duplicates.
  Cleanup failure exposes Retry Stop. No renderer-generated process state or
  optimistic replacement RUNNING state; fast exit events outrank older invoke replies.
- Output is a sibling of existing Terminal/Problems tabs with the existing
  PanelResizer and height state. Latest requested/stopped target output is shown;
  per-target views retain separate stdout/stderr chunks in received order. Stream
  view notifications batch on animation frames. Target/session/project guards
  reject superseded events; project changes, unavailability and unmount clear
  buffered views/frames. One Run subscription lives above panel/header mounts.
- 21 new deterministic Renderer-to-Preload-to-RunService integration cases plus
  three owner-cleanup cases and one App tab/subscription case. Existing Preload
  capability-list and App subscription-count fixtures now account for Run.
  Full regression passed 499/499 across 47 files with maxWorkers=4, unchanged
  timeouts/retries, no sleeps/skips, and existing non-blocking jsdom canvas output.
  Typecheck, lint, production/native build and git diff --check passed.
- New production UI smoke: build, then
  `node_modules/.bin/electron.cmd scripts/smoke-run-ui.mjs`. Actual built React,
  Monaco, Preload and native Run services verified Run/re-run/Stop, stdout/stderr,
  exit 0/7 and Problems/Output switching; four sessions released, zero resources.
  Screenshot inspection confirmed header placement and existing panel/token style.
  The harness waits for active-file selection after asynchronous file opening.
- Existing native smoke passed 15 cycles and root-first/failed-spawn checks;
  lifecycle smoke passed five sessions; project lifecycle smoke passed four with
  zero remaining resources. Monaco worker smoke passed editor/JS/TS/HTML/CSS/JSON
  with contextIsolation=true, nodeIntegration=false, sandbox=true under Electron
  44.0.0 / ABI 149 / Windows x64.
- No dependency/package-lock/ADR changes, shell redesign, Terminal or Problems
  behavior changes, commit, push or merge. Only sibling tab navigation was added
  to those panels. At 4E completion, 4F remained NOT_STARTED pending explicit
  authorization; full Phase 4 and packaged/installed acceptance were not claimed.

4F completion evidence (2026-09-05; authorized after 4E acceptance):

- Audited every tracked modification and untracked Phase 4 source, build script,
  fixture, test, spike and documentation file. No unrelated changes, tracked
  generated/native artifacts, logs, debug files, secrets, private data or source
  references to local developer paths remain. Generated native outputs stay under
  ignored `out/`; package.json and package-lock.json are unchanged.
- Reverified the complete 4A–4E architecture and security boundary: opaque Run
  sessions, Main-owned strategies/runtime/process lifecycle, exact IPC validation,
  typed Preload capability, creation-time Windows Job ownership, separate streams,
  single finalization, cleanup retry retention, project/application cleanup, stale
  rejection and the editor-header/Bottom Panel presentation. Renderer has no process
  authority or generic execution channel; contextIsolation, disabled nodeIntegration
  and sandbox remain enabled.
- Focused Phase 4 integration passed 180/180 across eight files. Two consecutive full
  suites passed 500/500 across 47 files with `--maxWorkers=4`; timeouts, retries,
  sleeps and Monaco coverage were unchanged. The known jsdom canvas diagnostic was
  non-blocking and no deterministic regression appeared. Representative Terminal,
  Problems, Search, Language Intelligence, editor/save and panel-resize coverage
  passed 147/147 across 16 files.
- Production Electron/native verification passed: native smoke completed 15 cycles;
  Run lifecycle smoke passed three repetitions of five sessions; project/application
  lifecycle smoke passed three repetitions of four sessions; UI smoke passed twice
  with eight sessions per run and six same-target cycles. All checks ended with zero
  tracked Run/ProcessManager resources, released native handles and no surviving
  descendants. Root-exits-before-child cleanup, Stop, re-run, switch/cancel/close,
  unavailable-project and shutdown behavior remained passing.
- Terminal native/service smoke, Monaco production worker smoke, typecheck, lint,
  production build and `git diff --check` passed. The production build emits and the
  built Electron application resolves `out/main/native/run-process.node` relative to
  Main output. This Windows 11 build (NT 10.0.26200.9168, display version 25H2) was
  verified; Windows 10 and an installed/package target were not available and remain
  Phase 7 verification, consistent with Section 19.
- No dependency, lockfile, ADR, architecture, security flag, Terminal behavior,
  Problems behavior, commit, push or merge change. Phase 4 V1 is complete; TypeScript
  Run, Run Project, npm scripts, dev-server orchestration and project entry settings
  remain deferred.

### Goal

Implement FR-022 and FR-024 through FR-026 as a trusted, non-interactive Run
domain separate from Terminal: only the current authorized JavaScript `.js` file
inside the active project via Node.js. FR-023 built-in Run Project is deferred,
not a Phase 4 V1 acceptance requirement.

### Dependencies

- Stable project/editor/output targets and ProcessManager primitives from Phase 2.
- Runtime/dependency status UX foundation from Phase 3 where shared conceptually,
  while runtime operation remains independent of Language Services.
- ADR-008 and ADR-012. ADR-014 is a future TypeScript Run gate, not a Phase 4 V1 dependency.

### Decision gates

- ADR-014 is deferred until a future authorized TypeScript Run phase. No V1
  TypeScript runtime, compile/transpile strategy, ts-node, tsx, or Node-native
  TypeScript policy is selected; no TypeScript Run dependency is authorized.
- The user resolved target/save, runtime detection, re-run, UI, and project
  lifecycle policies below, then accepted the isolated native Windows spike and
  authorized a narrow Main-only native piped-process adapter. Production Electron
  loading, async output, native release, and build artifact verification remain
  4B–4F gates; spike evidence cannot satisfy those production checks. ProcessManager
  redesign, Terminal/node-pty behavior changes, new dependencies, or package-lock
  changes still require stopping for a separate user decision.

### Key deliverables

- Main-owned RunService with a narrow internal RunStrategy boundary and exactly
  one concrete V1 JavaScriptRunStrategy. Future authorized strategies can be
  selected without redesigning core RunService; no TypeScript placeholder code.
- Explicit executable, argument array, cwd, controlled environment additions, and
  `shell: false` where possible.
- Separate stdout, stderr, exit code, stop/cancellation, and final exit metadata.
- Output UI and actionable missing/invalid runtime states.
- Main-controlled process PATH Node detection only; `MISSING` blocks Run with a
  safe useful message. Bundled Node and configured Node paths/Settings UI deferred.
- Dirty target blocks Run until explicit Save; no auto-save, stale disk execution,
  temporary execution file, or authoritative buffer mutation.
- Same-target re-run stops and awaits successful cleanup before replacement;
  one active run per target, no overlap or confirmation prompt.
- Confirmed project close/switch waits for all old-project Run cleanup; failure
  preserves project/editor state. Unavailable root stops owned runs; reject stale
  output and replacement-project/session events.
- One primary Run action on the editor header's right side, and an Output sibling
  tab in the existing Bottom Panel. No duplicate action or Terminal redesign.
- Windows owned-process-tree cleanup without a public generic `executeCommand`.
- Node.js execution of the current authorized `.js` file in the active project.
  TypeScript and Python Run are deferred. Built-in Run Project, npm/package-manager
  scripts, dev-server orchestration, project entry configuration, and framework/
  project launchers are deferred; future Run Project needs an explicit entry/script policy.

### Acceptance criteria

- Run remains distinct from Terminal and Language Server lifecycles.
- Output/error/exit behavior and runtime-missing UX satisfy FR-022 and FR-024–FR-026.
- Stop terminates the IDE-owned process tree without killing unrelated processes.
- Application shutdown leaves no IDE-owned Run process.

### Exit gate

- Only JavaScript `.js` execution is accepted in V1; TypeScript execution remains
  deferred behind future ADR-014 selection and verification. Phase 3 TypeScript
  intelligence remains supported. FR-023 is not a current exit gate.
- Phase 4 Definition of Done in Section 19 passes.
- Typecheck, lint, build, defined tests, and Windows process cleanup checks pass.

## 11. Phase 5 — Git Integration

### Current work-package status

- Phase 5A — Git Foundation + Dependency / Repository Detection: `COMPLETE`.
- Phase 5B — Git Status + Stage / Unstage: `COMPLETE`.
- Phase 5C — Commit + Branch + History: `COMPLETE` (including the authorized local branch `@` and native-test portability remediations).
- Phase 5D — Git Lifecycle / Cancellation / Stale-result Protection: `COMPLETE` (including document ownership remediation).
- Phase 5E — Right Sidebar + Source Control UI: `COMPLETE` (whitespace remediation and default parallel test gate verified on 2026-09-09).
- Phase 5F — Stabilization / Final Verification: `COMPLETE` (including corrective portability re-verification).

#### Phase 5 corrective native-test portability (2026-09-09)

Ubuntu GitHub Actions exposed a missing non-Windows suite guard in the Phase 5C
real local Git integration tests. This was a test-configuration defect, not
evidence of a production Git regression. The production detector retains its
Windows `git.exe` semantics. Phase 5C and Phase 5F were correctively reopened
only for this remediation and returned to `COMPLETE` after local re-verification.

The entire Phase 5C native suite now uses the existing suite-level non-Windows
skip policy. Unsupported non-Windows CI intentionally skips it without running
individual assertions; Windows continues to run all 32 tests normally and still
fails if required Git is unavailable. Focused Phase 5C passed 32/32 on Windows,
and the combined 5A/5B/5D native regression passed 32/32. The first default full
run had one existing 5-second timing-sensitive Phase 5C timeout at 5.022 seconds
(810/811 passed); an unchanged independent rerun passed 811/811 across 65 files.
Typecheck, lint, production/native build and whitespace checks passed. No
assertion, timeout, configured retry, product semantic, production code,
dependency, lockfile, contract, IPC or ADR changed. The corrected Ubuntu GitHub
Actions run remains pending until the uncommitted fix is pushed and is not
claimed as passing here.

#### Phase 5F stabilization and final verification (2026-09-09)

Phase 5F began from clean committed baseline
`6af919e43e9676f6cf37cc462dfb359010561839` on `feature/phase-5`; commits
`7e24792`, `7c76638`, `ded21ad`, `f67bef5`, `b1e6d0a` and `6af919e` contain
the verified Phase 5A–5E sequence. The audit found no production defect,
architecture deviation, new decision gate or test-policy issue requiring a code
change. Only verified completion documentation was updated.

- Focused verification passed: 5A 66/66, 5B 110/110, 5C 44/44, 5D 46/46,
  5E 105/105, Phase 2D Search regression 28/28 and Run regression 112/112.
  The combined real-Git matrix passed 72/72 using Git 2.47.1.windows.2.
- Electron 44 Windows x64 smokes passed for Git native argv/commit/history and
  Job cleanup, committed-document ownership across three reloads, built Git/UI
  workflows, Names/conflict/overflow presentation, and existing Run native,
  session, project and application lifecycle cleanup. Native Run completed 15
  cycles; all lifecycle smokes ended with zero retained resources.
- The standalone full `npm test` command passed 811/811 tests across 65 files in
  66.95 seconds with its established `--maxWorkers=4`. No local test was skipped;
  no retry, sleep, timeout, assertion or worker configuration changed. The known
  jsdom canvas diagnostic remains non-blocking.
- Typecheck, lint, production/native build and final `git diff --check` passed.
  Test/build process spawning used the approved external execution path required
  by the managed sandbox.
- Static security and consistency review confirmed secure BrowserWindow flags,
  exact runtime-validated IPC, narrow semantic Preload APIs, exact active-root
  repository authorization, project/document generations, truthful applied and
  unknown mutation outcomes, read-only conflicts, file-only trusted decoration
  projection, and separate Search/Git/Run ownership without polling.
- Deferred scope remains absent: remote Git, fetch/pull/push, hosted review APIs,
  merge/rebase or conflict-resolution UI, discard/diff, stage-all, branch
  creation/deletion/rename, worktrees, submodules, polling/watchers, Explorer
  folder aggregation and Explorer context menus. Phase 5 added no dependency or
  package-lock change.

The Phase 5 Definition of Done and package exit gate pass. Phase 5 is COMPLETE;
packaged/installed Windows 10/11 acceptance remains Phase 7 scope.

Phase 5A added PATH-only Git detection, the private bounded finite command
runner, active-project/exact-top-level repository authorization, the normal
`NOT_REPOSITORY` state, and narrow exact-validated IPC/Preload contracts. It did
not add status parsing, repository mutations, branch/history operations,
polling/watchers, or Renderer UI.

Phase 5A was reopened for authorized final-review remediation on 2026-09-06 and
returned to `COMPLETE` after fresh acceptance. Top-level parsing now validates
the complete fully-qualified drive/UNC path before realpath; malformed output
fails with `PROCESS_FAILED`, including dot/drive-relative output when process cwd
equals the active root. Canonical Windows case/separator comparison is unchanged.
The finite runner now waits for child close even on spawn failure. Real Git
tests verify success, non-zero exit, timeout, cancellation, bounded overflow,
spawn failure, dead child PIDs, one completion/close, destroyed timeout resources,
and removed AbortSignal listeners. Real ProjectService/GitService integration
verifies a spaced Unicode repository root, ordinary folder and nested project.

Fresh evidence: focused Git/Preload tests 76/76 (including six real-process and
three real-repository tests; none skipped locally), full regression 566/566 in
49 files with `--maxWorkers=4`, typecheck, lint, build and `git diff --check` pass.
Local Git is 2.47.1.windows.2. Sandboxed test/build spawn EPERM was an environment
failure; approved outside-sandbox runs passed. Real integration explicitly reports
skips without Windows PATH Git and cannot establish acceptance in that environment.
UNC syntax/identity has automated coverage; no live network-share smoke is claimed.
This remediation does not authorize Phase 5B; Phase 5 overall remains `IN_PROGRESS`.

#### Phase 5B execution and acceptance (2026-09-06)

The user explicitly authorized resuming the interrupted 5B implementation on
2026-09-06. Phase 4 and 5A prerequisites were complete; no Git decision gate
remained open. Existing uncommitted Git contracts, service, runner, parser,
path authority, IPC/Preload and tests were retained and completed. The Explorer
test change only supplies the expanded Git API stub; no unrelated change was
overwritten. Tracking moved through `IN_PROGRESS` before acceptance.

- Scope: FR-028/FR-029 backend status and selected-file stage/safe unstage.
  Source Control UI is 5E; commit/branch/history is 5C; comprehensive owner
  lifecycle/cancellation coordination is 5D; final Phase 5 acceptance is 5F.
- Status streams porcelain v2 NUL-delimited records with independent staged,
  unstaged and untracked states, rename/copy source paths and read-only conflicts.
  The parser retains at most 1000 entries, marks `didHitLimit` only after a
  complete 1001st entry, bounds individual tokens to 128 KiB and rejects malformed
  UTF-8, paths and unsupported records (including submodule records).
- Mutations select one entry from a fresh authorized snapshot. Main validates
  canonical containment, rejects directory expansion and uses literal pathspecs
  with `--`. Rename unstage includes both paths; copy unstage selects only the
  destination. Unstage uses index-only restore with HEAD or path-limited reset
  for an unborn repository, preserving working content and unrelated index data.
- Exact request/response validation exposes no cwd, executable, raw command or
  argument authority. Runner environment removes ambient `GIT_*` overrides;
  process calls use `shell: false`, hidden Windows launch, timeout and bounded
  output. Streaming completion waits for child close and releases listeners/timers.
- A confirmed mutation followed by failed refresh retains `applied: true` with
  `refreshRequired: true`. An interrupted mutation with unknown index outcome is
  `PROCESS_FAILED` with explicit refresh guidance, never reported as cancelled.
- Acceptance: all 676 tests in 53 files passed with unchanged `--maxWorkers=4`,
  including 18 real 5B repository cases and eight real streaming-process cases;
  no local skips. Real repository cases cover clean/MM/add/delete, Unicode,
  spaces, leading dash and literal brackets, rename/copy, unborn HEAD, conflicts,
  index locks, the 1001-file limit and nested-root rejection. Unit/IPC tests cover
  invalid payloads, canonical escapes/directory links and refresh-failure outcomes.
- Typecheck, lint, production/native build and `git diff --check` passed. Sandbox
  spawn EPERM required approved outside-sandbox test/build runs. The existing
  jsdom canvas diagnostic remains non-blocking. No new dependency, ADR change,
  visible UI or future work package was introduced. No live UNC share, Windows 10
  or packaged-app acceptance is claimed; those remain later acceptance work.

Phase 5B's backend exit gate is complete. This does not mark the overall Phase 5
Definition of Done complete or authorize implementation of 5C–5F.

#### Phase 5C execution and acceptance (2026-09-06)

The user subsequently authorized Phase 5C after the committed 5B baseline
`7c766382e768838fdaf4e5f2a83076f8863aa179` on `feature/phase-5`. The initial
worktree was clean. Implementation proceeded only after the user resolved the
history, branch snapshot, switch-outcome and in-progress-operation decisions.
Documentation was updated after implementation and verification, as requested.

- APIs: `commit(projectId, message)`, `getBranches(projectId)`,
  `switchBranch(projectId, branch)` and `getHistory(projectId, limit?)`.
  Existing state/status/stage/unstage capabilities remain intact. Requests reject
  unknown fields; Preload validates both requests and responses. No executable,
  cwd, raw Git argument/ref or shell authority is granted to Renderer.
- Commit invokes Main-owned `git commit -m <message>` with no implicit add,
  paths, amend, allow-empty or hook bypass. Empty/whitespace/NUL messages are
  rejected; Unicode and multiline messages work. First commits are supported;
  nothing staged and identity/hook failures produce safe typed errors. Main
  checks fixed Git metadata markers and rejects commit during merge, rebase,
  cherry-pick, revert or sequencer operations without altering their state.
- One branch snapshot contains `state: ATTACHED | DETACHED | UNBORN`,
  `currentBranch` and an array of local branch names. Detached has null current
  branch; unborn retains the initial name when Git supplies it. Main reads only
  `refs/heads/` with fixed `for-each-ref` formatting and checks HEAD identity
  around the list to reject an observed inconsistent snapshot. Switching requires
  membership in fresh local branch data and uses
  `git switch --no-guess --no-overwrite-ignore -- <branch>` for normal names;
  the authorized `@` exception is documented below. No branch creation,
  force, discard or implicit remote checkout is exposed. Git-blocked switches
  preserve local work; ignored files are also protected against overwrite.
- History is reachable from current HEAD only, including detached HEAD; confirmed
  unborn repositories return `[]`. Default count is 50, maximum 100; invalid,
  noninteger and out-of-range requests are rejected, never clamped. Items contain
  full `id`, `subject`, `authorName` and ISO 8601 `authoredAt` only. Main runs
  `git log --max-count=<limit> --no-decorate --no-show-signature --encoding=UTF-8 -z --format=tformat:%H%x00%s%x00%an%x00%aI HEAD --`.
  Four NUL-terminated fields form each record; bodies are excluded. Incomplete,
  malformed, duplicate or excessive records fail closed. The existing finite
  runner bounds stdout/stderr at 1 MiB; an oversized subject fails safely rather
  than producing an unbounded or truncated semantic result. History checks HEAD
  directly instead of enumerating unrelated branches.
- Commit/switch reuse the 5B mutation envelope: confirmed success retains
  `applied: true` even if post-operation status refresh fails or the project
  changes. A failed/interrupted switch is reauthorized/refreshed and reports
  `mutation-outcome-unknown`, with refresh required and no automatic retry:
  `post-checkout` can return nonzero after Git has actually switched. Interrupted
  commit also preserves unknown outcome. The successful envelope refreshes file
  status; callers obtain branch/history snapshots using their semantic APIs.
- Every operation retains active-project availability, canonical-root and exact
  Git top-level authorization. Parent-repository authority remains denied. Read
  operations accept internal runner options for future cancellation integration;
  full project/owner lifecycle coordination remains 5D. External Git activity is
  not transactionally locked by this package.
- Verification: focused 5C 34/34 (23 real Git repository cases); focused 5A/5B
  regression 176/176; final full suite 710/710 in 55 files with
  `--maxWorkers=4`, no local skips. Typecheck, lint, production/native build and
  `git diff --check` passed. Git version: 2.47.1.windows.2.
- Evidence includes staged-only/MM content preservation, first commit, identity
  and real hook failures, actual pending-merge rejection, all fixed operation
  markers, attached/detached/unborn snapshots, clean/dirty/ignored-file switch
  behavior, post-checkout failure after applied switch, project change after
  mutation, 101 real imported commits, Unicode subjects/bodies, oversized output,
  malformed DTOs and nested/stale-project rejection.
- Sandbox test/build spawning failed with EPERM; the identical commands ran via
  the approved outside-sandbox method. An initial full run concurrent with build
  had two 5C tests exceed the existing 5-second test timeout (706 others passed).
  After removing unnecessary branch enumeration from history and running the
  suite without the competing build, all 710 passed. No timeout inflation,
  sleeps, configured retries, assertion weakening or skips were added. The known
  jsdom canvas diagnostic remains non-blocking.

#### Phase 5C corrective verification — local branch `@` (2026-09-06)

The final review's MEDIUM finding reopened 5C from `COMPLETE` to `IN_PROGRESS`:
the shared validator rejected a valid local branch `@`, breaking the entire
snapshot and unrelated switches. The correction is now verified and 5C returns
to `COMPLETE`, within its existing backend scope.

- Shared validation accepts `@`; all other branch-name restrictions remain.
  Main still validates semantic membership in a fresh local branch snapshot.
- User-approved option 1 keeps the normal switch command unchanged. For `@`,
  Main constructs exact `refs/heads/@` and runs
  `git switch --detach --no-guess --no-overwrite-ignore -- refs/heads/@`.
  The native `post-checkout` hook runs normally and may observe DETACHED HEAD;
  this exception was explicitly authorized. Hooks are never suppressed.
- Main reauthorizes the exact project/root, proves detached HEAD and the local
  target ref still match the freshly captured commit, then runs
  `git symbolic-ref HEAD refs/heads/@`. It reauthorizes and proves attached HEAD
  and the target commit again before reporting success. Intermediate failures
  or an unproven final state trigger a recovery probe and safe nonretryable
  `mutation-outcome-unknown`; there is no rollback or automatic retry.
  Once success is proven, status-refresh failure retains the existing applied
  mutation envelope. No external-Git transaction lock or 5D system is added.
- Real Git regressions cover distinct main/@ commits, attached snapshots,
  unrelated normal switching, detached hook context, tracked/ignored blockers,
  harmless staged/unstaged/untracked/ignored preservation, failing hooks,
  HEAD lock failure, moved target ref, project transition and final-state change.
  Invalid names and unlisted full-ref-shaped requests remain rejected.
- Fresh verification: 44 focused 5C tests, including 32 real Git cases;
  176 focused 5A/5B regressions; 720/720 full-suite tests in 55 files with
  `--maxWorkers=4`; typecheck, lint and production/native build all passed.
  Git: 2.47.1.windows.2. Tests/build used the approved outside-sandbox path for
  the known spawning restriction. No timeouts, retries, skips or dependencies
  were added; package-lock is unchanged.

#### Phase 5C resumed verification (2026-09-07)

The user requested continuation of the previous corrective work. Review found
the documented local `@` correction already present in the uncommitted worktree;
no further production change was needed. Fresh verification passed 720/720 tests
in 55 files with the unchanged `npm test` command, typecheck, lint and
production/native build. The first suite run overlapping typecheck/lint had
three timeouts (5B, 5C and Monaco; 717 passed); a standalone full run passed
without changing assertions, timeouts, worker settings or skip/retry settings.
Tests/build required approved outside-sandbox execution after spawn EPERM.
The overview row now correctly lists 5D–5F as remaining. Phase 5C stays COMPLETE;
this continuation does not authorize 5D or change an ADR.

Only this backend package is complete. No dependency, package-lock or ADR change,
Source Control UI, remote Git, Phase 5D lifecycle system, repository stage,
commit or push was introduced. Phase 5 overall is not complete; 5D–5F require
their own authorization and acceptance.

#### Phase 5D resumed execution (2026-09-08)

Corrective reopening: the final read-only review found that `git:get-context`
unconditionally restored an owner lost during navigation. The user authorized
only this MEDIUM document-ownership remediation. Phase 5D was reopened to
`IN_PROGRESS`; it returned to `COMPLETE` after document-specific regressions and
the original verification matrix passed again, as recorded below.
No new public contract, decision, dependency or Phase 5E work is authorized.

Document ownership remediation verification (2026-09-08):

- Retained and verified the resumed implementation: Main observes WebContents
  before load, revokes ownership on navigation/crash/destruction, and restores
  only a committed current main document. Both context and semantic Git IPC
  check trusted sender-frame identity; requests cannot restore lost ownership.
- Six document regression cases cover pre-commit/context rejection, repeated
  navigation, stale caller/token rejection, invalid frames, pending read
  cancellation and dispatched mutation draining across replacement.
- Focused document/lifecycle IPC run: 16/16 tests. Full `npm test`: 766/766
  tests across 60 files, with no skips or configured retry/timeout changes.
- Electron 44.0.0 document smoke passed three same-WebContents reloads with
  four distinct committed frames and three rejected old-document semantic
  requests. New-document requests succeeded after each commit.
- Production/native `npm run build`, `npm run typecheck`, `npm run lint`,
  Git native smoke, Run native smoke (15 cycles, root-first descendant cleanup
  and failed spawn), and `git diff --check` passed. Sandbox spawn EPERM required
  approved outside-sandbox test/build execution; Electron smokes also ran with
  approval. The existing jsdom canvas diagnostic remains non-blocking.
- No additional production correction was needed on this continuation. No ADR,
  dependency, public DTO or architecture deviation; 5E/5F remain NOT_STARTED.

The user authorized continuation of the unfinished 5D work on `feature/phase-5`.
The existing uncommitted lifecycle, IPC identity, native Git runner, composition,
and regression fixtures were retained. Phase 4 and 5A–5C are complete; ADR-009,
ADR-016 and the existing Windows Job ownership primitives apply, with no open
Git strategy/dependency gate. The package moved to `IN_PROGRESS` on resumption
and to `COMPLETE` after the following exit evidence passed.

- Scope: project/owner generations, latest-read cancellation, stale receiving
  guards, serialized mutations, project transition draining, root unavailability,
  renderer reload/destruction, shutdown and retained process-tree cleanup.
- Main owns all command dispatch and Windows Jobs. Preload carries only validated
  request identity and transient transport bookkeeping; the semantic Git API
  remains unchanged. No renderer process, executable, cwd or argv authority.
- Mutation preparation can be cancelled. Once dispatched, a mutation drains with
  its bounded command timeout; applied results survive lost owners but lose stale
  snapshots. Unknown outcomes require refresh and are never automatically retried.
- Native `createGit` shares only private pipe/Job primitives with Run; Run's
  single-target `create` entry remains intact. No package or public executor added.
- Required exit evidence: deterministic lifecycle/IPC/race/security/cleanup tests,
  real Windows Git hooks and surviving descendants, abort/timeout cleanup,
  production Electron native smoke, Run native regression smoke, full `npm test`,
  typecheck, lint, build and `git diff --check`.
- 5E Source Control UI, 5F final Phase 5 review, settings, remote/hosted Git and
  credential storage remain outside this package.

Verification and exit result:

- Full `npm test`: 760/760 tests across 59 files, including 40 new 5D tests;
  no local skips. Native integration covers ordinary hooks, a detached hook
  descendant proven alive after Git root exit and dead after cleanup, abort,
  timeout, semantic index/commit and exact local `@` branch/history operations.
- Deterministic tests prove Main and receiving-side latest-result protection,
  identity rejection before dispatch, project close/switch draining, reload,
  unavailable root, lost owner and shutdown behavior. DesktopApplication stays
  `STOPPING` and retains dependencies when Git cleanup fails, then completes on
  successful explicit retry. Transport listeners are removed after settlement.
- `node_modules\\.bin\\electron.cmd scripts/smoke-git-native.mjs`: PASS with
  real Unicode/quoted/trailing-backslash commit/history, pipe EOFs and empty Job
  release. Existing `scripts/smoke-run-native.mjs`: PASS, 15 cycles plus
  root-first descendant cleanup and failed spawn.
- Windows NT 10.0.26200.0 x64, Git 2.47.1.windows.2, Electron 44.0.0.
  Typecheck, lint, final production/native build and `git diff --check` passed.
- Sandbox spawn EPERM required approved outside-sandbox test/build execution.
  Earlier full runs hit existing timeouts in Monaco/5C and an oversized new
  native scenario. The new scenario was split into independent hook,
  index/commit and branch/history cases; the final standalone suite passed
  without changing maxWorkers=4, timeout limits or configured retries. The
  existing jsdom canvas diagnostic remains non-blocking. Non-Windows CI skips
  the Windows-native cases explicitly and cannot claim native acceptance.
- No ADR/dependency change or architecture deviation. No Source Control UI or
  packaged/installed Windows acceptance is claimed; those remain 5E/7 scope.
  Phase 5D is complete; Phase 5 overall remains `IN_PROGRESS`.

#### Phase 5E execution and acceptance (2026-09-08)

Resumed corrective acceptance (2026-09-09):

- Retained the existing SearchPanel whitespace correction and four regression
  cases. Empty/whitespace-only input restores the Names tree, leaves Contents
  idle and issues no search; replacing an active query cancels it and rejects
  late results. Spaces in a non-empty literal query remain significant.
- Standalone default `npm test` passed 811/811 tests across 65 files in 62.88s,
  with four workers, no skips and unchanged timeout/assertion/retry settings.
  The earlier real Git timeouts did not reproduce; this is fresh acceptance
  evidence, not a claimed root-cause fix for timing sensitivity.
- Typecheck, lint, production/native build and `git diff --check` passed.
  Sandbox worker initialization/build spawn failures required approved external
  execution. The known jsdom canvas diagnostic remains non-blocking.
- Both Electron 5E smokes passed: real temporary-repository Git actions,
  project/draft lifecycle, sandbox and owned cleanup; Names/conflict fixture,
  280/220 px sidebar geometry and no horizontal overflow. Inspected all four
  regenerated screenshots under `out/phase-5e-ui/`.
- All 5E gates now pass and 5E returns to COMPLETE. No new dependency, ADR,
  architecture deviation or Git backend change. 5F remains NOT_STARTED and
  requires separate authorization; overall Phase 5 remains IN_PROGRESS.

The following entries describe the earlier correction and blocked verification.

Corrective reopening: the user identified sidebar visual-fidelity gaps against
Orca's actual implementation and explicitly authorized alignment. This correction
also has explicit approval for sharing the existing trusted Git snapshot with
Explorer, file-only decorations, hiding stale/untrusted data, no folder aggregation
or new requests, and conflict `!` with accessible "Conflicted — read-only" text.
Normal display priority is D > M > A/U > R > C. This does not reopen Git semantics
or authorize 5F. Completion below records the original 5E baseline; the correction
must pass regression and visual verification before returning to COMPLETE.

Corrective verification follow-up (2026-09-08):

- Completed the resumed compact activity tabs, project toolbar, Names/Contents
  strip, 24 px file rows, folder expansion icons and file-only Git decorations.
  Reference evidence is the locked Orca right-sidebar ActivityBarButton,
  FileExplorerToolbar/QueryStrip/ViewSwitch/Row and status-display patterns;
  implementation remains independent. No folder aggregation or new Git requests.
- Fixed explicit accessible file-row names, including `Conflicted — read-only`.
  Focused sidebar regression passed 85/85 tests. Snapshot invalidation, project
  replacement and conflict behavior passed without changing domain semantics.
- Typecheck, lint, final production/native build and diff whitespace checks passed.
  Real Windows Electron Git/UI smoke and Names/conflict fixture smoke passed.
  Inspected `explorer-aligned.png`, `explorer-narrow.png`, `full-shell.png` and
  `source-control.png` under `out/phase-5e-ui/`. The real smoke verifies 280/220 px
  layouts, keyboard resize, viewport/content containment, accessible labels,
  semantic Git actions, draft retention, sandbox and owned process cleanup.
  Geometry assertions account for the Windows DPI-scaled strip border.
- Full diagnostic `npm test -- --no-file-parallelism` passed 807/807 tests in
  65 files, with no skipped tests and unchanged assertions/timeouts. This is not
  a passing result for the default parallel `npm test` command: repeated default
  runs timed out in different real Git integration cases at 5 seconds. An initial
  Monaco import timeout did not recur. Sandbox spawn EPERM required approved
  external test/build execution; existing jsdom canvas noise remains non-blocking.
- 5E moves to BLOCKED solely on the unresolved default parallel test gate. UI
  correction is implemented and verified, but the full exit gate is not claimed.
  Test configuration, dependencies and ADRs are unchanged; 5F is not started or
  ready for execution. The completion narrative below is historical baseline.

The user authorized continuing 5E on `feature/phase-5`. Phase 4 and 5A–5D
prerequisites were COMPLETE. The resumed working tree already contained the
Source Control component, right-sidebar composition, Names/Contents search and
their tests; these changes were preserved. 5E moved through IN_PROGRESS before
verification. No Git strategy/dependency decision was open. Feature-local React
state follows ADR-011's existing default without selecting a shared-state library.

- Scope: right-sidebar Explorer/Source Control tabs and FR-027–FR-032 presentation
  over the existing finite Git API. Status separates staged/unstaged/untracked
  entries, shows conflicts read-only and reports truncation. Actions stage or
  unstage the selected file, commit already-staged changes, explicitly switch a
  selected local branch and display backend-bounded history.
- Draft text survives tab switches and Refresh; successful commit clears only
  unchanged submitted text. Failure/unknown outcome retains the draft; newer
  edits survive delayed success. Project replacement/close or renderer reload
  resets the project-session draft. Duplicate mutations are blocked.
- Applied-but-unrefreshed and unknown outcomes require explicit Refresh and
  never retry mutations automatically. Late reads cannot replace newer snapshots.
  Added regression coverage for initial transition-lock recovery and rejection of
  reads after root unavailability; unavailable/locked projects disable mutations.
  Missing, invalid, not-configured and non-repository states leave the editor
  available. Main/Preload retain project/document/process authority.
- Visual reference: locked Orca `4bb337741c335cfcc428d3b4271023566e2dadb8`,
  `src/renderer/src/app-shell/AppWorkspaceShell.tsx` evidence in
  `docs/ORCA-ANALYSIS.md`, and `docs/STYLEGUIDE.md`. The independent UI retains
  the existing compact dark shell, semantic tokens and sidebar proportions;
  Source Control uses the existing thin dark scrollbar language. No source copied.
- Verification: `npm test` passed 802/802 tests across 64 files, with no skips;
  typecheck, lint, final production/native build and `git diff --check` passed.
  Initial sandbox worker/build spawn EPERM required approved external execution.
  One first full run timed out loading Monaco; the unchanged test timeout and
  worker settings passed the complete rerun. Existing jsdom canvas noise remains.
- `scripts/smoke-git-ui.mjs` passed against a temporary Windows Git repository
  using built App, production sandboxed Preload, validated Main IPC, document
  ownership, GitService and native Job runner: status, stage/unstage, staged-only
  commit, branch switch, history, draft retention, non-repository, project switch/
  close and no pending runner cleanup. The project repository was not committed.
- `scripts/smoke-phase-5e-ui.mjs` passed production-component/CSS fixture checks
  for Names results, read-only conflict actions and no horizontal sidebar overflow.
  Captured images under `out/phase-5e-ui/` were visually inspected. This fixture
  smoke is distinct from the real Git/UI integration evidence above.
- No ADR change, dependency, architecture deviation, hosted/remote Git, Settings,
  repository commit/push or Phase 5F implementation. No remaining 5E blocker;
  5F is ready for separate authorization. Overall Phase 5 remains IN_PROGRESS;
  full final stabilization and packaged Windows acceptance remain 5F/7.

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
- Phase 5A uses PATH-first detection: `AVAILABLE` and `MISSING` are emitted now;
  `NOT_CONFIGURED` and configured-path `INVALID_CONFIGURATION` remain reserved.
  Repository authorization requires canonical project root equality with Git's
  canonical top-level, and an ordinary non-Git folder is `NOT_REPOSITORY`.

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

## 11.5 Phase 5.5 — C# Language Intelligence

Phase 5.5 is a newly authorized V1 scope extension after Phase 3 completed C#
syntax-only support. It does not rewrite Phase 3 history. It adds C# completion,
hover, signature help, go to definition, open-document pull diagnostics, and
Problems integration. C# Run and the deferred capabilities listed below are not
part of this phase.

### Phase status

- Phase 5.5A — Documentation & Design Baseline: `COMPLETE`.
- Phase 5.5B — Compatibility Spike: `COMPLETE`; **HARD GATE PASSED**.
- Phase 5.5C — Contracts + Dependency Foundation: `COMPLETE`.
- Phase 5.5D — Main LSP Core + C# Adapter: `COMPLETE`.
- Phase 5.5E — Workspace + Document Synchronization: `COMPLETE`.
- Phase 5.5F — IPC + Preload + Monaco Semantic Providers: `COMPLETE`.
- Phase 5.5G — Diagnostics + Problems + Status UX: `COMPLETE`.
- Phase 5.5H — Stabilization + Final Verification: `COMPLETE`.

Phase 5.5 overall is `COMPLETE`. The 5.5B hard gate passed with the pinned
provider/transport stack and structured preflight. The F/G corrective URI and
development-launch work passed automated verification and user-confirmed manual
reacceptance. Phase 5.5H final verification is complete. Dated investigation
entries below retain their historical status; this summary and the final 5.5H
acceptance record supersede earlier pending/reopened statements.

### Goal and capability scope

- Preserve C# syntax through Monaco tokenization.
- Add completion, hover, signature help, definition, diagnostics, and Problems
  through Main-owned `csharp-ls` and a thin semantic LSP↔Monaco adapter.
- Keep Runtime, C# language-service dependency, language-service lifecycle, and
  Run as independent states/domains.
- Keep editor/view/save available for missing dependencies, startup/loading
  delay, `CRASHED`, unsupported workspace, and all provider failures.

### Explicitly deferred

- References, rename, code actions/quick fix, refactoring, formatter, advanced
  semantic tokens, Razor, and metadata/BCL/generated virtual-document navigation.
- Debugger, C# Run, workspace diagnostics, and loose `.cs` full intelligence.
- Public start/stop/restart, automatic restart loop, raw provider logs, configured
  SDK/provider paths, and temporary solution creation.
- Packaged/installed `csharp-ls` acceptance, retained by Phase 7.

### Dependencies and accepted decisions

- Completed Phase 2 project/filesystem/editor/lifecycle/security foundations,
  completed Phase 3 Monaco/Problems foundation, and completed Phase 5 roadmap
  prerequisite.
- ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-008, ADR-012, ADR-013,
  ADR-015 historical scope, ADR-016, ADR-021, and ADR-022.
- .NET SDK 10 or newer is required to run current `csharp-ls`; .NET 10 LTS is
  the Windows V1 acceptance baseline. Main detection uses process PATH plus
  `dotnet --list-sdks`.
- Phase 5.5B selected `csharp-ls` 0.27.0,
  `vscode-languageserver-protocol` 3.18.3, and `vscode-jsonrpc/node` 9.0.2.

### Architecture and security constraints

- Main owns LanguageServiceManager, process/protocol lifecycle, real paths,
  workspace selection, cancellation, diagnostic result IDs, completion-resolve
  handles, and bounded descendant cleanup.
- Renderer owns Monaco providers, UI state, dirty models, marker projection, and
  Problems presentation. FileSystemService remains the only disk authority.
- Public language IPC uses `projectId` and project-relative paths only. Main
  derives owner identity from the trusted Electron sender/document and validates
  payload, project, path, session, document, and action before dispatch.
- Renderer receives no raw LSP/JSON-RPC, PID, executable path, cwd, spawn args,
  canonical project root, raw log stream, or generic process capability.
- Completion resolve uses opaque Main-owned handles. Definition results accept
  only `file:` URIs contained by the canonical active project root. External and
  metadata targets are unsupported.
- Preserve `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

### Workspace and document policy

- `.sln` and `.slnx` are both supported solution candidates.
- Reuse a saved valid selection; auto-select exactly one candidate; require user
  selection and remember it per project when multiple candidates exist.
- With no solution and one or more `.csproj` files, use project mode. Main may do
  bounded discovery for preflight/UX, while current `csharp-ls` owns recursive
  project discovery/loading. Do not claim Main controls the exact loaded set.
- With no solution or project, remain syntax-only. Never create a temporary
  solution.
- Track workspace readiness separately as `READY`, `SELECTION_REQUIRED`,
  `NO_CSHARP_WORKSPACE`, or `PREFLIGHT_FAILED`. Before provider startup, Main
  performs the structured SDK/solution/project-evaluation/reference preflight
  recorded in ADR-022. It requests no target, build, or restore and must not
  intentionally mutate the workspace. V1 evaluates user-trusted projects only;
  MSBuild evaluation is not a sandbox (ADR-022, 2026-09-11).
  `READY` is bounded preflight success, not proof of an
  equivalent provider-internal Roslyn workspace.
- Start lazily with one C# session for the active project. Perform `initialize`
  then `initialized`; negotiate/use UTF-16.
- `RUNNING` means process plus LSP initialization only. Never infer workspace
  failure from empty completion/definition, null hover, no diagnostics, or
  human-readable provider logs.
- Monaco dirty content is authoritative. Send `didOpen`, ordered incremental
  `didChange`, `didSave`, and `didClose`; use Monaco model version as document
  version. Batching may preserve order but must never drop changes. Flush pending
  changes before semantic requests.
- Reuse FileSystemService watcher events. Open/dirty sync wins over disk watcher
  content. Reject stale project/session/document/model-version results.
- Pull diagnostics cover open documents; workspace diagnostics are deferred.
- Graceful shutdown orders invalidate/cancel → `shutdown` → response → `exit` →
  bounded cleanup. Unexpected exit becomes `CRASHED`; no V1 restart loop.

### 5.5A — Documentation & Design Baseline

#### Scope

- Update the authoritative documents and repository instructions so the newly
  authorized C# scope, history, ownership, security, workspace, lifecycle,
  synchronization, dependency, phase sequence, and hard gate agree.
- Add only planned module locations to `CODEBASE-MAP.md`.
- Do not create the compatibility spike, production source, tests, dependencies,
  package changes, or changelog implementation claims.

#### Exit gate

- All authoritative documents are mutually consistent and preserve Phase 3
  syntax-only history.
- Phase 5.5B is visibly a hard gate for every 5.5C+ package.
- Searches find no stale claim that C# is permanently syntax-only or that all
  external language servers remain unspecified future scope.
- Searches find no accidental inclusion of C# Run, Razor, metadata navigation,
  formatter, rename, references, code actions, refactoring, advanced semantic
  tokens, loose-file full intelligence, or workspace diagnostics.
- Git diff contains documentation/agent-instruction files only; package files,
  production source, tests, and `CHANGELOG-THESIS.md` are unchanged.
- `git diff --check` passes.

#### 5.5A acceptance record (2026-09-09)

The authority consistency review passed across `REQUIREMENT.md`,
`ARCHITECTURE.md`, `DECISIONS.md`, `CODEBASE-MAP.md`, `LANGUAGE-SUPPORT.md`, and
this plan. Stale-claim searches left only explicitly historical Phase 3 evidence,
the current pre-5.5B source state, and the approved syntax-only fallback when no
solution/project exists. Deferred-capability review found no claim that C# Run,
Razor, metadata navigation, formatter, references, rename, code actions,
refactoring, advanced semantic tokens, workspace diagnostics, or loose-file full
intelligence is included. The final changed-file scope contains only the six
authoritative documents and `AGENTS.md`; package files, production source, tests,
and `CHANGELOG-THESIS.md` are unchanged. `git diff --check` passed. Phase 5.5A is
`COMPLETE`; at that acceptance point Phase 5.5 remained `IN_PROGRESS` and 5.5B
was the next hard gate. The current post-spike status is recorded below.

### 5.5B — Compatibility Spike — HARD GATE

#### Goal

Produce reproducible Windows evidence for the actual server, protocol libraries,
workspace behavior, synchronization, process lifecycle, and current build stack
before selecting exact versions or writing production 5.5C+ code.

#### Required evidence

- Dependency/version probe for .NET SDK 10+ and candidate `csharp-ls` versions.
- Real stdio JSON-RPC/LSP `initialize` → `initialized` → `shutdown` → `exit`.
- Advertised capability capture and comparison with required V1 capabilities.
- Dirty-buffer `didOpen`/incremental `didChange`/`didSave`/`didClose`, ordered
  flush, document versions, UTF-16, and representative Unicode behavior.
- Completion, completion resolve, request cancellation, hover, signature help,
  definition, and open-document pull diagnostics.
- `.sln`, `.slnx`, project mode, and no-solution recursive discovery behavior
  and representative performance. Record that `csharp-ls`, not Main, owns the
  actual recursive loaded-project set in project mode.
- Windows paths containing spaces, `#`, and Unicode.
- Dynamic watched-file registration and integration implications for the existing
  FileSystemService watcher.
- Workspace-load failure detection through machine-meaningful protocol/process
  state without parsing human log strings.
- Unexpected crash, graceful shutdown ordering, bounded descendant cleanup, and
  no orphaned owned process.
- Compatibility with electron-vite, TypeScript typecheck, and production build.

#### Gate result

A PASS records exact pinned versions and the evidence above in ADR-022 and the
plan before 5.5C begins. A failure sets Phase 5.5B and Phase 5.5 to `BLOCKED` and
requires a user decision; it does not silently substitute a provider, transport,
or architecture. This spike is not packaged/installed acceptance.

#### 2026-09-10 gate result — COMPLETE

The Windows spike exercised `csharp-ls` 0.27.0 with .NET SDK 10.0.401/runtime
10.0.12, `vscode-languageserver-protocol` 3.18.3, `vscode-jsonrpc` 9.0.2,
Electron 44.0.0, electron-vite 5.0.0, Vite 7.3.6, and TypeScript 6.0.3. Semantic
capabilities, dirty incremental sync, UTF-16/Unicode, `.sln`, `.slnx`, recursive
project mode, watched-file registration, lifecycle cleanup, Electron imports,
typecheck, and production bundling passed.

The hard gate failed because a malformed project resolved initialization,
registered normal capabilities, kept the process alive, resolved a semantic
request with an empty result, and ended work-done progress normally. No JSON-RPC
error, nonzero exit, or structured protocol failure identified the load failure;
only human log/progress strings did. The authorized corrective spike retained
`csharp-ls` and verified a structured Main-owned preflight across valid/broken
`.sln`, `.slnx`, and `.csproj`; reference, SDK, targeting, and multi-project
cases. It uses exit codes, evaluation JSON, and Main path checks without parsing
provider log text, running MSBuild targets/build/restore, generating solutions,
or changing workspace files.

The preflight deliberately does not certify provider-internal Roslyn health:
an unavailable targeting pack passed evaluation, and the provider may still fail
after preflight. `READY` and `RUNNING` therefore have bounded meanings recorded
in ADR-022. Valid and broken workspaces both produced legitimate empty/null
semantic results, proving those cannot be health signals. This residual risk is
accepted for V1 without a false public claim. Exact versions are selected and
5.5B is `COMPLETE`; Phase 5.5C subsequently completed under separate
authorization. Phase 5.5D later began under separate authorization; 5.5E–5.5H
remain `NOT_STARTED`.
See `spikes/csharp-lsp-compatibility/REPORT.md`.

Final verification passed 12/12 structured preflight cases, the full provider
harness, spike TypeScript/Electron/electron-vite gates, root typecheck, lint,
production/native build, 811/811 tests on the unchanged rerun, and
`git diff --check`.

### 5.5C — Contracts + Dependency Foundation

- Define side-effect-free semantic C# request/result/event contracts and exact
  runtime validators, including opaque resolve handles and normalized diagnostics.
- Implement Main PATH plus `dotnet --list-sdks` detection and selected provider
  resolution according to versions proven by 5.5B.
- Keep dependency state separate from service lifecycle: dependency
  `MISSING`/`INVALID_CONFIGURATION`; service
  `STOPPED`/`STARTING`/`RUNNING`/`CRASHED`; reserve `NOT_CONFIGURED` for future
  configured paths.
- Add focused contract, validation, dependency, Windows path, and redaction tests.

#### 2026-09-10 implementation record — COMPLETE

- Added side-effect-free shared provider/capability, dependency, service,
  workspace, project-relative document, position/range/version/request,
  completion/hover/signature/definition/diagnostic, and opaque completion-handle
  contracts with exact runtime validators for Renderer-originated shapes and
  safe status serialization. C# syntax remains Monaco-owned; the five semantic
  capabilities map to `csharp-ls`.
- Added Main-only Windows executable validation, a finite bounded probe,
  PATH-only `dotnet.exe` resolution, strict `dotnet --list-sdks` inventory
  parsing, SDK 10+ classification, and prerelease-only warning metadata.
- Added development private-first then PATH `csharp-ls` resolution and packaged
  app-owned-only resolution. A trusted Main caller supplies the private/app-owned
  executable candidate; no unproven packaged payload directory was invented.
  The real 5.5B provider output was probed and exact version 0.27.0 is enforced.
- Added exact runtime dependencies `vscode-languageserver-protocol` 3.18.3 and
  `vscode-jsonrpc` 9.0.2. Focused tests cover validation limits/redaction, PATH
  safety, SDK inventory states, probe failures, provider priority, packaged PATH
  exclusion, version mismatch, corrupt output, and missing providers.
- Verified focused tests 19/19, the full `npm test` command, typecheck, lint,
  production/native build, and `git diff --check`. The existing jsdom canvas
  diagnostic remained non-blocking. No timeout, retry, worker, or assertion was
  weakened. No workspace preflight execution, language session/LSP connection,
  provider spawn lifecycle, document sync, IPC/Preload, Monaco semantic provider,
  diagnostics integration, Problems/UI, or Phase 5.5D+ work was added.

### 5.5D — Main LSP Core + C# Adapter

Authorized on 2026-09-10, including the dedicated C# native pipe entry point,
atomic Windows Job ownership and hard-kill-root descendant verification recorded
in ADR-022. Phase 5.5E+ remains `NOT_STARTED`.

- Implement Main-owned JSON-RPC/LSP transport, initialize/capability negotiation,
  request cancellation, semantic capability mapping, opaque completion resolve,
  protocol/error normalization, crash state, and graceful bounded cleanup.
- Keep stderr/logging separate from diagnostics and Main-only.
- Verify malformed payload isolation, capability absence, cancellation races,
  unexpected exit, cleanup failure retention, and no generic process API.

#### 2026-09-10 implementation and verification evidence

- Added Main-only LspConnection, CSharpLsAdapter, LanguageServiceManager,
  safe language errors and a resolver-backed native C# process factory.
  The built language-runtime entry is an internal verification/composition
  seam; application, workspace and language IPC wiring are not introduced.
- The adapter captures initialize capabilities, enforces UTF-16 and required
  V1 support, maps completion/resolve/hover/signature/definition/pull diagnostics,
  and retains resolve data/result IDs in Main. Notification primitives have no
  production document queue, watcher hookup, or Monaco ownership.
- Dedicated native C# entry points reuse atomic Job creation/finalization and
  provide asynchronous stdin writes. Existing Run/Git entry behavior and
  ProcessManager implementation are unchanged.
- Deterministic fake-server coverage: 33/33 tests passed, including protocol
  order, server requests, allowlisted/rejected registrations, malformed data,
  correlation, errors, cancellation/late response/deadlines, stale generations,
  startup/crash/shutdown and retained cleanup failures.
- Production Electron native smoke passed on Windows x64: hard-killed root
  PID 27124 left descendant 19404 alive in the Job; premature release failed;
  termination emptied the Job and removed that descendant while an unrelated
  control survived. A blocked 8-MiB stdin write settled on Job termination
  before release. Repeated release was safe.
- Real csharp-ls 0.27.0 initialized with the minimal production client
  capabilities using .NET SDK 10.0.401. Completion, resolve, hover, signature,
  definition, pull diagnostics and incremental sync were all observed.
  Graceful shutdown reached STOPPED and released all registered ownership.
  RUNNING still makes no Roslyn workspace-health guarantee.
- Typecheck, lint, production/native build and git diff --check passed.
  Phase 5.5D was initially BLOCKED because the final full npm test run
  passed 862/863 with one 5000-ms timeout in
  tests/main/git-local.integration.test.ts:91, "snapshots @ and switches exact @
  with a detached native hook, preserving harmless local data".
  That test uses the unchanged GitCommandRunner, not the C# native entry point,
  and passed in the focused diagnostic run. Its full-suite timing was unresolved
  at that point; a focused pass did not replace the required full-suite gate.
  No LSP architecture decision remains open. Do not start 5.5E.
  The initial concurrent build/test run encountered old TEMP casing assertions
  and timeouts. TEMP/TMP were scoped to canonical C:\Windows\Temp for subsequent
  test processes; no assertions, workers, timeouts, retries or production
  filesystem behavior were changed. A subsequent suite reached 861/863 with
  two existing Git timeouts; both passed in a focused diagnostic run.
- Corrective investigation then reproduced the timeout without the new language
  tests: the Phase 5C case took 4044 ms alone but timed out at 5024 ms when the
  real Git suites ran together. Language + Git passed at 3881 ms, process/native
  + Git passed at 3490 ms, and no Git, csharp-ls or Electron child survived.
  Repeated repository setup subprocesses contending across four workers caused
  the failure; no Phase 5.5D resource or native Job leak was found.
- The three real-Git harnesses now prepare one baseline repository per suite and
  copy it into an isolated temporary directory for each test. Production Git
  behavior and assertions are unchanged; no timeout, worker, retry, sleep or skip
  policy changed. The formerly failing case took 2575 ms focused; the exact Git
  reproduction passed 266/266 at 4176 ms; the affected harnesses passed 55/55.
- Two consecutive canonical-TEMP full npm test runs passed 863/863 in 51.31 s
  and 48.96 s. Typecheck, lint, production/native build, whitespace checks and
  final process inspection passed. Phase 5.5D is COMPLETE. Do not start 5.5E
  without separate authorization.

### 5.5E — Workspace + Document Synchronization

Status: `COMPLETE` — authorized after committed 5.5D and the 2026-09-11
trusted-workspace clarification. No sandbox, trust UX, or 5.5F+ work is included.

- Implement saved `.sln`/`.slnx` choice, single-candidate selection,
  multi-candidate decision persistence, project mode, and syntax-only fallback.
- Implement lazy one-active-project session and ordered incremental document sync
  with flush-before-request and stale result rejection.
- Reuse FileSystemService watcher events with dirty/open precedence and dynamic
  watched-file registrations proven by 5.5B.
- Verify project switch/close, root unavailability, rename/delete, renderer loss,
  dirty buffers, batching, Unicode/version order, and cleanup.

#### 2026-09-11 resumed implementation and verification evidence

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

### 5.5F — IPC + Preload + Monaco Semantic Providers

Status: `COMPLETE` — corrective runtime verification and user-confirmed manual acceptance PASS on 2026-09-13. Canonical URI casing and the accepted semantic contract remain preserved.

- Add exact-validated semantic IPC and narrow Preload bridge using project IDs,
  relative paths, trusted sender/document ownership, and cancellation.
- Register separate Monaco completion, hover, signature help, and definition
  providers for C#. Convert UTF-16 LSP ranges and enums explicitly rather than
  casting protocol objects to Monaco types.
- Reject definition targets outside the active project and stale responses after
  edits, project/session replacement, owner loss, or provider disposal.

#### 2026-09-11 implementation and verification evidence

- Added exact-validated language IPC and a narrow Preload bridge for workspace
  state/selection, document open/change/save/close, completion/resolve, hover,
  signature help, definition, cancellation and scoped status events. Main derives
  owner identity from the committed Electron main frame and rechecks project,
  root, session, document and Monaco version across asynchronous continuations.
- Added Main semantic routing and explicit LSP-to-public mapping. Completion data
  remains behind bounded opaque handles; snippets and malformed provider data are
  rejected; presentation text is bounded and untrusted; definition returns only
  existing file targets canonically contained by the active project.
- Added the renderer-session C# client and four capability-specific Monaco
  providers. Dirty in-memory text and ordered incremental UTF-16 versions are
  synchronized before semantic work. Provider registrations follow effective
  server capabilities and negotiated trigger characters; project replacement,
  edits, cancellation, owner loss and disposal reject late results.
- Added request/result bounds and exact response validation without exposing raw
  LSP/JSON-RPC, process details, canonical roots, executable data or a generic
  execution/restart surface. C# syntax and editor/save remain available when the
  semantic service is unavailable.
- The combined focused 5.5E–F regression set passed 150/150. The full suite passed
  947/947 tests in 72 files; the existing jsdom canvas warning remained
  non-blocking. Typecheck, lint, production/native build and `git diff --check`
  passed without changing workers, timeouts, retries or assertions.
- No dependency or ADR was added or changed. Diagnostics/Problems/status UX,
  C# Run, manual restart, raw logs, Razor, metadata navigation and all other
  deferred capabilities remain absent. Phase 5.5G requires separate authorization.

### 5.5G — Diagnostics + Problems + Status UX

Status: `COMPLETE` — corrective diagnostics/Problems verification and user-confirmed manual acceptance PASS on 2026-09-13. Earlier investigation entries below are historical.

#### 2026-09-12 net10.0 runtime-identity investigation

- Acceptance remains unaccepted: G is `IN_PROGRESS`; H is `NOT_STARTED`.
  This investigation did not reproduce the reported missing diagnostics and
  does not claim a production fix or identify the user's failing boundary.
- Baseline: branch `feature/phase-5.5-csharp-language-intelligence`, HEAD
  `abfe1f5b1f0bd859746dd038a13d0e94ed4bb7d1`, with existing uncommitted F/G work
  preserved. No Electron or csharp-ls process was running at initial inspection.
- A direct launch lacked csharp-ls on PATH. The controlled launch used the
  existing private SDK/provider from `spikes/csharp-lsp-compatibility`, following
  a successful `npm run build`. This PATH difference is not an explanation for
  the user's completion-working reproduction; their original launch command
  and environment have not yet been confirmed.
- Actual entry: `node_modules/electron/dist/electron.exe . --inspect-brk=9230
  --remote-debugging-port=9231`, cwd `D:/coding-ide`; normal application entry,
  user-data and restored real `D:/Frontend-API/fe/TestCSharp` net10.0 project.
  No alternate acceptance renderer, fixture, mocked IPC or modified project was
  used. One Main process/window, its Chromium children and one owned csharp-ls
  process were verified.
- Debugger script-source SHA-256 values matched disk for Main index, language
  runtime, isolated Preload and Renderer. All four also matched the initial
  pre-rebuild runtime: no stale-bundle mismatch was found. The actual renderer
  loaded `out/renderer/assets/index-BXfqPpqq.js`. Runtime security settings were
  contextIsolation=true, nodeIntegration=false and sandbox=true.
- Non-pausing debugger logpoints recorded safe identity/version/generation,
  sync, flush, pull, wire count/codes, normalization, Preload validation,
  Renderer stale acceptance, Problems replacement and marker publication.
  At model version 115, client generation 1, project generation 1, provider
  generation 5, Main session epoch 5 and adapter generation 7, `Program.cs`
  reached didChange/flush/pull with version 115 throughout. csharp-ls returned
  full `[CS0029]`; Preload accepted it; current Renderer identity accepted it;
  Problems and Monaco each received CS0029.
- Visible real-app input/inspection passed CS0029, CS0103 and CS1733/CS1002.
  Corrected calls and syntax produced full empty results and cleared both
  consumers. Exact `int b = 123;` removed CS0029 but correctly retained compiler
  warning CS0219 for unused b; this is not an all-diagnostics-empty result.
  C# completion popup also worked in the same session. Input used the real
  Electron renderer; screenshots used its CDP capture because native capture
  incorrectly returned the VS Code window. These are agent-operated real-app
  observations, not a claim that the user's failing launch now passes.
- Evidence: `out/runtime-diagnostics/` contains loaded-script identities,
  process identity, per-case end-to-end traces and screenshots. Project source
  was edited only in the unsaved editor buffer; no test save/restore/build or
  project-file rewrite was performed. The editor buffer was restored afterward.
- Automated checks on the existing source passed: focused 167/167, full suite
  1006/1006 in 74 files, typecheck, lint and production/native build. No timeout,
  retry, architecture, public contract or production source change was made.
  The missing evidence remains a failing run under the user's actual launch
  command/environment; the net9 targeting-pack hypothesis is not reused.

#### 2026-09-12 net9.0 targeting-pack verification

- The user's real net9.0 project is the reproduction baseline. Investigation
  used copies only; no original project, installed SDK or production IDE source
  was changed.
- Private SDK 10.0.401 resolves net9.0 to Microsoft.NETCore.App.Ref 9.0.20.
  That version is absent from its packs root and the user's default NuGet cache.
  The machine has system pack 9.0.16, but that is neither the requested version
  nor in the private SDK's default packs root. MSBuild ProcessFrameworkReferences
  returned no resolved Path for the requested net9 pack.
- The same probe for net10.0 resolved the installed private pack 10.0.12,
  including System.Runtime.dll.
- Causal control: a net9.0 copy explicitly selected the existing system pack
  root and targeting-pack version 9.0.16, solely for this experiment. The
  production csharp-ls/IDE pipeline then returned CS0029, CS1733/CS1002 and
  CS0103 for the three cases, published markers/Problems before and after save,
  and cleared corrected diagnostics. CS0518/CS1729 disappeared. This confirms
  unresolved reference assemblies explain those compiler errors; it is not
  evidence that IDE normalization/scheduling dropped the correct diagnostics.
- A second copy retargeted to net10.0, with an offline local-only restore,
  passed the same five automated cases using its default pack resolution.
- No dependency was downloaded or installed. Fixture pack/version overrides
  are experimental controls, not a shipped workaround or a change to the
  user's target framework. Do not hide SDK errors or infer readiness from
  provider logs/diagnostic codes. Production contract, scheduler, lifecycle,
  timeouts, workers and retry policy remain unchanged.
- Evidence and reproduction scripts are retained under
  `out/target-pack-comparison/`. G remains IN_PROGRESS and manual acceptance
  is not COMPLETE; H remains NOT_STARTED. This resolves the CS0518/CS1729
  environment hypothesis, not the outstanding complete manual acceptance gate.

#### 2026-09-12 diagnostics investigation after repeated manual FAIL

- Manual acceptance remains FAIL / unaccepted. G remains IN_PROGRESS; H remains
  NOT_STARTED. No new production fix or architecture/product decision is claimed.
- Added build-time development tracing in `scripts/csharp-diagnostics-trace.mjs`
  and extended `scripts/smoke-csharp-acceptance.mjs`. It observes document events,
  scheduling, client synchronization, Main versions/flush, adapter and wire
  responses, normalization, IPC/Preload validation, controller stale checks,
  marker ownership, Problems replacement and cleanup. Provider result IDs/logs
  remain Main-only test evidence; no public contract or production logging changed.
- Fresh net10.0 console fixture: CS0029, CS1733/CS1002 and CS0103 reached
  `student-ide.language.csharp-ls` markers and Problems provider `csharp-ls`,
  before and after actual save notifications. Renderer/Main/sync versions matched.
  Correcting to `int b = 123;` removes CS0029 but legitimately produces CS0219
  when b is unused. Using b afterward produces a full empty report and clears
  both consumers, still empty after settling. The harness now waits for a full
  current-version DTO before accepting clear, avoiding a transient edit-clear pass.
- Recent-project metadata identified `D:/Frontend-API/fe/TestCSharp`, targeting
  net9.0 with the reported invalid assignment. Its source was read and copied to
  an isolated fixture; original project files were not changed.
- The net9.0 copy did NOT reproduce an entirely empty UI. Its version-2 pull
  reached csharp-ls and returned full [CS0518, CS0518, CS0518, CS1729], not CS0029.
  Main normalized all four; Preload accepted them; controller accepted the
  current response; Monaco and Problems received all four. Thus the first
  divergence from the expected CS0029 is the provider response, not dropped
  data in the scheduler/Main/Renderer. The private SDK has only net10 reference
  assemblies, while system net9 packs are outside that private root. This is
  evidence of a reference-resolution problem in this test environment, not
  proof of the user's original empty-UI root cause. READY/RUNNING semantics
  were not changed or inferred from these diagnostics/logs.
- A visible fixture captured a directly edited invalid assignment with a red
  underline and a matching ProblemsStore entry. The correction step did not
  complete. Native Computer Use capture/focus failures prevent claiming the
  requested complete manual acceptance sequence.
- Added a regression proving edit/save pulls wait for both synchronization
  promises and publish only the current model version. Focused diagnostics:
  164/164 passed. Full suite initially had one unrelated Git timeout (1005 pass,
  1 fail); that test passed separately and the unchanged full suite rerun passed
  1006/1006 in 74 files. Typecheck, lint and production/native build passed.
  No timeout, worker, retry, lifecycle, scheduling or public API policy changed.
- Remaining evidence needed: reproduce the original completely empty marker/
  Problems behavior using the user's actual launch environment and complete
  the error-to-correction manual sequence. Do not treat this investigation as
  a resolved production defect or authorize 5.5H.

#### 2026-09-12 corrective runtime evidence (acceptance still pending)

- A fresh `dotnet new console -n TestCSharp` fixture with the pinned private
  SDK/provider reproduced hover `null` and diagnostics `full: []` for 12 pulls
  through the production adapter when the canonical URI was lowercased.
  Preserving URI casing, with identical buffer and capabilities, returned
  Console documentation, CS0029, and 50 completion items on the first attempt.
- Main document synchronization now preserves canonical URI casing on the wire;
  Windows ownership comparison decodes the URI before case folding. Watched-file
  notifications also preserve canonical casing. No public contract, scheduling,
  lifecycle policy, security boundary, dependency or ADR was changed.
- Focused regression passed 160/160; full suite passed 1005/1005 in 74 files.
  Typecheck and lint passed. Added coverage verifies open/change/save/close and
  semantic URI consistency, Unicode Windows aliases, duplicate rejection and
  ownership release. Existing stale/cancelled and diagnostics tests also pass.
- Electron was launched, but UI automation repeatedly reported user input between
  observation and action, preventing reliable fixture selection. Completion,
  hover, signature help, marker/Problems publication and clearing have NOT been
  accepted in the real app. Adapter evidence is not a substitute for those cases.
- F/G remain IN_PROGRESS until those runtime cases and the complete requested
  end-to-end trace are verified. H remains NOT_STARTED.

#### 2026-09-12 resumed end-to-end verification

- `scripts/smoke-csharp-acceptance.mjs` creates a fresh `dotnet new console -n
  TestCSharp` fixture and runs the actual application Main, secure Preload,
  Renderer, Monaco providers and pinned csharp-ls. Test-only source transforms
  under `out/` observe adapter/service/flush results and Renderer provider
  replies; no debug IPC or production tracing is introduced. A hidden window
  isolates the test fixture from unrelated desktop input.
- All five automated real-app cases passed: completion popup with WriteLine,
  Console hover documentation, signature popup when typing `(` through Monaco
  (including its normal automatic closing parenthesis), CS0029 marker plus
  Problems entry, and clearing both after correcting the assignment.
- Effective hover/diagnostic capabilities are enabled. Each observed semantic
  provider has one registration. The trace shows synchronized requests reaching
  the adapter, nonempty hover reaching a valid untrusted Monaco Hover, and full
  diagnostic reports reaching the current model version and Problems provider
  `csharp-ls`. Marker owner is `student-ide.language.csharp-ls`; the corrected
  buffer receives full empty diagnostics and remains clear after settling.
- The shared failure point was lowercasing the canonical document URI before
  didOpen and semantic/pull requests. Roslyn returned null hover/empty diagnostics
  for that differently cased identity. Preserve wire casing while case-folding
  only decoded Windows ownership keys. No additional production fix, contract,
  scheduling policy, lifecycle, dependency or ADR was needed on resumption.
- Focused tests: 170/170; full suite: 1005/1005 in 74 files. Typecheck, lint,
  production/native build and diff-check passed. Existing unit coverage also
  exercises full/unchanged results, stale/cancelled generations, disposal and
  Windows URI alias rejection.
- Final trace and screenshots are retained locally under
  `out/csharp-acceptance-evidence/`. Intermediate runs emitted an intermittent
  generic synchronization/cleanup warning; the final run's Main report trace
  was empty. Its cause was not established, so this is not a claim that the
  broader lifecycle acceptance gate has passed.
- This is automated real-app acceptance, not a claim of manual pointer/keyboard
  acceptance. Windows Computer Use failed with an unavailable native pipe;
  human/manual acceptance remains outstanding. F/G stay IN_PROGRESS, H stays
  NOT_STARTED, and no next package is authorized by these results.
- Pull diagnostics for open documents, retain result IDs only in Main, normalize
  results, and publish version/generation-safe Monaco markers to the existing
  Problems store and navigation flow.
- Present dependency and service states separately, including syntax-only
  fallback, workspace selection, loading/failure, and `CRASHED`, without a public
  restart or raw-log API.
- Verify update/clear/dispose/navigation, dirty-model preservation, severity/code/
  source mapping, unsupported targets, and failure isolation from other languages.
- Main now serializes per-document pulls after pending synchronization, retains
  provider result IDs privately, bounds and sanitizes diagnostic DTOs, and rejects
  cancelled or stale owner/project/session/document/version results. The adapter
  sends the provider identifier verified by 5.5B and propagates provider refresh
  requests without exposing raw LSP state.
- Renderer publishes a dedicated C# marker owner into the existing Problems
  store, clears only C# state on edit/close/switch/crash/disposal, preserves dirty
  editor models during navigation, and performs bounded settling pulls when the
  provider temporarily returns `unchanged` after an edit. Existing JS/TS/CSS/JSON
  diagnostic owners remain isolated.
- Status-bar UX presents dependency, workspace and service lifecycle separately,
  supports bounded solution selection/loading/failure feedback, and retains
  syntax/edit availability without adding restart, process or raw-log controls.
- Focused 5.5G tests passed 128/128. The full suite passed 1004/1004 tests in 74
  files; the existing jsdom canvas warning remained non-blocking. Typecheck, lint
  and production/native build passed. No test worker, timeout, assertion or retry
  policy changed; no dependency, ADR or architecture deviation was introduced.
- C# Run, workspace diagnostics, public/manual restart, raw logs, Razor, metadata
  navigation and all other deferred capabilities remain absent. Phase 5.5H retains
  Windows Electron smoke, repeated-cycle/performance review and final Phase 5.5
  stabilization.

#### 2026-09-13 development-launch environment correction

- Scope remains corrective Phase 5.5F/G. Phase 5.5H is `NOT_STARTED` and was not
  started by this work.
- Side-by-side launch evidence found the first meaningful divergence before
  Electron composition: the acceptance harness prepended the Phase 5.5B private
  .NET SDK 10.0.401 and private `csharp-ls` 0.27.0 and set `DOTNET_ROOT`; the
  prior `npm run dev` command inherited the caller environment. In the inspected
  shell that meant system .NET SDK 10.0.112, no `DOTNET_ROOT`, and no provider on
  PATH. A controlled hybrid run supplied the same private provider while retaining
  system .NET and reproduced a window where completion/service readiness preceded
  the expected diagnostic publication.
- Main entry (`out/main/index.js`), Preload (`out/preload/index.js`), development
  Renderer source modules, Electron entry/cwd, project/workspace selection,
  native binding, one main frame/provider process, service state and provider
  registration were otherwise current and healthy. Vite performed one initial
  dependency-optimization reload; ownership cleanup/reacquisition completed and
  no duplicate frame, session, provider registration, or unexpected Main restart
  remained. The diagnostic scheduler started for the current open-document
  version; traced provider replies reached Main, Preload and Renderer, then Monaco
  and ProblemsStore.
- `npm run dev` now uses a narrow Node launcher. On Windows it prefers the complete
  project-private Phase 5.5B SDK/provider pair only when both executables exist;
  otherwise it preserves the accepted inherited PATH fallback. Electron/Main,
  Preload, Renderer, public contracts, security boundaries, diagnostics logic,
  scheduling and lifecycle architecture are unchanged.
- Real fixed development launch verification used SDK 10.0.401 and the private
  provider category. `int b = "aaa";` at model version 85 produced a full CS0029
  provider reply, Renderer DTO, Monaco marker and one Problems error. Changing to
  `int b = 123;` at version 86 produced only CS0219 and removed CS0029 from both
  Monaco and Problems.
- Regression coverage passed 3/3 for complete-pair preference, incomplete-pair
  fallback and non-Windows preservation. Focused Phase 5.5 coverage passed
  171/171. The final full suite passed 1009/1009 in 75 files; an earlier parallel
  run had one unrelated 5-second Git integration timeout, whose full 32-test file
  passed immediately before the clean full rerun. Typecheck, lint and
  production/native build and `git diff --check` passed.

### 5.5H — Stabilization + Final Verification

Status: `COMPLETE` — final automated verification and user-confirmed manual acceptance PASS on 2026-09-13.

#### 2026-09-13 final-verification evidence — PASS

- Preserved prior passing evidence: focused 227/227 (14 files), full 1009/1009
  (75 files), production/native build, real native/preflight/workspace/sync smoke.
- Collected the interrupted typecheck and lint processes: both exited 0.
- Final source audit confirmed contextIsolation=true, nodeIntegration=false,
  sandbox=true; exact language request/response validation; committed owner/frame,
  project/path/version checks; contained definition targets; private wire IDs,
  completion data, diagnostic result IDs and process authority stay Main-owned.
- An isolated real-provider controlled-crash check used production manager/native
  factory with a test-only binding observer: STOPPED -> STARTING -> RUNNING ->
  CRASHED, retired adapter rejected, server PID exited, cleanupPending=false and
  zero registered owned resources. The temporary harness is under ignored out/.
  It does not replace renderer crash-state acceptance in the real application.
- User-confirmed manual acceptance PASS: completion, hover, signature help,
  go to definition, diagnostic markers, Problems, clearing after correction,
  project-switch stale-state cleanup, document close/reopen recovery and the
  `npm run dev` runtime. The user explicitly confirms all remaining 5.5H
  acceptance gates are satisfied. This closes the earlier Computer Use tooling
  limitation; manual results are user-provided, not agent-observed UI evidence.
- Typecheck, lint, build, focused/full tests, Windows smoke, security/lifecycle
  verification and final documentation diff-check passed. Phase 5.5A–5.5H and
  overall Phase 5.5 are COMPLETE.
- No production code, dependency, test policy or architecture changed during
  final documentation closure. Phase 6 and Phase 7 remain NOT_STARTED.
  Packaged/installed provider discovery, resource placement and installer
  verification remain Phase 7; they are not claimed by Phase 5.5.

- Run focused and full automated suites, typecheck, lint, production build,
  `git diff --check`, Windows Electron smoke, security/lifecycle review, repeated
  project/session cycles, representative solution/project performance, and
  documentation/traceability review.
- Confirm all Phase 5.5 capabilities and failure states while C# Run and every
  deferred capability remain absent.
- Update actual codebase paths and `CHANGELOG-THESIS.md` only for implemented,
  verified work. Do not claim packaged/installed provider acceptance before
  Phase 7.

### Phase 5.5 exit gate

- 5.5B passed before 5.5C began and exact versions match its evidence.
- Syntax, completion, hover, signature, definition, open-document diagnostics,
  Problems, workspace policy, synchronization, cancellation, status, lifecycle,
  cleanup, security, Windows paths, and failure isolation pass.
- Editor/save remain available in every dependency/service failure state.
- Defined focused/full tests, typecheck, lint, build, Windows Electron smoke, and
  `git diff --check` pass.
- Phase 7 remains responsible for packaged/installed `csharp-ls` acceptance.

## 12. Phase 6 — Settings & UX

### Goal

Complete FR-003 and FR-033 through FR-037 user-facing configuration and
persistence UX without changing the main-owned versioned JSON strategy.

### Dependencies

- Persistence foundation and minimal recent metadata from Phase 2.
- Actual runtime, language-service, and Git configuration needs from Phases 3–5.5.

### Decision gates

- Settings schemas must reflect implemented providers/runners rather than resolve
  their earlier ADRs retroactively.
- Any helper package requires a recorded decision; no database server is allowed.

### Key deliverables

- SettingsService validation/default/update and Settings UI.
- Theme, editor font size, tab size, Auto Save, and keyboard-shortcut UX within
  current requirements.
- Runtime and Git executable/configuration paths where needed. Configured C# SDK
  or provider paths remain deferred; `NOT_CONFIGURED` is reserved for that future
  scope.
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

### Phase 6 completion evidence — 2026-09-14

Status: `COMPLETE`. The user authorized continuation of the in-progress Phase 6
branch. Phases 2–5.5 prerequisites are complete. ADR-023 and the user-approved
2026-09-13 UX clarification define the delivered scope: fixed shortcuts,
unbounded MRU history, approved preference defaults/ranges, and dependency
guidance only. No custom executable path or shortcut remapping was introduced.

- FR-003: list/open/remove Recent Projects using opaque IDs; reopening passes
  canonical-root and unsaved transition guards. Missing folders retain history
  and provide recovery guidance. Removing history preserves the active project
  and source files.
- FR-012 / FR-033–FR-036 / keyboard shortcuts: Light/Dark/System, 8–40 px integer
  editor font, 2/4 spaces and Auto Save OFF by default. Enabled Auto Save uses
  ADR-023's 1000 ms idle delay and the existing version-aware save flow. Failed
  or conflicting writes preserve dirty content without an automatic retry loop.
  Timers follow rename and are disposed with their owning editor session.
  Dialogs and terminal/editor key ownership retain priority.
- FR-037: app schema v2 migrates v1 recent metadata; Settings and history updates
  share serialized atomic writes. Backup/default recovery surfaces a warning,
  and invalid primary JSON is preserved before replacement. Source buffers
  remain outside app-state persistence.
- Node/Git detection gives installation/PATH/restart guidance. C# keeps its
  existing SDK/provider policy and active-project status surface. Runtime,
  language-service, Terminal and Run ownership remain separate.

Verification:

- `npm test`: **1032/1032 tests, 78/78 files PASS**.
- `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check`:
  **PASS**. The final full-suite run followed the native/production build;
  a prior concurrent run hit existing 5-second real-Git timeouts. No timeout
  threshold was weakened; all tests passed when rerun without the build load.
- Windows Electron 44.0.0: `scripts/smoke-settings.mjs` stages `initial`,
  `restart` and `recovery` all **PASS**. Main/Preload are production output;
  the renderer has a test-only model observation point for hidden-window edits.
  Real Settings controls apply and persist preferences; Auto Save writes the
  actual fixture source. Separate process launches verify restored preferences,
  recent reopen/removal, backup recovery, the visible warning and preserved
  source. Light/Dark screenshots were visually reviewed with no horizontal
  dialog overflow.
- `npm run node-pty:smoke-service`: **PASS** for live-root and natural-root
  Windows scenarios; owned descendants exited, the control process survived,
  and application shutdown reached STOPPED with one final quit.
- Security/lifecycle: exact payload validation, current-main-frame authorization,
  handler/timer/theme-listener disposal, dirty/conflict preservation and existing
  project transition guards are covered. Smoke asserts contextIsolation=true,
  nodeIntegration=false and sandbox=true.
- Reproduction after `npm run build`: run
  `electron scripts/smoke-settings.mjs --stage=initial`, then `--stage=restart`,
  then `--stage=recovery` using `node_modules/.bin/electron`. Fixture evidence is
  stored only under ignored `out/phase6-smoke/`.
- Non-blocking diagnostics: existing jsdom canvas warning, smoke renderer chunk
  size warning, and GPU teardown messages after successful Electron assertions.

Exit gate: **PASS**. Architecture deviations: **NONE**. New dependencies:
**NONE**. Remaining Phase 6 blockers: **NONE**. Phase 7 is ready for authorization
and remains `NOT_STARTED`; Windows installer/packaged acceptance is not claimed.

## 13. Phase 7 — Testing, Stabilization & Windows Packaging

### Goal

Complete final V1 integration, security, Windows 10/11 acceptance, native
dependency packaging, application packaging, installer, and documentation review.

C# Project Run is the scoped exception: its manual/native/e2e and packaged
acceptance platform is Windows 11 x64 (ADR-024 amendment). Windows 10 is outside
its verified baseline; compatibility is not claimed. Other IDE Windows 10/11
packaging and installed-workflow obligations remain unchanged.

### Dependencies

- All Phase 2–6 exit gates, including Phase 5.5, and recorded decisions.

### Decision gates

- Select packaging/installer mechanics only when release implementation begins and
  record any architecture/dependency decision they require.
- Phase 2 `node-pty` compatibility evidence is prerequisite but does not replace
  packaged-app and installer verification.
- Phase 5.5B C# compatibility evidence is prerequisite but does not replace
  packaged/installed `csharp-ls`, resource, process, and installer verification.

### Key deliverables

- Full integration/regression suite and manual Electron workflow smoke tests.
- Windows 10 and Windows 11 acceptance.
- Production build, full application packaging, native dependency inclusion,
  packaged `node-pty` and app-owned pinned `csharp-ls` verification, release
  artifact, installer, and installer smoke test.
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

## 13.5 Phase 8 — Local AI Chat

Traceability: FR-038 in Requirement Section 20. This roadmap records the completed
renderer UI and local inference work. UI completion evidence is retained
in Section 3. For this roadmap, `PLANNED` denotes future work that has not started
and does not authorize implementation; the existing phase tracking rules remain
unchanged.

### 8A. Chat UI — COMPLETE

#### Scope

- Local AI toggle in the top-right application chrome.
- AI Chat panel overlays the existing right sidebar; Explorer/Git remain mounted
  underneath, and the editor remains accessible.
- Chat panel uses the beUI primitives Message, MessageBubble, MessageScroller,
  PromptInput, and StreamingResponse.
- UI uses ephemeral conversation state; Phase 8B replaced mock replies with Ollama.
- The displayed model label is `qwen3:1.7b`.
- Compact messages have no YOU/QWEN labels; Thinking... indicates a pending response.

Status: `COMPLETE`.

### 8B. Ollama Integration — COMPLETE

#### Scope

- Connect Student Coding IDE to local Ollama.
- Use `qwen3:1.7b` as the initial local model, with inference intended to run locally.
- Detect whether Ollama is available.
- Send chat messages to Ollama and receive AI responses.
- Follow the existing architecture boundary:

```text
Renderer → typed Preload API → Electron IPC → Main service → Ollama
```

Status: `COMPLETE`. AiChatPanel uses real local Ollama at the fixed
`http://127.0.0.1:11434` URL with fixed `qwen3:1.7b`. Conversation history is sent
with `stream:false` and `think:false` at the 8B exit gate; the complete assistant
response was returned. Phase 8C below supersedes that transport with streaming.
Typed getStatus/chat APIs validated requests and responses. Loading/error states
and overlapping-submission prevention are implemented. Typecheck, lint, 43 focused
AI/preload tests and diff checks passed; the subsequent UI polish passed 9 renderer tests.

### 8C. Streaming & Reliability — COMPLETE

#### Scope

- Stream assistant output incrementally.
- Stop generation through the backend.
- Handle Ollama unavailable and `qwen3:1.7b` missing/unavailable states.
- Handle request/generation errors.
- Prevent unstable behavior during overlapping requests.
- Keep the UI responsive if generation fails or is interrupted.

Status: `COMPLETE`. Typed `startChat`, `stopChat` and `onChatEvent` replace the
complete-response chat API. Main incrementally parses Ollama NDJSON with
`stream:true`, `think:false`, fixed `qwen3:1.7b` and the fixed localhost URL.
Request-scoped chunk/complete/error/stopped events go only to the owning renderer.
The panel grows one assistant response; Thinking... disappears on its first chunk.
Stop aborts the request, preserves partial content and permits another submission.
Request identity guards late/duplicate events, including events before the start
acknowledgement. Panel unmount, window navigation/destruction, renderer loss and
application shutdown cancel owned generation. Main blocks overlapping requests;
the UI handles missing Ollama/model, HTTP failures, malformed records, premature
EOF and timeouts without losing partial content. Stream record/output sizes are bounded.
Verification: typecheck, lint, 51 AI/preload tests across 5 files and
`git diff --check` passed. Tests mock HTTP/streams; no live Ollama test was required.

### Non-goals

Future AI Agent capabilities are outside Phase 8: current-file context,
selected-code context, multi-file/project context, editing files, running terminal
commands, tool calling, and autonomous agent behavior.

## 13.6 PHASE 9 — LEARNING / PROGRAMMING TECHNIQUES

Status: `NOT_STARTED`. Approved roadmap only; no implementation or completion
is claimed. Traceability: Requirement Section 21, Phase 9; Architecture Section
6, Learning direction. Existing Phase 1–8 decisions remain unchanged.

### Goal, workspace layout and state

Extend the IDE with Learning Mode for the initial course **Kỹ thuật lập trình**.
Project Mode and Learning Mode are separate application workspace modes.
Learning is not a project, modal, dialog, editor tab or replacement for Project
Mode. Future courses must fit without redesigning Learning Mode.

The current Project Mode layout in `App.tsx` remains authoritative:

| Area | Project Mode | Learning Mode |
|---|---|---|
| Left `.project-sidebar` | Projects, Open/Switch Project, Create Project, Active Project, Recent Projects, Settings | Learning Roadmap: chapters and progress |
| Center `.preview-surface` | EditorWorkbench and Terminal / Problems / Output; editor tabs and Run integrated in the workspace header | Learning Workspace, expanded into space freed on the right |
| Right `.explorer-sidebar` | Project Tools: Explorer, Search, Source Control / Git | Hidden |

Add the Learning application-header entry beside Local AI: `[Learning] [Local AI]`.
Icon direction: `GraduationCap` from existing `lucide-react`. Learning toggles
Project Mode ↔ Learning Mode. Reuse the left sidebar; do not add another sidebar.
Hide Project bottom panels in Learning. Exercise Test Cases / Result must never
be mixed with Project Output.

Entering Learning changes presentation only: it must not close/switch the active
project, close documents, discard unsaved code, restart terminals or reset Project
Mode. Preserve and restore, where applicable:

- active project, open documents and active document;
- unsaved editor state and Monaco/editor models;
- Projects sidebar state, selected Explorer/Git tab and presentation state;
- terminal sessions and bottom panel state.

Learning state is isolated. Learning → Project → Learning resumes the current
chapter, lesson/exercise/quiz, selected exercise language, code draft, applicable
Run/Submit result and learning position. Hiding a mode is not session disposal.

### Content and exercise contract

Local content is data-driven and separate from React components. The conceptual
structure is Course → Chapter → Lesson → Exercise → Quiz; chapters need not
require every item in that sequence. Never hard-code chapters into React.
**Chương 1 — Giới thiệu môn học** is a special introduction chapter: course
introduction, objectives, knowledge/skills, learning method and Learning Mode
guidance. Coding exercises and quizzes are optional for Chapter 1. From Chapter
2 onward, chapters may expose Tài liệu, Luyện tập, Trắc nghiệm and Tiến độ.
Learning Roadmap answers “Student đang học ở đâu?”.

Learning Workspace views/navigation:

- Course Introduction for the introductory chapter.
- Material → Lesson Workspace.
- Practice → Exercise List → Exercise Workspace.
- Quiz → Quiz Workspace.

Exercise progression groups are **Cơ bản** (direct application), **Trung bình**
(combining knowledge) and **Nâng cao** (problem analysis, edge cases and greater
challenge). Learning statuses include chưa làm, đang làm and hoàn thành.

An Exercise is language-neutral: id, title, learning difficulty, problem statement,
input/output specifications, examples, constraints, test cases and allowed
languages. Each language supplies language id, Monaco language id, filename,
starter code and runtime adapter. Direction: C#, JavaScript, Python and Java;
all adapters need not be implemented in one task or PR.

Exercise Workspace has a breadcrumb/title, language selector, Run and Submit in
its header. The Problem panel (Description, Input, Output, Examples, Constraints)
sits beside the Monaco editor, with Test Cases / Run Result / Submission Result
below. The split may resize where appropriate; no fixed pixel or percentage
allocation is prescribed.

Reuse the current Monaco/editor foundation; Project Document != Exercise Document.
Exercise code is not automatically saved into the student project or shown in its
file tree. Exercise Session owns exerciseId, selectedLanguage, solution drafts per
language, current Run/Submit results, completion/progress and draft/dirty state
where needed. C# → Python → C# retains the earlier C# draft. Shared Monaco
configuration/wrapper extraction may occur in an authorized implementation
package; duplicating the editor architecture is not the direction.

Learning V1 uses **STDIN → Student Program → STDOUT**, allowing shared test cases
across languages. Function-signature/harness exercises are outside V1. Run uses
current session code, selected language and sample/custom input, returning
stdout/stderr and a Run Result without requiring a saved project file.

Submit prepares/compiles when needed, runs public then hidden tests, and judges
results. Outcomes: Accepted, Wrong Answer, Compilation Error, Runtime Error and
Time Limit Exceeded. Partial scores may show Passed 7 / 10 and Score 7 / 10.
Full hidden input/output is not exposed to students.

Execution follows Renderer → typed Preload API → IPC → Main → Exercise Service
→ Judge Service → Language Runtime Adapter → OS/runtime. Main owns temporary
exercise workspaces, prepare/compile/execute, stdin, stdout/stderr, timeout,
normalization and cleanup. Project Run and Exercise Run may share narrow internal
process primitives while retaining separate behavior and domain lifecycles.
No generic renderer command execution API is allowed.

### Dependencies and decision gates

Use existing shell, retained project/editor state, Monaco, validated typed IPC,
Main-owned process cleanup and local persistence foundations. Phase 9 follows
Phase 8 in the roadmap; existing Phase 7 packaging/Windows acceptance obligations
remain. Verify prerequisite exit gates and explicit package authorization before
implementation. Learning itself has no AI dependency.

Package sequence: 9A → 9B → 9C → 9D → 9E → 9F → 9G. Adapters can be delivered
sequentially; completing one adapter does not complete all of 9D.
ADR-011 remains unresolved for shared renderer state expansion: record the
applicable decision before implementation without selecting a store here.
Exact runtime versions/distribution, dependency detection, temporary-workspace
policy, timeout limits, normalization/comparison rules, scoring rules and Learning
persistence schema must be specified and verified in their authorized packages.
This roadmap selects no new dependencies or language-service providers.

### 9A — Learning Mode & Roadmap

Status: `NOT_STARTED`.

**Scope:** Learning icon/header entry; Project/Learning mode state; Projects sidebar
→ Learning Roadmap; Project Workspace → Learning Workspace; hide right Project
Tools and Project bottom panels; preserve/restore both modes; basic course/chapter
navigation; Chapter 1 introduction shell; mode lifecycle/regression coverage.

**Goal / exit gate:** Project ↔ Learning is safe. Verify all project and Learning
state listed above, dirty buffers and retained models, live terminals, sidebar/
panel restoration and inaccessible hidden controls. Local AI opens as a temporary
overlay without revealing Project Tools; closing it returns to Learning Workspace.
No project transition is triggered by entering Learning.

### 9B — Course Content & Lessons

Status: `NOT_STARTED`. Prerequisite: 9A exit gate.

**Scope:** Course, Chapter and Lesson/material models; local data-driven content;
Chapter 1 introduction content; Lesson Workspace; chapter/lesson navigation;
content separated from React implementation.

**Goal / exit gate:** Students follow the roadmap and read real course material.
Verify data-driven navigation, the special introduction chapter without mandatory
exercise/quiz, and content boundaries that permit additional courses.

### 9C — Practice & Exercise Workspace

Status: `NOT_STARTED`. Prerequisite: 9B exit gate.

**Scope:** Exercise model; difficulty grouping; Exercise List and status;
Exercise Session; Exercise Workspace and Problem panel; reused Monaco foundation;
language selector; independent language drafts; Test/Result UI shell.
A complete Judge is not required here.

**Goal / exit gate:** Students open an exercise and write a solution. Verify
problem content, independent document/model ownership, per-language draft
retention, mode round trips and no automatic project file/tree mutations.
Runtime/Judge actions must not present mock results as actual execution.

### 9D — Exercise Runtime & Multi-language

Status: `NOT_STARTED`. Prerequisite: 9C exit gate.

**Scope:** Runtime abstraction; temporary workspace; STDIN/STDOUT; prepare/compile/
run lifecycle; timeout; stdout/stderr capture; cleanup; language runtime adapters.

| Adapter package | Status | Runtime direction |
|---|---|---|
| 9D.1 — C# | `NOT_STARTED` | dotnet |
| 9D.2 — JavaScript | `NOT_STARTED` | node |
| 9D.3 — Python | `NOT_STARTED` | python |
| 9D.4 — Java | `NOT_STARTED` | Java compile/runtime adapter |

Each adapter requires the common runtime contract and explicit task scope; all
four need not ship in the same implementation task/PR.

**Goal / exit gate:** Exercise code runs locally in the selected supported
language without saving a project file. Verify stdin/stdout/stderr, preparation
and compile failures, missing/invalid dependencies, bounded time/output, owned
process/temporary-file cleanup and Windows behavior for each adapter. Validate
IPC/session ownership and stale-result rejection. Runtime support does not imply
new Project Run or language intelligence support.

### 9E — Local Judge & Submission

Status: `NOT_STARTED`. Prerequisite: 9D exit gate.

**Scope:** Complete Run integration; Submit; public/hidden tests; output
normalization/comparison; timeout result; Accepted / Wrong Answer / Compilation
Error / Runtime Error / Time Limit Exceeded; partial scoring; submission result
UI; Judge regression coverage.

**Goal / exit gate:** Students submit and receive local judging results. Verify
sample/custom Run input, shared test cases across supported languages, comparison/
scoring, result classification, hidden input/output redaction, compile/runtime
failures, timeout, stale-result rejection and cleanup.

### 9F — Quiz & Learning Progress

Status: `NOT_STARTED`. Prerequisite: 9E exit gate.

**Scope:** Quiz model and Workspace; multiple-choice theory, code-reading,
predict-output and identify-error questions; navigation and answers; scoring and
results; chapter progress, lesson/exercise completion, submission score/progress;
local persistence and Learning state resume.

**Goal / exit gate:** Learning assesses knowledge and tracks progress. Verify quiz
navigation/scoring/results and restoration of exercise drafts, submission results/
scores, quiz completion/results and last learning position. Follow Main-owned
versioned persistence, serialized atomic writes, migration and corrupt-state
recovery. No account, cloud or backend is required.

### 9G — Learning UX & Stabilization

Status: `NOT_STARTED`. Prerequisite: 9A–9F exit gates.

**Scope:** UI polish; resizing; accessibility; keyboard navigation; mode-switch
regression; Learning state, Monaco and Exercise Session lifecycles; runtime cleanup
and Judge regression tests; manual Electron smoke tests.

**Goal / exit gate:** Stabilize the complete Learning flow. All package acceptance
checks and new regressions must pass, including project data safety, isolated
Learning state, retained drafts, runtime ownership/cleanup and Local AI overlay
behavior. Verify both layouts and resizing in Electron on required Windows
acceptance platforms before claiming Phase 9 completion.

### Phase 9 quality gates and non-goals

Implementation requires focused domain/security/lifecycle/renderer regressions,
the documented automated suite, typecheck, lint, build and `git diff --check`,
plus actual Windows/Electron evidence for runtime and final stabilization gates.
This docs-only roadmap update requires diff review and `git diff --check` only.
No Phase 9 package is complete until its exit gate has actually passed.

Learning V1 is local and independent of AI. Keep Local AI on the header as a
temporary overlay in Learning: opening it must not restore Project Tools and
closing it returns to Learning. Preserve Phase 8's fixed local Ollama endpoint,
`qwen3:1.7b`, text chat and configuration. No Agent, tools, project file access,
automatic exercise/code context, AI Tutor or exercise-aware AI is added; these
remain separate future extensions. Backend/cloud, accounts, project templates
and function-signature exercise harnesses are outside this foundation.

## 13.7 C# PROJECT RUN — CORE, CONSOLE INPUT & COMPLETION

Status: `IN_PROGRESS`. M1-01 through M1-08 are explicitly authorized and `COMPLETE`;
M1-04's isolated spike passes 32/32 cases on Windows 11 x64 under the revised
ADR-024 acceptance scope. M1-05's production resolver/evaluation is verified;
M1-06 discovery/classification and M1-07 selection/persistence are verified
(2026-10-08); M1-08 Main-only cancellable plan lifecycle is verified.
All later tasks and
Milestone 2 remain `NOT_STARTED`. The 2026-10-07 planning
authorization was documentation-only; subsequent authorization is limited to
M1-01 contracts/validation, M1-02 identity/runtime foundations and M1-03 native
argument arrays with closed stdin, followed by M1-04 isolated native/SDK evidence
and M1-05 Run-specific SDK resolution/structured evaluation, followed by M1-06
discovery/classification, M1-07 Main-side selection/persistence and M1-08 lifecycle
infrastructure. No M1-09a/M1-09 or later implementation is authorized.
This package is a bounded Project Run extension,
not Phase 5.5 reopening, Phase 9D implementation or authorization for later tasks.
Traceability: FR-023 C# extension / FR-024, Architecture Section 10, ADR-024,
Codebase Map planned C# Run modules, Language Support planned Project Run scope.

Acceptance platform for this extension: **Windows 11 x64**, including M1/M2
manual/native/e2e evidence and its Phase 7 packaging checks. Windows 10 is outside
the verified C# Project Run acceptance baseline. Compatibility is not claimed.
The 2026-10-07 scope revision removes the previous Windows 10 evidence requirement;
it does not waive a failed test or weaken cleanup, stdin or regression gates.
Other IDE Windows 10/11 acceptance obligations remain unchanged.

### M1-01/M1-02 task start checklist and baseline findings

1. Authorized work: M1-01 semantic contracts/validation, followed by M1-02 Main
   identity/runtime/strategy foundations. No native, IPC implementation, stdin or
   UI changes; M1-03 and later tasks need separate authorization.
2. Goal: saved Console `.csproj` Run plus Console.ReadLine in Output. M1 alone
   is partial delivery. Exclude loose `.cs`, Web/API, debugger, launch profiles,
   advanced multi-target selection, Exercise Runtime/Judge, auto-install SDK,
   generic Renderer executor and PTY substitution.
3. Foundations: completed Phase 2 project/filesystem/editor/IPC/process cleanup,
   Phase 4 Run/Output and Phase 6 persistence/settings; Phase 5.5 native regression
   coverage is mandatory because the binding is shared. At implementation start,
   reconfirm applicable exit gates; Phase 7 packaged/Windows obligations remain.
   This independently authorized extension requires no Phase 9 gate or new AI work.
4. ADR-024 settles design scope. M1-04 is a hard native/SDK evidence gate; passing
   planning checks does not pass it. No dependency or store-library gate resolved.
5. Main owns disk/SDK/process/target store; Preload is semantic and typed; Renderer
   owns documents/presentation. Preserve contextIsolation, sandbox, no Node access,
   no raw IPC, relative-path authority, session ownership and retained cleanup.
6. Required future verification: focused unit/integration tests, existing full
   npm test, typecheck/lint/build, diff checks, native and manual Windows evidence
   below. Docs-only review runs diff checks, not production acceptance.
7. Planning survey branch was develop; the M1-01 implementation starts on
   feature/csharp-project-run with a clean working tree. Prior planning and Phase 9
   changes are already present and retained. No dependency or commit is authorized.
   M1-02 starts on the same feature branch with M1-01 changes in five docs,
   shared/contracts/run.ts and its untracked contract test; all are preserved.

| Current evidence | Consequence for planned work |
|---|---|
| run-service.ts has a fixed JS list and context-free resolveRuntime | Compose trusted strategies and resolve runtime by authorized kind/context |
| prepare/start/launch use execution.args[0] for identity | Replace all sites with canonical target identity before multi-argument launches |
| WindowsPipedProcessAdapter accepts one arg, rejects environment additions | Add bounded argv and explicit internal stdin/environment policy; preserve JS |
| PipedRunProcess and RunService wrapper lack stdin capability | Extend both internal interfaces, not merely native exports |
| Native binding supplies NUL stdin for Run, dedicated C# language pipes/writer | Reuse primitives with separate Run handles; never reuse LSP session ownership |
| SDK detector rejects SDKs below 10 for csharp-ls | Run-specific policy; preserve existing language detector semantics |
| CsharpWorkspace finds solutions/projects, not runnable Console entry targets | Separate Run resolver/store with evaluated Console eligibility |
| RunController/EditorRunAction use active JS document; Output has streams only | Add project target and composer within existing header/Bottom Panel |
| startRun awaits preparation; pending-start UI disables Stop | C# must reserve/return STARTING session promptly and expose cancellation during owned asynchronous preparation/build |
| Root exit finalizes current one-process sessions | C# step exit must clean the step before advancing, not finalize the whole Run |

### Final scope and implementation order

M1: SDK-style single-framework .NET Console Exe under the active folder project;
bounded nested discovery; one candidate auto-select/multiple explicit selection;
separate remembered Run target; Main SDK/global.json/TFM checks; project-wide
Save-first/conflict guard; SDK build/restore then dotnet run; Run/Stop/Re-run and
separate stdout/stderr/exit. Preserve JS and all existing ownership transitions.
M2: UTF-8 line-oriented stdin for exact owned C# execute session, repeated lines,
multiline paste, typed validation/acks, bounded queue/backpressure/EOF, minimal
Output composer, complete cross-domain regression and Windows acceptance.

Execute M1-01 -> M1-02 -> M1-03 -> M1-04 before dependent C# production strategy.
Then M1-05 -> M1-06 -> M1-07; M1-08 uses M1-02/M1-03 and may be validated with
fake plans before real strategy composition; M1-09a supplies the source guard;
M1-09 composes the completed seams;
M1-10 -> M1-11 -> M1-12. Execute M2-01 -> M2-02 -> M2-03 -> M2-04 -> M2-05 ->
M2-06 -> M2-07 after M1 exit. Independent module testing does not bypass listed
production dependencies. A failed M1-04 blocks dependent work and reopens ADR-024
only if evidence requires a design change.

### Milestone 1 — C# Project Run Core

Status: `IN_PROGRESS`. M1-01 through M1-08 COMPLETE; M1-09a/M1-09–M1-12
NOT_STARTED. No later implementation authorization is inferred.
No later implementation authorization is inferred.

| ID | Công việc | File/module dự kiến | Phụ thuộc | Kết quả đầu ra | Tiêu chí hoàn thành |
|---|---|---|---|---|---|
| M1-01 | COMPLETE — Define target kind, resolution, phase/failure DTOs and exact validation | shared/contracts/run.ts; tests/contracts/run-validation.test.ts | Explicit implementation authorization; ADR-024 | Additive semantic file/project targets, execution phases and resolution/failure DTOs; live JS API unchanged | 74 contract tests and 178 focused/regression tests PASS; typecheck/lint/build/diff checks PASS; no process authority |
| M1-02 | COMPLETE — Replace argv-derived identity; inject fixed strategies and contextual runtime resolution | run/run-service.ts, run-strategy.ts, javascript-run-strategy.ts; main/index.ts; run-identity/foundation/lifecycle tests | M1-01 | Immutable authorized identity and fingerprint; JS-only composition verified | All RunService args[0] identity sites removed; 202 focused tests, 1185 full-suite tests, quality gates and three native JS smokes PASS |
| M1-03 | COMPLETE — Generalize Windows argv with closed stdin mode | run/windows-piped-process-adapter.ts, piped-process-adapter.ts, native/run-process.cpp; smoke-run-native.mjs | M1-02 | Bounded argument-array launch, proper quoting/handles/environment | Native round-trip/bounds/closed stdin and Job cleanup PASS; JS/Terminal/Git/LSP regression PASS; 1195 tests and quality gates PASS |
| M1-04 | COMPLETE — Windows 11 x64 compatibility gate PASS | spikes/csharp-project-run/REPORT.md and unchanged evidence/results.json, evidence/verification.json; no app composition | M1-03; explicitly authorized spike and scope revision | Real SDK 8.0.410/net8.0 and 10.0.112/net10.0; 32/32 PASS; stdin/EOF/blocked-write prototype | Flags/restore/build Stop, retained descendants, worker no-reuse, resource cleanup and regressions PASS; Windows 11 x64 evidence satisfies revised hard gate |
| M1-05 | COMPLETE — Run SDK resolver and structured evaluation | dependencies/dotnet-run-runtime.ts; run/csharp-run-preflight.ts; run/csharp-run-probe.ts; tests/main/csharp-run-preflight.test.ts; scripts/smoke-csharp-run-preflight.mjs | M1-04 COMPLETE; explicitly authorized | Main PATH inventory, CLI-selected candidate SDK >=8 and fixed Debug MSBuild facts; independent from LSP | 60 focused/214 focused+regression tests; real Windows 11 SDK 8/10 smoke 20/20; 1255 full-suite tests and quality/native regression gates PASS; no M1-06 classification |
| M1-06 | COMPLETE — Discover and classify runnable Console targets | run/csharp-run-target-resolver.ts; tests/main/csharp-run-targets.test.ts; scripts/smoke-csharp-run-targets.mjs | M1-05 COMPLETE; explicitly authorized 2026-10-08 | Bounded independent discovery, evaluated Console classification, recursive authorized reference graph and structured resolution | 62 new tests; 1317 full-suite tests PASS; real Windows SDK 8/10 smoke 14/14; 0/1/multiple/broken/overflow and containment/cancellation verified; no persistence/execution |
| M1-07 | COMPLETE — Persist independent per-project selection | run/csharp-run-target-store.ts; tests/main/csharp-run-target-store.test.ts; existing persistence internals | M1-06 COMPLETE; explicitly authorized | Main resolve/select/clear, isolated versioned relative-path selection and revalidation/recovery | 143 focused tests/5 files PASS; restore/change/clear/isolation/stale/corrupt/atomic failure/supersession/project close verified; typecheck/scoped lint/diff PASS; no UI/IPC/execution |
| M1-08 | COMPLETE — Add cancellable execution-plan/session lifecycle | run/run-service.ts, run-strategy.ts; tests/main/run-plan-lifecycle.test.ts; existing project lifecycle reused unchanged | M1-02/M1-03; M1-04 before real C# launch | Main-only JS one-step/C# two-step seam; early STARTING, abortable preparation/resources, step generations and full-plan launch fingerprint | 31 new/145 focused tests in 7 files PASS; preparation/build/execute/gap Stop, callback retirement, intermediate exit, retained cleanup and replacement/project/shutdown failure verified; typecheck/scoped lint/diff PASS; no production C# strategy |
| M1-09a | Define and implement bounded saved-source handshake | planned run/run-source-guard.ts; shared Run guard DTOs; IPC/Preload and output controller; focused tests | M1-01/M1-08 | Owner-scoped guard request/reply, aggregate dirty/conflict revision and preparation invalidation | Current lifecycle approval is not a snapshot API; 5s timeout/unknown/stale response fails closed; non-active dirty/reference conflict and edits during build prevent launch; no Monaco state in Main |
| M1-09 | Implement CSharpRunStrategy and classify step failures | planned run/csharp-run-strategy.ts; run service and main/index.ts; focused strategy tests | M1-05–M1-08/M1-09a | Fixed SDK build then dotnet run plan, phase/error mapping and launch guard | No auto-save; guarded saved-source execution; build nonzero prevents execute; exact fixed args; JS plan unchanged |
| M1-10 | Wire target resolution/selection and Run DTOs through IPC/Preload | main/ipc/run-ipc-service.ts, preload/bridge/run.ts, shared contract exports; IPC/Preload tests | M1-09 | Narrow resolve/select/start/stop/events; owner-scoped discovery cancellation | Exact validation at both boundaries; relative paths only; no runtime CLI options; stale selection/generation/owner denied; early session response supports Stop |
| M1-11 | Minimal C# target/Run/Stop/Output presentation | output/run-controller.ts, EditorRunAction.tsx, OutputPanel.tsx, use-project-run.ts; App composition if needed | M1-10 | Compact target choice/label; project save guard; phase/failure output; JS current-file behavior | Single Run entry; Stop available while preparing/building; target != active .cs; stale events ignored; existing output/tab/theme behavior preserved |
| M1-12 | Core acceptance and milestone review | tests/main/csharp-run*.test.ts; tests/renderer/run-output.integration.test.tsx; planned scripts/smoke-csharp-run.mjs; docs | M1-11 | M1 evidence report and status update only after exit passes | Core test matrix/native smoke, full suite/typecheck/lint/build/diff checks; Windows Core evidence; overall feature remains IN_PROGRESS pending M2 |

#### M1-01 verification and compatibility — 2026-10-07

- Implemented additive `SemanticRunTarget`, `SemanticStartRunRequest`,
  `SemanticRunSession`, `RunExecutionPhase`, CSharpRunCandidate/dependency/resolution
  and RunFailure types plus exact validators in the existing side-effect-free
  shared Run module; the existing wildcard export exposes these types/validators.
- Target kinds: javascript-file (.js, preserving current case policy) and
  csharp-project (.csproj, case-insensitive Windows suffix). New DTO bounds:
  relative path 4096 UTF-16 code units, display name 256, candidate list 64.
  Reuse the existing lexical path rules; no new bounds imposed on legacy requests.
- Phases PREPARING / BUILD_RESTORE / EXECUTING remain separate from RunState.
  JS has no BUILD_RESTORE phase. These validators do not authorize owners or
  enforce lifecycle transitions; Main must still validate identity, generation,
  SDK, disk containment and real Console eligibility when later tasks compose them.
- Resolution: READY / SELECTION_REQUIRED / NO_RUNNABLE_PROJECT /
  DEPENDENCY_FAILED / FAILED. Exact per-variant fields, candidate eligibility/reason,
  dependency state/reason, target membership/project match, candidate bounds and
  case-insensitive duplicate checks reject contradictory or unsafe payloads.
  A limit failure cannot masquerade as a partial candidate list.
- Runtime-owned executable/argv/cwd/environment/handles/canonical paths remain
  Main-only in run-strategy.ts. Live RunApi, RUN_CHANNELS, legacy StartRunRequest,
  RunSession/RunEvent validators and dispatch behavior remain unchanged. New typed
  DTOs deliberately fail legacy validators: no C# execution is enabled in M1-01.
  No semantic event/channel wiring, runtime resolver, selection store, source guard,
  stdin, native or UI implementation in this task.
- Verified: 178 tests across six focused files (new contract tests plus existing
  Run foundation/lifecycle/project lifecycle, Preload domain bridges and Output
  integration) PASS. Final contract-only rerun: 74/74 PASS after lint correction.
  Typecheck, final lint, production build including existing Windows native binding,
  and git diff --check PASS. No full-suite or live C#/Windows smoke claim; no native
  behavior changed and M1-04 remains unexecuted.
- Reviewed diff: no changes to Main, Preload, Renderer, package/lockfile or RunService;
  clean starting tree on feature/csharp-project-run. No new dependency, ADR change,
  commit/push/merge. M1-02 is eligible only after explicit user authorization.

#### M1-02 verification and compatibility — 2026-10-07

- Identity is a Main-only tuple of project ID, trusted strategy kind and normalized
  canonical target path, validated for absolute path and root containment. No
  argv position participates in duplicate detection, start serialization or re-run.
- Immutable execution snapshots and SHA-256 fingerprints include identity, root,
  executable, ordered argv, cwd, shell and deterministically ordered environment.
  Initial resolution/preparation/launch must agree; mismatch prevents creation.
  Main still reauthorizes disk/owner/project and checks lifecycle generations.
- Constructor injection snapshots a fixed strategy list, rejects duplicate kinds
  and ambiguous dispatch, and passes authorized target/kind to runtime resolution.
  Main registers only JavaScript; no C# strategy, SDK resolver, dotnet invocation,
  native argv support, stdin, dependency, generic executor or public API change.
- Existing test and native smoke constructors now explicitly inject JavaScript;
  Main-only run-runtime build entry exports that strategy for those harnesses.
- PASS: typecheck, final lint (after removing an unused test parameter), build,
  202 focused/regression tests in seven files, full npm test (1185 tests / 84 files),
  git diff --check. Full suite printed a non-failing jsdom canvas diagnostic.
- PASS on Electron 44 / ABI 149 / Windows x64: smoke-run-native (15 cycles,
  root-first cleanup and failed spawn), smoke-run-lifecycle (Stop, duplicate Stop,
  re-run, streams/exits/descendants), smoke-run-project-lifecycle (cancel, switch,
  close, unavailable/reopen, shutdown). Lifecycle smokes report zero remaining
  resources; project smoke reports all native resources released.
- UI manual smoke, packaged Win10/Win11 matrix and C# native/SDK evidence were not
  run; none is claimed here. M1-04 remains an unexecuted hard gate. The adapter's
  single-argument create call is unchanged and belongs to M1-03.
- No ADR change or architecture deviation. Prior M1-01 work is preserved;
  no commit/push/merge. M1-02 COMPLETE does not complete M1 or overall C# Run.

#### M1-03 verification and compatibility — 2026-10-07

- Start checklist: user authorized M1-03 only; M1-01/M1-02 are COMPLETE.
  Branch `feature/csharp-project-run` started clean, with no unrelated edits.
  Goal/scope is bounded Windows argv and closed stdin, preserving JS and native
  ownership. Exclude M1-04, CSharpRunStrategy, SDK Run, input writing/queues,
  public API/UI changes and dependencies. ADR-024 design and ADR-020/021 retained
  Job/cleanup rules apply; M1-04 remains a separate unexecuted hard gate.
  Required verification: focused/full automated tests, typecheck/lint/build,
  Windows native bounds/quoting/ownership and cross-domain regression, diff check.
- Dedicated private `createRun(executable, args, cwd, environment, observer)`
  accepts 0–1024 arguments including empty strings. The adapter passes Main's
  immutable PreparedRun array intact; existing fingerprint/authorization remains
  unchanged. Legacy create, Git and C# language entry contracts remain available.
- Windows quoting surrounds each argument, doubles backslashes before a quote
  or closing delimiter and preserves spaces/#/Unicode/tabs/newlines/empty values.
  Limit: 32766 UTF-16 code units after quoting, plus NUL. Reject non-string/sparse
  arrays, count/string/quoted overflow and embedded NUL before creating handles.
  Main retains project/executable authorization; native additionally checks fully
  qualified drive/UNC paths, existing `.exe` and directory cwd. No shell/search
  fallback or command-string execution interface. Environment is filtered Main
  inheritance only, no additions, with native block limit 32767 including NULs.
- Fixed stdin policy is closed via NUL/EOF. Run cannot use the language writer.
  Job-at-creation, suspended launch, restricted inherited handles, Stop,
  concurrent close, root/EOF settlement and empty-Job-before-release are retained.
- PASS: focused suite 212/212 in eight files, typecheck, final lint,
  production/native build, full suite 1195/1195 in
  85 files and diff check. Initial new-test table/globals issues were corrected.
  First full run had one 5s Git integration timeout under concurrent native smoke;
  isolated Git rerun passed 32/32 and subsequent full suite passed unchanged.
  Existing non-failing jsdom canvas diagnostic remains.
- Automated Electron 44 / ABI 149 / Windows x64 native smoke PASS: 15 JS cycles,
  23 argv round-trips, 30 invalid-input cases, exact command-line/count bounds,
  copied executable/script paths containing spaces/#/Unicode, filtered environment,
  closed stdin, failed creation and repeated cleanup. Handle count stayed 688→688.
  Multi-argument live-root Stop and root-first cases verify root/descendant PIDs
  gone, empty Job and released ownership. No native resource growth observed.
- Run lifecycle and project lifecycle smokes PASS with zero remaining resources.
  Terminal live-root/natural-root smokes PASS; Git native smoke PASS; existing
  C# Language Service native/blocked-write/provider shutdown smoke PASS. This is
  LSP regression evidence, not C# Run or M1-04 SDK compatibility evidence.
- Manual UI smoke, packaged Windows 10/11 matrix and live UNC-share execution
  were not performed; no such acceptance is claimed. M1-03 is COMPLETE, M1/overall
  C# Run remain IN_PROGRESS, M1-04 remains NOT_STARTED and needs authorization.
  No dependency, ADR decision change, architecture deviation, commit/push/merge.

#### M1-04 isolated compatibility evidence — 2026-10-07

- Scope/checklist and full evidence: `spikes/csharp-project-run/REPORT.md`.
  Started on `feature/csharp-project-run` with clean status/diff; preserved M1-03.
  Added isolated harness, native probe, Console/build-hold fixtures and evidence;
  no production source, SDK resolver, C# strategy, Run IPC/UI or dependency change.
- Available host: Windows 11 x64, build 10.0.26200; PATH dotnet is
  `C:\Program Files\dotnet\dotnet.exe`. Inventory includes 8.0.410, 9.0.314,
  10.0.112. Local global.json pins prove 8.0.410/net8.0 and 10.0.112/net10.0;
  no SDK installation. Raw inventory and source hashes are in evidence/results.json.
- PASS on that host: 32/32 cases covering evaluation-only properties/references,
  build/restore, fixed no-build/no-restore/no-launch-profile/no-server flags,
  `-nodeReuse:false` worker policy, spaces/#/Unicode paths, stdout/stderr/nonzero,
  real localhost NuGet request cancellation and held CoreCompile build cancellation.
- CLI and direct-host root/child cases, owner cancellation and failed build/run
  cleanup PASS. Prototype stdin receives Unicode/empty/multiple lines and EOF;
  blocked 8 MiB write settles on Stop before release. This is isolated feasibility,
  not production M2 input, queue, session capability or UI implementation.
- Retained native ownership verified with Job/PID snapshots and actual no-reuse
  MSBuild worker command lines. Final resources 0, new surviving .NET processes 0,
  every released session has 0 open handles/pending writes. Eight repeated cycle
  handle counts are flat: SDK 8 at 700, SDK 10 at 696. Unrelated control survives.
  No global build-server shutdown or process-name termination.
- Application checks/regression commands and their executed results are recorded
  in `spikes/csharp-project-run/evidence/verification.json`. Initial harness setup
  failures and corrected observation assumptions are disclosed in REPORT.md.
- Gate disposition after authorized scope reconciliation: PASS / COMPLETE.
  ADR-024's 2026-10-07 amendment makes Windows 11 x64 the acceptance platform;
  existing 32/32 evidence satisfies all M1-04 hard gates. Windows 10 is out of
  the verified baseline; compatibility is not claimed. No technical incompatibility
  reopens ADR-024's architecture conclusions. Raw JSON remains unchanged, including
  the historical BLOCKED disposition in verification.json under the previous
  two-OS scope. This removes a scope requirement, not a failed-test waiver.
  Manual production UI/packaged acceptance is not inferred and remains a later
  obligation. M1-05 is READY from this gate but NOT_STARTED; explicit authorization
  is still required. No repository commit/push/merge.

#### M1-05 resolver/evaluation verification — 2026-10-07

Completion revalidation (2026-10-08): unchanged implementation; fresh full suite
1255/1255 (86 files), typecheck/lint/build/diff checks and real production smoke
20/20 PASS. All 77 native sessions released, resources/new surviving processes 0,
eight handle measurements 677. Five source hashes match the original evidence.
See `spikes/csharp-project-run/M1-05-REPORT.md` and
`spikes/csharp-project-run/evidence/m1-05-revalidation-2026-10-08.json`.
M1-05 remains COMPLETE; M1-06 remains NOT_STARTED. No new production scope.

- Authorized M1-05 only after COMPLETE M1-01–M1-04. Started on
  `feature/csharp-project-run` with clean status/diff; no unrelated changes to
  preserve. No unresolved decision gate or new dependency; ADR-024 unchanged.
- Main-only `DotnetRunRuntimeResolver` validates a PATH dotnet executable and
  bounds inventory, then queries CLI `--version` in each canonical candidate cwd.
  Stable SDK >=8 policy is independent of language SDK >=10. Nearest ancestor
  global.json syntax/known-field diagnostics are bounded (64 levels/64 KiB);
  CLI retains all SDK selection and roll-forward semantics.
- `CsharpRunPreflight` authorizes/revalidates a single project via FileSystemService
  and evaluates fixed Debug properties and ProjectReference items as MSBuild JSON.
  Empty computed properties and multi-target facts remain distinct; references
  are facts for later authorization. No raw XML interpretation, discovery,
  runnable classification, selection, CSharpRunStrategy, app composition, IPC/UI,
  build/run step or production stdin was implemented.
- `CsharpRunProbe` scopes fixed commands to Run's existing native adapter and
  ProcessManager owner. Closed stdin, shell:false, no environment additions,
  20-second command deadline and 1 MiB combined output bound; root exit/cancel/
  timeout/error waits for Job release. Failed cleanup retains ownership and
  blocks new commands; explicit retry is tested. Shared wire contracts unchanged.
- Unit/mocked evidence: 60 new focused tests; 214 focused/dependency/Run/language
  regressions PASS. Typecheck/lint/build PASS. Full suite 1255/1255 in 86 files
  PASS on the independent final run. An earlier run concurrent with build had
  one 5-second Git integration timeout; no test/timeout was weakened.
- Real evidence: `scripts/smoke-csharp-run-preflight.mjs`,
  `spikes/csharp-project-run/M1-05-REPORT.md`, and unchanged captured
  `spikes/csharp-project-run/evidence/m1-05-preflight.json`.
  Windows 11 x64 SDK 8.0.410/net8.0 and 10.0.112/net10.0: 20/20 cases PASS,
  including exact/ancestor/nearest pin, roll-forward, invalid/malformed global.json,
  imports/Directory.Build.props/conditions, references, multi-target/future TFM facts,
  no build/restore side effects, cancellation and repeated cleanup. 77 native
  sessions released, final resources 0, new surviving .NET processes 0; all eight
  measured handle counts 682. Earlier fixture/configuration findings are disclosed
  in the report; M1-04 evidence was not changed.
- Native regressions PASS: JS Run (15 cycles/23 argv round trips/30 rejects,
  handles 692 -> 692), Run lifecycle/project cleanup, Git, C# provider/native/
  preflight and Terminal live/natural-root. An initial JS smoke had transient EPERM
  deleting a temp executable; unchanged smoke passed on retry.
- M1-05 COMPLETE; overall C# Run/M1 IN_PROGRESS. M1-06 READY but NOT_STARTED and
  requires separate authorization. Manual UI/packaged acceptance not performed.
  No commit, push or merge.

M1 exit: every M1 task acceptance passes, actual Console project builds/runs/stops,
invalid/dirty/conflict/dependency paths are truthful, original JS acceptance passes
again, no owned descendant survives, and cleanup failure remains fail-closed.
M1 does not claim Console.ReadLine support; only programs not requiring stdin are
accepted until M2. Overall feature cannot be COMPLETE at the Core exit.

#### M1-06 discovery/classification verification — 2026-10-08

- Task start: M1-06 only, explicitly authorized after COMPLETE M1-01–M1-05.
  `feature/csharp-project-run` had a clean status and empty diff. ADR-024 and
  M1-04's Windows 11 x64 gate apply; no unresolved gate/new dependency/ADR change.
  Scope is Main discovery/classification, existing M1-01 DTOs and M1-05 evaluation.
  Persistence, UI/IPC composition, execution and later work remain excluded.
- Added `CsharpRunTargetResolver`: authorized root from ProjectService, bounded
  FileSystemService traversal (100,000 entries/64 canonical projects including
  references/4096-character relative paths), documented exclusions, symlink skip,
  stable Windows canonical dedup/order. No solution/LSP/editor-based choice.
- Uses production M1-05 for every assessed graph node. Console predicates and
  known single-TFM checks reject Library/Web/test/WPF/Forms/multi/unknown facts;
  unresolved facts remain unassessable. In-root references are reauthorized,
  deduplicated, evaluated once, cycle-checked and transitively validated.
  The complete graph is reauthorized before returning a cardinality result.
- Existing resolution DTOs unchanged. Exactly one assessed eligible candidate
  yields READY; multiple or eligible plus unassessable yield SELECTION_REQUIRED
  without a target. SDK failure/invalid evaluation/bounds/cancellation are not
  converted into an empty result. Safe detailed assessments remain Main-only.
- 62 new M1-06 tests passed in the final suite; intermediate focused M1-06/M1-05/
  workspace/Run lifecycle regression run passed 248 tests in 7 files. Final full
  `npm test`: 1317/1317, 87 files PASS. Typecheck/lint/build/diff checks PASS.
  Initial type-name typo and unused test import were corrected; no flaky test or
  unrelated module changes. Existing non-failing jsdom canvas message remains.
- Real production discovery + M1-05 smoke: 14/14 PASS, Windows 11 x64, SDK
  8.0.410/net8.0 and 10.0.112/net10.0. Console/Library/Web/test/WPF/Forms,
  Windows-qualified Console, multi/future TFM, spaces/Unicode/nesting, solution
  independence, malformed/SDK failure, references/cycles/escape/junctions,
  cancellation and repeated cleanup. No SKIP or workload installation.
  Fixture snapshots unchanged; no build/restore/run request. 116 native sessions
  released, resources/new surviving .NET processes 0, eight handle counts 687.
- Reproduction, caveats and source-hashed evidence:
  `spikes/csharp-project-run/M1-06-REPORT.md` and
  `spikes/csharp-project-run/evidence/m1-06-targets.json`.
  Native/process sources and M1-05 sources are unchanged; separate native
  JS/Git/Terminal/LSP smokes were not rerun or claimed for this package.
- M1-06 COMPLETE; M1-07 READY but NOT_STARTED. M1/overall C# Run IN_PROGRESS.
  No CSharpRunStrategy, build/run, selection persistence, IPC/picker/Output/stdin,
  commit, push or merge. No manual UI/packaged/Windows 10 acceptance claimed.

#### M1-07 selection/persistence verification — 2026-10-08

- Authorized M1-07 only after M1-01–M1-06 COMPLETE. Started on
  `feature/csharp-project-run` with clean status/diff. Read AGENTS, ADR-024,
  FR-023, Architecture Sections 10/13, module/capability maps, M1-01 contracts,
  M1-06 resolver and project/persistence/lifecycle services. No unresolved gate,
  new dependency or architecture deviation; existing persistence is reused.
- Added Main-only `CsharpRunTargetStore.resolve/select/clear/stop`; schema 1
  documents under `<workspace-state-directory>/csharp-run-targets/<projectId>.json`.
  The ID is Main's canonical project hash; data stores only relativePath or {}.
  Existing PersistenceService owns serialized temporary-file/atomic replace,
  backup and corrupt preservation. App metadata and LSP stores are untouched.
- Fresh production M1-06 results gate every choice. One fully assessed candidate
  may be automatic without implicit persistence. Multiple require explicit choice
  unless a revalidated saved choice remains eligible. Explicit/saved choice can
  select a known eligible candidate alongside unrelated unassessable candidates;
  global FAILED/bound results cannot be overridden. Canonical identity is checked
  before/after resolver and chosen paths are reauthorized around persistence.
- Stale saved paths require fresh choice even if another single Console remains.
  Corrupt/backup recovery reports a safe issue and forces fresh choice; no backup
  target is automatically adopted. Clear atomically persists {} so a normal
  reopen cannot resurrect backup choice. IO/write failures return PERSISTENCE_FAILED.
- Operations serialize per project and newer requests supersede/abort older ones.
  Captured ActiveProject identity rejects stale same-ID reopen results. Project
  switch/close/cancel/stop abort discovery; finally removes listeners. Stale staged
  writes fail before atomic rename. Already-started rename may finish only in
  that old project's file; no stale READY or cross-project selection is returned.
  Stop drains operations and persistence writes.
- Final focused command:
  `npm test -- tests/main/csharp-run-target-store.test.ts tests/main/csharp-run-targets.test.ts tests/main/persistence-service.test.ts tests/main/project-service.test.ts tests/main/run-project-lifecycle.test.ts`:
  **143/143 tests, 5 files PASS**. `npm run typecheck` PASS;
  `npx --no-install eslint src/main/services/run/csharp-run-target-store.ts tests/main/csharp-run-target-store.test.ts`
  PASS; tracked/new-file diff checks PASS. Initial return-type/mock-narrowing
  TypeScript errors were corrected before final checks; no flaky test.
- Tests use real filesystem and production ProjectService/FileSystemService,
  M1-06/M1-05 and PersistenceService; SDK process facts and controlled fault/race
  injection are mocked. Restore/reopen/isolation/change/clear, target rename/
  deletion/library, paths/ownership/junctions, corrupt/IO/atomic failures,
  cancellation/supersession/staged writes/stop and namespace isolation pass.
- Full suite, build and native smoke intentionally not run per this task's
  explicit verification scope. No native/process, contracts, app composition,
  JS Run, LSP, Terminal, IPC/Preload/Renderer or execution code changed.
- M1-07 COMPLETE; M1-08 READY but NOT_STARTED. M1/overall C# Run IN_PROGRESS.
  No new ADR, commit, push or merge. UI/IPC composition and launch-time/source
  revalidation remain later packages; no complete C# Run capability is claimed.

### Milestone 2 — Console Input & Completion

| ID | Công việc | File/module dự kiến | Phụ thuộc | Kết quả đầu ra | Tiêu chí hoàn thành |
|---|---|---|---|---|---|
| M2-01 | Define input/EOF/ack/capability contracts | shared/contracts/run.ts; contract tests | M1 exit; explicit M2 authorization | sendInput(projectId,sessionId,sequence,text), closeInput and typed responses/status | Exact fields; NUL/surrogates/size/sequence checks; no command/process fields; JS/build capability false |
| M2-02 | Add Run-specific asynchronous native stdin | run/native/run-process.cpp, windows-piped-process-adapter.ts, piped-process-adapter.ts; native fixtures/smoke | M2-01; M1-04 stdin evidence | UTF-8 pipe writes, optional stdin capability, ordered EOF, cancellable writes | Repeated/partial writes and broken pipe; one in-flight writer; Stop unblocks full pipe; write callbacks/handles released; LSP/Git entry behavior unchanged |
| M2-03 | Session-owned input queue and cancellation | run/run-service.ts; planned run/run-input-queue.ts; focused queue/lifecycle tests | M2-02 | Per-session order, 16 KiB request/64 KiB+32 queue/10s deadline, backpressure and input gate | Wrong owner/project/session/step denied; empty/multiline ordering; queue full rejects without byte loss; no replay; gate closes before Stop/exit/re-run/switch/shutdown |
| M2-04 | Wire semantic input IPC and Preload | main/ipc/run-ipc-service.ts, preload/bridge/run.ts; IPC/Preload tests | M2-03 | Trusted-frame session-scoped input, safe acknowledgements/status | Validate at IPC and domain; JS input rejected; transport errors normalized; late replies never attach to replacement/other project |
| M2-05 | Add Output line composer and controller behavior | output/OutputPanel.tsx, run-controller.ts; styles.css only as needed; renderer tests | M2-04 | Send/Enter, Shift+Enter/multiline, EOF, disabled/busy state; unsent-text preservation | One/multiple ReadLine; IME-safe Enter; no terminal redesign; no automatic resend/history/logging; queued input never transferred on re-run |
| M2-06 | Full integration and Windows 11 x64 regression acceptance | main/IPC/preload/renderer tests; scripts/smoke-csharp-run.mjs; JS/Terminal/C# language smokes | M2-05 | Repeatable actual Electron end-to-end and manual Windows 11 x64 evidence | Complete test matrix below; root killed with surviving descendant; blocked write/ReadLine Stop; switch/close/re-run cycles; no orphan/handle leak |
| M2-07 | Final review, documentation and status | relevant docs only after verified execution | M2-06 | Truthful capability/status updates and completion report | M1+M2 gates under revised platform scope, full automated/quality gates, Windows 11 x64 manual evidence; remaining Phase 7 packaging obligations explicit |

M2 exit / overall completion: all M1 and M2 gates pass together, Console.ReadLine
works repeatedly with Unicode/empty/multiline input, ownership/backpressure/stale
results are verified, original JS/Terminal/Language Service acceptance is preserved,
and Stop/transition/shutdown leave no owned processes/resources. Only then set
overall C# Run COMPLETE. Missing required Windows 11 x64 evidence prevents COMPLETE.

### Test plan

U = unit/fake-adapter tests; I = integration across services/contracts or real native
Electron; W = manual Windows 11 x64 Electron smoke. W is recorded per SDK,
fixture and observed outcome; mocked tests do not replace actual platform evidence.
Windows 10 is outside this extension's verified acceptance baseline;
compatibility is not claimed.

| Scenario | Unit tests (U) | Integration tests (I) | Windows manual smoke (W) |
|---|---|---|---|
| JS Run regression | Node strategy/runtime selection, canonical target identity, dirty guard | Existing foundation/lifecycle/project/UI/IPC/Preload suites and native smoke | Saved .js output/Stop/re-run/switch unchanged; no stdin UI |
| Valid Console project | Evaluated SDK Exe/single TFM classifier, fixed Debug args/cwd | Real net8.0 and net10.0 Console build/run; no-launch-profile policy | Run saved Console, observe project label and result |
| One/multiple/nested projects | Auto-choice, saved choice, explicit choice, case dedup | Discovery + store + typed chooser; change/delete remembered target | Root/nested apps and libraries; selection retained after restart |
| No suitable project / unsupported project | Library/Web/GUI/test/multi-TFM/malformed and limits | Resolution states; no child launch; unassessable candidate surfaced | Empty folder/only library/no SDK with candidates; actionable reason |
| Missing/invalid SDK/global.json/TFM | PATH, inventory, effective selection JSON and invalid probe | Candidate-cwd CLI, missing required SDK, missing runtime/targeting pack fixtures | Installation/PATH/global.json guidance; never infer LSP health |
| Build/restore failure | Build nonzero suppresses execute; cancellation != failure | Syntax error, unreachable/test NuGet feed, safe structured cause/streams | Separate Build/restore failed result; no runnable child afterward |
| stdout/stderr/exit | UTF-8 split chunks, phase tagging, 0/nonzero/null, late step event | Prompt without newline, mixed streams, host failure, user nonzero exit | Unicode and both streams visible; actual exit code; no claimed total cross-stream ordering |
| Unsaved/external conflict | Any active-folder retained buffer blocks; unknown revision blocks | Non-active file dirty, referenced file conflict, edits/external change during build | Save manually then run; no auto-save/discard; conflict retains editor text |
| ReadLine once/repeated/multiline/empty | Newline normalization, FIFO, byte budget, EOF barrier | Actual dotnet run receives each line, Unicode, empty line and EOF/null | Type/send/paste multiple lines; Enter/Shift+Enter/IME and EOF |
| Input after exit / wrong session/owner | Capability, sequence/duplicate, project generation guards | Direct IPC adversarial input; superseded session/reply rejection | Composer disables after exit/Stop; no text reaches new run |
| Queue/backpressure / blocked stdin | 16 KiB/64 KiB/32/deadline boundaries; preserve bytes on busy | Child never reads, broken pipe, ack loss/late reply, bounded termination | Saturate input; busy/error feedback; Stop remains responsive |
| Stop build/restore/preflight/step gap | Cancel token and step launch guard; retained cleanup failure | Actual long-running build/restore fixture and owned preparation process | Stop before and during build; no subsequent execute or build worker |
| Stop execution/ReadLine/Re-run | Input gate closes first; serial cleanup/new session and fresh sequence | Waiting ReadLine, rapid repeated starts, cleanup failure/retry | Stop prompt; repeated runs have no overlap or carried input |
| Project switch/unavailable root | Leases/generations cancel pending discovery/start/input | RunProjectLifecycle plus unsaved confirmation and stale results | Switch while building/reading; failed cleanup retains old project |
| Owner loss/shutdown/no orphan | STOPPING retains failed resources and retries | Navigate/destroy renderer; natural/hard root exit with child holding pipe; repeated handle/write drain | Close app during build/input; inspect dotnet/app/MSBuild children and native handles after repeated cycles |
| Terminal/Git/C# intelligence regression | Separate factories/registries/capabilities | Existing Git native, Terminal lifecycle and C# language native/workspace acceptance smokes | PTY input/resize and language completion/diagnostics remain functional while Run starts/stops |

Implementation quality gates: focused tests as each independently testable task
lands; at each milestone exit run `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build` and `git diff --check`, plus applicable real native/manual checks.
Run builds and process tests sequentially where concurrent native file locks or
resource contention would invalidate evidence. No automated, platform or packaged
acceptance is claimed by this docs-only task.

### Risks, evidence gates and first implementation task

- Shared native changes can break Run/Git/LSP handle inheritance/finalization:
  preserve entry points and run their regression smokes before composition.
- Build/compiler servers may escape ownership: fixed no-server/no-reuse policy
  requires actual SDK evidence; never terminate unrelated global servers.
- SDK evaluation can execute trusted project logic and SDK restore can use network:
  preserve existing trust policy, containment checks and cancellation budgets;
  neither IPC validation nor Job objects sandbox student code/MSBuild.
- CLI build versus restore is intentionally one combined failure category; exact
  host versus student runtime cause needs structured evidence. Do not add parser
  guesses to make statuses seem more precise.
- Dirty state is Renderer-owned; current unsaved coordination exposes approval
  only, so M1-09a adds a scoped Run guard handshake/revision. Build cannot provide
  a fully atomic snapshot under
  arbitrary external concurrent writes. Verify races and reject known changes.
- Console line input is not terminal emulation; dotnet forwarding, UTF-8 and blocked
  writes must be proven in M1-04 and M2 native acceptance. No automatic prompt/read
  detection. Input acknowledgements report delivery, not consumption.
- Initial stable SDK >=8, single-framework and input/discovery limits are bounded
  design defaults; compatibility gate may require explicit ADR revision. No SDK
  installation or new dependency is authorized. Phase 7 packaging is still required.
- Actual Windows 11 x64 evidence is required for each applicable gate; missing
  manual/native/e2e or packaging checks cannot be inferred from M1-04's spike.
  M1-04 compatibility is verified; production acceptance remains future work.

M1-01 through M1-08 are COMPLETE. Next eligible task is **M1-09a**, requiring
explicit authorization. M1-09a and M1-09 strategy composition remain NOT_STARTED.
Neither milestone nor
overall C# Run is COMPLETE.

## 14. Decision Gate Register

| Decision | Related ADR | Required before | Current status | What must be verified |
|---|---|---|---|---|
| C# Project Run SDK/native compatibility | ADR-024 and platform amendment | Before M1-05 and real C# strategy composition | RESOLVED / PASS — M1-04 COMPLETE; Windows 11 x64/net8+net10 32/32 evidence | Verified no-server/no-reuse flags, stdin/blocked writes, restore/build Stop, owned-tree cleanup and JS/Terminal/Git/LSP regressions; preserve these gates during production implementation |
| Renderer state management | ADR-011 | Shared Phase 2 shell/project/editor state expands | Proposed; unresolved | Actual cross-feature update needs, lifecycle ownership, complexity, bundle/dependency cost |
| IPC runtime validation mechanism | ADR-016, ADR-003 | Production IPC handlers multiply in early Phase 2 | RESOLVED Phase 2A — explicit validators | Current contracts are small; validators provide normalized issues and audited narrowing without schema runtime cost |
| React Monaco integration | ADR-006, ADR-019 | Phase 2C Editor implementation | RESOLVED Phase 2C — thin `@monaco-editor/react` mount over local `monaco-editor` | Model/view ownership remains with EditorModelManager; local workers, development/build behavior, and disposal must pass the Phase 2C gate |
| JS/TS/HTML/CSS/JSON providers | ADR-013, ADR-015 | Phase 3B implementation | RESOLVED Phase 3A — Monaco-native workers/providers | Matrix capabilities, bounded cross-file behavior, sync, worker lifecycle, development/production-build behavior, resource discovery; full packaged/installed verification is Phase 7 |
| C# external provider/transport versions | ADR-022 | Before Phase 5.5C | RESOLVED Phase 5.5B — `csharp-ls` 0.27.0, protocol 3.18.3, JSON-RPC 9.0.2, structured Main preflight and bounded readiness semantics | Real Windows `csharp-ls`, protocol/library compatibility, capabilities, workspace selection/preflight, sync, Unicode, cancellation, diagnostics, dynamic registration, lifecycle, cleanup, and electron-vite/build compatibility |
| Python/Java providers | ADR-013, ADR-015 | Future explicitly authorized language phase | DEFERRED — no provider selected | Re-evaluate capabilities, distribution, executable/config discovery, Main-owned lifecycle, narrow IPC, Windows behavior, license, and packaging only when future scope is authorized |
| Large-file language thresholds | Architecture §8 | Phase 3 acceptance for expensive features | RESOLVED Phase 3B — initial 500 files / 5 MiB total / 256 KiB per file | Re-measure during 3C integration while edit/save remains available; lower bounds if live responsiveness requires it |
| TypeScript Run strategy | ADR-014 | Future authorized TypeScript execution | Deferred; not a Phase 4 V1 blocker | Node versions, ESM/CJS, `tsconfig`, errors/maps, startup, Windows paths, stop/tree cleanup |
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
| Language-provider packaging | 3, 5.5, 7 | Intelligence works only in development or fails after distribution | Phase 3 worker evidence; Phase 5.5B C# development compatibility gate; Phase 7 full packaged/installed provider/resource verification |
| C# workspace and protocol behavior | 5.5 | Wrong solution, stale semantics, UI stalls, or orphaned server | ADR-022 policies; 5.5B real Windows hard gate; ordered/versioned sync, containment, cancellation, machine-readable failures, and bounded cleanup tests |
| Future Python/Java provider distribution | Future language phase, 7 | Future intelligence may require external process/distribution work | Deferred provider decision; preserve Main ownership, narrow validated IPC, Windows lifecycle, and packaged verification gates |
| TypeScript Run strategy | Future | Inconsistent execution/config behavior | ADR-014 decision and verification before future authorized TypeScript execution |
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
  `node-pty`, process trees, current Monaco worker resources, Git, persistence,
  and the Phase 5.5 C# provider/process after its hard gate.
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
- cleanup of watchers, models, PTYs, Run processes, current provider workers, and
  the Main-owned Phase 5.5 C# process by their owner.

An API equivalent to `window.api.execute(command)` is prohibited.

## 18. Windows Acceptance Strategy

V1 acceptance targets Windows 10 and Windows 11.

C# Project Run is scoped to Windows 11 x64 by ADR-024's platform amendment.
Windows 10 is outside its verified acceptance baseline; compatibility is not
claimed. The other IDE domains retain the Windows 10/11 baseline below.

Relevant packages must test:

- drive letters and case-insensitive canonical comparisons;
- Windows separators and supported UNC paths;
- reserved names, long paths, locked files, and antivirus/file-lock delays where
  applicable;
- configured absolute executable paths and effective `PATH` lookup;
- PowerShell and `cmd.exe` with their distinct argument/quoting behavior;
- native `node-pty` Electron ABI compatibility;
- descendant process cleanup without broad process-name killing;
- `.NET 10 LTS`, `csharp-ls` stdio/lifecycle, `.sln`/`.slnx`/project mode,
  UTF-16/Unicode, paths with spaces/`#`/Unicode, and bounded descendants for
  Phase 5.5;
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

- Current provider decisions are recorded and the current Tier 1/2 matrix
  capabilities plus Tier 3 C#/PHP syntax assignment pass.
- Completion, hover, required signature/definition behavior, and diagnostics for
  JavaScript, TypeScript, CSS, and JSON pass. Problems/navigation for those
  diagnostic sources passes in Phase 3E. HTML diagnostics/Problems contribution
  remain deferred under ADR-015.
- Provider status/recovery and project switch/close, root `UNAVAILABLE`, renderer
  reload, worker cleanup, and stale-diagnostic behavior pass.
- Runtime and current Monaco providers remain independent; editor/save survive
  all applicable worker failure/status states. External service lifecycle is not
  a Phase 3 exit gate.
- Manual user-facing language-service restart is not required; external-server
  start/stop/restart/crash UX remains future scope.
- All Python and Java support remains deferred and introduces no current
  dependency, process, IPC, or acceptance requirement.
- Defined tests, Windows smoke, typecheck, lint, and build pass.

### Phase 4 Definition of Done

- JavaScriptRunStrategy executes the current authorized `.js` file inside the
  active project via Node.js through an extensible internal RunStrategy boundary.
  TypeScript/Python Run and built-in Run Project remain deferred; no V1 TypeScript
  runtime/compile/transpile selection or npm/dev-server/project-entry execution.
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

### Phase 5.5 Definition of Done

- The 5.5B real-Windows compatibility hard gate passes before 5.5C and records
  exact `csharp-ls`, `vscode-languageserver-protocol`, and `vscode-jsonrpc`
  versions.
- C# syntax, completion, hover, signature help, definition, open-document pull
  diagnostics, and Problems/navigation pass for supported solution/project mode.
- Workspace selection, dirty incremental sync, UTF-16, cancellation, stale-result
  rejection, dependency/status separation, crash behavior, and bounded cleanup
  pass without weakening editor/save or privileged boundaries.
- Deferred C# capabilities and C# Run remain absent.
- Defined tests, Windows Electron smoke, typecheck, lint, build, and
  `git diff --check` pass. Phase 7 retains packaged/installed acceptance.

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
  C# Project Run's acceptance checks use Windows 11 x64 only; this exception does
  not remove Windows 10 obligations for other installed IDE workflows.
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
